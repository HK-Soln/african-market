terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 6.0" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
    # The RabbitMQ console's address (inspection.tf).
    dns = { source = "hashicorp/dns", version = ">= 3.4" }
  }
}
