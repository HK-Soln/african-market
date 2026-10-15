variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Database subnets, in at least two zones."
  type        = list(string)
}

variable "allowed_security_groups" {
  description = "Name to security group id of everything that may connect (the service tasks)."
  type        = map(string)
}

variable "engine_version" {
  type    = string
  default = "16"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "database_name" {
  type    = string
  default = "african_market"
}

variable "username" {
  type    = string
  default = "am_admin"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "max_allocated_storage" {
  description = "Storage autoscaling ceiling, in GB."
  type        = number
  default     = 100
}

variable "multi_az" {
  type    = bool
  default = true
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "final_snapshot" {
  description = "Take a snapshot when the instance is destroyed."
  type        = bool
  default     = true
}

variable "apply_immediately" {
  type    = bool
  default = false
}
