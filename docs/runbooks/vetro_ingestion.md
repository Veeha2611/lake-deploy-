# Vetro Ingestion

## Purpose
Ingest network plan exports (geometry + metadata) for passings/BSL counts and network analytics.

## Landing (S3)
- API/backfill exports: `s3://gwi-raw-us-east-2-pc/raw/vetro/plan_id=<ID>/dt=YYYY-MM-DD/`
- Manual UI exports (batch GeoJSON): `s3://gwi-raw-us-east-2-pc/raw/vetro_plans/manual_exports/dt=YYYY-MM-DD/`
- Layer exports (zipped + unpacked): `s3://gwi-raw-us-east-2-pc/raw/vetro_layers/dt=YYYY-MM-DD/`
- Orchestration manifest: `s3://gwi-raw-us-east-2-pc/orchestration/vetro_daily/run_date=YYYY-MM-DD/manifest.json`

## Schema (raw)
- `athena/raw/legacy_ddls/raw_vetro_exports.sql`

## Current status
- Manual batches ingested and indexed; plan list total tracked in `vetro_export_state/plan_index.json`.
- Full plan coverage must be verified against `docs/reference/vetro_completeness_2026-02-03.md`.

## Reconciliation
- `docs/reference/vetro_reconciliation_with_manual_2026-01-30.csv`
- `docs/reference/vetro_remaining_work_2026-01-30.md`
- `docs/reference/vetro_completeness_2026-02-03.md`

## SSOT rule (authoritative plans)
Per Vetro SME guidance (Chris call transcript), **all operational/BSL/passings/network analytics must use only plans tagged "As Built."**
In the lake this is enforced via `curated_core.v_vetro_plans_as_built` (phase_id=3) and downstream views
such as `curated_core.v_vetro_passings_by_plan`, which filter to as-built plan_ids only.

## Completeness Gates
Run `runbooks/ssot_source_gates.sh` and confirm:
- `vetro_export_state/plan_index.json` and `vetro_export_state/backfill_queue.json` exist and are non-zero.
- Latest dt partitions for `raw/vetro/`, `raw/vetro_plans/manual_exports/dt=`, and `raw/vetro_layers/dt=` are non-zero.
- Service-location counts and BSL coverage meet expected thresholds in `docs/reference/vetro_completeness_2026-02-03.md`.
