# A throwaway test environment (decision T-43): made-up data only, any region, smallest sizes,
# gone ttl_minutes (at most three hours) after it was created: GitHub's teardown check (every 30 minutes) runs `reap`,
# and with scheduled_teardown a one-time AWS schedule also starts the CodeBuild runner with
# ACTION=down. Brought up and down by infra/deploy/test-env.sh (GitHub Actions, CodeBuild, or
# by hand).

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    time   = { source = "hashicorp/time", version = "~> 0.12" }
  }
  # terraform init -backend-config=backend.tfbackend
  backend "s3" {}
}

# Credentials from the environment: AWS_PROFILE=aws-toolkit by hand, the runner's role in AWS.
# Only the test account: a profile signed in to any other account stops here, before anything
# is read or changed (the profile is shared with other projects).
provider "aws" {
  region              = var.region
  allowed_account_ids = ["726228202446"]
  default_tags {
    tags = {
      Project     = "african-market"
      Environment = "test"
      ManagedBy   = "terraform"
    }
  }
}

variable "region" {
  description = "Any region: test environments hold made-up data only (decision T-43)."
  type        = string
  default     = "eu-north-1"
}

variable "domain" {
  description = "The customer site; the zone of the same name is the one the bootstrap made."
  type        = string
  default     = "am.amahkudi.dev"
}

variable "image_tag" {
  description = "The commit the images were built from (the runner sets it)."
  type        = string
  default     = "bootstrap"
}

variable "current_phase" {
  type    = number
  default = 1
}

variable "apps_running" {
  description = "false creates every app with 0 tasks; test-env.sh up migrates, then starts them with aws ecs update-service."
  type        = bool
  default     = true
}

variable "ttl_minutes" {
  description = "How long the environment lives, from when it was first created, before it deletes itself."
  type        = number
  default     = 180
  validation {
    # At least 45: the timer starts when the infrastructure is created, and the rest of an `up`
    # (database, broker, migrations, the made-up shops) takes another 15-20 minutes. A teardown
    # in the middle of an `up` leaves a lock and half a state behind.
    condition     = var.ttl_minutes >= 45 && var.ttl_minutes <= 180
    error_message = "A test environment lives 45 to 180 minutes."
  }
}

variable "inspection_tools" {
  description = "The mail inbox, RabbitMQ console and database view, each behind its own login (decision T-47)."
  type        = bool
  default     = true
}

variable "scheduled_teardown" {
  description = "Also carry a one-time AWS schedule that starts the CodeBuild runner with ACTION=down. Needs CodeBuild builds allowed in the account (its quota starts at 0)."
  type        = bool
  default     = false
}

variable "runner_project" {
  description = "The CodeBuild project that brings environments up and down (bootstrap)."
  type        = string
  default     = "african-market-env"
}

variable "otp_test_numbers" {
  description = "The only numbers that can sign in (no SMS provider here); codes are generated."
  type        = list(string)
  default     = ["+971500000001", "+971500000002", "+971500000010", "+971500000011"]
}

data "aws_route53_zone" "test" {
  name = var.domain
}

module "platform" {
  source = "../../modules/platform"

  environment     = "test"
  apps_running    = var.apps_running
  region          = var.region
  domain          = var.domain
  route53_zone_id = data.aws_route53_zone.test.zone_id
  current_phase   = var.current_phase
  image_tag       = var.image_tag
  email_from      = "African Market test <no-reply@${var.domain}>"
  # Every seller passes the identity check: there is no real person to check.
  kyc_provider     = "fake"
  otp_test_numbers = var.otp_test_numbers

  single_nat_gateway = true
  app_sizes = {
    # Next renders on the server; 512 MB is tight for it.
    web = { cpu = 512, memory = 1024, desired_count = 1 }
  }

  db_instance_class = "db.t4g.micro"
  db_multi_az       = false
  redis_node_type   = "cache.t4g.micro"
  redis_replicas    = 0
  mq_instance_type  = "mq.m7g.medium" # the smallest RabbitMQ broker; Amazon MQ dropped t3.micro for RabbitMQ
  mq_cluster        = false

  log_retention_days = 1
  tracing            = false
  # Nothing here is kept: no deletion protection, no final snapshot, buckets emptied on destroy.
  protect_data = false

  inspection_tools = var.inspection_tools
}

# ── the self-destruct timer ──────────────────────────────────────────────────────────────────

# The moment the environment was first created; kept in the state, so later applies do not
# push the deadline back.
resource "time_static" "created" {}

locals {
  expires_at = timeadd(time_static.created.rfc3339, "${var.ttl_minutes}m")
}

data "aws_caller_identity" "current" {}

data "aws_iam_role" "scheduler" {
  count = var.scheduled_teardown ? 1 : 0
  name  = "${var.runner_project}-scheduler"
}

resource "aws_scheduler_schedule" "teardown" {
  count       = var.scheduled_teardown ? 1 : 0
  name        = "am-test-teardown"
  description = "Deletes the test environment ${var.ttl_minutes} minutes after it was created"
  # One run, then the schedule removes itself (the destroy removes it from the state too).
  schedule_expression          = "at(${formatdate("YYYY-MM-DD'T'hh:mm:ss", local.expires_at)})"
  schedule_expression_timezone = "UTC"
  action_after_completion      = "DELETE"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:codebuild:startBuild"
    role_arn = data.aws_iam_role.scheduler[0].arn
    input = jsonencode({
      ProjectName = var.runner_project
      EnvironmentVariablesOverride = [
        { Name = "ACTION", Value = "down", Type = "PLAINTEXT" },
      ]
    })
  }
}

# ── outputs (the runner and run-migrations.sh read these) ────────────────────────────────────

output "expires_at" {
  value = local.expires_at
}

output "inspection_urls" {
  value = module.platform.inspection_urls
}

output "inspection_logins" {
  value = module.platform.inspection_logins
}

output "urls" {
  value = module.platform.urls
}

output "ecr_repositories" {
  value = module.platform.ecr_repositories
}

output "next_public_build_args" {
  value = module.platform.next_public_build_args
}

output "cluster_name" {
  value = module.platform.cluster_name
}

output "desired_counts" {
  value = module.platform.desired_counts
}

output "migration" {
  value = module.platform.migration
}

output "database_identifier" {
  value = module.platform.database_identifier
}

output "otp_test_numbers_secret" {
  value = module.platform.otp_test_numbers_secret
}
