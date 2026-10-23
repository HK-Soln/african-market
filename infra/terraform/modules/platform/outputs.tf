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
    NEXT_PUBLIC_SELLER_URL  = "https://${local.hosts.seller}"
    # `none` (no DSN): the apps report nothing. The environment is what reports are filed under.
    NEXT_PUBLIC_SENTRY_DSN         = var.sentry_dsn_frontend == "" ? "none" : var.sentry_dsn_frontend
    NEXT_PUBLIC_SENTRY_ENVIRONMENT = var.environment
    # A browser key (public by design; limit it to the site's addresses in Google Cloud);
    # `none`: no map.
    NEXT_PUBLIC_GOOGLE_MAPS_KEY = var.google_maps_browser_key == "" ? "none" : var.google_maps_browser_key
    NEXT_PUBLIC_GOOGLE_MAP_ID   = var.google_map_id == "" ? "none" : var.google_map_id
  }
}

output "cluster_name" {
  value = module.cluster.cluster_name
}

output "desired_counts" {
  description = "Tasks per ECS service when running. Terraform sets a count only when it creates a service (ignore_changes), so a script that starts the apps later uses these."
  # Only the apps that have a service in this phase.
  value = merge(
    {
      for app in concat(["gateway"], keys(local.enabled_services), keys(local.next_apps)) :
      app => lookup(var.app_sizes, app, local.default_size).desired_count
    },
    # The inspection tools (inspection.tf), one task each.
    local.inspection ? { mailpit = 1, pgweb = 1 } : {},
  )
}

output "inspection_urls" {
  description = "The inspection pages (test environments with inspection_tools), or {}."
  value       = { for tool, host in local.inspection_hosts : tool => "https://${host}" }
}

output "inspection_logins" {
  description = "How to sign in to each inspection page: the user, and the Secrets Manager secret (and JSON key, for the database) holding the password. Never the passwords themselves."
  value = local.inspection ? {
    mail = { user = local.inspection_user, secret = "african-market/${var.environment}/MAILPIT_UI_AUTH", note = "the secret is user:password" }
    db   = { user = local.inspection_user, secret = "african-market/${var.environment}/PGWEB_AUTH_PASS", note = "the secret is the password" }
    mq   = { user = module.rabbitmq.username, secret = "african-market/${var.environment}/RABBITMQ_URL", note = "the password is between the second : and the @" }
  } : {}
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
