# Platt SSOT - Current State and Next Steps

## Purpose
Keep Platt as the authoritative SSOT for billing, customer, and rate data with daily freshness and audit proofs.

## Current State (as of 2026-02-02)
- `curated_platt.billing_derived` exists and is fresh to dt=2026-01-30.
- `curated_core.platt_billing_current` now points to `billing_derived`.
- Raw Platt tables are landing daily and partitioned by `dt`.

## Landing (S3)
- `s3://gwi-raw-us-east-2-pc/raw/platt/customer/`
- `s3://gwi-raw-us-east-2-pc/raw/platt/iheader/`
- `s3://gwi-raw-us-east-2-pc/raw/platt/idetail/`
- `s3://gwi-raw-us-east-2-pc/raw/platt/billing/` (stale; replaced by derived table)
- `s3://gwi-raw-us-east-2-pc/raw/platt/custrate/`
- `s3://gwi-raw-us-east-2-pc/raw/platt/*_history/`
- Proof packs: `s3://gwi-raw-us-east-2-pc/orchestration/platt_daily/run_date=YYYY-MM-DD/manifest.json`

## Key Queries (verified)
1) `curated_platt.billing_derived` freshness
   - QID: `fd04db9e-6c86-468c-b352-9b9aa1209c60`
   - Result: max_dt=2026-01-30, invoice_cnt=13,439,062

2) `curated_core.platt_billing_current` freshness
   - QID: `d660f3e2-6ead-4628-8721-bec7a794cb7e`
   - Result: max_dt=2026-01-30, invoice_cnt=13,439,062

3) Derived billing CTAS
   - QID: `cb6ea95a-0450-4de8-bca8-640f11018d97`
   - Result: SUCCEEDED

## Known Gap
Header totals in `iheader.total` do not reconcile to derived line totals in the lake.
- Validation QID: `ed955641-2edf-4bc0-859a-e2e81d82b453`
- Normalization test QID: `7e661323-ea72-4419-8ed8-93fd2c0339a5`
- Parse integrity QID (dt=2026-01-30): `330217fd-a949-40cf-aacf-954a87377be1`

Root cause: raw `iheader.csv.gz` is unquoted CSV; commas inside text fields shift columns, causing header_total and date parsing errors.

## Next Steps (follow in order)
1) Re-export Platt with quoting (or switch to pipe delimiter) and update SerDe if needed.
2) Re-run raw → curated refresh and reconciliation.
3) Record final reconciliation thresholds in:
   - `docs/reference/lake_audit_2026-01-30.md`
   - `docs/integrations/platt.md`
4) Add a recurring SSOT check for:
   - `curated_core.platt_billing_current` freshness
   - `curated_core.platt_customer_current_ssot` freshness

## Rollback Plan
If derived billing is invalid, revert `curated_core.platt_billing_current` to its prior definition and document the reason in the audit log.
