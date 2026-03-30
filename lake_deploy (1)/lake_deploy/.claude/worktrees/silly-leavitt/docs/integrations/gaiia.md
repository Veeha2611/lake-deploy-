# Gaiia Integration

## Purpose
Ingest customers and invoices for operational analytics and reconciliation.

## API access (confirmed)
- **Endpoint**: `https://api.gaiia.com/api/v1` (GraphQL POST).
- **Auth header**: `X-Gaiia-Api-Key: <token>` (no `Authorization: Bearer`).
- **Env vars**:
  - `GAIIA_API_URL` (default to `https://api.gaiia.com/api/v1`)
  - `GAIIA_API_TOKEN` (or tenant-specific keys in Secrets Manager)
-- **Query registry**:
  - Store a JSON registry in S3 and set `GAIIA_QUERY_REGISTRY_KEY`.
  - Each entry should include `entity`, `query`, `variables`, and optional `root_field`, `paginate`, `page_size`.
  - Default registry location: `source_exports/gaiia/gaiia_graphql_query_registry.json`.
- **Lambda config** (if using `gaiia_ingest_stack.yaml`):
  - `GAIIA_AUTH_HEADER="X-Gaiia-Api-Key"`
  - `GAIIA_AUTH_PREFIX=""`
  - `GAIIA_QUERY_REGISTRY_KEY="<s3 key to registry>"` (optional, enables GraphQL mode)

## S3 Outputs
- GraphQL landing (JSONL):
  - `s3://gwi-raw-us-east-2-pc/raw/gaiia/graphql/<entity>/tenant=<tenant>/dt=YYYY-MM-DD/part-0001.json`
- Legacy REST landing (if used):
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

## Glue Crawler (raw GraphQL)
- **Crawler name**: `gaiia-graphql-raw-crawler`
- **S3 target**: `s3://gwi-raw-us-east-2-pc/raw/gaiia/graphql/`
- **Glue DB**: `raw_gaiia`
- **Table prefix**: `raw_gaiia_graphql_`

## Deployed Today
- Curated customer/invoice tables + exception logging.

## Planned / Future
- Automated contract validation harness (pending connector stability).
