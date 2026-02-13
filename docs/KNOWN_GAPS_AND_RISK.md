# Known Gaps and Risk (2026-02-13)

This is the current known-gaps inventory for SSOT readiness and IaC codification.

## Summary Risk Table

| Risk ID | Category | Description | Impact | Status | Mitigation | ETA |
|---|---|---|---|---|---|---|
| R-001 | Billing Mirror | Platt full-mirror not proven due to billing summary source uncertainty and stale partitions for some billing summary datasets. | Finance tiles and downstream billing-derived KPIs may drift. | Open | Confirm native source object for billing summary, refresh landing, then re-audit mirror parity. | TBD |
| R-002 | Crosswalk | Salesforce account crosswalk coverage is incomplete for deterministic 1:1 mapping to billing/customer masters. | Customer identity consistency and rollups can be incorrect. | Open | Use deterministic keys (Plat account number / version) to expand lake-side crosswalk; produce a review list for ops. | In progress |
| R-003 | Finance KPIs | TTM MRR mismatch between UI metric and raw-lake recomputation; active subscriptions query blocked by schema mismatch. | Executive finance KPI tiles not SSOT-certified. | Open | Repair raw schema assumptions, reconcile filters, and re-audit against lake + native. | In progress |
| R-004 | Accounting Mirror | Intacct GL backfill/snapshot completeness has outstanding orchestration artifacts and/or checkpoint continuity risk. | Close pack and accounting reconciliations may be incomplete. | Open | Resume backfill with a single checkpoint path and validate page advance; produce artifacts under orchestration prefix. | In progress |
| R-005 | Bucket Summary | Owned/Contracted/CLEC bucket attribution can degrade into “catch-all” when the system-key crosswalk is incomplete. | Ownership tiles and revenue attribution may be wrong. | Open | Align bucket attribution to deterministic crosswalk logic (network map + as-built + system keys). | In progress |

## Detailed Risks (With Evidence References)

### R-001 — Platt Billing Mirror Not Proven
Evidence (latest):
- Local: `lake_deploy/ssot_audit/platt_full_mirror_2026-02-12/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/platt_self_audit/dt=2026-02-12/`

Observed symptoms:
- Billing summary source object name/schema uncertainty.
- Some billing summary partitions are stale relative to other Platt raw tables.

### R-002 — Salesforce Crosswalk Coverage Incomplete
Evidence:
- `docs/ssot/sf_crosswalk_hybrid_2026-02-12.md`
- Intake candidates: `lake_deploy/intake/threads_inbox_2026-02-12/sf_crosswalk_candidates/`

Observed symptoms:
- Missing deterministic link for a subset of Salesforce Accounts to billing/customer masters.
- Duplicate Accounts may exist due to historical version migrations; version filtering may be required.

### R-003 — Finance KPI Certification Blocked
Evidence (raw-lake audit):
- Local: `lake_deploy/ssot_audit/finance_kpi_raw_2026-02-11/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/finance_kpi_raw_audit/dt=2026-02-11/`

Observed symptoms:
- Large TTM mismatch between UI and raw-lake recomputation.
- Active subscriptions computation blocked by raw schema mismatch (`COLUMN_NOT_FOUND`).

### R-004 — Intacct Mirror / Backfill Continuity Risk
Evidence (checkpoint):
- `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=2026-02-12/checkpoints/latest.json`

Observed symptoms:
- No ingestion tasks running at the last observed checkpoint.
- Risk of loop/replay if multiple checkpoint prefixes are used for the same run.

### R-005 — Ownership / Bucket Summary Attribution Drift
Evidence:
- UI tile output drift observed during SSOT validation workstreams.
- Bucket attribution is sensitive to `system_key` correctness in customer/system crosswalk tables.

Mitigation direction:
- Use a single crosswalk policy for system attribution (prefer deterministic network mapping and as-built evidence).

## KPI Confidence Matrix (Current)

| KPI / Tile Group | Confidence | Why |
|---|---|---|
| Vetro GIS layers + plan mapping | High | Cast-safe GeoJSON checks and plan/network coverage were evidence-backed in the GIS audit flow. |
| Network Mix (billing-aligned) | Medium | Logic exists and is queryable, but depends on upstream billing/crosswalk hygiene. |
| Finance KPIs (TTM/YTD MRR) | Low | Raw-lake recomputation mismatch indicates filter/schema alignment is not proven. |
| Bucket Summary (Owned/Contracted/CLEC) | Low | Attribution depends on system crosswalk correctness; misclassification risk remains. |
| Close Pack (GL rollups) | Medium | Depends on Intacct backfill/snapshot completeness and guard freshness. |

## Risk Trend Summary
- Improving: GIS SSOT validation process and evidence packaging.
- At risk: billing mirror parity and crosswalk completeness (directly impacts finance + ownership tiles).
- Blocking SSOT certification: any unresolved mirror/crosswalk gaps that prevent deterministic, evidence-backed reconciliation.

