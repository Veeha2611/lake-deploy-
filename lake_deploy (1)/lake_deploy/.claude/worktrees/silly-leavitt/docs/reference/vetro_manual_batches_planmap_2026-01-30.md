# Vetro Manual Batch Plan Mapping (2026-01-30)

## Source
Manual batch zips from Downloads:
- `Manual export vetro batch 1`
- `Batch 2 vetro`

## Output
- `docs/reference/vetro_manual_batches_planmap_2026-01-30.csv`
  - Columns: batch, filename, plan_id, plan_name, meta_file

## Summary
- Files processed: 94
- Files with plan_id or plan_name detected: 92
- Files without detected plan metadata (2):
  - `initial-rockport-fttx-network-plan-G0f6e_R-qNiafJIp58LUI.zip`
  - `rockport-gwi-network-plan-mB27qbbElaHgDz5HKSgak.zip`

## Notes
Mapping is based on JSON/GeoJSON files inside each zip. If a zip contains no parseable JSON, plan metadata is missing.
