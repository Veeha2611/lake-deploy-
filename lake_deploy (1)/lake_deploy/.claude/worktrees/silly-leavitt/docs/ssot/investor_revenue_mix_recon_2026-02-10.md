# Investor Revenue Mix SSOT Recon (2026-02-10)

## Source
- Workbook: `/Users/patch/Downloads/Investor Questions - GWI Business.xlsx`
- Tab: `Revenue Mix`
- Sections used:
  - `REVENUE`
  - `PLAT ID COUNT`
  - `Monthly ARPU`

## Lake landing
- Local extract: `/tmp/investor_revenue_mix_2026-02-10.csv`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/investor_revenue_mix/dt=2026-02-10/investor_revenue_mix_2026-02-10.csv`

## Athena objects
- Table: `curated_recon.investor_revenue_mix`
- Views:
  - `curated_core.v_investor_revenue_mix_latest` (network-level rows, excludes Total)
  - `curated_core.v_investor_revenue_mix_totals_latest` (Total row only)

## Key behavior
- The workbook `Total` rows **do not** equal the sum of network rows.
- Totals are taken directly from the workbook `Total` lines (Revenue, Plat ID Count, Monthly ARPU).
- Network-level rows are retained for allocation analysis but should not be summed to reproduce totals.

## Latest totals (as-of)
- As-of date: `2026-02-25`
- Total MRR: `1,060,028`
- MRR customers (Plat ID Count): `4,570`
- Avg ARPU: `232`

## Evidence / QIDs
- Create DB: `8d46ea7d-cc88-4780-8052-f18bdb45f4ad`
- Create table: `e10e010b-0a54-42a8-9988-baf332661078`
- Create detail view: `4d278f0c-7ed9-48ce-9f4c-6f59c874279f`
- Create totals view: `a5dd24d0-d12f-45ad-9e9b-000814267737`
- Finance KPI view refresh: `9cb2710f-05d4-4162-9c0a-99f24f9a054e`
- Finance KPI validation: `294eae04-903a-40c6-9910-c616eb3fad7d`

## Notes
- Finance KPIs now source `total_mrr` and `mrr_customers` from `v_investor_revenue_mix_totals_latest`.
- Active accounts remain from `curated_core.dim_customer_platt` (service-active) and may exceed billed MRR customers.
