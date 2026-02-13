output "raw_bucket_arn" {
  value       = module.lake_inventory.raw_bucket_arn
  description = "ARN of the raw bucket."
}

output "curated_bucket_arn" {
  value       = module.lake_inventory.curated_bucket_arn
  description = "ARN of the curated bucket."
}

output "staging_bucket_arn" {
  value       = module.lake_inventory.staging_bucket_arn
  description = "ARN of the staging bucket."
}

