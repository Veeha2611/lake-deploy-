# Salesforce Ingestion

## Purpose
Ingest accounts and opportunities into raw layer for pipeline and customer analytics.

## Landing (S3)
- Accounts: `s3://gwi-raw-us-east-2-pc/raw/salesforce/accounts/` (dt partition)
- Opportunities: `s3://gwi-raw-us-east-2-pc/raw/salesforce/opportunities/` (dt partition)
- Orchestration manifest: `s3://gwi-raw-us-east-2-pc/orchestration/salesforce_daily/run_date=YYYY-MM-DD/manifest.json`

## Schema (raw)
- Accounts: `athena/raw/legacy_ddls/raw_salesforce_accounts.sql`
- Opportunities: `athena/raw/legacy_ddls/raw_salesforce_opportunities.sql`

## Curated/SSOT
- Curated joins used in SSOT views (see `docs/ssot/SSOT_POLICY.md`).

## Recovery
- Re-run last dt partition if a source pull fails.
