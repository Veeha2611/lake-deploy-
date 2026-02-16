# MAC Console SSOT Audit Template (2026-02-12)

**Purpose**: Validate the MAC Console deterministic engine, cross-system investigation path, and evidence-pack behavior after the latest runtime build. This audit is **read-only** and must not run any DDL/DML or Base44 calls.

## Inputs (fill in)
- `RUN_DATE`: 2026-02-12
- `AWS_REGION`: us-east-2
- `ATHENA_WORKGROUP`: primary
- `ATHENA_OUTPUT_LOCATION`: s3://gwi-raw-us-east-2-pc/athena-results/orchestration/
- `MAC_API_BASE`: https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod/

## Evidence output (must exist)
- Local: `lake_deploy/ssot_audit/mac_ai_console_${RUN_DATE}/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/mac_ai_console_audit/dt=${RUN_DATE}/`

## Required sources
- `curated_core.platt_customer_current_ssot`
- `curated_core.v_platt_billing_customer_month_latest`
- `curated_core.dim_customer_platt_v1_1`
- `curated_recon.v_network_mix_billing_aligned_latest`

## Audit steps (required)
### 1) Registry sanity (API)
- `GET ${MAC_API_BASE}/registry` must include:
  - `customer_identity_overview`
  - `copper_customers_count`
  - `customers_in_city_breakdown`
  - `network_health`
  - `mrr_overview`
  - `mrr_trend_12m`
  - `projects_pipeline`

### 2) Deterministic + cross-system investigation (API)
Run these via `POST ${MAC_API_BASE}/query`:

**A) Copper investigation**
- Question: `How many copper-only customers do we have? Investigate across all systems.`
- Expect:
  - `ok: true`
  - `answer_markdown` contains **"Copper Customers (multi-scope)"**
  - `answer_markdown` contains **"Cross-System Verification"** (or an explicit unavailable note)
  - `evidence_pack` present

**B) Location multi-scope**
- Question: `How many active customers do we have in Isleboro? Investigate across systems.`
- Expect:
  - `ok: true`
  - `answer_markdown` contains **"Customers in Isleboro (multi-scope)"**
  - `evidence_pack` present
  - No `query_execution_id` timeouts (no 504)

**C) Non-data guardrail**
- Question: `Tell me who you are.`
- Expect:
  - `ok: true`
  - `question_id: non_data_response`
  - `answer_markdown` present

### 3) Case actions (VERIFY)
For any query above that returns `case_id`, call:
- `POST ${MAC_API_BASE}/cases/action` with `{"case_id":"<case_id>","action":"VERIFY_ACROSS_SYSTEMS"}`
- Expect:
  - `ok: true`
  - `verification.status` = `ok` **or** `unavailable` with a clear message

### 4) Evidence pack integrity
Confirm for each response:
- `evidence_pack.executed_sql` populated for SSOT queries
- `evidence_pack.query_execution_id` present
- `evidence_pack.sources` include SSOT views
- `answer_markdown` is **not null**

### 5) UI smoke (optional, manual)
- Open `https://mac-app.macmtn.com/Console`
- Submit `How many copper-only customers do we have? Investigate across all systems.`
- Confirm response appears and includes Cross-System Verification section

## PASS/FAIL criteria
PASS if all are true:
- Registry includes required query IDs
- Copper investigation returns multi-scope output + evidence pack
- Isleboro multi-scope query returns successfully (no 504)
- Non-data guardrail works
- VERIFY action returns ok/unavailable with a message
- No missing `answer_markdown`

FAIL if any required object missing, response is null, or evidence pack missing.

## Evidence pack (required files)
- `status.json`
- `qids.tsv`
- `athena_values.json`
- `responses.json`
- `notes.md` (brief audit notes)

## Output format (for reporting)
- **Result**: PASS / FAIL
- **Errors**: list failures
- **QIDs**: list each Athena query execution ID
- **Notes**: any missing sources or known constraints
