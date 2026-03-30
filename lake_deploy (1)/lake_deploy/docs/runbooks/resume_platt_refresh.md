Resume Platt Refresh (Stop/Start)

Last known running step
- CTAS for curated_platt.billing_derived
- Last QID: cb6ea95a-0450-4de8-bca8-640f11018d97

Resume checklist (in order)
1) Check CTAS status for QID cb6ea95a-0450-4de8-bca8-640f11018d97.
2) If success, verify max_dt for curated_platt.billing_derived.
3) Update curated_core.platt_billing_current to point to billing_derived.
4) Validate derived totals against header totals.
5) Record results and QIDs in docs/reference/lake_audit_2026-01-30.md.

Notes
- The CTAS uses regex-safe casts to prevent non-numeric id_extended values from failing the build.
- Raw billing table is stale; this derived table replaces it for current billing rollups.
