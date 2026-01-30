# Salesforce Integration

## Purpose
Ingest Salesforce account and opportunity data to support SSOT and pipeline analytics.

## Manifests
- `s3://gwi-raw-us-east-2-pc/orchestration/salesforce_daily/run_date=YYYY-MM-DD/manifest.json`

## Athena
- `curated_core.salesforce_account_current` (daily current snapshot)

## Deployed Today
- Daily manifest and current snapshot validation.

## Planned / Future
- Full opportunity-to-project mapping in curated_core.

