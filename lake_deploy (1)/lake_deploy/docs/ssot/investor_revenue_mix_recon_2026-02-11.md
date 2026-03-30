# Investor Revenue Mix SSOT Recon (2026-02-11)

Purpose: Rebuild Revenue Mix metrics from the investor workbook and publish SSOT‑aligned totals for Finance KPIs.

## Source
- Workbook: `/Users/patch/Downloads/Investor Questions - GWI Business.xlsx`
- Sheet: `Revenue Mix`
- Sections used: `REVENUE`, `PLAT ID COUNT`, `Monthly ARPU`

## Transform
- Extracted rows under each section (network + network_type + monthly columns).
- Dropped non‑numeric rows (notes / labels in Monthly ARPU section).
- Long format columns:
  - `metric_type` (`Revenue`, `PlatIdCount`, `MonthlyARPU`)
  - `network`
  - `network_type`
  - `as_of_date` (YYYY‑MM‑DD)
  - `metric_value` (double)
- Current‑month logic in views: `day(as_of_date)=25` and `as_of_date <= current_date`.

## Outputs
- Local CSV: `/Users/patch/vetro/tmp/investor_revenue_mix_2026-02-11.csv`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/investor_revenue_mix/dt=2026-02-11/investor_revenue_mix_2026-02-11.csv`

## Catalog
- Database: `curated_recon`
- Table: `curated_recon.investor_revenue_mix`
  - Created via Glue API (Athena v3 does not allow external CSV DDL).
  - Location: `s3://gwi-raw-us-east-2-pc/curated_recon/investor_revenue_mix/dt=2026-02-11/`

## Views
- `curated_core.v_investor_revenue_mix_latest`
- `curated_core.v_investor_revenue_mix_totals_latest`

## Validation (Athena)
Latest totals (as of 2026‑01‑25):
- Total MRR: **1,198,104.0**
- Total Subscriptions: **4,798.0**
- Avg ARPU: **250.0**

Finance KPI snapshot:
- Period: **2026‑01‑25**
- Total MRR: **1,198,104.0**
- MRR Customers: **4,798.0**
- Active Service Accounts (Platt): **6,224**

## Evidence (QIDs)
- Create views:
  - `curated_core.v_investor_revenue_mix_latest`: `28b2ede5-fc94-4d94-9c0c-55eac637f18e`
  - `curated_core.v_investor_revenue_mix_totals_latest`: `51137c57-163f-4bd8-9a6f-3bdfee23079b`
- Refresh finance KPI view: `ac8fcd3b-77bf-4d43-a32a-3c178462f594`
- Totals validation: `d706a57c-89e5-4a20-986a-7cbd3fb3d175`
- Finance KPI validation: `bd77a2bf-4370-47c1-9952-e603aeda32b0`

## Notes
- Active Service Accounts come from `curated_core.dim_customer_platt` and can exceed MRR customers.
- If month‑end logic should use a different day, update `day(as_of_date)=25` in the views.
