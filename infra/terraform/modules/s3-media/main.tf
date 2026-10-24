# Three buckets, all in the UAE region (decision T-27):
#   uploads  quarantine. The only bucket browsers write to, through a single-use presigned POST
#            for one key; files wait there until the media service checks them, a day at most.
#   public   processed images. Written by the media service only; only CloudFront may read it.
#   private  documents (trade licences). Never public, versioned, KMS-encrypted; written and read
#            by the media service only, which streams them to admins through the gateway.
# Only uploads has CORS rules: browsers never talk to the other two.

# ── public media ────────────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "public" {
  bucket        = "${var.name}-media-public"
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_public_access_block" "public" {
  bucket                  = aws_s3_bucket.public.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "public" {
  bucket = aws_s3_bucket.public.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "public" {
  bucket = aws_s3_bucket.public.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "public" {
  bucket = aws_s3_bucket.public.id
  rule {
    id     = "abandoned-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_cloudfront_origin_access_control" "public" {
  name                              = "${var.name}-media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "public" {
  enabled         = true
  comment         = "${var.name} public media"
  is_ipv6_enabled = true
  http_version    = "http2and3"
  # Europe, the Middle East and Africa are in every class; 100 is the cheapest that has them.
  price_class = var.price_class

  origin {
    origin_id                = "media"
    domain_name              = aws_s3_bucket.public.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.public.id
  }

  default_cache_behavior {
    target_origin_id       = "media"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Managed policy "CachingOptimized".
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # The default *.cloudfront.net certificate; a custom media domain needs a certificate in
  # us-east-1 and can come later.
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "public" {
  bucket = aws_s3_bucket.public.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontReads"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.public.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.public.arn } }
      },
      {
        Sid       = "TlsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.public.arn, "${aws_s3_bucket.public.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.public]
}

# ── private documents (KYC) ─────────────────────────────────────────────────────────────────

resource "aws_kms_key" "private" {
  description         = "${var.name} private documents (KYC, trade licences)"
  enable_key_rotation = true
  # AWS's longest wait where data is kept; its shortest for a throwaway environment.
  deletion_window_in_days = var.force_destroy ? 7 : 30
}

resource "aws_kms_alias" "private" {
  name          = "alias/${var.name}-media-private"
  target_key_id = aws_kms_key.private.key_id
}

resource "aws_s3_bucket" "private" {
  bucket        = "${var.name}-media-private"
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_public_access_block" "private" {
  bucket                  = aws_s3_bucket.private.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "private" {
  bucket = aws_s3_bucket.private.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "private" {
  bucket = aws_s3_bucket.private.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "private" {
  bucket = aws_s3_bucket.private.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.private.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "private" {
  bucket = aws_s3_bucket.private.id
  rule {
    id     = "old-versions-and-abandoned-uploads"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = var.private_noncurrent_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "private" {
  bucket = aws_s3_bucket.private.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.private.arn, "${aws_s3_bucket.private.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.private]
}

# ── uploads (quarantine) ────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "uploads" {
  bucket        = "${var.name}-media-uploads"
  force_destroy = true # nothing here is kept: files live a day at most
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# The private key: a trade licence is a document before it is checked, too.
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.private.arn
    }
    bucket_key_enabled = true
  }
}

# Form uploads (POST) from the apps, nothing else.
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  # Browsers PUT the file with a signed link (decision T-44).
  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = var.upload_origins
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

# An upload nobody confirmed is gone after a day, whatever the media service does.
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "quarantine"
    status = "Enabled"
    filter {}
    expiration {
      days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

# What the media service may do, for its task role, and nothing more: it signs upload forms for
# the quarantine bucket (so it needs PutObject there), reads and deletes what arrives, writes and
# deletes public images, and writes, reads and deletes private documents. ListBucket on uploads
# only, so a file that has not arrived reads as missing rather than as access denied.
locals {
  media_service_statements = [
    {
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      Resource = ["${aws_s3_bucket.uploads.arn}/*"]
    },
    {
      Effect   = "Allow"
      Action   = ["s3:ListBucket"]
      Resource = [aws_s3_bucket.uploads.arn]
    },
    {
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:DeleteObject"]
      Resource = ["${aws_s3_bucket.public.arn}/*"]
    },
    {
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
      Resource = ["${aws_s3_bucket.private.arn}/*"]
    },
    {
      Effect   = "Allow"
      Action   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
      Resource = [aws_kms_key.private.arn]
    },
    {
      # Removed public images stop being served from the CDN's caches.
      Effect   = "Allow"
      Action   = ["cloudfront:CreateInvalidation"]
      Resource = [aws_cloudfront_distribution.public.arn]
    },
  ]
}
