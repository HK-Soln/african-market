# Applied once per AWS account, by a person, before any environment: the S3 bucket that holds
# every environment's Terraform state. Its own state stays local (it is one bucket); keep the
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
  region = var.region
  default_tags {
    tags = { Project = "african-market", ManagedBy = "terraform", Stack = "bootstrap" }
  }
}

variable "region" {
  type    = string
  default = "me-central-1"
}

variable "state_bucket" {
  description = "Globally unique name for the state bucket. Use the same one in envs/*/backend.tfbackend."
  type        = string
  default     = "african-market-terraform-state"
}

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket
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

variable "github_repository" {
  type    = string
  default = "HK-Soln/african-market"
}

variable "deploy_environment" {
  description = "The GitHub environment that deploys to this account: staging or production."
  type        = string
  default     = "staging"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "deploy" {
  name                 = "github-deploy-${var.deploy_environment}"
  description          = "GitHub Actions deploys from ${var.github_repository} (${var.deploy_environment})"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.deploy_environment}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "deploy" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "deploy_role_arn" {
  description = "Set as the repository variable AWS_STAGING_ROLE_ARN (or AWS_PRODUCTION_ROLE_ARN)."
  value       = aws_iam_role.deploy.arn
}
