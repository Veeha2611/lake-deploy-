data "aws_s3_bucket" "raw" {
  bucket = var.raw_bucket_name
}

data "aws_s3_bucket" "curated" {
  bucket = var.curated_bucket_name
}

data "aws_s3_bucket" "staging" {
  bucket = var.staging_bucket_name
}

