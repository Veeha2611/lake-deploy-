output "raw_bucket_arn" {
  value       = data.aws_s3_bucket.raw.arn
  description = "ARN of the raw bucket."
}

output "curated_bucket_arn" {
  value       = data.aws_s3_bucket.curated.arn
  description = "ARN of the curated bucket."
}

output "staging_bucket_arn" {
  value       = data.aws_s3_bucket.staging.arn
  description = "ARN of the staging bucket."
}

