variable "name" {
  description = "App name, e.g. identity. Also the container and Cloud Map name."
  type        = string
}

variable "cluster_id" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "image" {
  description = "Full image reference, <repository>:<tag>."
  type        = string
}

variable "command" {
  description = "Overrides the image's CMD; null keeps it."
  type        = list(string)
  default     = null
}

variable "container_port" {
  description = "The HTTP port: the load balancer target and the healthcheck."
  type        = number
}

variable "extra_ports" {
  description = "Other ports the container listens on (a service's TCP port)."
  type        = list(number)
  default     = []
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "cpu_architecture" {
  description = "X86_64 or ARM64. Must match the image."
  type        = string
  default     = "X86_64"
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "environment" {
  description = "Plain environment variables."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Environment variables read from Secrets Manager: name to secret ARN (or ARN:key::)."
  type        = map(string)
  default     = {}
}

variable "execution_role_arn" {
  type = string
}

variable "task_policy_statements" {
  description = "IAM policy statements for the running app (S3 for media, for example). Empty for most."
  type        = any
  default     = []
}

variable "ingress" {
  description = "Who may connect: a name for the source (alb, gateway), its security group and the port."
  type = list(object({
    from   = string
    source = string
    port   = number
  }))
  default = []
}

variable "additional_security_group_ids" {
  description = "Groups the tasks also join, e.g. the one the data stores accept connections from."
  type        = list(string)
  default     = []
}

variable "discoverable" {
  description = "Register <name> in the Cloud Map namespace, so the gateway can reach it by name."
  type        = bool
  default     = false
}

variable "namespace_id" {
  description = "Cloud Map namespace, used when discoverable."
  type        = string
  default     = null
}

variable "load_balancer" {
  description = "Route these host names on the HTTPS listener to the app, or null."
  type = object({
    listener_arn = string
    hosts        = list(string)
    priority     = number
    health_path  = string
  })
  default = null
}

variable "enable_exec" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  type    = number
  default = 30
}
