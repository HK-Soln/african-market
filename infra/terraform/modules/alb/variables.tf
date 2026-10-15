variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "domain_name" {
  description = "The certificate's main name, e.g. staging.africanmarket.ae."
  type        = string
}

variable "alternative_names" {
  description = "Other host names on the certificate, e.g. api.staging.africanmarket.ae."
  type        = list(string)
  default     = []
}

variable "route53_zone_id" {
  description = "Hosted zone for the domain, to create the validation and host records. Null when DNS is elsewhere."
  type        = string
  default     = null
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "access_logs_bucket" {
  description = "S3 bucket for access logs, or null for none."
  type        = string
  default     = null
}
