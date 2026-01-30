# Gaiia Ingestion

## Purpose
Ingest customer/invoice data into curated_core for SSOT and reconciliation.

## Current status
- Curated scaffold exists: `athena/curated/ssot/50_ssot_gaiia_customers.sql`
- Raw ingestion depends on valid Gaiia auth and export contract.

## Landing (S3)
- If enabled, raw payloads should land under `s3://gwi-raw-us-east-2-pc/raw/gaiia/` with dt partitioning.

## Next step
- Implement raw ingestion and map to curated_core.gaiia_customers.
