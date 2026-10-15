variable "prefix" {
  description = "Secret name prefix, e.g. african-market/staging."
  type        = string
}

variable "generated" {
  description = "Names whose value is a random 64-character string (signing keys)."
  type        = list(string)
  default     = []
}

variable "value_names" {
  description = "The names in `values`, listed separately because keys of a sensitive map cannot key resources."
  type        = list(string)
  default     = []
}

variable "values" {
  description = "Name to value, for values Terraform knows (connection URLs)."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "manual" {
  description = "Names a person sets by hand."
  type        = list(string)
  default     = []
}

variable "recovery_window_days" {
  description = "Days a deleted secret can be restored. 0 deletes at once."
  type        = number
  default     = 7
}
