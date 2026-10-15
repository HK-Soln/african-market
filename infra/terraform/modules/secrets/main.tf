# One Secrets Manager secret per environment variable, at <prefix>/<NAME>. ECS reads them into the
# task's environment at start; values never appear in a task definition.
#
#   values    set by Terraform from what it created (connection URLs) or generated (signing keys)
#   manual    created with a placeholder; a person sets the real value in the console or CLI, and
#             Terraform never overwrites it (third-party credentials, e.g. the WhatsApp provider)

resource "random_password" "generated" {
  for_each = toset(var.generated)
  length   = 64
  special  = false
}

locals {
  managed = merge(
    { for name in var.generated : name => random_password.generated[name].result },
    var.values,
  )
  # Names only, so they can key for_each; the values stay sensitive.
  managed_names = toset(concat(var.generated, var.value_names))
}

resource "aws_secretsmanager_secret" "managed" {
  for_each                = local.managed_names
  name                    = "${var.prefix}/${each.key}"
  recovery_window_in_days = var.recovery_window_days
}

resource "aws_secretsmanager_secret_version" "managed" {
  for_each      = local.managed_names
  secret_id     = aws_secretsmanager_secret.managed[each.key].id
  secret_string = local.managed[each.key]
}

resource "aws_secretsmanager_secret" "manual" {
  for_each                = toset(var.manual)
  name                    = "${var.prefix}/${each.key}"
  description             = "Set by hand: aws secretsmanager put-secret-value --secret-id ${var.prefix}/${each.key} --secret-string ..."
  recovery_window_in_days = var.recovery_window_days
}

# ECS cannot start a task whose secret has no value, so each starts with a placeholder.
resource "aws_secretsmanager_secret_version" "manual" {
  for_each      = toset(var.manual)
  secret_id     = aws_secretsmanager_secret.manual[each.key].id
  secret_string = "unset"
  lifecycle {
    ignore_changes = [secret_string, version_stages]
  }
}
