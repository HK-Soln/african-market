output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "distribution_id" {
  description = "The CloudFront distribution in front of the public bucket (CLOUDFRONT_DISTRIBUTION_ID)."
  value       = aws_cloudfront_distribution.public.id
}

output "public_bucket" {
  value = aws_s3_bucket.public.bucket
}

output "private_bucket" {
  value = aws_s3_bucket.private.bucket
}

output "public_base_url" {
  description = "Where public media is served from (MEDIA_PUBLIC_BASE_URL)."
  value       = "https://${aws_cloudfront_distribution.public.domain_name}"
}

output "media_service_statements" {
  description = "IAM statements for the media service's task role."
  value       = local.media_service_statements
}
