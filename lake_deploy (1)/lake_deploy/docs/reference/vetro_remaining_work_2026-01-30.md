# Vetro Remaining Work (2026-01-30)

## Status
- Manual Batch 1 + 2 exports are ingested and indexed.
- API/backfill exports are incomplete; full plan export is still outstanding.

## What is missing
- Complete Vetro plan export coverage (all plan IDs).
- Final reconciliation of S3 exports against authoritative plan list.

## Where exports should land
- API/backfill: `s3://gwi-raw-us-east-2-pc/raw/vetro_ui/plan_id=.../dt=YYYY-MM-DD/`
- Manual UI: `s3://gwi-raw-us-east-2-pc/raw/vetro_ui_manual/plan_id=.../dt=YYYY-MM-DD/`

## Required artifacts to finish
- Authoritative Vetro plan list (plan_id + plan_name + status)
- Completion of backfill queue or a plan-id export manifest

## Reconciliation steps (after exports complete)
1) Refresh S3 inventories for `raw/vetro_ui` and `raw/vetro_ui_manual`.
2) Regenerate `vetro_reconciliation_with_manual_2026-01-30.csv`.
3) Update `vetro_exports_audit.md` and `audit_completion_status_2026-01-30.md`.
