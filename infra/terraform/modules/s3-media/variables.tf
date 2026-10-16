variable "name" {
  description = "Bucket name prefix; must be globally unique, e.g. african-market-staging."
  type        = string
}

variable "upload_origins" {
  description = "Web origins that post upload forms to the quarantine bucket."
  type        = list(string)
}

variable "price_class" {
  type    = string
  default = "PriceClass_100"
}

variable "private_noncurrent_days" {
  description = "How long a replaced or deleted private document is kept."
  type        = number
  default     = 30
}

variable "force_destroy" {
  description = "Allow destroying buckets that still hold files."
  type        = bool
  default     = false
}
