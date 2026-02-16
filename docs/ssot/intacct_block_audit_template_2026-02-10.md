# Intacct Block SSOT Audit Template

**Purpose**: Validate any Intacct block run is SSOT‑worthy (curated + reconciled + evidence) and publish a proof pack. This runs after each ingestion block finishes and JSON lands.

## Inputs (fill these in)
- `RUN_DATE`: <run_date for this block, e.g. 2026-02-09_w4b>
- `AWS_REGION`: us-east-2
- `ATHENA_WORKGROUP`: primary
- `ATHENA_OUTPUT_LOCATION`: s3://gwi-raw-us-east-2-pc/athena-results/orchestration/

## Evidence output (must exist)
- Local: `lake_deploy/ssot_audit/intacct_${RUN_DATE}/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/dt=${RUN_DATE}/`

## Audit steps (required)
### 1) S3 object integrity (non‑zero)
- Ensure JSON exists:
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/data/run_date=${RUN_DATE}/gl_entries.json`
- Ensure metadata exists:
  - `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/_meta/run_date=${RUN_DATE}/metadata.json`
- Produce `object_integrity.tsv` listing all objects + sizes; fail if any zero‑byte.

### 2) Glue crawler status
- Start all `intacct_*_json_crawler` crawlers.
- Wait for `READY`.
- Save `glue_crawler_status.json` (full crawler list with last status).

### 3) Athena checks (gwi_raw_intacct)
**Partition logic**
- If `RUN_DATE` is date‑like (`YYYY-MM-DD`), use partition `dt`:
  - `SELECT count(*) FROM gwi_raw_intacct.gl_entries WHERE dt='${RUN_DATE}'`
  - `SELECT min(entry_date), max(entry_date) FROM gwi_raw_intacct.gl_entries WHERE dt='${RUN_DATE}'`
- If `RUN_DATE` is NOT date‑like (block id), derive count/min/max from JSON directly:
  - Stream JSON and compute `count`, `min(entry_date)`, `max(entry_date)`
  - Mark QID state as `LOCAL` in `qids.tsv`

**Required tables (count > 0)**
- `gl_entries` (count + min/max entry_date)
- `gl_accounts`
- `customers`
- `vendors`
- `ap_bills`
- `ap_payments`
- `ar_invoices`
- `ar_invoice_items`
- `ar_payments`

### 4) Curated SSOT checks
- `SELECT count(*) FROM curated_core.intacct_gl_entries_current_ssot`
- `SELECT count(*) FROM curated_recon.intacct_gl_entries_exceptions`

### 5) Evidence pack (required files)
- `object_integrity.tsv`
- `glue_crawler_status.json`
- `qids.tsv`
- `athena_values.json`
- `status.json` (PASS/FAIL + timestamp)

## PASS/FAIL criteria
PASS if all are true:
- JSON exists and non‑zero
- Crawlers SUCCEEDED
- Athena counts > 0 (or JSON fallback count > 0)
- Date range not null
- Curated SSOT count > 0
- Exceptions tracked (can be > 0 but must be documented)

FAIL if any required object is missing or if count/date range is null.

## Output format (for reporting)
- **Result**: PASS / FAIL
- **Counts**: `gl_entries_count`, `min_entry_date`, `max_entry_date`
- **QIDs + S3 output** for each Athena query
- **Exceptions**: count + remediation note

## Automation note
If possible, call:
- `runbooks/intacct_reconcile_on_arrival.sh ${RUN_DATE}`
This script already generates the evidence pack and writes to the S3 path above.
