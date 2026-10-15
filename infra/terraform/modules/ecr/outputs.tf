output "repository_urls" {
  description = "App name to repository URL."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "repository_arns" {
  value = [for repo in aws_ecr_repository.this : repo.arn]
}
