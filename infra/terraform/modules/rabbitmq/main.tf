# Amazon MQ for RabbitMQ: the event bus. Private, TLS only (amqps on 5671).

resource "aws_security_group" "this" {
  name        = "${var.name}-rabbitmq"
  description = "RabbitMQ, from the app tasks only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "amqps" {
  for_each                     = var.allowed_security_groups
  security_group_id            = aws_security_group.this.id
  description                  = "AMQPS from ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 5671
  to_port                      = 5671
  referenced_security_group_id = each.value
}

resource "random_password" "app" {
  length  = 40
  special = false # Amazon MQ refuses commas, colons and equals signs; it also goes into a URL
}

resource "aws_mq_broker" "this" {
  broker_name                = var.name
  engine_type                = "RabbitMQ"
  engine_version             = var.engine_version
  host_instance_type         = var.instance_type
  deployment_mode            = var.cluster ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"
  publicly_accessible        = false
  auto_minor_version_upgrade = true
  apply_immediately          = var.apply_immediately

  # A single instance lives in one subnet; a cluster spans three.
  subnet_ids      = var.cluster ? var.subnet_ids : [var.subnet_ids[0]]
  security_groups = [aws_security_group.this.id]

  user {
    username = var.username
    password = random_password.app.result
  }

  logs {
    general = true
  }

  maintenance_window_start_time {
    day_of_week = "FRIDAY"
    time_of_day = "23:00"
    time_zone   = "UTC"
  }
}
