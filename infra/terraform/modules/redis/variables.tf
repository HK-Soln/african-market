variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "allowed_security_groups" {
  description = "Name to security group id of everything that may connect."
  type        = map(string)
}

variable "engine_version" {
  type    = string
  default = "7.1"
}

variable "node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "replicas" {
  description = "Read replicas; one or more turns on automatic failover across zones."
  type        = number
  default     = 0
}

variable "snapshot_retention_days" {
  type    = number
  default = 1
}

variable "apply_immediately" {
  type    = bool
  default = false
}
