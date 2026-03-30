# Vetro Integration

## Purpose
Exports Vetro plan data into S3 for GIS/network analytics and passings calculations.

## Ingest Method
- **Lambda**: `automation/lambda/vetro_export_lambda.py`
- **IaC**: `automation/cf/vetro_export_stack.yaml`
- **Deployment scripts**: `runbooks/deploy_vetro_export.sh`, `runbooks/validate_vetro_export.sh`
- **Legacy scripts**: `external_sources/vetro_ingest/` (reference only)

## S3 Outputs
- Raw exports: `s3://gwi-raw-us-east-2-pc/raw/vetro/plan_id=<plan_id>/dt=<YYYY-MM-DD>/`
- State files: `s3://gwi-raw-us-east-2-pc/vetro_export_state/plan_index.json`

## Athena
- Raw table DDL: `athena/raw/01_raw_vetro_ddl.sql`
- Projection: `athena/raw/02_raw_vetro_projection.sql`
- Curated rollup: `athena/curated/10_curated_vetro_rollup.sql`

## Rate Limiting & Backfill
- 429 responses set `next_allowed_ts` in `plan_index.json`.
- Backfill uses `backfill_queue.json` and `backfill_complete.json`.

## Deployed Today
- Scheduled Lambda export with state tracking.

## Planned / Future
- Full backfill completion monitor + alerting.
- Expanded export formats if needed (GeoJSON/SHP).
