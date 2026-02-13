# SSOT Policy (Single Source of Truth)

## Principles
- **S3 is the system of record.** All ingests land in S3 first.
- **Curated tables are the canonical layer** for operational analytics and application use.
- **Current tables drive SSOT guards**; exception tables record gaps without blocking the run unless thresholds are exceeded.

## SSOT Layers
- **Raw**: Source-native extracts staged in S3.
- **Curated Core**: Normalized, query-ready tables/views.
- **Curated Recon**: Exceptions and reconciliation deltas.
- **Curated SSOT**: Summary/guard tables for daily status.

## Daily Guard Policy
- Each system writes a **manifest** to:
  `s3://gwi-raw-us-east-2-pc/orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json`
- Guard status reads from `*_current` tables.
- Exceptions are recorded to `curated_recon.*` and only fail if thresholds are breached.

## Global SSOT Gate Policy (Hard Block)
SSOT may not be declared unless **all** global gates pass:
1) **Source parity**: row counts and max dates match the native source.
2) **Partition integrity**: no zero-byte runs, no duplicate snapshots, no missing expected objects.
3) **Schema/parse integrity**: headers, line wrapping, and JSON parsing validated.
4) **Reconciliation**: investor workbooks and internal rollups match lake outputs.

Global gates are enforced by:
- `runbooks/ssot_source_gates.sh`
- `runbooks/ssot_intacct_gates.sh`
- `runbooks/ssot_platt_gates.sh`
- `runbooks/ssot_global_gates.sh` (wrapper used by `scripts/ssot_daily.sh`)

SSOT claims **must** include proof artifacts with Athena QIDs.

## Canonical Deliverables (SSOT)
- Config: `config/deliverables_config.json`
- Schema: `sql/ssot/02_deliverables_schema.sql`
- Daily load: `sql/ssot/03_deliverables_insert.sql` (replace `<RUN_DATE>`)
- Proof query:
  ```
  SELECT deliverable_id, status, ssot_guard_ok, exception_count
  FROM curated_ssot.deliverables
  WHERE dt='<YYYY-MM-DD>';
  ```

## Deployed Today
- SSOT daily summary: `curated_recon.ssot_daily_summary`
- Deliverables SSOT: `curated_ssot.deliverables`

## Planned / Future
- Threshold enforcement and automated paging on guard failures.
- Expanded SSOT coverage for additional sources.
