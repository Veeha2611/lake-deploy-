variable "aws_region" {
  type        = string
  description = "AWS region for lake resources."
  default     = "us-east-2"
}

variable "raw_bucket_name" {
  type        = string
  description = "Primary raw/system-of-record S3 bucket."
  default     = "gwi-raw-us-east-2-pc"
}

variable "curated_bucket_name" {
  type        = string
  description = "Primary curated S3 bucket (if applicable)."
  default     = "gwi-curated-us-east-2-pc"
}

variable "staging_bucket_name" {
  type        = string
  description = "Primary staging S3 bucket (if applicable)."
  default     = "gwi-staging-pc"
}

