# Gaiia GraphQL SSOT Automation Runbook

Last updated: 2026-02-02

## Goal
Keep Gaiia GraphQL data fully loaded, SSOT‑ready, and queryable daily.

## Components
- **Lambda**: `gaiia-ingest`
- **Secret**: `gaiia/api_keys`
- **Registry**: `s3://gwi-raw-us-east-2-pc/source_exports/gaiia/gaiia_graphql_query_registry.json`
- **Raw landing**: `s3://gwi-raw-us-east-2-pc/raw/gaiia/graphql/<entity>/tenant=<tenant>/dt=YYYY-MM-DD/part-0001.json`
- **Glue crawler**: `gaiia-graphql-raw-crawler`
- **Glue DB**: `raw_gaiia`
- **SSOT views**: `sql/ssot/12_gaiia_graphql_current_views.sql`
- **Crosswalks**: `sql/ssot/90_gaiia_crosswalk_scaffold.sql`

## Setup (one‑time)
1. Ensure secrets exist in Secrets Manager: `gaiia/api_keys` with `gwi_key`, `lymefiber_key`, `dvfiber_key`, `base_url`.
2. Upload registry JSON to S3:
   - `source_exports/gaiia/gaiia_graphql_query_registry.json`
3. Deploy/update Lambda stack:
   - `external_sources/aws_local/gaiia_ingest_stack.yaml`
   - Schedule is enabled by default; uses `raw/gaiia/graphql` and API `https://api.gaiia.com/api/v1`.
4. Ensure Glue crawler exists: `gaiia-graphql-raw-crawler`.

## Daily flow
1. EventBridge triggers `gaiia-ingest` Lambda.
2. Lambda loads registry, paginates GraphQL, writes JSON per entity to raw S3.
3. Glue crawler catalogs new partitions.
4. Athena SSOT views read latest snapshots.

## Validation checks
- Raw landing: S3 partition exists for all entities and tenants.
- Glue: `raw_gaiia.raw_gaiia_graphql_<entity>` tables exist.
- SSOT views return rows for `gwi`, `lymefiber`, `dvfiber`.

## Troubleshooting
- If Lambda errors, check `raw/gaiia/graphql/_meta/dt=.../run.json` for per‑entity status.
- If crawler doesn’t update partitions, re‑run:
  - `aws glue start-crawler --name gaiia-graphql-raw-crawler`
