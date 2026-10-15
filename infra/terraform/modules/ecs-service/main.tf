# One app on Fargate: task definition, service, log group, security group, and optionally a
# load balancer target (by host name) and a Cloud Map name for TCP from the gateway.

locals {
  ports = distinct(concat([var.container_port], var.extra_ports))
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.cluster_name}/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_security_group" "this" {
  name        = "${var.cluster_name}-${var.name}"
  description = "${var.name} tasks"
  vpc_id      = var.vpc_id

  egress {
    description = "Out to the data stores, other services and the internet through NAT"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "this" {
  # Keyed by name: security group ids are not known until apply.
  for_each                     = { for rule in var.ingress : "${rule.from}-${rule.port}" => rule }
  security_group_id            = aws_security_group.this.id
  description                  = "From ${each.value.from}"
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
  referenced_security_group_id = each.value.source
}

# What the app itself may call in AWS (S3 for media, for example). Empty for most apps.
resource "aws_iam_role" "task" {
  name = "${var.cluster_name}-${var.name}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "task" {
  # Counted by the list's length, which is known at plan time even when the ARNs inside are not.
  count  = length(var.task_policy_statements) > 0 ? 1 : 0
  name   = "app"
  role   = aws_iam_role.task.id
  policy = jsonencode({ Version = "2012-10-17", Statement = var.task_policy_statements })
}

# ECS Exec (`aws ecs execute-command`) for debugging a running task.
resource "aws_iam_role_policy" "exec" {
  count = var.enable_exec ? 1 : 0
  name  = "ecs-exec"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.cluster_name}-${var.name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([{
    name      = var.name
    image     = var.image
    essential = true
    command   = var.command
    portMappings = [for port in local.ports : {
      containerPort = port
      protocol      = "tcp"
    }]
    environment = [for key in sort(keys(var.environment)) : { name = key, value = var.environment[key] }]
    secrets     = [for key in sort(keys(var.secrets)) : { name = key, valueFrom = var.secrets[key] }]
    # The image's own check: /health on the app's HTTP port.
    healthCheck = {
      command     = ["CMD", "node", "healthcheck.cjs"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    readonlyRootFilesystem = false
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = var.region
        awslogs-stream-prefix = var.name
      }
    }
  }])
}

resource "aws_service_discovery_service" "this" {
  count = var.discoverable ? 1 : 0
  name  = var.name

  dns_config {
    namespace_id   = var.namespace_id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }

}

resource "aws_lb_target_group" "this" {
  count       = var.load_balancer == null ? 0 : 1
  name        = substr("${var.cluster_name}-${var.name}", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id
  # Long enough for in-flight requests, short enough that a deploy does not drag.
  deregistration_delay = 30

  health_check {
    path                = var.load_balancer.health_path
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener_rule" "this" {
  count        = var.load_balancer == null ? 0 : 1
  listener_arn = var.load_balancer.listener_arn
  priority     = var.load_balancer.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[0].arn
  }

  condition {
    host_header {
      values = var.load_balancer.hosts
    }
  }
}

resource "aws_ecs_service" "this" {
  name                   = var.name
  cluster                = var.cluster_id
  task_definition        = aws_ecs_task_definition.this.arn
  desired_count          = var.desired_count
  launch_type            = "FARGATE"
  enable_execute_command = var.enable_exec
  propagate_tags         = "SERVICE"

  # Slow first boot (migrations ran separately, but Nest and Next still need a moment).
  health_check_grace_period_seconds = var.load_balancer == null ? null : 60

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = concat([aws_security_group.this.id], var.additional_security_group_ids)
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  dynamic "load_balancer" {
    for_each = var.load_balancer == null ? [] : [1]
    content {
      target_group_arn = aws_lb_target_group.this[0].arn
      container_name   = var.name
      container_port   = var.container_port
    }
  }

  dynamic "service_registries" {
    for_each = var.discoverable ? [1] : []
    content {
      registry_arn = aws_service_discovery_service.this[0].arn
    }
  }

  # The count is set when the service is created; after that the staging schedule (and later
  # autoscaling) changes it, and a deploy must not undo that.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener_rule.this]
}
