variable "name" {
  type = string
}

variable "domain" {
  description = "The domain email is sent from, e.g. staging.africanmarket.ae."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone to create the DKIM, MAIL FROM and DMARC records in. Null when DNS is elsewhere."
  type        = string
  default     = null
}
