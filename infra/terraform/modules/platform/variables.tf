variable "environment" {
  description = "staging or production. Becomes NODE_ENV in the backends."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment is staging or production."
  }
}

variable "region" {
  type = string
}

variable "domain" {
  description = "The customer site's host name; the others hang off it (api., seller., admin.)."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone for the domain. Null when DNS is managed elsewhere: the records are outputs."
  type        = string
  default     = null
}

variable "current_phase" {
  description = "Apps of this phase and earlier run (see SERVICES in libs/contracts). Phase 0: gateway, identity, the three Next apps."
  type        = number
  default     = 0
}

variable "image_tag" {
  description = "Image tag to run (the git commit, pushed by CI)."
  type        = string
}

variable "email_from" {
  description = "Sender of the emails identity sends."
  type        = string
}

variable "email_provider" {
  description = <<-EOT
    How identity sends email. Either way it speaks SMTP, so changing provider changes no code.
      ses    Terraform creates the SES identity and the SMTP credentials.
      smtp   any provider with an SMTP endpoint (Resend, Postmark, ...): set the secret
             <prefix>/SMTP_URL by hand, e.g. smtps://resend:<api key>@smtp.resend.com:465
  EOT
  type        = string
  default     = "ses"
  validation {
    condition     = contains(["ses", "smtp"], var.email_provider)
    error_message = "email_provider is ses or smtp."
  }
}

variable "otp_test_numbers" {
  description = <<-EOT
    Phone numbers that sign in with a fixed code, never sent: for the end-to-end tests. Terraform
    generates each code and stores OTP_TEST_NUMBERS for identity; the tests read the same secret.
    Must stay empty in production (identity refuses to start otherwise).
  EOT
  type        = list(string)
  default     = []
}

variable "working_hours" {
  description = "Run the apps and database only during these hours (Asia/Dubai), or null for always on."
  type = object({
    on_at  = string
    off_at = string
    days   = string
  })
  default = null
}

variable "manual_secrets" {
  description = "Secrets a person sets by hand (third-party credentials), given to every backend."
  type        = list(string)
  default     = []
}

# ── sizes ─────────────────────────────────────────────────────────────────────────────────────

variable "single_nat_gateway" {
  type = bool
}

variable "app_sizes" {
  description = "Per app: cpu, memory and task count. Apps not listed get the default."
  type = map(object({
    cpu           = number
    memory        = number
    desired_count = number
  }))
  default = {}
}

variable "db_instance_class" {
  type = string
}

variable "db_multi_az" {
  type = bool
}

variable "redis_node_type" {
  type = string
}

variable "redis_replicas" {
  type = number
}

variable "mq_instance_type" {
  type = string
}

variable "mq_cluster" {
  type = bool
}

variable "log_retention_days" {
  type = number
}

variable "protect_data" {
  description = "Deletion protection and final snapshots on the database, load balancer and buckets."
  type        = bool
  default     = true
}

# ── observability (F0-15) ─────────────────────────────────────────────────────────────────────

variable "tracing" {
  description = "Traces from the backends go to X-Ray in this region, through a collector beside each task."
  type        = bool
  default     = true
}

variable "otel_collector_image" {
  description = "The AWS Distro for OpenTelemetry collector, by exact version."
  type        = string
  default     = "public.ecr.aws/aws-observability/aws-otel-collector:v0.49.0"
}

variable "sentry_dsn_backend" {
  description = "Sentry DSN for the gateway and services. Empty: no error reports. Not a secret (it only allows sending)."
  type        = string
  default     = ""
}

variable "sentry_dsn_frontend" {
  description = "Sentry DSN compiled into the three Next apps (next_public_build_args). Empty: no error reports."
  type        = string
  default     = ""
}

variable "didit_workflow_id" {
  description = "The Didit workflow seller verification sessions follow (Didit Console > Workflows)."
  type        = string
}
