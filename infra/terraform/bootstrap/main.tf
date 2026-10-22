# Applied once per AWS account, by a person, before any environment: the S3 bucket that holds
# every environment's Terraform state, the role GitHub Actions deploys with, and the monthly
# budget alert. Its own state stays local (it is one bucket); keep the
# terraform.tfstate this produces somewhere safe, or import the bucket again if it is lost.
#
# Locking uses S3 itself (use_lockfile, Terraform 1.10+), so there is no DynamoDB table.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region  = var.region
  profile = var.profile
  default_tags {
    tags = { Project = "african-market", ManagedBy = "terraform", Stack = "bootstrap" }
  }
}

variable "region" {
  description = "The account's region (decision T-43: any region for test environments)."
  type        = string
  default     = "eu-north-1"
}

variable "profile" {
  description = "AWS CLI profile to sign in with locally; null in CI."
  type        = string
  default     = null
}

variable "state_bucket" {
  description = "Globally unique name for the state bucket; by default it carries the account id."
  type        = string
  default     = null
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  bucket = coalesce(var.state_bucket, "african-market-tfstate-${data.aws_caller_identity.current.account_id}")
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# State holds generated passwords: TLS only, and old versions kept for 90 days to recover from a
# bad apply.
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.state]
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

# ── GitHub Actions deploys (F0-14) ────────────────────────────────────────────────────────────
#
# GitHub signs in with OIDC: a short-lived token per job, no AWS keys stored anywhere. Only jobs
# that run in this account's GitHub environment (staging or production) may take the role, and
# GitHub only lets the `stage` branch deploy to staging and `main` to production, the latter
# after an approval (infra/github/apply-rulesets.sh).
#
# The role applies Terraform, so it can change anything in the account: AdministratorAccess.
# That is why it is fenced by the environment, and why staging and production are separate
# accounts.
#
# Projects in AWS's new experience may not create identity providers (the managed service
# control policy denies iam:*Provider*); this account has advanced features since 2026-10-22, so
# it can. Set false in an account that cannot.

variable "github_oidc" {
  description = "Create the GitHub OIDC provider and deploy role."
  type        = bool
  default     = true
}

variable "github_repository" {
  type    = string
  default = "HK-Soln/african-market"
}

variable "deploy_environment" {
  description = "The GitHub environment that deploys to this account: test, staging or production."
  type        = string
  default     = "test"
}

variable "extra_github_environments" {
  description = "Other GitHub environments that may take the role. Test: test-teardown, which runs down and the teardown check without approval, from dev only."
  type        = list(string)
  default     = ["test-teardown"]
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.github_oidc ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "deploy" {
  count                = var.github_oidc ? 1 : 0
  name                 = "github-deploy-${var.deploy_environment}"
  description          = "GitHub Actions deploys from ${var.github_repository} (${var.deploy_environment})"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github[0].arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = [
            for env in concat([var.deploy_environment], var.extra_github_environments) :
            "repo:${var.github_repository}:environment:${env}"
          ]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "deploy" {
  count      = var.github_oidc ? 1 : 0
  role       = aws_iam_role.deploy[0].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "deploy_role_arn" {
  description = "Set as the repository variable AWS_TEST_ROLE_ARN (or AWS_STAGING_ROLE_ARN, AWS_PRODUCTION_ROLE_ARN)."
  value       = one(aws_iam_role.deploy[*].arn)
}

# ── Budget ───────────────────────────────────────────────────────────────────────────────────
#
# Test environments live a few hours at a time (decision T-43); this says so when a month costs
# more than planned: at half, most and all of the budget, and when the forecast passes it.

variable "monthly_budget_usd" {
  type    = number
  default = 10
}

variable "budget_alert_email" {
  description = "Who is told when spending passes a threshold."
  type        = string
}

resource "aws_budgets_budget" "monthly" {
  name         = "african-market-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

# ── Test domain ──────────────────────────────────────────────────────────────────────────────
#
# Until the business domain exists, test environments live under a subdomain of the owner's
# personal domain, delegated to Route 53 once (NS records at the domain's DNS host). Each
# environment then adds and removes its own records here, certificate checks included.

variable "test_domain" {
  type    = string
  default = "am.amahkudi.dev"
}

resource "aws_route53_zone" "test" {
  name    = var.test_domain
  comment = "Throwaway test environments (decision T-43)"
}

output "test_zone_id" {
  value = aws_route53_zone.test.zone_id
}

output "test_zone_name_servers" {
  description = "Add these as NS records for the subdomain at the parent domain's DNS host."
  value       = aws_route53_zone.test.name_servers
}

# ── The test environment runner (decision T-43) ──────────────────────────────────────────────
#
# GitHub cannot sign in to this kind of project (see github_oidc), so test environments are
# brought up and down from inside AWS: a CodeBuild project that checks out the public repository
# and runs infra/deploy/test-env.sh with ACTION=up, down or status. Each environment's one-time
# schedule starts it with ACTION=down when the environment's time is up.
#
#   aws codebuild start-build --project-name african-market-env \
#     --environment-variables-override name=ACTION,value=up [name=GIT_REF,value=<branch>]

variable "runner_name" {
  type    = string
  default = "african-market-env"
}

variable "repository_url" {
  description = "Public repository the runner checks out (no credentials needed)."
  type        = string
  default     = "https://github.com/HK-Soln/african-market.git"
}

resource "aws_cloudwatch_log_group" "runner" {
  name              = "/codebuild/${var.runner_name}"
  retention_in_days = 7
}

# Brings whole environments up and down, so it may change anything in the project; only the
# CodeBuild service can take it, and only for this project's builds.
resource "aws_iam_role" "runner" {
  name        = var.runner_name
  description = "CodeBuild: brings test environments up and down (infra/deploy/test-env.sh)"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "runner" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_codebuild_project" "runner" {
  name          = var.runner_name
  description   = "Test environments: ACTION=up, down or status (infra/deploy/test-env.sh)"
  service_role  = aws_iam_role.runner.arn
  build_timeout = 90

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type = "BUILD_GENERAL1_MEDIUM"
    image        = "aws/codebuild/amazonlinux-x86_64-standard:5.0"
    type         = "LINUX_CONTAINER"
    # Docker builds the images.
    privileged_mode = true

    environment_variable {
      name  = "ACTION"
      value = "status"
    }
    environment_variable {
      name  = "GIT_REF"
      value = "dev"
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.runner.name
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = <<-YAML
      version: 0.2
      phases:
        install:
          commands:
            - curl -fsSL -o /tmp/tf.zip https://releases.hashicorp.com/terraform/1.13.5/terraform_1.13.5_linux_amd64.zip
            - unzip -o -q /tmp/tf.zip -d /usr/local/bin && terraform -version
        build:
          commands:
            - git clone --depth 1 --branch "$GIT_REF" ${var.repository_url} repo
            - cd repo && bash infra/deploy/test-env.sh "$ACTION"
    YAML
  }
}

# The one-time teardown schedules use this to start the runner, and may do nothing else.
resource "aws_iam_role" "runner_scheduler" {
  name        = "${var.runner_name}-scheduler"
  description = "EventBridge Scheduler: starts the test environment runner (teardown)"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy" "runner_scheduler" {
  role = aws_iam_role.runner_scheduler.id
  name = "start-runner"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "codebuild:StartBuild"
      Resource = aws_codebuild_project.runner.arn
    }]
  })
}

output "runner_project" {
  value = aws_codebuild_project.runner.name
}
