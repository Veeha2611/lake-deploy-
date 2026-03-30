# Reconciliation & Exceptions

## Exception Tables
- `curated_recon.vetro_plan_exports_exceptions`
- `curated_recon.gaiia_customers_exceptions`
- `curated_recon.gaiia_invoices_exceptions`
- `curated_recon.ssot_daily_summary`

## Rule Summary
- **Vetro**: Exports are valid only if zip size >= 10KB and expected JSON/GeoJSON is present. Invalid exports are recorded in exceptions and skipped.
- **Vetro Gates**: Require non-zero S3 objects for `vetro_export_state/plan_index.json` and `vetro_export_state/backfill_queue.json`, plus non-zero latest dt partitions for `raw/vetro/`, `raw/vetro_plans/manual_exports/dt=`, and `raw/vetro_layers/dt=`.
- **Gaiia**: Curated outputs are compared to raw snapshots; mismatches are logged to exceptions.
- **Global SSOT**: Aggregates per-system status; failures are blocked only when thresholds are exceeded.

## Exception Handling Workflow
1. Write daily manifests for each system run.
2. Populate `*_current` tables from raw inputs.
3. Emit exceptions to `curated_recon.*` tables.
4. Update SSOT summary and deliverables tables.

## Deployed Today
- Exception tables for Vetro and Gaiia.
- SSOT daily summary rollup.

## Planned / Future
- Automated exception triage queues.
- Threshold policies per system with explicit SLAs.
