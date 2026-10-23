# ── inspection tools (test environments only, decision T-47) ─────────────────────────────────
#
# With inspection_tools, three pages to look inside a test environment, each on its own host
# behind its own login (the passwords are in Secrets Manager, see the inspection_logins output):
#
#   mail.<domain>  Mailpit: every email the apps send lands here, and none reaches a real person
#   mq.<domain>    the RabbitMQ management console of the Amazon MQ broker (the console only;
#                  the AMQP port stays private)
#   db.<domain>    pgweb, a read-only view of the database
#
# Staging and production never have them (the variable's validation refuses it).

locals {
  inspection = var.inspection_tools
  inspection_hosts = local.inspection ? {
    mail = "mail.${var.domain}"
    mq   = "mq.${var.domain}"
    db   = "db.${var.domain}"
  } : {}
  # One user name for both tools' logins; each has its own password.
  inspection_user = "inspect"
}

resource "random_password" "inspection" {
  for_each = local.inspection ? toset(["mail", "db"]) : toset([])
  length   = 32
  special  = false
}

module "mailpit" {
  count              = local.inspection ? 1 : 0
  source             = "../ecs-service"
  name               = "mailpit"
  cluster_id         = module.cluster.cluster_id
  cluster_name       = module.cluster.cluster_name
  region             = var.region
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  execution_role_arn = module.cluster.execution_role_arn
  image              = var.mailpit_image
  image_health_check = false
  container_port     = 8025
  extra_ports        = [1025]
  cpu                = 256
  memory             = 512
  desired_count      = 1
  log_retention_days = var.log_retention_days

  # Kept in memory: a test environment's mail lives only as long as the environment.
  environment = { MP_MAX_MESSAGES = "1000" }
  secrets     = { MP_UI_AUTH = module.secrets.arns["MAILPIT_UI_AUTH"] }

  ingress = [
    { from = "alb", source = module.alb.security_group_id, port = 8025 },
    # The apps send mail over SMTP (identity today, notifications later).
    { from = "backend", source = aws_security_group.backend.id, port = 1025 },
  ]
  discoverable = true
  namespace_id = module.cluster.namespace_id
  load_balancer = {
    listener_arn   = module.alb.https_listener_arn
    hosts          = [local.inspection_hosts.mail]
    priority       = 50
    health_path    = "/livez"
    health_matcher = "200,401"
  }
}

module "pgweb" {
  count              = local.inspection ? 1 : 0
  source             = "../ecs-service"
  name               = "pgweb"
  cluster_id         = module.cluster.cluster_id
  cluster_name       = module.cluster.cluster_name
  region             = var.region
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  execution_role_arn = module.cluster.execution_role_arn
  image              = var.pgweb_image
  image_health_check = false
  # Read only: pgweb runs every query in a read-only transaction. Made-up data only.
  command            = ["--readonly"]
  container_port     = 8081
  cpu                = 256
  memory             = 512
  desired_count      = 1
  log_retention_days = var.log_retention_days

  environment = { PGWEB_AUTH_USER = local.inspection_user }
  secrets = {
    PGWEB_DATABASE_URL = module.secrets.arns["PGWEB_DATABASE_URL"]
    PGWEB_AUTH_PASS    = module.secrets.arns["PGWEB_AUTH_PASS"]
  }

  # It reaches the database as the apps do.
  additional_security_group_ids = [aws_security_group.backend.id]
  ingress                       = [{ from = "alb", source = module.alb.security_group_id, port = 8081 }]
  load_balancer = {
    listener_arn   = module.alb.https_listener_arn
    hosts          = [local.inspection_hosts.db]
    priority       = 60
    health_path    = "/"
    health_matcher = "200,401"
  }
}

# The broker's console is not a task: the load balancer forwards mq.<domain> to it on 443. A
# private RabbitMQ broker is reached through an endpoint Amazon MQ puts in our network; Amazon MQ
# does not report that endpoint's address (ip_address is empty for RabbitMQ), but the console's
# host name resolves to it, so it is looked up once the broker exists. The broker has its own certificate, which the load balancer does not
# check (it does not check targets' certificates); browsers see the load balancer's.
resource "aws_lb_target_group" "mq_console" {
  count       = local.inspection ? 1 : 0
  name        = substr("${local.name}-mq-console", 0, 32)
  port        = 443
  protocol    = "HTTPS"
  target_type = "ip"
  vpc_id      = module.network.vpc_id

  health_check {
    protocol            = "HTTPS"
    path                = "/"
    matcher             = "200-399"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

data "dns_a_record_set" "mq_console" {
  count = local.inspection ? 1 : 0
  host  = trimsuffix(trimprefix(module.rabbitmq.console_url, "https://"), "/")
}

resource "aws_lb_target_group_attachment" "mq_console" {
  count            = local.inspection ? 1 : 0
  target_group_arn = aws_lb_target_group.mq_console[0].arn
  target_id        = data.dns_a_record_set.mq_console[0].addrs[0]
  port             = 443
}

resource "aws_lb_listener_rule" "mq_console" {
  count        = local.inspection ? 1 : 0
  listener_arn = module.alb.https_listener_arn
  priority     = 70

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mq_console[0].arn
  }

  condition {
    host_header {
      values = [local.inspection_hosts.mq]
    }
  }
}
