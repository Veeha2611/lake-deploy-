# Gaiia Ingestion

## Purpose
Ingest customer/invoice data into curated_core for SSOT and reconciliation.

## Current status
- Curated scaffold exists: `athena/curated/ssot/50_ssot_gaiia_customers.sql`
- Raw ingestion depends on valid Gaiia auth and export contract.

## Landing (S3)
- If enabled, raw payloads should land under `s3://gwi-raw-us-east-2-pc/raw/gaiia/` with dt partitioning.

## Next step
- Implement raw ingestion and map to curated_core.gaiia_customers.

## 2026-02-02 run

- Lambda `gaiia-ingest` updated for GraphQL registry and invoked successfully.
- Query registry loaded from: `s3://gwi-raw-us-east-2-pc/orchestration/gaiia/query_registry/gaiia_query_registry.json`
- Daily schedule confirmed enabled (`gaiia-ingest-schedule`).
- Raw landing verified under `s3://gwi-raw-us-east-2-pc/raw/gaiia/`.
- Glue crawler `gaiia-raw-crawler` run and completed.
- Proof: `docs/reference/gaiia_ingestion_run_2026-02-02.md`

## Remaining to reach full SSOT

- Replace probe queries in registry with final GraphQL queries and required variables (operation_id, ticket_id, etc.).
- Implement parsed, canonical fields for invoices (beyond JSON scaffold).
