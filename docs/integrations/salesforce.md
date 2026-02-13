# Salesforce Integration

## Purpose
Ingest Salesforce account and opportunity data to support SSOT and pipeline analytics.

## Manifests
- `s3://gwi-raw-us-east-2-pc/orchestration/salesforce_daily/run_date=YYYY-MM-DD/manifest.json`

## Raw SSOT Path
- Canonical source: `s3://gwi-raw-us-east-2-pc/raw/salesforce_prod_appflow/`
- Legacy (read-only): `s3://gwi-raw-us-east-2-pc/raw/salesforce/`

## Athena
- `raw_salesforce_prod_appflow.account` (AppFlow raw)
- `raw_salesforce_prod_appflow.opportunity` (AppFlow raw)
- `curated_core.salesforce_account_current` (daily current snapshot)
- `curated_core.salesforce_opportunity_current` (daily current snapshot)

## Deployed Today
- AppFlow raw tables + current snapshot views pointing to AppFlow.

## Crosswalks
- `curated_crosswalks.sf_account_to_intacct_customer` (name+ZIP baseline)
- `curated_crosswalks.sf_account_to_intacct_customer_hybrid` (SF→Platt→Intacct bridge)
- `curated_crosswalks.sf_account_to_intacct_customer_final` (hybrid + residuals; SSOT input)
- Summary: `curated_recon.sf_intacct_crosswalk_summary`
 - Gaps: `curated_recon.sf_intacct_crosswalk_gaps`
 - Advisory suggestions (non-SSOT): `curated_crosswalks.sf_intacct_match_suggestions`

## Planned / Future
- Full opportunity-to-project mapping in curated_core.
