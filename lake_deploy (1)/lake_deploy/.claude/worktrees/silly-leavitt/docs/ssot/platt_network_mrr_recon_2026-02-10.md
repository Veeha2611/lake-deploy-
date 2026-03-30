# Platt ↔ Network MRR Reconciliation (SSOT Evidence)

**Date**: 2026-02-10  
**Purpose**: Make the Platt billed MRR vs Vetro modeled network MRR discrepancy *auditable* with explicit crosswalks and exceptions.

## Why this is needed
Platt billing is complete at the customer level, but **modeled network MRR** (Vetro SSOT) is a different source and requires a **system/network crosswalk**. Without that, dashboards show mismatches (e.g., 6,225 active accounts vs 362 billed MRR customers; modeled MRR ~ $969K vs billed MRR ~$7.8K).

This reconciliation layer makes the gap explicit and measurable.

## Platt SSOT status (customer-level parity)
Platt SSOT audit confirmed full history parity at the customer dimension:
- **idetail → iheader_full missing**: 0 (PASS)  
  QID: `aeb66643-8ef6-4bbe-b4db-8bebb0183bd5`
- **iheader → dim_customer_platt_full missing**: 0 (PASS)  
  QID: `2f320284-d0ef-46d8-8c06-82b99e86579b`

## Crosswalk assets (Athena + S3)
**Mapping source** (Platt customer → GWI system):  
`curated_recon.platt_customer_system_map`

**New crosswalk** (GWI system → network/system_key):  
S3: `s3://gwi-raw-us-east-2-pc/curated_recon/gwi_system_network_map/dt=2026-02-10/gwi_system_network_map_2026-02-10.csv`  
Athena table: `curated_recon.gwi_system_network_map`  
QID: `e99cfeb5-e12d-416f-9283-b3c8907164b6`

**Latest mapping view** (joins both maps):  
`curated_core.dim_customer_system_latest`  
QID: `e3f97de8-4bdf-400d-af3d-c562d90a9087`

## Reconciliation views created (Athena)
SQL file: `athena/curated/14_network_mrr_recon.sql`

**Created via Athena (QIDs):**
- `curated_recon` database: `11a1f327-25c0-4d4c-9b3c-2d523ab00a49`
- `curated_recon.v_network_mrr_recon_latest`: `52f9649c-968c-4a3e-acd9-09693791e510`
- `curated_recon.v_network_mrr_recon_exceptions`: `bcd8e81d-2d9e-43ad-897c-26438e3f77d3`
- `curated_recon.v_network_mrr_recon_summary`: `f80656f0-d43e-4110-a81b-03a0c647a872`

### What the views do
- **`v_network_mrr_recon_latest`**  
  Aligns billed MRR (Platt) to modeled MRR (Vetro) via:
  - `platt_customer_system_map` → `gwi_system_network_map`
  - network join to `curated_core.v_network_health`
  It computes:
  - billed MRR and customer counts
  - modeled subscriptions / MRR / ARPU
  - delta and ratio

- **`v_network_mrr_recon_exceptions`**  
  Lists billed MRR customers with missing system key or missing network map, with `exception_reason`.

- **`v_network_mrr_recon_summary`**  
  Overall totals: billed vs modeled MRR, subscriptions, and unmapped coverage.

## Mapping coverage (latest billed)
Coverage query QID: `83acbedf-16ed-4f8e-812c-c5dcf51561f7`
- Billed customers: **362**
- Billed MRR: **$7,815.15**
- Mapped to network: **322 customers / $7,526.58**
- Unmapped: **40 customers / $288.57**

## Finance KPI baseline (latest billed)
From `curated_core.v_finance_kpis_latest`:
- Period month: **2026-02-01**
- Total billed MRR: **$7,815.15**
- MRR customers: **362**
- Active service accounts: **6,225**

Query QID: `4c2485eb-ed65-4453-8081-b9ca5593783e`

## Churn summary materialization (performance + SSOT)
To avoid heavy scans on `v_monthly_account_churn_by_segment`, a monthly summary table is materialized:
- Table: `curated_core.monthly_account_churn_summary`
- CTAS QID: `f6f9a1c1-d270-4c9c-8251-ae352c34ca22`
- Location: `s3://gwi-raw-us-east-2-pc/curated_core/monthly_account_churn_summary/`

`curated_core.v_finance_kpis_latest` now reads from this table for churn fields.
Latest KPI query QID: `858d1ab0-cf1b-4d52-8435-f2edd5ffc06a`

## Reconciliation summary (latest)
Summary QID: `f39b65a7-291d-450c-9d2d-9099733744e1`
- Billed MRR total: **$7,815.15**
- Modeled MRR total: **$969,185.00**
- Billed customers: **362**
- Modeled subscriptions: **4,834**
- Unmapped billed MRR: **$288.57**

## Next SSOT actions
1) Remediate unmapped GWI systems (unmapped list is in `curated_recon.gwi_system_network_map`).  
2) Publish `v_network_mrr_recon_exceptions` count and top offenders.  
3) Keep reconciliation view in place as SSOT evidence for Finance + Network Mix alignment.

## Outcome
This reconciliation layer makes discrepancies **auditable and explainable**, rather than hidden. It is a required SSOT step before Finance + Network Mix tiles are considered fully aligned.
