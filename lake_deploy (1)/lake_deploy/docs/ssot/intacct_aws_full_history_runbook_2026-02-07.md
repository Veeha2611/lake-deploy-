# Intacct Full-History Ingestion (AWS-Only) Runbook

Date: 2026-02-07
Owner: Data Lake / SSOT

## Goal
Land full Intacct history in the lake from AWS-only compute, after the 24-month backfill is confirmed complete.

## Prerequisites
- 24-month backfill completed and marked _SUCCESS.
- SSOT gates passing for backfill window.
- Secrets Manager + IAM roles verified.

## Strategy (Current Implementation)
Use the AWS ECS pipeline with **page-batched GLENTRY pulls** and S3 checkpoints:
- `GL_ENTRIES_QUERY="RECORDNO > 0"`
- `GL_ENTRIES_PAGE_SIZE=1000` (Intacct caps at 1000 for GLENTRY)
- `GL_ENTRIES_MAX_PAGES=25` per batch (reduces restart blast radius)
- Auto-resume from checkpoint in S3 if no explicit resume cursor is provided.
- Optional lookback for testing only (full history uses `GL_ENTRIES_LOOKBACK_DAYS=36500`).

## S3 Layout (Authoritative)
- Raw XML pages:
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_xml/gl_entries/<RUN_DATE>/gl_entries_page_<n>.xml`
- Raw JSON batches (partial):
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=<RUN_DATE>/batches/`
- Checkpoints (resume cursor):
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=<RUN_DATE>/checkpoints/latest.json`
- Completion marker:
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=<RUN_DATE>/checkpoints/complete.json`
- Watchdog status:
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=<RUN_DATE>/watchdog/status.json`

## Automation (AWS-Only, Current)
1) **Batch scheduler** (EventBridge):
   - Rule: `intacct-backfill-batch` (rate: 30 minutes)
   - Target: ECS task `intacct-ingest-task:11`
   - Overrides: `GL_ENTRIES_MAX_PAGES=25`, `GL_ENTRIES_PAGE_SIZE=1000`, `GL_ENTRIES_LOOKBACK_DAYS=36500`, `GL_ENTRIES_QUERY="RECORDNO > 0"`
   - Lock file prevents overlap: `.../locks/batch_lock.json`
2) **Watchdog** (EventBridge):
   - Rule: `intacct-backfill-watchdog` (rate: 15 minutes)
   - Writes status JSON to `.../watchdog/status.json`
3) **Daily ingestion**:
   - Rule: `intacct-ingest-schedule` (rate: 24 hours)
   - Target updated to `intacct-ingest-task:11`

## Completeness Checks (Must Pass)
1) Page coverage:
   - `expected_pages == s3_page_objects_count`
   - `expected_pages = ceil(totalcount / 1000)`
2) Row counts:
   - Sum of `row_count` across pages == `totalcount`
3) Date coverage:
   - `MIN(ENTRY_DATE)` matches earliest Intacct GLENTRY date.
   - `MAX(ENTRY_DATE)` matches latest Intacct GLENTRY date.
4) SSOT availability:
   - `curated_core.intacct_gl_entries_current_ssot` non-empty.

## Evidence Artifacts
Capture and store:
- `manifest.json`
- `checks.json`
- Athena QIDs
- CloudWatch log stream IDs

## Failure Handling
- If partial, rerun only missing pages using S3 checkpoint resume.
- If missing ranges, re-run by date windows or recordno ranges.

## Notes
- Run after the 24-month backfill is certified complete.
- Full history is a one-time baseline; daily runs continue afterward.
