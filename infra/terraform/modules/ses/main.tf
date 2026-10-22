# Sending email with SES: the domain identity with DKIM and a custom MAIL FROM, plus SMTP
# credentials, because identity sends through SMTP (EMAIL_PROVIDER=smtp) for now.
#
# The SMTP credentials are an IAM access key, which is long-lived. It can only send email from
# this domain. Once identity gets an SES API provider (EMAIL_PROVIDER=ses), the task role can
# send instead and this user goes away.
#
# A new SES account is in the sandbox: it only sends to verified addresses until AWS approves
# production access (a support request; see the README).

data "aws_region" "current" {}

resource "aws_sesv2_email_identity" "this" {
  email_identity = var.domain
  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "this" {
  email_identity         = aws_sesv2_email_identity.this.email_identity
  mail_from_domain       = "mail.${var.domain}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

locals {
  region = data.aws_region.current.region
  tokens = aws_sesv2_email_identity.this.dkim_signing_attributes[0].tokens
  # Keys are fixed, values come from SES: Terraform must know every key when it plans, before
  # the identity (and so its DKIM tokens) exists. Easy DKIM always gives three tokens.
  dns_records = merge(
    {
      for i in range(3) : "dkim-${i}" => {
        name  = "${local.tokens[i]}._domainkey.${var.domain}"
        type  = "CNAME"
        value = "${local.tokens[i]}.dkim.amazonses.com"
      }
    },
    {
      mail-from-mx  = { name = "mail.${var.domain}", type = "MX", value = "10 feedback-smtp.${local.region}.amazonses.com" }
      mail-from-spf = { name = "mail.${var.domain}", type = "TXT", value = "v=spf1 include:amazonses.com ~all" }
      dmarc         = { name = "_dmarc.${var.domain}", type = "TXT", value = "v=DMARC1; p=none;" }
    },
  )
}

resource "aws_route53_record" "this" {
  for_each = var.route53_zone_id == null ? {} : local.dns_records
  zone_id  = var.route53_zone_id
  name     = each.value.name
  type     = each.value.type
  ttl      = 600
  records  = [each.value.value]
}

resource "aws_iam_user" "smtp" {
  name = "${var.name}-ses-smtp"
}

resource "aws_iam_user_policy" "smtp" {
  name = "send-from-${replace(var.domain, ".", "-")}"
  user = aws_iam_user.smtp.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendRawEmail"]
      Resource = aws_sesv2_email_identity.this.arn
    }]
  })
}

resource "aws_iam_access_key" "smtp" {
  user = aws_iam_user.smtp.name
}
