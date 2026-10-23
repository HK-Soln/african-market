locals {
  # "amqps://b-1234.mq.me-central-1.on.aws:5671"
  endpoint = aws_mq_broker.this.instances[0].endpoints[0]
}

output "url" {
  description = "Connection URL with the credentials, for RABBITMQ_URL."
  value       = replace(local.endpoint, "amqps://", "amqps://${var.username}:${random_password.app.result}@")
  sensitive   = true
}

output "console_url" {
  value = aws_mq_broker.this.instances[0].console_url
}

output "username" {
  description = "The broker's one user, which also signs in to the management console."
  value       = var.username
}
