# Executive Demo Checklist — MAC App Alignment

**Date:** 2026-02-13

## Access
- [ ] App loads (no blank screen).
- [ ] Dashboard tiles render without errors.

## Customer Mix (Owned / Contracted / CLEC)
- [ ] `bucket_summary` returns subscriptions-aligned buckets (`owned_fttp`, `contracted_fttp`, `clec_business`).
- [ ] `network_health` returns network rows with `subscriptions`, `active_services`, `billed_customers`, and `mrr_billed` populated (when available).
- [ ] `bucket_summary_billing` returns billed customers + billed MRR by bucket (separate from subscriptions-aligned summary).

## Freshness (Fail-Closed)
- [ ] If a required source is stale beyond SLA, the response is **UNAVAILABLE** (not a silent 0).
- [ ] Evidence pack includes freshness checks + query execution IDs.

## Evidence
- [ ] “Show evidence” includes executed SQL + Athena QueryExecutionId.
- [ ] “Verify” returns deterministic comparison outputs for the bucket subscription metrics.

