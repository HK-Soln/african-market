output "arns" {
  description = "Name to secret ARN, for the tasks' `secrets`."
  value = merge(
    { for name, secret in aws_secretsmanager_secret.managed : name => secret.arn },
    { for name, secret in aws_secretsmanager_secret.manual : name => secret.arn },
  )
}

output "all_arns" {
  value = concat(
    [for secret in aws_secretsmanager_secret.managed : secret.arn],
    [for secret in aws_secretsmanager_secret.manual : secret.arn],
  )
}
