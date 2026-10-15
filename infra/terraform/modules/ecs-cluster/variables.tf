variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "namespace" {
  description = "Private DNS namespace for service discovery, e.g. staging.am.internal."
  type        = string
}

variable "secret_arns" {
  description = "Secrets the tasks may receive as environment variables."
  type        = list(string)
}

variable "container_insights" {
  type    = bool
  default = true
}
