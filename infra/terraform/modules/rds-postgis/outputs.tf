output "identifier" {
  value = aws_db_instance.this.identifier
}

output "arn" {
  value = aws_db_instance.this.arn
}

output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "database_name" {
  value = aws_db_instance.this.db_name
}

output "username" {
  value = aws_db_instance.this.username
}

output "password" {
  value     = random_password.master.result
  sensitive = true
}
