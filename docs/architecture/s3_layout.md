# S3 Layout (gwi-raw-us-east-2-pc)

## Raw Zone
- `raw/vetro/plan_id=<plan_id>/dt=<YYYY-MM-DD>/` — Vetro plan exports (JSON/GeoJSON)
- `raw/vetro_features/` — Vetro feature snapshots + metadata
- `raw/platt/<table>/` — Platt raw tables (customer, iheader, idetail, billing, custrate, history)
- `raw/intacct_xml/<entity>/YYYY-MM-DD/` — Intacct XML (gl_entries, vendors, customers, ap_bills, ap_payments, ar_payments)
- `raw/intacct_json/gl_entries/run_date=YYYY-MM-DD/` — Intacct JSON GL entries
- `raw/gaiia/<entity>/dt=YYYY-MM-DD/part-0001.json` — Gaiia raw snapshots (customers, invoices)
- `raw/manual/` — Manually staged source documents and converted extracts
- `raw/investor_docs/YYYY-MM-DD/` — Investor docs (Excel/Word/KMZ), staged for cataloging

## Curated Zone
- `curated_core/` — Canonical curated views/tables (projects_enriched, gaiia_* curated, vetro_plan_exports_curated_raw)
- `curated_ssot/` — SSOT tables (deliverables, SSOT rollups)
- `curated_recon/` — Reconciliation exception outputs (gaiia_*_exceptions, vetro_plan_exports_exceptions)
- `curated/platt/` — Curated Platt tables and billing summary

## Orchestration & State
- `orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json` — Proof artifacts per run
- `orchestration/lambda-code/` — Lambda deployment zips
- `vetro_export_state/plan_index.json` — Vetro export queue state
- `vetro_export_state/backfill_queue.json` — Vetro backfill queue
- `vetro_export_state/backfill_complete.json` — Completion marker

## Knowledge / Documentation
- `knowledge/notion/pages/dt=YYYY-MM-DD/` — Notion raw JSON exports
- `knowledge/notion/text/dt=YYYY-MM-DD/` — Notion text/markdown
- `knowledge/notion/index/dt=YYYY-MM-DD/index.ndjson` — Notion index
- `knowledge_base/` — Knowledge retrieval lane for Base44 app

## Athena Output
- `athena-results/` and `athena-result/` — Athena query outputs (reporting + proofs)
