# MAC Dashboard: What Changed (Owned / Contracted / CLEC)

**Date:** 2026-02-13  
**Audience:** Alex / Adam / Exec review  
**Goal:** Explain the “912 vs 348” mismatch and confirm current dashboard behavior.

## What Changed
- The **Bucket Summary — Owned / Contracted / CLEC** output was updated so “Customers” reflects **Subscriptions (Active services)** for this tile, aligning to the Investor “Customer Mix” workbook semantics.

## Why The Mismatch Happened (912 vs 348)
- **912** is a **subscriptions** number (service volume) used by the workbook’s Customer Mix.
- **348** was a **billed-customer-based** number (distinct billing `customer_id` after crosswalk/as-built bucketing).
- Both can be valid metrics, but they cannot share the same label without causing confusion.

## What The Dashboard Shows Now
For the Bucket Summary tile (subscriptions-aligned):
- Owned FTTP: **912**
- Contracted: **2,333**
- CLEC: **1,634**

## What “SSOT” Means Here
SSOT means:
- deterministic definitions (no ambiguous labels),
- evidence-backed results (queries + views named and reproducible),
- reconciled across systems (modeled vs measured deltas tracked until within tolerance).

## Where To Validate (2-minute check)
1. In the MAC app Dashboard: open the **Bucket Summary** tile and confirm Owned FTTP shows ~912.
2. If you want a deterministic back-end check: query `bucket_summary` via the MAC API `/query` and confirm `owned_fttp.customer_count = 912`.

## What Still Needs Work
- ARPU/MRR in the aligned path is still **modeled** from the workbook harness. Next step is to compute a billing-aligned MRR (guarantor-aware, exclusions applied) directly from Platt invoice sources and publish it alongside subscriptions.

