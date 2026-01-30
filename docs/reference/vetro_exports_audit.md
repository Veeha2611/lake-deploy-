# Vetro Exports Audit (2026-01-30)

## Scope
Audit of Vetro export landing zones in S3 and current backfill state.

## S3 Locations Observed
- `s3://gwi-raw-us-east-2-pc/raw/vetro_ui/`
- `s3://gwi-raw-us-east-2-pc/raw/vetro_ui_manual/`
- `s3://gwi-raw-us-east-2-pc/vetro_export_state/`

## Automated/UI Export Objects

### `raw/vetro_ui/`
Objects present (11 total):
- `raw/vetro_ui/plan_id=2/dt=2026-01-28/export_2026-01-28T192127730Z.zip` (18,841 bytes)
- `raw/vetro_ui/plan_id=4/dt=2026-01-28/export_2026-01-28T192228881Z.zip` (14,596 bytes)
- `raw/vetro_ui/plan_id=5/dt=2026-01-28/export_2026-01-28T192420358Z.zip` (27,851 bytes)
- `raw/vetro_ui/plan_id=218/dt=2026-01-28/export_2026-01-28T203058351Z.zip` (10,577 bytes)
- `raw/vetro_ui/plan_id=224/dt=2026-01-28/export_2026-01-28T203152298Z.zip` (14,969 bytes)
- `raw/vetro_ui/plan_id=239/dt=2026-01-28/export_2026-01-28T203309341Z.zip` (10,995 bytes)
- `raw/vetro_ui/plan_id=316/dt=2026-01-28/export_2026-01-28T205852657Z.zip` (19,112 bytes)
- `raw/vetro_ui/plan_id=408/dt=2026-01-28/export_2026-01-28T191819159Z.zip` (25,789 bytes)
- `raw/vetro_ui/plan_id=408/dt=2026-01-29/export_2026-01-29T041011060Z.zip` (16,675 bytes)
- `raw/vetro_ui/plans/dt=2026-01-28/plans.json` (1,098,810 bytes)
- `raw/vetro_ui/plans/dt=2026-01-28/plans_raw.json` (1,040,091 bytes)

### `raw/vetro_ui_manual/`
Object counts:
- Batch 1: `s3://gwi-raw-us-east-2-pc/raw/vetro_ui_manual/batch=manual_export_vetro_batch_1/` (26 zip files)
- Batch 2: `s3://gwi-raw-us-east-2-pc/raw/vetro_ui_manual/batch=manual_export_vetro_batch_2/` (69 zip files)
- Total under `raw/vetro_ui_manual/`: 95 objects

## Backfill State
- `s3://gwi-raw-us-east-2-pc/vetro_export_state/plan_index.json`
  - Contains cursor/state metadata (not a plan list).
- `s3://gwi-raw-us-east-2-pc/vetro_export_state/backfill_queue.json`
  - `plan_ids` list length: 1,552
  - Indicates remaining plan IDs to export via backfill queue.

## Current Status Summary
- Manual UI exports are landing successfully in `raw/vetro_ui_manual/` with 95 total zips across two batches.
- Automated/UI export pipeline has produced a small subset of plan exports plus `plans.json` snapshots.
- Full plan export backlog remains in `backfill_queue.json` (1,552 plan IDs).

## Next Reconciliation Steps
1. Produce a canonical plan list from `backfill_queue.json` (remaining IDs) and compare to `raw/vetro_ui/plan_id=...` exports already present.
2. Create a manual batch index (zip filename + batch) to track completeness and avoid duplicates.
3. After the investor workbook download completes, crosswalk plan IDs or plan names (if present) against the Vetro plan list to prioritize remaining exports.
4. Record export validation rules (min zip size, required JSON/GeoJSON) and log failures for targeted retries.
