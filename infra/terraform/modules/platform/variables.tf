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
