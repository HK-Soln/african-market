output "url" {
  description = "Connection URL with the auth token, for REDIS_URL."
  value       = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
  sensitive   = true
}
