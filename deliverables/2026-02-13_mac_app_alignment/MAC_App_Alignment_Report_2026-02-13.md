# MAC App Alignment Report — Customer Mix / Bucket Summary

**Date:** 2026-02-13  
**Scope:** Explain and document the “Owned FTTP mismatch” and confirm the current dashboard behavior vs the Investor “Customer Mix” workbook. Provide action items and an evidence-backed validation path.

## 1) Top-Line Summary

### What was wrong
- The dashboard was mixing **two different definitions of “customers”**:
  - **Subscriptions / Active services** (workbook semantics; “~900 Owned FTTP”).
  - **Billed customers** (distinct billing `customer_id` / MRR customers; much smaller).
- The **Owned FTTP** count mismatch surfaced as **912 vs 348** in the meeting.

### What is now fixed (as of 2026-02-13)
- The MAC API `bucket_summary` response now returns **subscriptions** by bucket so the dashboard matches the Investor workbook “Customer Mix” semantics:
  - Owned FTTP: **912**
  - Contracted: **2,333**
  - CLEC: **1,634**
- This resolves the “912 vs 348” mismatch as a **definition/label mismatch**, not missing data.
- A billing-aligned bucket summary is now available alongside the subscriptions-aligned summary:
  - `bucket_summary_billing` returns **billed customers + billed MRR** by bucket, with evidence and freshness checks.

### What remains (known gap)
- The network mix ARPU/MRR shown in this alignment path is still **modeled** (subscriptions × ARPU from the workbook reconciliation harness), not recomputed from **native Platt invoicing** using guarantor roll-up + exclusion rules.
- Next step is to compute **billing-aligned** “customers + MRR” from Platt invoice sources and publish a parallel tile (or promote measured values once reconciled).

## 2) Action Items (from transcript)

The following are direct requests/commitments captured in the meeting transcript.

### A) Reconcile and communicate the fix + to-do list (Patch)
- Request (transcript): “Pat, you’re going to look at that to do list… do you think you could do that today? And send it to Adam and to me…” and “I’ll do the action item… send that out in a digestible format…”  
- Recap (transcript): “Patch you’re going to send by the end of the day the updated… fix with this list of to dos…”

### B) Vetro cleanup escalation to Chris Whalen (Adam)
- Request (transcript): “send him an email… urgent to start today… who is he assign and when they’re going to start… we want to see updates daily…”
- Recap (transcript): “Adam, you’re sending an email to Chris Whalen… have him tell you today who’s assigning it…”

### C) Add “Change Log” (24h delta) widget (Patch)
- Request (transcript): “is there a change log… ten new customers / lost three…”
- Response (commitment): publish a lightweight, daily-ingestion-based change log.

### D) Add MRR movement breakdown (Patch)
- Request (transcript): break down MRR into contraction / churn / reactivation for trend tracking.

## 3) Definition Clarity (Subscriptions vs Billed Customers)

To avoid “apples vs oranges”:

- **Subscriptions / Active services**
  - Measures service volume.
  - Investor “Customer Mix” workbook uses **Subscriptions** as the “customer-like” metric at the network level.
  - Current dashboard alignment shows this in `bucket_summary`.

- **Billed customers**
  - Measures bill-to accounts (distinct billing identifiers).
  - Useful for finance/collections and invoice-based MRR reporting.
  - Should be published as a **separate tile** (billing-aligned) or clearly labeled when displayed.

## 4) Workbook Alignment (Customer Mix Semantics)

Current dashboard semantics for the “Owned / Contracted / CLEC” groupings match the workbook’s **Subscriptions** totals:
- Owned FTTP: 912
- Contracted: 2,333
- CLEC: 1,634

## 5) Evidence (What to Run, Where It Comes From)

### A) MAC API (AWS-only path)
- Endpoint: `POST /prod/query`
- Query ID: `bucket_summary`
- Source view: `curated_core.v_bucket_summary_latest`

**Evidence pack (2026-02-13 run):**
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/mac_alignment_run/dt=2026-02-13/`
- Local: `ssot_audit/mac_alignment_run/dt=2026-02-13/`

**Validation steps (deterministic):**
1. Call the API:
   - `question_id=bucket_summary`
2. Confirm `owned_fttp.customer_count = 912` and buckets include `owned_fttp`, `contracted_fttp`, `clec_business`.

### B) Athena (direct)
**Network type totals (subscriptions):**
```sql
SELECT
  network_type,
  SUM(COALESCE(subscriptions, 0)) AS subscriptions
FROM curated_core.v_network_health
WHERE dt = (SELECT MAX(dt) FROM curated_core.v_network_health)
  AND network <> 'Unmapped'
GROUP BY network_type
ORDER BY subscriptions DESC;
```

**Bucket summary rows (subscriptions-aligned):**
```sql
SELECT
  bucket,
  fsa_count,
  customer_count,
  total_mrr,
  revenue_per_customer
FROM curated_core.v_bucket_summary_latest
ORDER BY CASE bucket WHEN 'owned_fttp' THEN 1 WHEN 'contracted_fttp' THEN 2 ELSE 3 END;
```

### C) Lake SQL definitions (source of record)
- `athena/curated/11_network_health.sql` (creates `curated_core.v_network_health`)
- `athena/curated/14_unit_economics_and_ownership.sql` (creates `curated_core.v_bucket_summary_latest`)

## 6) Known Gaps and Concrete Next Step (Make It Lake-Native and Dynamic)

### What is modeled today
- Subscriptions and ARPU used in the aligned path are derived from the Investor workbook reconciliation harness, then surfaced via `curated_core.v_network_health`.

### What must become measured (from the lake)
1. **Active services by network** (Platt-derived)  
   - Use `curated_recon.v_network_active_services_latest` as the subscriptions truth for dashboard metrics.
2. **Billed MRR by network** (invoice-derived, guarantor-aware, exclusions applied)
   - Compute from Platt invoice sources with:
     - guarantor roll-up (bill-to account)
     - exclusion list (taxes/fees/credits/etc.)
   - Materialize as a monthly summary table to avoid heavy scans.
3. Publish a **billing-aligned bucket summary** alongside the subscriptions-aligned summary; reconcile until deltas are within tolerance.

## 7) Change Log Request (Simplest v1)

Implement a v1 “Last 24h delta” for:
- subscriptions (active services)
- billed customers (latest month) and billed MRR
- unmapped systems count / MRR
- Vetro service locations count
- Vetro as-built plan count

Implementation can be a daily materialized table keyed by `run_date` with precomputed deltas, then displayed as a small tile.
