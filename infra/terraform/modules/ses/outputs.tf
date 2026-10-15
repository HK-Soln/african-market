output "smtp_url" {
  description = "For SMTP_URL: STARTTLS on 587 with the SMTP credentials."
  value = format(
    "smtp://%s:%s@email-smtp.%s.amazonaws.com:587",
    urlencode(aws_iam_access_key.smtp.id),
    urlencode(aws_iam_access_key.smtp.ses_smtp_password_v4),
    local.region,
  )
  sensitive = true
}

output "dns_records" {
  description = "Records to add at the DNS provider when it is not Route 53."
  value       = local.dns_records
}
