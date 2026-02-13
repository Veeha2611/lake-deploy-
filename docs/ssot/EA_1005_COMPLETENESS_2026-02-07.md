# EA-1005 Completeness Evidence Artifact

Date: 2026-02-07
Scope: Intacct 24-month backfill completeness (AWS-only)
Owner: Data Lake / SSOT

## Status
IN PROGRESS - 24-month backfill is queryable; full-history run still in progress; manifest + checks pending.

## Objective
Prove that the 24-month Intacct backfill in S3 is complete, reconciled, and SSOT-ready, with all proof artifacts stored in the lake.

## Required Evidence (Must Attach)
1) Orchestration manifest
   - Path: `s3://gwi-raw-us-east-2-pc/orchestration/intacct_backfill_24mo/run_date=YYYY-MM-DD/manifest.json`
   - Must include: totalcount, total_pages, page_size, lookback_start_date, lookback_end_date, run_id.

2) Page object inventory
   - Evidence: S3 listing count for page objects.
   - Expected: `count(page_objects) == manifest.total_pages`.

3) Row count reconciliation
   - Evidence: `SUM(page.row_count) == manifest.totalcount`.
   - Artifact: `checks.json`.

4) Date coverage
   - Evidence: `MIN(business_date) <= lookback_start_date`
   - Evidence: `MAX(business_date) >= lookback_end_date - 1 day`

5) SSOT readiness
   - `curated_core.intacct_gl_entries_current_ssot` row count > 0.
   - Exceptions count within threshold.

6) SSOT gates
   - `runbooks/ssot_global_gates.sh` output (AWS run).
   - All gates pass.

7) CloudWatch logs
   - Log group + stream IDs for extraction and transforms.

## Evidence Capture Checklist
- [ ] manifest.json archived in S3
- [ ] checks.json archived in S3
- [ ] Athena QIDs recorded for all checks
- [ ] S3 object inventory captured
- [ ] CloudWatch log streams captured
- [ ] _SUCCESS marker written

## Placeholder: Evidence Links
- manifest.json: PENDING
- checks.json: PENDING
- Athena QIDs:
  - 24mo row count + date range (gwi_raw.raw_intacct_gl_entries, run_date=2026-02-06):
    - QID: 745d149f-4f43-41cf-9996-9e121285ee7b
    - Output: s3://gwi-raw-us-east-2-pc/athena-results/745d149f-4f43-41cf-9996-9e121285ee7b.csv
    - Result: rows=2,270,474; min_entry_date=2024-02-07; max_entry_date=2026-03-01
- CloudWatch logs: PENDING (AWS-only run not yet executed)
- S3 inventory output: PENDING
- _SUCCESS marker: PENDING

## Notes (Current Observations)
- SSOT Intacct gates output captured:
  - Local: lake_deploy/docs/ssot/intacct_ssot_gates_2026-02-07.txt
  - S3: s3://gwi-raw-us-east-2-pc/curated_recon/intacct_ssot_gates/dt=2026-02-07/intacct_ssot_gates_2026-02-07.txt
- Warning present: gl_entries metadata.json missing for run_date=2026-02-06

## Signoff
- Data Engineering:
- SSOT Steward:
- Independent Audit (see separate prompt):
