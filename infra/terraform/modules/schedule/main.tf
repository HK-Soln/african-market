# Turns an environment off outside working hours and back on, with EventBridge Scheduler calling
# the AWS APIs directly (no code to run). Staging only.
#
#   on    start the database, then (15 minutes later, once it is up) give each app its tasks
#   off   take every app to 0 tasks, then stop the database
#
# What can be stopped is: Fargate tasks and the RDS instance, most of staging's bill. The load
# balancer, NAT gateway, Redis and Amazon MQ cannot be paused; they keep running.

locals {
  timezone = "Asia/Dubai"
  # "08:00" -> minutes after midnight.
  on_minutes  = tonumber(split(":", var.on_at)[0]) * 60 + tonumber(split(":", var.on_at)[1])
  off_minutes = tonumber(split(":", var.off_at)[0]) * 60 + tonumber(split(":", var.off_at)[1])
  # The database starts 15 minutes before the apps, so they do not crash-loop while it boots,
  # and stops 5 minutes after them.
  cron = {
    db_on    = local.on_minutes - 15
    apps_on  = local.on_minutes
    apps_off = local.off_minutes
    db_off   = local.off_minutes + 5
  }
  expression = {
    for name, minutes in local.cron :
    name => "cron(${minutes % 60} ${floor(minutes / 60)} ? * ${var.days} *)"
  }
}

resource "aws_scheduler_schedule_group" "this" {
  name = var.name
}

resource "aws_iam_role" "scheduler" {
  name = "${var.name}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:UpdateService"]
        Resource = [for service in var.services : service.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["rds:StartDBInstance", "rds:StopDBInstance"]
        Resource = var.db_instance_arn
      },
    ]
  })
}

resource "aws_scheduler_schedule" "db_on" {
  name                         = "db-on"
  group_name                   = aws_scheduler_schedule_group.this.name
  schedule_expression          = local.expression.db_on
  schedule_expression_timezone = local.timezone
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:startDBInstance"
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ DbInstanceIdentifier = var.db_instance_id })
    retry_policy {
      maximum_retry_attempts = 0 # already running: nothing to do
    }
  }
}

resource "aws_scheduler_schedule" "db_off" {
  name                         = "db-off"
  group_name                   = aws_scheduler_schedule_group.this.name
  schedule_expression          = local.expression.db_off
  schedule_expression_timezone = local.timezone
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance"
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ DbInstanceIdentifier = var.db_instance_id })
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

resource "aws_scheduler_schedule" "apps_on" {
  for_each                     = var.services
  name                         = "${each.key}-on"
  group_name                   = aws_scheduler_schedule_group.this.name
  schedule_expression          = local.expression.apps_on
  schedule_expression_timezone = local.timezone
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler.arn
    input = jsonencode({
      Cluster      = var.cluster_name
      Service      = each.value.name
      DesiredCount = each.value.desired_count
    })
  }
}

resource "aws_scheduler_schedule" "apps_off" {
  for_each                     = var.services
  name                         = "${each.key}-off"
  group_name                   = aws_scheduler_schedule_group.this.name
  schedule_expression          = local.expression.apps_off
  schedule_expression_timezone = local.timezone
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.scheduler.arn
    input = jsonencode({
      Cluster      = var.cluster_name
      Service      = each.value.name
      DesiredCount = 0
    })
  }
}
