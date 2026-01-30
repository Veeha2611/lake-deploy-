# Vetro Ingestion

## Purpose
Ingest network plan exports (geometry + metadata) for passings/BSL counts and network analytics.

## Landing (S3)
- API/backfill exports: `s3://gwi-raw-us-east-2-pc/raw/vetro_ui/plan_id=<ID>/dt=YYYY-MM-DD/`
- Manual UI exports: `s3://gwi-raw-us-east-2-pc/raw/vetro_ui_manual/plan_id=<ID>/dt=YYYY-MM-DD/`
- Orchestration manifest: `s3://gwi-raw-us-east-2-pc/orchestration/vetro_daily/run_date=YYYY-MM-DD/manifest.json`

## Schema (raw)
- `athena/raw/legacy_ddls/raw_vetro_exports.sql`

## Current status
- Manual Batch 1 + 2 ingested and indexed.
- Full plan coverage is not complete (exports outstanding).

## Reconciliation
- `docs/reference/vetro_reconciliation_with_manual_2026-01-30.csv`
- `docs/reference/vetro_remaining_work_2026-01-30.md`
