# Staging in AWS me-central-1 (UAE). Sized to be cheap but shaped like production: three zones,
# private subnets, TLS everywhere. Postgres is single-zone here (Multi-AZ is for production only),
# and the apps and database run only in working hours. See ../../README.md to bootstrap.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # Bucket and key in backend.tfbackend: terraform init -backend-config=backend.tfbackend
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "african-market"
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}

variable "region" {
  description = "Personal data stays in the UAE (product rule 8)."
  type        = string
  default     = "me-central-1"
  validation {
    condition     = var.region == "me-central-1"
    error_message = "Personal data must stay in a UAE region: me-central-1."
  }
}

variable "domain" {
  description = "The staging customer site, e.g. staging.africanmarket.ae."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone of the domain, or null when DNS is managed elsewhere."
  type        = string
  default     = null
}

variable "image_tag" {
  description = "The commit to run. CI sets it (F0-14); `bootstrap` until the first images are pushed."
  type        = string
  default     = "bootstrap"
}

variable "current_phase" {
  type    = number
  default = 0
}

variable "email_provider" {
  description = "ses, or smtp for any other provider (Resend, Postmark, ...). See modules/platform."
  type        = string
  default     = "ses"
}

variable "otp_test_numbers" {
  description = "Numbers the end-to-end tests sign in with; their codes are generated (see modules/platform)."
  type        = list(string)
  default     = ["+971500000001", "+971500000002"]
}

variable "manual_secrets" {
  type    = list(string)
  default = []
}

variable "didit_workflow_id" {
  description = "The Didit workflow for seller verification (see modules/platform)."
  type        = string
}

variable "google_client_ids" {
  description = "Google OAuth client ids (web and seller) for sign-in; empty leaves it off."
  type        = list(string)
  default     = []
}

variable "facebook_app_id" {
  description = "Facebook app id for sign-in; empty leaves it off (secret: FACEBOOK_APP_SECRET)."
  type        = string
  default     = ""
}

variable "sentry_dsn_backend" {
  description = "Sentry DSN for the gateway and services; empty: no error reports (see modules/platform)."
  type        = string
  default     = ""
}

variable "google_maps_browser_key" {
  description = "Google Maps browser key for the customer site; empty: no map."
  type        = string
  default     = ""
}

variable "google_map_id" {
  description = "Google Maps map id, required with the key."
  type        = string
  default     = ""
}

variable "sentry_dsn_frontend" {
  description = "Sentry DSN compiled into the Next apps; empty: no error reports."
  type        = string
  default     = ""
}

module "platform" {
  source = "../../modules/platform"

  environment         = "staging"
  region              = var.region
  domain              = var.domain
  route53_zone_id     = var.route53_zone_id
  current_phase       = var.current_phase
  image_tag           = var.image_tag
  email_from          = "African Market <no-reply@${var.domain}>"
  manual_secrets      = var.manual_secrets
  sentry_dsn_backend  = var.sentry_dsn_backend
  didit_workflow_id   = var.didit_workflow_id
  google_client_ids   = var.google_client_ids
  facebook_app_id     = var.facebook_app_id
  sentry_dsn_frontend = var.sentry_dsn_frontend

  google_maps_browser_key = var.google_maps_browser_key
  google_map_id           = var.google_map_id
  otp_test_numbers        = var.otp_test_numbers

  # Up 08:00-20:00 Dubai time, Monday to Friday (decided 2026-10-16). Outside those hours the
  # apps have no tasks and the database is stopped; the deploy workflow starts it if needed.
  working_hours  = { on_at = "08:00", off_at = "20:00", days = "MON-FRI" }
  email_provider = var.email_provider

  single_nat_gateway = true
  app_sizes = {
    # Next renders on the server; 512 MB is tight for it.
    web = { cpu = 512, memory = 1024, desired_count = 1 }
  }

  db_instance_class = "db.t4g.micro"
  db_multi_az       = false # Multi-AZ in production only (decided 2026-10-16)
  redis_node_type   = "cache.t4g.micro"
  redis_replicas    = 0
  mq_instance_type  = "mq.t3.micro"
  mq_cluster        = false

  log_retention_days = 30
  # Staging can be torn down and rebuilt; production keeps this true.
  protect_data = false
}

output "urls" {
  value = module.platform.urls
}

output "load_balancer_dns_name" {
  value = module.platform.load_balancer_dns_name
}

output "dns_records" {
  value = module.platform.dns_records
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

output "migration" {
  value = module.platform.migration
}

output "secret_names" {
  value = module.platform.secret_names
}

output "database_identifier" {
  value = module.platform.database_identifier
}

output "otp_test_numbers_secret" {
  value = module.platform.otp_test_numbers_secret
}
