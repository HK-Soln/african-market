variable "name" {
  description = "Prefix for every resource, e.g. am-staging."
  type        = string
}

variable "region" {
  description = "AWS region, for the S3 endpoint name."
  type        = string
}

variable "cidr_block" {
  description = "VPC range. Split into /20 subnets."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Availability zones to use."
  type        = number
  default     = 3
}

variable "single_nat_gateway" {
  description = "One NAT gateway for all zones (cheaper; staging) instead of one per zone (production)."
  type        = bool
  default     = false
}

variable "log_retention_days" {
  type    = number
  default = 30
}
