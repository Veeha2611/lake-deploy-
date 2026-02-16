# Appendix — Technical Notes (Customer Mix / Bucket Summary)

**Date:** 2026-02-13  
**Purpose:** Provide technical details backing the executive report and the one-pager. This appendix is intended for Patch/Adam and anyone validating the lake logic.

## A) Current “Customer Mix” + “Bucket Summary” Logic (subscriptions-aligned)

### 1) `curated_core.v_network_health`
**Definition source:** `athena/curated/11_network_health.sql`  
**What it represents:** network-level passings + subscriptions + ARPU + modeled MRR, aligned to the Investor “Customer Mix” harness.

Key details:
- Uses the latest `dt` from `curated_recon.vetro_customer_mix_recon`.
- Produces:
  - `passings` (reconciled from Vetro layers / as-built harness)
  - `subscriptions` (workbook-locked)
  - `arpu` (workbook-locked)
  - `mrr = subscriptions * arpu` (modeled)
- Network bucketing (`network_type` / `customer_type`) uses a deterministic mapping list aligned to the workbook “Customer Mix” sheet.

### 2) `curated_core.v_bucket_summary_latest`
**Definition source:** `athena/curated/14_unit_economics_and_ownership.sql`  
**What it represents:** subscriptions-aligned bucket rollups (Owned FTTP / Contracted / CLEC) based on `curated_core.v_network_health`.

Key details:
- Buckets are derived from `v_network_health.network_type`:
  - `Owned FTTP -> owned_fttp`
  - `Contracted -> contracted_fttp`
  - `CLEC -> clec_business`
- `customer_count` is computed as `SUM(subscriptions)` (not distinct billing customers).
- `total_mrr` is computed as `SUM(mrr)` (modeled MRR).
- FSA counts are joined from `curated_core.v_vetro_fsa_tagged`.

## B) Prior Logic That Produced “348” (billing-customer semantics)

The earlier path (captured in `Downloads/owned workstream resolve.txt`) bucketed from billed customer IDs:
- Start from latest-month billing customers (`mrr_total > 0`) and count `COUNT(DISTINCT customer_id)`.
- Crosswalk customer → network → plan → as-built:
  - `curated_recon.platt_customer_system_map` (customer → `gwi_system`)
  - `curated_recon.gwi_system_network_map` (system → network)
  - `raw_sheets.vetro_network_plan_map_auto` (network → plan_id/plan_name)
  - `raw_sheets.vetro_as_built_plan_ids` (as-built plan filter)
- Bucket logic was therefore sensitive to crosswalk and as-built completeness, and it counted **billing customers**, not subscriptions.

This is why the meeting surfaced “912 vs 348” as a mismatch: different definitions.

## C) Evidence and Validation Paths

### 1) Transcript (source of requests)
- `ssot_audit/notion_transcripts/2026-02-13/3063eb690d098193a94fd08ed4f1b196_transcript.txt`
  - “912 vs 348” discussion
  - Request to send fix + to-do list “today / by end of day”
  - Request for urgent Vetro cleanup email + daily progress updates
  - Request for change log and MRR movement breakdown

### 2) “owned workstream resolve” notes (definition breakdown)
- `/Users/patch/Downloads/owned workstream resolve.txt`

### 3) Quick sanity queries (Athena)
**Subscriptions by network_type:**
```sql
SELECT
  network_type,
  SUM(subscriptions) AS subs,
  SUM(passings) AS passings,
  SUM(mrr) AS modeled_mrr
FROM curated_core.v_network_health
WHERE dt = (SELECT MAX(dt) FROM curated_core.v_network_health)
  AND network <> 'Unmapped'
GROUP BY network_type
ORDER BY subs DESC;
```

**Bucket summary rows:**
```sql
SELECT *
FROM curated_core.v_bucket_summary_latest
ORDER BY bucket;
```

## D) Next Step Plan: Move From Modeled (Workbook) to Measured (Lake-Native)

The goal is to keep workbook alignment while making the dashboard dynamic from authoritative lake sources.

### Step 1: Adopt Platt-derived “subscriptions” as the dynamic truth
- Use `curated_recon.v_network_active_services_latest` as the subscriptions truth per network (active service accounts).
- Reconcile against `v_network_health.subscriptions` to quantify drift.

### Step 2: Compute billed MRR (invoice-derived) using Emilie’s rules
Requirements:
- Guarantor-aware billing roll-up (bill-to account hierarchy).
- Exclude taxes/fees/credits per a controlled exclusion list.
- Apply consistent filters (e.g., exclude automatic/late fee comments where applicable).

Deliverable:
- A partitioned monthly summary (CTAS) that produces:
  - billed MRR by bill-to (guarantor)
  - billed customer counts
  - billed MRR by network after system/network crosswalk

### Step 3: Publish a billing-aligned bucket summary in parallel
Publish side-by-side:
- Subscriptions-aligned bucket summary (current)
- Billing-aligned bucket summary (new)

Then:
- Establish tolerance thresholds (e.g., deltas > 2% require explanation).
- Reconcile until the measured vs modeled differences are understood and stable.

## E) Known Blockers / Risks
- Crosswalk coverage: customer → system → network must be complete and stable, or billed MRR will fall into “Unmapped.”
- Vetro data cleanup: service locations, FSAs, and as-built plan tagging quality impacts downstream network views and join consistency.
- Labeling: UI must keep “Subscriptions” and “Billed customers” distinct to prevent regression of the original mismatch.

