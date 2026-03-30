# Pioneer One KPI Summary — Lake Population Runbook

## Objective
Determine whether the **Pioneer One KPI Summary** workbook can be fully populated from the data lake, identify exact queries needed, and document gaps.

## Source File
- `/Users/patch/Downloads/Pioneer One KPI Summary (1).xlsx`

## Workbook Structure (Sheet1)
**Columns (network categories):**
- DVFiber
- NW Fiberworx
- LymeFiber
- Maine Operations*
- TOTAL GWI
- Acquisition: Stowe / Downeast / Leeds

**Rows (metrics):**
- Passings (fiber - resi)
- Passings (fiber - commc’l)
- Passings (coax/copper/etc - resi)
- Passings (coax/copper/etc - commc’l)
- Subs (fiber - resi)
- Subs (fiber - commcl)
- Subs (coax/copper/etc - resi)
- Subs (coax/copper/etc - commc’l)
- ARPU (fiber - resi)
- ARPU (fiber - commcl)
- ARPU (coax/copper/etc - resi)
- ARPU (coax/copper/etc - commc’l)
- CLEC Subs
- CLEC ARPU
- Revenue (fiber - resi / commc’l / coax resi / coax commc’l)
- EBITDA (fiber - resi / commc’l / coax resi / coax commc’l)

## Lake Views Available (Current)
- **Revenue:** `curated_core.v_monthly_revenue_platt_long`
- **EBITDA:** `curated_finance.v_ebitda_rollup_monthly_by_location`
- **Subscribers:** `curated_core.v_subscriber_summary_v1`
- **Copper subscribers:** `curated_core.v_residential_copper_customers`
- **Passings (bulk/retail only):** `curated_core.v_passings_bulk_retail_split`

## Deterministic Gaps (Blocking)
1) **Category mapping** (DVFiber / NWFX / LymeFiber / Maine Ops / Stowe / Downeast / Leeds)
   - Required to attribute all metrics to workbook columns.
   - **Missing** in lake today.

2) **Passings by category + tech + resi/comm**
   - Requires Vetro passings **and** category mapping.
   - Vetro backfill incomplete → **blocked**.

3) **Coax/copper passings by category**
   - No source mapped to lake → **blocked**.

4) **CLEC Subs / CLEC ARPU**
   - CLEC flag not present in curated views → **blocked**.

## Required New/Updated Tables
Create/land a mapping table with at least:
- `entity_id` (customer_id or location_id)
- `network_category` (DVFiber, NW Fiberworx, LymeFiber, Maine Ops, Stowe, Downeast, Leeds)
- `tech_type` (fiber / copper / coax)
- `segment` (resi / commcl)
- `clec_flag` (true/false)

Suggested name:
- `curated_core.network_category_map`

## Execution Plan (Once Gaps Closed)
1) **Passings**
   - Join Vetro passings → `network_category_map`.
2) **Subscribers**
   - Join `v_subscriber_summary_v1` → `network_category_map`.
3) **Revenue**
   - Join `v_monthly_revenue_platt_long` → `network_category_map`.
4) **EBITDA**
   - Join `v_ebitda_rollup_monthly_by_location` → `network_category_map`.
5) **ARPU**
   - Derived as `revenue / subs` (by category + tech + segment).
6) **CLEC**
   - Filter using `clec_flag` in mapping table.

## Proof / Output Requirement
For each populated metric:
- SQL used
- Athena QID
- Output file location in S3
- Last refreshed timestamp

## Current Status Summary
- **Can partially populate totals** (without category split) from existing revenue/EBITDA/subscriber views.
- **Cannot fully populate workbook columns** until category mapping and Vetro passings are landed.

