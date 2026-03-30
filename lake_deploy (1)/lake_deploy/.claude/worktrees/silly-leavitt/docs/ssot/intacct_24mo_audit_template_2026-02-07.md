# Independent Audit Template - Intacct 24-Month Completeness

Date: 2026-02-07
Purpose: Provide a standalone template for an independent verifier to confirm 24-month completeness in AWS.

## Execution Template

You are auditing the Intacct 24-month backfill in AWS. Do not use any local files or local machine state. Validate completeness using only AWS artifacts and Athena.

Required checks:
1) Confirm `manifest.json` exists at:
   `s3://gwi-raw-us-east-2-pc/orchestration/intacct_backfill_24mo/run_date=YYYY-MM-DD/manifest.json`
   - Report totalcount, total_pages, lookback_start_date, lookback_end_date, run_id.

2) Confirm page object count:
   - List `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=YYYY-MM-DD/run_id=<run_id>/`
   - Count objects named `page_*.json.gz`.
   - Must equal manifest.total_pages.

3) Row count reconciliation:
   - Read `checks.json` or compute from page metadata.
   - Sum of per-page row_count must equal manifest.totalcount.

4) Date coverage in Athena:
   - Query `curated_core.intacct_gl_entries_current_ssot` (or curated raw table).
   - Verify min and max business_date span the lookback window.

5) Exceptions and null checks:
   - Query `curated_recon.intacct_gl_entries_exceptions`.
   - Report exceptions count and null customer_id rate.

6) SSOT gates:
   - Confirm SSOT gates were executed for the run and passed.
   - Provide QIDs or log evidence.

Deliverables:
- Pass/Fail for each check.
- Evidence references (S3 paths, Athena QIDs, CloudWatch log stream IDs).
- Final conclusion: COMPLETE / INCOMPLETE with reasons.
