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

variable "console_security_groups" {
  description = "Name to security group id of what may open the management console (HTTPS 443): the load balancer, in test environments only. Empty everywhere else."
  type        = map(string)
  default     = {}
}

variable "engine_version" {
  description = "Matches the local docker compose image (3.13)."
  type        = string
  default     = "3.13"
}

variable "instance_type" {
  type    = string
  default = "mq.m7g.medium"
}

variable "cluster" {
  description = "Three-node cluster across zones (production) instead of one instance (staging)."
  type        = bool
  default     = false
}

variable "username" {
  type    = string
  default = "am_app"
}

variable "apply_immediately" {
  type    = bool
  default = false
}
