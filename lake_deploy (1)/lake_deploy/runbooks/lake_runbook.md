# Lake Runbook

## Data flow
1. **Ingest** – Vetro exports land at `s3://gwi-raw-us-east-2-pc/raw/vetro/plan_id=<plan_id>/dt=<YYYY-MM-DD>/`.
2. **Glue/Athena** – Crawlers or Athena MSCK REPAIR TABLE keep `vetro_raw_db.raw_line` aware of new partitions; partition projection handles `dt`.
3. **Orchestration** – The Lambda cycles through `plan_id` list, stores state at `s3://gwi-raw-us-east-2-pc/vetro_export_state/plan_index.json`, and writes raw JSON payloads by plan/dt.
4. **Curated layer** – Views in `curated_core` (e.g., `v_vetro_passings_by_system_dt`) parse JSON fields and leverage the Sheets-based crosswalk.

## Operational notes
- Follow the numbered Athena scripts for raw and curated layers.
- Upload Lambda zips to `s3://gwi-raw-us-east-2-pc/orchestration/lambda-code/`.
- Release tags follow `mac-YYYYMMDD-vX` and must cite Athena SQL, CFN, and Lambda artifacts.
