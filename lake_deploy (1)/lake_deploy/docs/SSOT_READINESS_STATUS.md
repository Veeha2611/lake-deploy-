# SSOT Readiness Status (2026-02-16)

This page is the current operational status of SSOT readiness across core source domains.

## Overall Status
- `PARTIAL`: Core finance mirrors and KPI certification are passing, but ownership/bucket parity remains open and blocks full certification for those tiles.

## Domain Status

| Domain | Status | Latest Evidence | Notes |
|---|---|---|---|
| Platt mirror | PASS | `ssot_audit/platt_full_mirror_2026-02-13/` | Raw mirror validated with `billing_summary` treated as a derived dataset from base billing tables. |
| Intacct mirror (24-month) | PASS | `ssot_audit/intacct_full_mirror_2026-02-12/` | 24-month mirror is validated. |
| Intacct mirror (full-history, native parity) | FAIL | `ssot_audit/intacct_forensic_native_full_20260218T180000Z_allbuckets_v3/` | Native-vs-lake forensic audit (all S3 buckets) shows major GLENTRY coverage gaps and small mismatches in APBILL/OTHERRECEIPTS; not yet a like-for-like mirror. |
| Salesforce crosswalk | CONDITIONAL | `ssot_audit/ssot_crosswalk_status_2026-02-13/` | Crosswalk exists but is not strictly 1:1 due to migrations/duplicates; mapped vs unmapped handling is required in downstream KPIs. |
| Vetro ingestion + GIS | DEGRADED / RECOVERING | `ssot_audit/vetro_gis_2026-02-11/` and live orchestration state | Plan list refresh is healthy. Export/feature ingestion is now throttling-aware; progress depends on Vetro API rate windows. |
| Gaiia integration | CONDITIONAL | `docs/integrations/gaiia.md` and crosswalk evidence packs | Available for operational enrichment; not used as sole deterministic identity key for SSOT joins. |
| Finance KPI certification | PASS | `ssot_audit/finance_kpi_raw_2026-02-12/` | TTM/YTD MRR and active subscription checks are evidence-backed and passing. |
| Ownership bucket parity | FAIL (OPEN) | `ssot_audit/bucket_summary_hybrid_2026-02-13/` | Owned/Contracted/CLEC parity outside tolerance; UI must remain evidence-gated until pass. |

## Certification Rule
- Full SSOT certification for the MAC ownership/customer-mix experience requires:
  1. Ownership bucket parity within configured tolerance.
  2. Crosswalk-safe joins with explicit mapped/unmapped visibility.
  3. Freshness gates passing for all source domains used by the surfaced metrics.

## What Is Safe To Present Now
- Finance KPIs and mirror results with attached evidence pack links.
- Cross-system architecture, governance controls, and freshness gating strategy.
- Ownership/bucket metrics only when explicitly marked as benchmarked or evidence-gated.

## Next Milestones
1. Close R-005 (ownership bucket parity) and rerun parity audit to PASS.
2. Lock crosswalk selection rules for non-1:1 Salesforce cases and publish mapped/unmapped controls.
3. Re-run end-to-end readiness gate and update this status page with a full-certification timestamp.
