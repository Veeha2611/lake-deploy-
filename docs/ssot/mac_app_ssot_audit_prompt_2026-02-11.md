# MAC App SSOT Audit Prompt (Template)

**Purpose**: Validate MAC App SSOT readiness for Network Mix + Finance KPI alignment + Unmapped reporting + Close Pack + FY2025 MRR. Confirms lake‑derived outputs, consistent KPI definitions, and AWS‑only wiring (no Base44 calls).

## Scope
**Included**
- Network Mix (billing‑aligned) KPIs + table
- Finance KPIs (billing MRR + active subs/customers + billing customers)
- Unmapped Systems panel + export
- Close Pack (Platt GL revenue) now that Intacct backfill is landed
- FY2025 MRR Rollup (no TYPE_MISMATCH)
- AWS‑only routing (MAC API)

**Excluded**
- GIS CTAS / Vetro GIS rebuilds
- Revenue audit rebuilds
- Any Athena DDL/DML

---

## Inputs (fill in)
- `RUN_DATE`: 2026-02-11
- `AWS_REGION`: us-east-2
- `ATHENA_WORKGROUP`: primary
- `ATHENA_OUTPUT_LOCATION`: s3://gwi-raw-us-east-2-pc/athena-results/orchestration/
- `MAC_API_BASE`: https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod/

## Evidence output (must exist)
- Local: `lake_deploy/ssot_audit/mac_app_ssot_${RUN_DATE}/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/mac_app_ssot_audit/dt=${RUN_DATE}/`

## Required sources (SSOT)
- `curated_recon.v_network_mix_billing_aligned_latest`
- `curated_recon.v_unmapped_network_services_latest`
- `curated_recon.v_unmapped_network_customers_latest`
- `curated_core.v_platt_billing_mrr_monthly`
- `curated_core.dim_customer_platt_v1_1`
- `curated_core.intacct_gl_entries_current_ssot`

---

## Audit steps (required)

### 1) MAC API health + AWS‑only routing
**Goal**: Prove MAC API responds and AWS‑only mode is live.
- `GET ${MAC_API_BASE}/health`
- Record response JSON to `api_health.json`.

### 2) Network Mix integrity (no subs > passings)
Run:
```
SELECT
  COUNT(*) AS bad_rows
FROM curated_recon.v_network_mix_billing_aligned_latest
WHERE network <> 'Unmapped'
  AND subscriptions > passings;
```
PASS if `bad_rows = 0`.

### 3) Network Mix totals (passings/subs/mrr)
Run:
```
SELECT
  MAX(period_month) AS period_month,
  SUM(passings) AS total_passings,
  SUM(subscriptions) AS total_subscriptions,
  SUM(mrr_billed) AS billed_mrr,
  SUM(mrr) AS modeled_mrr
FROM curated_recon.v_network_mix_billing_aligned_latest
WHERE network <> 'Unmapped';
```
Record counts for cross‑check.

### 4) Finance KPI alignment (API query + schema)
Use MAC API to force a fresh schema result:
```
POST ${MAC_API_BASE}/query
{
  "question_id": "platt_billing_mrr_latest",
  "params": { "schema_version": "2026-02-11" }
}
```
PASS if:
- `columns` includes **all**:
  `period_month`, `latest_total_mrr`, `active_subscriptions`, `active_customers`,
  `latest_arpu`, `latest_billing_customers`, `ttm_total_mrr`, `ttm_avg_mrr`,
  `ytd_total_mrr`, `ytd_months`
- `rows` length >= 1

### 5) Finance vs Network Mix consistency (key checks)
From Step 4 API response and Step 3 SQL:
- `active_subscriptions` (API) **must equal** `total_subscriptions` (Step 3)
- `latest_total_mrr` (API) should be close to billed MRR latest month (Step 3 `billed_mrr`)
- `latest_billing_customers` should be >= `active_customers`
Record deltas in `consistency_checks.json`.

### 6) Unmapped Systems summary (lake)
Run:
```
SELECT
  SUM(active_services) AS total_unmapped_services,
  SUM(billed_customers) AS total_unmapped_billed,
  SUM(billed_mrr) AS total_unmapped_mrr
FROM curated_recon.v_unmapped_network_services_latest;
```
PASS if query succeeds and totals are recorded (can be 0).

### 7) Unmapped Systems details export (lake)
Run:
```
SELECT *
FROM curated_recon.v_unmapped_network_customers_latest
LIMIT 100;
```
Record sample rows (redact as needed).

### 8) Close Pack availability (MAC API)
**Goal**: Confirm Intacct close pack months exist and summary query returns rows.

Discovery:
```
POST ${MAC_API_BASE}/query
{
  "question_id": "glclosepack_discovery"
}
```
PASS if response returns at least one `period_month` value.

Summary (pick latest available month):
```
POST ${MAC_API_BASE}/query
{
  "question_id": "glclosepack_summary",
  "params": { "period_month": "YYYY-MM", "limit": 500 }
}
```
PASS if rows > 0.

Detail (optional):
```
POST ${MAC_API_BASE}/query
{
  "question_id": "glclosepack_detail",
  "params": { "period_month": "YYYY-MM", "limit": 5000 }
}
```
PASS if rows >= 0.

### 9) FY2025 MRR Rollup (no TYPE_MISMATCH)
Run via MAC API:
```
POST ${MAC_API_BASE}/query
{ "question_id": "mrr_fy2025_kpi" }
```
PASS if `fy2025_mrr_total` returns numeric and query succeeds.

Optional trend:
```
POST ${MAC_API_BASE}/query
{ "question_id": "mrr_fy2025_monthly" }
```
PASS if rows >= 1.

### 10) Base44 endpoints not used (AWS‑only)
Verify in UI config:
- `VITE_MAC_APP_AWS_ONLY=true` or `window.__MAC_APP_CONFIG__.awsOnly=true`
- `MAC_API_BASE` set in build config.
Record in `aws_only_config.json`.

---

## Evidence pack (required files)
Place all files under `lake_deploy/ssot_audit/mac_app_ssot_${RUN_DATE}/`:
- `api_health.json`
- `qids.tsv` (QID per Athena query above)
- `athena_values.json` (counts/results)
- `consistency_checks.json`
- `close_pack_checks.json`
- `fy2025_checks.json`
- `aws_only_config.json`
- `status.json` (PASS/FAIL + timestamp + notes)

---

## PASS/FAIL criteria
PASS if all true:
- API health OK
- `bad_rows = 0` for subs > passings
- Finance KPI API response includes required columns
- Active subscriptions equals Network Mix totals
- Unmapped queries succeed
- Close Pack discovery + summary succeed
- FY2025 MRR query succeeds
- AWS‑only config confirmed (no Base44)

FAIL if any required query fails, schema missing, or consistency checks fail.

---

## Output format (for reporting)
- **Result**: PASS / FAIL  
- **Network Mix totals**: passings, subscriptions, billed_mrr  
- **Finance KPIs**: latest_total_mrr, active_subscriptions, active_customers, latest_billing_customers  
- **Unmapped totals**: services, billed customers, billed mrr  
- **Close Pack**: discovery ok + summary rows  
- **FY2025**: numeric total + monthly rows  
- **AWS‑only**: confirmed true  
- **QIDs**: list each Athena query execution ID
