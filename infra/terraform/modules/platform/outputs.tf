output "urls" {
  value = {
    web     = "https://${local.hosts.web}"
    seller  = "https://${local.hosts.seller}"
    admin   = "https://${local.hosts.admin}"
    gateway = "https://${local.hosts.gateway}"
  }
}

output "load_balancer_dns_name" {
  description = "Point the four host names here when DNS is not in Route 53."
  value       = module.alb.dns_name
}

output "dns_records" {
  description = "Records to create at the DNS provider when DNS is not in Route 53: certificate validation and email."
  value = {
    certificate = module.alb.certificate_validation_records
    # With another provider, its own dashboard lists the records to add.
    email = local.ses ? module.ses[0].dns_records : []
  }
}

output "ecr_repositories" {
  value = module.ecr.repository_urls
}

output "next_public_build_args" {
  description = "Build arguments for this environment's Next images (CI, F0-14)."
  value = {
    NEXT_PUBLIC_GATEWAY_URL = "https://${local.hosts.gateway}"
    NEXT_PUBLIC_WEB_URL     = "https://${local.hosts.web}"
  }
}

output "cluster_name" {
  value = module.cluster.cluster_name
}

output "migration" {
  description = "How a deploy runs migrations: each service's task definition with the command `migrate` (F0-14)."
  value = {
    subnets         = module.network.private_subnet_ids
    security_groups = { for name, svc in module.service : name => [svc.security_group_id, aws_security_group.backend.id] }
    task_families   = { for name, svc in module.service : name => svc.task_definition_family }
  }
}

output "database_identifier" {
  description = "The RDS instance; a deploy outside working hours starts it first."
  value       = module.postgres.identifier
}

output "otp_test_numbers_secret" {
  description = "Secrets Manager name of OTP_TEST_NUMBERS, which the end-to-end tests read; null when there are none."
  value       = local.has_test_numbers ? "african-market/${var.environment}/OTP_TEST_NUMBERS" : null
}

output "secret_names" {
  description = "Secrets Manager names; the manual ones need a value set by hand."
  value       = keys(module.secrets.arns)
}
