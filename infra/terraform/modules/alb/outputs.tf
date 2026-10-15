output "security_group_id" {
  value = aws_security_group.this.id
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}

output "dns_name" {
  description = "Point the host names here (CNAME, or an alias in Route 53)."
  value       = aws_lb.this.dns_name
}

output "certificate_validation_records" {
  description = "DNS records that prove we own the domain. Add them at the DNS provider when it is not Route 53."
  value = [for option in aws_acm_certificate.this.domain_validation_options : {
    name  = option.resource_record_name
    type  = option.resource_record_type
    value = option.resource_record_value
  }]
}
