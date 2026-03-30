# Vetro Reconciliation (2026-01-30)

## Inputs
- `raw/vetro_ui/plans/dt=2026-01-28/plans.json` → `source_exports/vetro_plans_2026-01-30/plans.json`
- `vetro_export_state/backfill_queue.json` → `source_exports/vetro_state_2026-01-30/backfill_queue.json`
- `raw/vetro_ui/plan_id=...` exports (S3 list)
- Manual batches from Downloads

## Plan Inventory Summary
- Total plans in plans.json: **1,912**
- Status breakdown:
  - Active: **1,440**
  - Archived: **472**

## Automated/UI Exports (raw/vetro_ui)
- Plan IDs present: **8**
- Exported plan IDs: **2, 4, 5, 218, 224, 239, 316, 408**

## Backfill Queue
- Remaining plan IDs in backfill queue: **1,552**

## Manual Batch Index
- Manual batch index file: `docs/reference/vetro_manual_batches_index_2026-01-30.csv`
- Files indexed: **94**
- Combined size: **476,125 bytes**

## Reconciliation Outputs
- Plan-level reconciliation table:
  - `docs/reference/vetro_reconciliation_2026-01-30.csv`
  - Columns: `plan_id`, `plan_name`, `status`, `exported_in_raw_vetro_ui`, `in_backfill_queue`

## Notes
- Manual batch files do not include plan_id in filename. Duplicate detection is currently by SHA256 hash.
- Next step is to parse manual batch zip contents for embedded metadata (if present) to map to plan_id.


## Manual batches
- Batch 1 and Batch 2 exports are copied into source_exports and indexed in vetro_manual_batches_index_2026-01-30.csv.
- Manual batch reconciliation updated in vetro_reconciliation_with_manual_2026-01-30.csv.
