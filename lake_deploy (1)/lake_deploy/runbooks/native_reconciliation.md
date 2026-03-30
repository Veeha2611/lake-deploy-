# Native Reconciliation Runbook

This runbook explains how to validate the lake outputs against **native sources** (system-of-record) and how to interpret PASS/WARN/FAIL.

## Scope
Native reconciliation is used to prove:
- **Mirror parity** (row counts, max dates, key distributions)
- **Metric parity** (rollups and derived KPIs match within tolerance)
- **Freshness** (data meets SLA)

This runbook is intentionally system-agnostic. System-specific steps live in:
- `docs/integrations/platt.md`
- `docs/integrations/intacct.md`
- `docs/integrations/salesforce.md`
- `docs/integrations/gaiia.md`
- `docs/integrations/vetro.md`

## Definitions
- **Native source**: the upstream system (database/API/export) that is the system of record for a domain.
- **Lake mirror**: raw landing tables and partitions that represent the native extract in S3/Glue/Athena.
- **Curated**: normalized, query-ready datasets derived from raw.
- **SSOT**: gated outputs with evidence packs and guard status.

## Required Evidence Pack (Every Run)
For any reconciliation run, produce:
- `status.json` (PASS/FAIL/WARN + timestamp + notes)
- `athena_values.json` (raw result snapshot)
- `qids.tsv` (Athena QIDs)
- `evidence/index.md` (links to local + S3 artifacts, dt/run_date)
- `commands_run.txt` (timestamped commands)
- `s3_paths.txt` (all S3 prefixes touched)

## Standard Workflow

### 1) Preflight
1. Verify AWS identity and region:
   - `aws sts get-caller-identity`
   - `aws configure get region`
2. Verify required secrets exist (names only):
   - see `docs/access_prereqs.md`
3. If validating a native DB behind VPN (example: Platt), run connectivity preflight:
   - `runbooks/platt_vpn_preflight.sh`

### 2) Define the Comparison Window
Pick one:
- **Latest partition** (fast, preferred for freshness)
- **Bounded range** (e.g., last full month, last 90 days)
- **Full history** (only when required; can be expensive)

Rules:
- Do not change page size / query parameters mid-run when resuming paginated backfills.
- Use explicit absolute dates in evidence (`YYYY-MM-DD`).

### 3) Mirror Parity Checks (Native vs Lake Raw)
Minimum checks:
- row counts (native vs lake)
- max date / latest dt partition
- key uniqueness counts (e.g., distinct customer ids)
- null rate for join keys

Expected outcomes:
- Mirror parity should be exact unless an explicit tolerance is approved and documented.

### 4) Curated / SSOT Gate Checks
Minimum checks:
- curated view/table counts are non-zero where expected
- freshness SLAs pass (or show WARN with reason)
- numeric KPIs reconcile within tolerance (see `docs/GOVERNANCE.md`)

### 5) Record Results
Write a status summary:
- PASS: mirror parity proven + KPIs within tolerance + freshness within SLA
- WARN: usable but with bounded exceptions (documented + time-bounded)
- FAIL: mirror parity not proven, freshness out of SLA with no exception, or KPI deltas exceed tolerance

## PASS/WARN/FAIL Interpretation
PASS:
- Native mirror parity proven
- SLA compliance proven (or explicitly waived with policy)
- KPI deltas within tolerance and reproducible with evidence

WARN:
- Non-blocking gaps exist but are bounded and documented with mitigation + ETA

FAIL:
- Any required mirror is not proven
- Any required KPI reconciles outside tolerance
- Any required source is stale beyond SLA without an approved exception

## Notes On Tolerances
Recommended defaults are defined in `docs/GOVERNANCE.md`.
If a tolerance is changed, record:
- the exact tolerance
- the rationale
- the affected KPIs
- the planned end date / owner

