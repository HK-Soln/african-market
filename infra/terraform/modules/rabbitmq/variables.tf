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
  description = "Matches the local docker compose image (3.13)."
  type        = string
  default     = "3.13"
}

variable "instance_type" {
  type    = string
  default = "mq.t3.micro"
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
