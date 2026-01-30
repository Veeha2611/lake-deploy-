# Gaiia Integration

## Purpose
Ingest customers and invoices for operational analytics and reconciliation.

## S3 Outputs
- `s3://gwi-raw-us-east-2-pc/raw/gaiia/<entity>/dt=YYYY-MM-DD/part-0001.json`
- Curated:
  - `s3://gwi-raw-us-east-2-pc/curated_core/gaiia_customers_curated_raw/`
  - `s3://gwi-raw-us-east-2-pc/curated_core/gaiia_invoices_curated_raw/`
- Exceptions:
  - `s3://gwi-raw-us-east-2-pc/curated_recon/gaiia_customers_exceptions/`
  - `s3://gwi-raw-us-east-2-pc/curated_recon/gaiia_invoices_exceptions/`

## Athena SQL
- `source_exports/10_gaiia_customers.sql`
- `source_exports/11_gaiia_invoices.sql`

## Reference Scripts
- `external_sources/gaiia_ingest/` (sanitized; no discovery outputs)

## Deployed Today
- Curated customer/invoice tables + exception logging.

## Planned / Future
- Automated contract validation harness (pending connector stability).
