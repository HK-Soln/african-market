# Everything one environment needs, wired together. envs/staging and (later) envs/production
# call this with their own sizes.
#
#   internet ──HTTPS──▶ ALB ──host──▶ web / seller / admin (3000)
#                            └──api.──▶ gateway (4000) ──TCP──▶ identity, shops, ... (41xx)
#   backends ──▶ RDS Postgres, ElastiCache Redis, Amazon MQ, S3; secrets from Secrets Manager

locals {
  # The inspection tools' Mailpit takes the email instead of SES (inspection.tf).
  ses   = var.email_provider == "ses" && !var.inspection_tools
  didit = var.kyc_provider == "didit"
  # Social sign-in (F1-09): only the providers with ids set are switched on.
  social_providers = join(",", compact([length(var.google_client_ids) > 0 ? "google" : "", var.facebook_app_id != "" ? "facebook" : ""]))
  name             = "am-${var.environment}"
  namespace        = "${var.environment}.am.internal"

  hosts = {
    web     = var.domain
    seller  = "seller.${var.domain}"
    admin   = "admin.${var.domain}"
    gateway = "api.${var.domain}"
  }
  origins = [for app in ["web", "seller", "admin"] : "https://${local.hosts[app]}"]

  # Mirrors SERVICES in libs/contracts/src/services.ts.
  services = {
    identity      = { tcp = 4101, http = 4201, phase = 0 }
    shops         = { tcp = 4102, http = 4202, phase = 1 }
    catalog       = { tcp = 4103, http = 4203, phase = 1 }
    discovery     = { tcp = 4104, http = 4204, phase = 1 }
    media         = { tcp = 4105, http = 4205, phase = 1 }
    messaging     = { tcp = 4106, http = 4206, phase = 2 }
    notifications = { tcp = 4107, http = 4207, phase = 2 }
    orders        = { tcp = 4108, http = 4208, phase = 3 }
    payments      = { tcp = 4109, http = 4209, phase = 3 }
  }
  enabled_services = { for name, svc in local.services : name => svc if svc.phase <= var.current_phase }

  next_apps = {
    web    = { priority = 30 }
    seller = { priority = 20 }
    admin  = { priority = 10 }
  }

  default_size = { cpu = 256, memory = 512, desired_count = 1 }
  size = {
    for app in concat(keys(local.services), ["gateway", "web", "seller", "admin"]) :
    app => merge(lookup(var.app_sizes, app, local.default_size), var.apps_running ? {} : { desired_count = 0 })
  }

  # A repository for every app, so the registry is complete before a phase starts.
  all_apps = concat(["gateway"], keys(local.services), keys(local.next_apps))
}

module "network" {
  source             = "../network"
  name               = local.name
  region             = var.region
  single_nat_gateway = var.single_nat_gateway
  log_retention_days = var.log_retention_days
}

# Per environment: staging and production are expected to live in separate AWS accounts.
module "ecr" {
  source       = "../ecr"
  prefix       = "african-market"
  repositories = local.all_apps
  force_delete = !var.protect_data
}

# ── data stores ───────────────────────────────────────────────────────────────────────────────

# Every backend task joins this group; the data stores accept connections from it.
resource "aws_security_group" "backend" {
  name        = "${local.name}-backend"
  description = "Backend tasks (gateway and services): may reach Postgres, Redis and RabbitMQ"
  vpc_id      = module.network.vpc_id
}

module "postgres" {
  source                  = "../rds-postgis"
  name                    = local.name
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.database_subnet_ids
  allowed_security_groups = { backend = aws_security_group.backend.id }
  instance_class          = var.db_instance_class
  multi_az                = var.db_multi_az
  deletion_protection     = var.protect_data
  final_snapshot          = var.protect_data
}

module "redis" {
  source                  = "../redis"
  name                    = local.name
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.database_subnet_ids
  allowed_security_groups = { backend = aws_security_group.backend.id }
  node_type               = var.redis_node_type
  replicas                = var.redis_replicas
}

module "rabbitmq" {
  source                  = "../rabbitmq"
  name                    = local.name
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.database_subnet_ids
  allowed_security_groups = { backend = aws_security_group.backend.id }
  console_security_groups = var.inspection_tools ? { alb = module.alb.security_group_id } : {}
  # Throwaway environments leave nothing behind (decision T-48).
  general_logs  = var.protect_data
  instance_type = var.mq_instance_type
  cluster       = var.mq_cluster
}

module "media" {
  source         = "../s3-media"
  name           = "african-market-${var.environment}"
  upload_origins = local.origins
  force_destroy  = !var.protect_data
}

# Only with email_provider = "ses". With "smtp", any provider (Resend, Postmark, ...) is used
# through its SMTP endpoint and SMTP_URL is a secret set by hand.
module "ses" {
  count           = var.email_provider == "ses" ? 1 : 0
  source          = "../ses"
  name            = local.name
  domain          = var.domain
  route53_zone_id = var.route53_zone_id
}

# Each test number's code: six random digits, kept in the state and in Secrets Manager.
resource "random_password" "otp_test_code" {
  for_each = toset(var.otp_test_numbers)
  length   = 6
  upper    = false
  lower    = false
  special  = false
  numeric  = true
}

locals {
  otp_test_numbers = join(",", [for phone in var.otp_test_numbers : "${phone}:${random_password.otp_test_code[phone].result}"])
  has_test_numbers = length(var.otp_test_numbers) > 0
}

module "secrets" {
  source    = "../secrets"
  prefix    = "african-market/${var.environment}"
  generated = ["JWT_ACCESS_SECRET", "OTP_HMAC_SECRET"]
  value_names = concat(
    ["DATABASE_URL", "REDIS_URL", "RABBITMQ_URL"],
    local.ses || var.inspection_tools ? ["SMTP_URL"] : [],
    local.has_test_numbers ? ["OTP_TEST_NUMBERS"] : [],
    var.inspection_tools ? ["MAILPIT_UI_AUTH", "PGWEB_AUTH_PASS", "PGWEB_DATABASE_URL"] : [],
  )
  values = merge(
    local.ses ? { SMTP_URL = module.ses[0].smtp_url } : {},
    var.inspection_tools ? {
      SMTP_URL        = "smtp://mailpit.${local.namespace}:1025"
      MAILPIT_UI_AUTH = "${local.inspection_user}:${random_password.inspection["mail"].result}"
      PGWEB_AUTH_PASS = random_password.inspection["db"].result
      # pgweb has no copy of the RDS certificate bundle: encrypted, not verified (test data only).
      PGWEB_DATABASE_URL = format(
        "postgres://%s:%s@%s:%d/%s?sslmode=require",
        module.postgres.username,
        module.postgres.password,
        module.postgres.address,
        module.postgres.port,
        module.postgres.database_name,
      )
    } : {},
    local.has_test_numbers ? { OTP_TEST_NUMBERS = local.otp_test_numbers } : {},
    {
      # Verified TLS against the RDS certificate bundle baked into the service images.
      DATABASE_URL = format(
        "postgres://%s:%s@%s:%d/%s?sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem",
        module.postgres.username,
        module.postgres.password,
        module.postgres.address,
        module.postgres.port,
        module.postgres.database_name,
      )
      REDIS_URL    = module.redis.url
      RABBITMQ_URL = module.rabbitmq.url
    },
  )
  # Didit's keys are set by hand too (Didit Console > API & Webhooks); only shops gets them.
  # Facebook's app secret likewise (Meta for Developers > App settings), when Facebook is on.
  manual = concat(
    var.manual_secrets,
    local.ses || var.inspection_tools ? [] : ["SMTP_URL"],
    local.didit ? ["DIDIT_API_KEY", "DIDIT_API_SECRET"] : [],
    var.facebook_app_id != "" ? ["FACEBOOK_APP_SECRET"] : [],
  )
  recovery_window_days = var.protect_data ? 7 : 0
}

# ── cluster and load balancer ─────────────────────────────────────────────────────────────────

module "cluster" {
  source = "../ecs-cluster"
  name   = local.name
  # Enhanced Container Insights is billed per metric and writes a log group outside Terraform,
  # which outlived every test environment: on only where data is kept.
  container_insights = var.protect_data
  vpc_id             = module.network.vpc_id
  namespace          = local.namespace
  secret_arns        = module.secrets.all_arns
}

module "alb" {
  source              = "../alb"
  name                = local.name
  vpc_id              = module.network.vpc_id
  vpc_cidr            = module.network.vpc_cidr
  public_subnet_ids   = module.network.public_subnet_ids
  domain_name         = local.hosts.web
  alternative_names   = concat([local.hosts.gateway, local.hosts.seller, local.hosts.admin], values(local.inspection_hosts))
  route53_zone_id     = var.route53_zone_id
  deletion_protection = var.protect_data
}

# ── apps ──────────────────────────────────────────────────────────────────────────────────────

locals {
  # Where each service listens and is reached. Every key is set: the apps have no defaults
  # (decision T-45), and a feature that is off is written `none` (ECS drops empty values).
  service_endpoints = merge([for name, svc in local.services : {
    "${upper(name)}_HOST"      = "${name}.${local.namespace}"
    "${upper(name)}_TCP_PORT"  = tostring(svc.tcp)
    "${upper(name)}_HTTP_PORT" = tostring(svc.http)
  }]...)

  backend_env = merge(local.service_endpoints, {
    DEPLOY_ENV            = var.environment
    LOG_LEVEL             = "info"
    LOG_FORMAT            = "json"
    CURRENT_PHASE         = tostring(var.current_phase)
    EVENTS_EXCHANGE       = "am.events"
    EVENT_RETRY_DELAYS_MS = "5000,30000,120000"
    TYPEORM_LOGGING       = "false"
    OUTBOX_POLL_MS        = "500"
    # The end-to-end routes and made-up social sign-in stay off in every AWS environment.
    TEST_SUPPORT_ROUTES      = "false"
    OTEL_TRACES_SAMPLE_RATIO = "1"
    # Phone codes: the real provider (WhatsApp first). Until it is built identity answers
    # SMS_PROVIDER_NOT_CONFIGURED, and the console provider is refused outside development.
    SMS_PROVIDER               = "twilio"
    EMAIL_PROVIDER             = "smtp"
    EMAIL_FROM                 = var.email_from
    S3_REGION                  = var.region
    S3_UPLOADS_BUCKET          = module.media.uploads_bucket
    S3_PUBLIC_BUCKET           = module.media.public_bucket
    CLOUDFRONT_DISTRIBUTION_ID = module.media.distribution_id
    S3_PRIVATE_BUCKET          = module.media.private_bucket
    MEDIA_PUBLIC_BASE_URL      = module.media.public_base_url
    # The collector beside each task (modules/ecs-service); `none`: spans are made but kept.
    OTEL_EXPORTER_OTLP_ENDPOINT = var.tracing ? "http://localhost:4318" : "none"
    SENTRY_DSN                  = var.sentry_dsn_backend == "" ? "none" : var.sentry_dsn_backend
  })

  otel_collector = var.tracing ? { image = var.otel_collector_image } : null

  backend_secrets = merge(
    {
      for name in ["DATABASE_URL", "REDIS_URL", "RABBITMQ_URL", "JWT_ACCESS_SECRET", "OTP_HMAC_SECRET", "SMTP_URL"] :
      name => module.secrets.arns[name]
    },
    { for name in var.manual_secrets : name => module.secrets.arns[name] },
  )
}

module "gateway" {
  source             = "../ecs-service"
  name               = "gateway"
  cluster_id         = module.cluster.cluster_id
  cluster_name       = module.cluster.cluster_name
  region             = var.region
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  execution_role_arn = module.cluster.execution_role_arn
  image              = "${module.ecr.repository_urls["gateway"]}:${var.image_tag}"
  container_port     = 4000
  cpu                = local.size.gateway.cpu
  memory             = local.size.gateway.memory
  desired_count      = local.size.gateway.desired_count
  log_retention_days = var.log_retention_days

  environment = merge(local.backend_env, {
    GATEWAY_PORT             = "4000"
    WEB_ORIGIN               = "https://${local.hosts.web}"
    SELLER_ORIGIN            = "https://${local.hosts.seller}"
    ADMIN_ORIGIN             = "https://${local.hosts.admin}"
    COOKIE_DOMAIN            = ".${var.domain}"
    COOKIE_SECURE            = "true"
    TRUST_PROXY_HOPS         = "1"
    SERVICE_TIMEOUT_MS       = "5000"
    AUTH_THROTTLE_MULTIPLIER = "1"
  })
  secrets        = local.backend_secrets
  otel_collector = local.otel_collector

  additional_security_group_ids = [aws_security_group.backend.id]
  ingress = concat(
    [{ from = "alb", source = module.alb.security_group_id, port = 4000 }],
    # The Next apps call the gateway from the server by its internal name.
    [for app, _ in local.next_apps : { from = app, source = module.next[app].security_group_id, port = 4000 }],
  )
  # Discoverable so the Next apps' server-side calls stay inside the VPC.
  discoverable = true
  namespace_id = module.cluster.namespace_id
  load_balancer = {
    listener_arn = module.alb.https_listener_arn
    hosts        = [local.hosts.gateway]
    priority     = 40
    health_path  = "/api/v1/health"
  }
}

module "service" {
  source   = "../ecs-service"
  for_each = local.enabled_services

  name               = each.key
  cluster_id         = module.cluster.cluster_id
  cluster_name       = module.cluster.cluster_name
  region             = var.region
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  execution_role_arn = module.cluster.execution_role_arn
  image              = "${module.ecr.repository_urls[each.key]}:${var.image_tag}"
  container_port     = each.value.http
  extra_ports        = [each.value.tcp]
  cpu                = local.size[each.key].cpu
  memory             = local.size[each.key].memory
  desired_count      = local.size[each.key].desired_count
  log_retention_days = var.log_retention_days

  environment = merge(
    local.backend_env,
    # Seller identity verification (decision T-28): the hosted page sends sellers back here.
    each.key == "identity" ? merge(
      {
        SOCIAL_PROVIDERS    = local.social_providers == "" ? "none" : local.social_providers
        GOOGLE_CLIENT_IDS   = length(var.google_client_ids) > 0 ? join(",", var.google_client_ids) : "none"
        FACEBOOK_APP_ID     = var.facebook_app_id == "" ? "none" : var.facebook_app_id
        FAKE_SOCIAL_SIGN_IN = "false"
      },
      # Secrets otherwise (below); `none` when there are none.
      local.has_test_numbers ? {} : { OTP_TEST_NUMBERS = "none" },
      var.facebook_app_id != "" ? {} : { FACEBOOK_APP_SECRET = "none" },
    ) : {},
    # Storage is reached with the task's role, not keys, at AWS's own endpoint.
    each.key == "media" ? {
      S3_ENDPOINT          = "none"
      S3_PRESIGN_ENDPOINT  = "none"
      S3_ACCESS_KEY_ID     = "none"
      S3_SECRET_ACCESS_KEY = "none"
      S3_CREATE_BUCKETS    = "false"
    } : {},
    each.key == "shops" ? merge(
      {
        KYC_PROVIDER   = var.kyc_provider
        SELLER_APP_URL = "https://${local.hosts.seller}"
      },
      local.didit ? {
        DIDIT_API_URL     = "https://verification.didit.me"
        DIDIT_WORKFLOW_ID = var.didit_workflow_id
        } : {
        DIDIT_API_URL     = "none"
        DIDIT_WORKFLOW_ID = "none"
        DIDIT_API_KEY     = "none"
        DIDIT_API_SECRET  = "none"
      },
    ) : {},
  )
  # Only identity may see the test numbers' codes and Facebook's secret, and only shops Didit's keys.
  secrets = merge(
    local.backend_secrets,
    each.key == "identity" && local.has_test_numbers ? { OTP_TEST_NUMBERS = module.secrets.arns["OTP_TEST_NUMBERS"] } : {},
    each.key == "identity" && var.facebook_app_id != "" ? { FACEBOOK_APP_SECRET = module.secrets.arns["FACEBOOK_APP_SECRET"] } : {},
    each.key == "shops" && local.didit ? {
      DIDIT_API_KEY    = module.secrets.arns["DIDIT_API_KEY"]
      DIDIT_API_SECRET = module.secrets.arns["DIDIT_API_SECRET"]
    } : {},
  )

  task_policy_statements = each.key == "media" ? module.media.media_service_statements : []
  otel_collector         = local.otel_collector

  additional_security_group_ids = [aws_security_group.backend.id]
  # The gateway calls every service; discovery also reads shops and catalog (decision T-31), so
  # those two take calls from the backend group too (no service-to-service call changes data).
  ingress = concat(
    [{ from = "gateway", source = module.gateway.security_group_id, port = each.value.tcp }],
    contains(["shops", "catalog"], each.key) ? [{ from = "backend", source = aws_security_group.backend.id, port = each.value.tcp }] : [],
  )
  discoverable = true
  namespace_id = module.cluster.namespace_id
}

module "next" {
  source   = "../ecs-service"
  for_each = local.next_apps

  name               = each.key
  cluster_id         = module.cluster.cluster_id
  cluster_name       = module.cluster.cluster_name
  region             = var.region
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  execution_role_arn = module.cluster.execution_role_arn
  # Built for this environment: NEXT_PUBLIC_* are compiled in (see the next_public_build_args output).
  image              = "${module.ecr.repository_urls[each.key]}:${var.image_tag}"
  container_port     = 3000
  cpu                = local.size[each.key].cpu
  memory             = local.size[each.key].memory
  desired_count      = local.size[each.key].desired_count
  log_retention_days = var.log_retention_days

  # Server-side calls go to the gateway inside the VPC; the browser uses api.<domain>.
  environment = {
    GATEWAY_URL = "http://gateway.${local.namespace}:4000"
  }

  ingress = [{ from = "alb", source = module.alb.security_group_id, port = 3000 }]
  load_balancer = {
    listener_arn = module.alb.https_listener_arn
    hosts        = [local.hosts[each.key]]
    priority     = each.value.priority
    health_path  = "/health"
  }
}

# ── working hours (staging) ───────────────────────────────────────────────────────────────────

module "working_hours" {
  count  = var.working_hours == null ? 0 : 1
  source = "../schedule"

  name         = "${local.name}-hours"
  cluster_name = module.cluster.cluster_name
  services = merge(
    { gateway = { name = module.gateway.service_name, arn = module.gateway.service_arn, desired_count = local.size.gateway.desired_count } },
    { for name, svc in module.service : name => { name = svc.service_name, arn = svc.service_arn, desired_count = local.size[name].desired_count } },
    { for name, svc in module.next : name => { name = svc.service_name, arn = svc.service_arn, desired_count = local.size[name].desired_count } },
  )
  db_instance_id  = module.postgres.identifier
  db_instance_arn = module.postgres.arn
  on_at           = var.working_hours.on_at
  off_at          = var.working_hours.off_at
  days            = var.working_hours.days
}
