# Platt Export Format Fix (CSV quoting or pipe delimiter)

## Goal
Eliminate column shifts caused by commas in text fields so raw Platt data parses correctly in the lake.

## Required change (choose one)
### Option A — Proper CSV quoting (preferred if Platt can export with quotes)
- Ensure all text fields are quoted.
- Confirm commas inside names/addresses are preserved within quotes.

### Option B — Pipe-delimited export (recommended if quoting is not available)
- Export using `|` as delimiter.
- No quoting required, but delimiter must not appear in fields.

## Data to re-export (minimum)
- `iheader`
- `idetail`
- `customer`
- `custrate`
- `billing` (if used)

## Landing paths (raw)
```
s3://gwi-raw-us-east-2-pc/raw/platt/iheader/dt=YYYY-MM-DD/
s3://gwi-raw-us-east-2-pc/raw/platt/idetail/dt=YYYY-MM-DD/
s3://gwi-raw-us-east-2-pc/raw/platt/customer/dt=YYYY-MM-DD/
s3://gwi-raw-us-east-2-pc/raw/platt/custrate/dt=YYYY-MM-DD/
s3://gwi-raw-us-east-2-pc/raw/platt/billing/dt=YYYY-MM-DD/
```

## Glue updates (if pipe-delimited)
Athena DDL/ALTER is blocked in this workgroup. Use Glue API to update SerDe + header skip.

SerDe:
- `org.apache.hadoop.hive.serde2.OpenCSVSerde`

Serde parameters:
- `separatorChar = |`
- `quoteChar = "`
- `escapeChar = \\`

Table parameters:
- `skip.header.line.count = 1`

Tables:
- `raw_platt.iheader_raw`
- `raw_platt.idetail_raw`
- `raw_platt.customer`
- `raw_platt.custrate_raw`

If unquoted CSVs already landed in the same `dt` partition, move them to `_invalid/` before validation so the pipe parse is clean.

## Refresh steps (after re-export)
1) `MSCK REPAIR TABLE` for all Platt raw tables after the SerDe update.
2) Rebuild curated Platt tables:
   - `curated_platt.iheader`
   - `curated_platt.idetail`
   - `curated_platt.customer`
   - `curated_platt.custrate`
3) Rebuild `curated_platt.billing_derived` and refresh:
   - `curated_core.platt_billing_current`
4) Validate:
   - `iheader.total` == sum(`idetail.id_extended`)
   - Record QIDs in `docs/reference/lake_audit_2026-01-30.md`
