# Intacct 24-Month Backfill (AWS-Only) Runbook

Date: 2026-02-07
Owner: Data Lake / SSOT

## Goal
Land a complete 24-month Intacct backfill in the lake from AWS-only compute, with SSOT proof artifacts and no dependency on local machines.

## Scope
- Source: Sage Intacct API (GLENTRY + supporting objects as needed).
- Window: last 24 months from run start (rolling 730 days).
- Outputs:
  - Raw exports in S3.
  - Orchestration manifest.
  - Curated SSOT views refreshed.
  - Reconciliation checks passed.

## AWS Architecture (Recommended)
- Step Functions state machine orchestrates:
  1) Start run + allocate run_id.
  2) Extract pages from Intacct via ECS Fargate task.
  3) Write per-page objects to S3 (NDJSON or gzipped JSON).
  4) Write manifest (expected pages, counts, min/max dates).
  5) Trigger Glue crawler / Athena CTAS.
  6) Run SSOT gates and recon queries.
  7) Publish completion marker + alerts.
- DynamoDB table for checkpoints: `intacct_ingest_checkpoints`.
- CloudWatch log groups for all steps.
- Secrets Manager for Intacct credentials (no local env files).

## S3 Layout (Recommended)
- Raw data:
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=YYYY-MM-DD/run_id=<run_id>/page_<n>.json.gz`
- Orchestration artifacts:
  - `s3://gwi-raw-us-east-2-pc/orchestration/intacct_backfill_24mo/run_date=YYYY-MM-DD/manifest.json`
  - `s3://gwi-raw-us-east-2-pc/orchestration/intacct_backfill_24mo/run_date=YYYY-MM-DD/checks.json`
- Completion marker:
  - `s3://gwi-raw-us-east-2-pc/orchestration/intacct_backfill_24mo/run_date=YYYY-MM-DD/_SUCCESS`

## Required IAM
The task role must allow:
- `secretsmanager:GetSecretValue` on Intacct secret.
- `s3:PutObject`, `s3:ListBucket`, `s3:GetObject` on the prefixes above.
- `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:GetItem`, `dynamodb:Query`.
- `logs:CreateLogStream`, `logs:PutLogEvents`.
- `glue:StartCrawler` (if used).
- `athena:StartQueryExecution`, `athena:GetQueryExecution`, `athena:GetQueryResults` (for gates).

## Run Steps
1) Launch Step Functions backfill:
   - Input parameters:
     - `run_date`: ISO date (UTC).
     - `lookback_days`: 730.
     - `page_size`: 1000 (or Intacct max).
     - `s3_prefix`: `raw/intacct_json/gl_entries`.
     - `run_id`: generated UUID.
2) Extract and write pages:
   - Each page writes:
     - object key
     - row_count
     - min/max recordno
     - min/max business_date
   - Write a DynamoDB checkpoint per page.
3) Write manifest.json:
   - totalcount
   - total_pages
   - page_size
   - lookback_start_date / lookback_end_date
   - s3_prefix
   - run_id
   - checksum (optional)
4) Refresh raw table:
   - Glue crawler or Athena `MSCK REPAIR TABLE`.
5) SSOT transforms:
   - `athena/curated/ssot/40_ssot_intacct_gl_entries.sql`
   - `athena/curated/ssot/41_ssot_intacct_enrichment.sql`
6) Run SSOT gates (hard fail on any):
   - `runbooks/ssot_global_gates.sh` (AWS-hosted version).
7) Write checks.json:
   - Athena row counts.
   - Min/max business_date.
   - Null-rate checks.
   - Any exceptions count.
8) Publish _SUCCESS marker and notify.

## Completeness Checks (Must Pass)
1) Page coverage:
   - `expected_pages == s3_page_objects_count`
2) Row counts:
   - Sum of `row_count` across pages == `manifest.totalcount`
3) Date coverage:
   - `MIN(business_date) <= lookback_start_date`
   - `MAX(business_date) >= lookback_end_date - 1 day`
4) SSOT availability:
   - `curated_core.intacct_gl_entries_current_ssot` non-empty.
5) Exceptions:
   - `curated_recon.intacct_gl_entries_exceptions` within thresholds.

## Evidence Artifacts
Capture and store:
- `manifest.json`
- `checks.json`
- Athena query IDs (QIDs) for each check
- CloudWatch log stream IDs

## Failure Handling
- Do not overwrite last known good SSOT data.
- If partial, rerun only missing pages (using DynamoDB checkpoints).
- Document root cause and rerun outcome.

## Notes
- This runbook is AWS-only. Local execution is not part of the plan.
- After backfill completion, proceed to full-history ingestion.
