# PostgreSQL 16 for every service (one schema each, as locally). PostGIS, citext and the other
# extensions are created by the services' migrations; the RDS master user may do that.

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "this" {
  name        = "${var.name}-postgres"
  description = "Postgres, from the app tasks only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "this" {
  for_each                     = var.allowed_security_groups
  security_group_id            = aws_security_group.this.id
  description                  = "From ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = each.value
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg16"
  family = "postgres16"

  # Only encrypted connections.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  # Queries slower than a second end up in the log.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "random_password" "master" {
  length  = 40
  special = false # it goes into a connection URL
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.database_name
  username = var.username
  password = random_password.master.result

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  publicly_accessible    = false
  parameter_group_name   = aws_db_parameter_group.this.name

  # Daily snapshots and point-in-time recovery.
  backup_retention_period  = var.backup_retention_days
  backup_window            = "22:00-23:00" # 02:00-03:00 in the UAE
  maintenance_window       = "fri:23:00-sat:00:00"
  copy_tags_to_snapshot    = true
  delete_automated_backups = false

  auto_minor_version_upgrade   = true
  performance_insights_enabled = true
  monitoring_interval          = 0

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = !var.final_snapshot
  final_snapshot_identifier = var.final_snapshot ? "${var.name}-final" : null
  apply_immediately         = var.apply_immediately
}
