# Production in AWS me-central-1 (UAE), in its own AWS account. The same platform as staging,
# sized and protected for real customers: Multi-AZ Postgres, a NAT gateway and a Redis replica
# in every zone, a three-node RabbitMQ cluster, deletion protection, always on.
#
# Not deployed yet: it needs the production account bootstrapped (../../README.md). The first
# deploy comes from a merge to `main` after staging has been signed off.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "african-market"
      Environment = "production"
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
  description = "The customer site, e.g. africanmarket.ae."
  type        = string
}

variable "route53_zone_id" {
  type    = string
  default = null
}

variable "image_tag" {
  type    = string
  default = "bootstrap"
}

variable "current_phase" {
  type    = number
  default = 0
}

variable "email_provider" {
  type    = string
  default = "ses"
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

  environment         = "production"
  region              = var.region
  domain              = var.domain
  route53_zone_id     = var.route53_zone_id
  current_phase       = var.current_phase
  image_tag           = var.image_tag
  email_from          = "African Market <no-reply@${var.domain}>"
  email_provider      = var.email_provider
  manual_secrets      = var.manual_secrets
  sentry_dsn_backend  = var.sentry_dsn_backend
  didit_workflow_id   = var.didit_workflow_id
  google_client_ids   = var.google_client_ids
  facebook_app_id     = var.facebook_app_id
  sentry_dsn_frontend = var.sentry_dsn_frontend

  google_maps_browser_key = var.google_maps_browser_key
  google_map_id           = var.google_map_id
  # No test numbers and no working hours in production.

  single_nat_gateway = false
  app_sizes = {
    gateway  = { cpu = 512, memory = 1024, desired_count = 2 }
    identity = { cpu = 512, memory = 1024, desired_count = 2 }
    web      = { cpu = 1024, memory = 2048, desired_count = 2 }
    seller   = { cpu = 512, memory = 1024, desired_count = 2 }
    admin    = { cpu = 256, memory = 512, desired_count = 1 }
  }

  db_instance_class = "db.t4g.medium"
  db_multi_az       = true
  redis_node_type   = "cache.t4g.small"
  redis_replicas    = 1
  mq_instance_type  = "mq.m5.large" # a cluster needs m5; t3.micro is single-instance only
  mq_cluster        = true

  log_retention_days = 90
  protect_data       = true
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

output "database_identifier" {
  value = module.platform.database_identifier
}

output "secret_names" {
  value = module.platform.secret_names
}
