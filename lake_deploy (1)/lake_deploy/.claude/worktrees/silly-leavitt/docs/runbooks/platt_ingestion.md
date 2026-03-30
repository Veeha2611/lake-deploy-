# Platt Ingestion

## Purpose
Ingest customer and product data for materials/cost analysis and SSOT joins.

## Landing (S3)
- Customer: `s3://gwi-raw-us-east-2-pc/raw/platt/customer/` (dt partition)
- Orchestration manifest: `s3://gwi-raw-us-east-2-pc/orchestration/platt_daily/run_date=YYYY-MM-DD/manifest.json`

## Schema (raw)
- `athena/raw/legacy_ddls/raw_platt_customer.sql`

## Recovery
- If a dt partition is incomplete, re-run that date and verify manifest proof pack.
