# Platt Source -> Lake Mapping (2026-01-26)

## Core tables

| source_table             | lake_table                 |
|--------------------------|----------------------------|
| dbo.customer             | raw_platt.customer         |
| dbo.iheader              | raw_platt.iheader_raw      |
| dbo.idetail              | raw_platt.idetail_raw      |
| dbo.custrate             | raw_platt.custrate_raw     |
| gwi.middleware_plat_billings  | raw_platt.billing     |
| derived.billing_summary (from base tables) | raw_platt.billing_summary |

## History tables (audit trail)

If we want full audit history, ingest these into separate lake tables:

| source_table             | lake_table                      |
|--------------------------|---------------------------------|
| dbo.iheader__History     | raw_platt.iheader_history       |
| dbo.idetail__History     | raw_platt.idetail_history       |
| dbo.custrate__History    | raw_platt.custrate_history      |

Notes:
- History tables should be landed to S3 under `raw/platt/<table>_history/` with the same CSV layout as the base table.
- Add separate Glue tables and curated Parquet outputs to keep audit data isolated from current-state extracts.
- `raw_platt.billing_summary` is a lake-side artifact (exported/derived from base tables such as `iheader` + `idetail` + `customer` + rate history); do not assume a 1:1 native source table name for mirror audits.
