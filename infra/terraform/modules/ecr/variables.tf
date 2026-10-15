variable "prefix" {
  description = "Repository name prefix, e.g. african-market (repositories are <prefix>/<app>)."
  type        = string
}

variable "repositories" {
  description = "App names, one repository each."
  type        = list(string)
}

variable "keep_images" {
  type    = number
  default = 30
}

variable "force_delete" {
  description = "Allow destroying a repository that still has images."
  type        = bool
  default     = false
}
