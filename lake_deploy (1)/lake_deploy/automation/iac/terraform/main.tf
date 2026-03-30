module "lake_inventory" {
  source = "./modules/lake_inventory"

  raw_bucket_name     = var.raw_bucket_name
  curated_bucket_name = var.curated_bucket_name
  staging_bucket_name = var.staging_bucket_name
}

