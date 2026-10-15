variable "name" {
  description = "Schedule group name, e.g. am-staging-hours."
  type        = string
}

variable "cluster_name" {
  type = string
}

variable "services" {
  description = "Key to the ECS service's name and ARN, and its task count during working hours."
  type = map(object({
    name          = string
    arn           = string
    desired_count = number
  }))
}

variable "db_instance_id" {
  type = string
}

variable "db_instance_arn" {
  type = string
}

variable "on_at" {
  description = "When the apps are up, Asia/Dubai time (HH:MM). The database starts 15 minutes earlier."
  type        = string
  default     = "08:00"
}

variable "off_at" {
  description = "When the apps stop, Asia/Dubai time (HH:MM). The database stops 5 minutes later."
  type        = string
  default     = "20:00"
}

variable "days" {
  description = "Working days, in cron day-of-week form. The UAE weekend is Saturday and Sunday."
  type        = string
  default     = "MON-FRI"
}
