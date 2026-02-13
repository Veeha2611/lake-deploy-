# Platt Integration

## Purpose
Ingest and curate Platt billing/customer data for revenue analysis and SSOT.

## Raw Tables (S3)
- `s3://gwi-raw-us-east-2-pc/raw/platt/customer`
- `s3://gwi-raw-us-east-2-pc/raw/platt/iheader`
- `s3://gwi-raw-us-east-2-pc/raw/platt/idetail`
- `s3://gwi-raw-us-east-2-pc/raw/platt/billing`
- `s3://gwi-raw-us-east-2-pc/raw/platt/custrate`
- History tables under `raw/platt/*_history`

## Curated Tables
- `curated/platt/customer/`
- `curated/platt/iheader/`
- `curated/platt/idetail/`
- `curated/platt/billing/`
- `curated/platt/custrate/`
- `curated/platt/billing_summary/`

## DDL / SQL
- Raw table DDL: `source_exports/03_raw_platt_tables.sql` (adapted into repo where needed)
- Curated tables: `source_exports/20_curated_platt.sql` and `22_curated_platt_billing_summary.sql`

## Reference Assets
- `external_sources/ops_raw_platt/` (headers + DDL generator)

## Deployed Today
- Nightly cadence with proof packs and SSOT rollups.

## Planned / Future
- Expand reconciliation between Platt and GL lines.
- Ensure Platt exports are quoted or use a delimiter that avoids comma collisions; re-run raw → curated refresh after export fix.
