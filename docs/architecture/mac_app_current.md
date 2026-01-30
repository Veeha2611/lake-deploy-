# MAC App (Base44) — Current Wiring

This summary reflects the 2026-01-30 Base44 exports.

## Modules Wired to Athena
- Network Map (GIS) — `vetro_raw_db.vetro_raw_json_lines`
- Projects Pipeline — `curated_core.projects_enriched`
- Revenue Reconciliation Pack — `curated_core.invoice_line_item_repro_v1`, `curated_core.v_monthly_revenue_platt_long`
- AI Intelligence Console — curated_core views + S3 knowledge lane
- Dashboard Tiles — curated_core KPI views

## Evidence Fields (Standard)
- athena_query_execution_id
- generated_sql
- rows_returned
- rows_truncated (where applicable)

## Limits
- GIS layers: 2,000 per layer
- Tables: 200 default, 2,000 max

## Deployed Today
- All 5 modules wired with evidence fields.

## Planned / Future
- Pagination support for large datasets.
- Expanded knowledge ingestion sources.

## Reference
- `docs/architecture/base44_app_architecture.md`
