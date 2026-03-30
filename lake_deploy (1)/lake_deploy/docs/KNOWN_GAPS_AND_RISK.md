# Known Gaps and Risk (2026-02-13)

This is the current known-gaps inventory for SSOT readiness and IaC codification.

## Summary Risk Table

| Risk ID | Category | Description | Impact | Status | Mitigation | ETA |
|---|---|---|---|---|---|---|
| R-001 | Billing Mirror | Platt raw tables mirror validated `PASS` including `billing_summary` as a derived dataset from base invoice tables. | Billing-derived KPIs can be certified against lake evidence with reduced mirror-parity risk. | Closed (PASS 2026-02-13) | Continue freshness gating; treat `billing_summary` as derived, not a native mirror object. | n/a |
| R-002 | Crosswalk | Salesforce Account crosswalk is present but is not strictly 1:1 due to duplicates/version migrations and missing Plat IDs on some Accounts. | Identity rollups can drift if queries assume 1:1; “customer counts” can be overstated without canonical selection rules. | Open | Enforce left-join safety, expose mapped vs unmapped totals, and maintain “ready/review/no-candidate” exports for ops to resolve edge cases. | 2026-02-21 |
| R-003 | Finance KPIs | Raw-lake finance KPI audit is now `PASS` (TTM/YTD MRR and active subscriptions) with evidence packs. | Executive finance KPI tiles can be SSOT-certified when UI routes to the certified registry templates and gates on freshness. | Closed (PASS 2026-02-12) | Keep UI routing tied to certified query templates + freshness gates. | n/a |
| R-004 | Accounting Mirror | Intacct 24-month mirror/backfill validated `PASS`; full-history GL backfill (if required) remains an orchestration and scope decision. | Long-horizon accounting comparisons may be incomplete if full history is required. | Open | Decide the required history window; run chunked backfill with a single checkpoint prefix; publish orchestration artifacts and re-audit. | 2026-02-28 |
| R-005 | Bucket Summary | Owned/Contracted/CLEC bucket summary parity vs hybrid/billing logic is currently `FAIL` beyond tolerance. | Ownership tiles and attribution may be wrong; demo risk if presented as certified. | Open | Align bucket attribution to canonical classification + crosswalk rules; re-run audit until within tolerance and evidence-gate the UI. | 2026-02-19 |

## Detailed Risks (With Evidence References)

### R-001 — Platt Billing Mirror (Closed)
Evidence (latest):
- Local: `ssot_audit/platt_full_mirror_2026-02-13/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/platt_self_audit/dt=2026-02-13/`

Resolution notes:
- Mirror parity validated within configured tolerance for core raw tables.
- `billing_summary` is treated as `derived_from_base_tables` (not a missing native object).

### R-002 — Salesforce Crosswalk (Not Strictly 1:1)
Evidence:
- Crosswalk status snapshot: `ssot_audit/ssot_crosswalk_status_2026-02-13/`
- Hybrid crosswalk notes: `docs/ssot/sf_crosswalk_hybrid_2026-02-12.md`
- Candidate exports: `ssot_audit/sf_crosswalk_candidates_2026-02-12/`

Observed symptoms:
- Multiple Salesforce Account rows can map to the same canonical identity due to historical migrations/versioning.
- Some Accounts do not have a populated Plat account number field (requires a “review list” workflow).

Required guardrails:
- SSOT views must avoid unsafe INNER JOIN drops; expose `mapped` vs `unmapped` totals explicitly.
- Any “customer count” KPI must declare its grain (Accounts vs billed customer IDs vs subscriptions).

### R-003 — Finance KPI Certification (Closed)
Evidence (raw-lake audit):
- Local: `ssot_audit/finance_kpi_raw_2026-02-12/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/finance_kpi_raw_audit/dt=2026-02-12/`

Resolution notes:
- Raw-lake recomputation is evidence-backed and `PASS` (including active subscriptions).

### R-004 — Intacct Mirror / Backfill Scope (Open)
Evidence (24-month mirror audit):
- Local: `ssot_audit/intacct_full_mirror_2026-02-12/`

Notes:
- 24-month GL backfill blocks were validated in the mirror audit evidence pack.
- If full-history GL mirroring is required, treat it as a separate scope and run it with strict checkpoint continuity (single checkpoint prefix per run window).

### R-005 — Ownership / Bucket Summary Parity (Open)
Evidence (latest hybrid audit):
- Local: `ssot_audit/bucket_summary_hybrid_2026-02-13/`

Observed symptoms:
- Parity checks vs hybrid/billing logic exceed configured tolerance in multiple buckets.

Mitigation direction:
- Centralize canonical bucket definitions and enforce shared usage across tiles and console answers.
- Evidence-gate the UI: if parity is `FAIL`, return `UNAVAILABLE`/`INCONCLUSIVE` rather than a silent number.

## KPI Confidence Matrix (Current)

| KPI / Tile Group | Confidence | Why |
|---|---|---|
| Vetro GIS layers + plan mapping | High | Cast-safe GeoJSON checks and plan/network coverage were evidence-backed in the GIS audit flow. |
| Network Mix (workbook-modeled) | Medium | Subscriptions semantics are deterministic; revenue/MRR semantics depend on whether modeled vs billed sources are selected. |
| Finance KPIs (TTM/YTD MRR) | High | Raw-lake audit is `PASS` with evidence packs (TTM/YTD MRR + active subscriptions). |
| Bucket Summary (Owned/Contracted/CLEC) | Low | Latest hybrid parity audit is `FAIL` beyond tolerance; must be evidence-gated. |
| Close Pack (GL rollups) | Medium | 24-month mirror/backfill is evidence-backed; full-history scope (if required) must be explicitly executed and audited. |

## Risk Trend Summary
- Improving: Platt mirror parity and finance KPI audits are now evidence-backed with daily evidence packs.
- At risk: crosswalk non-1:1 behavior (versioning/duplicates) and bucket summary parity (Owned/Contracted/CLEC).
- Blocking SSOT certification (for ownership tiles): bucket summary parity must be within tolerance or evidence-gated as `UNAVAILABLE`/`INCONCLUSIVE`.
