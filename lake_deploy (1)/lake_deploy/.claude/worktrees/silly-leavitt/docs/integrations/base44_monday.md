# Base44 + Monday Integration

## Purpose
Enable Monday as the input surface for project pipeline data, store all records in AWS (system of record), and expose curated outputs in the Base44 app.

## Flow (Current)
1. User updates Monday project row.
2. Base44 function syncs Monday → AWS (append-only CSV to S3).
3. Athena refresh exposes `curated_core.projects_enriched`.
4. Base44 Projects page reads Athena.

## Monday → AWS Sync
- Function: `syncMondayToAWS` (Base44 function)
- S3 target: `s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/input/`
- Output: timestamped CSV (append-only)

## AWS → Monday (Optional)
- Result write-back is disabled until webhook is verified.

## Scenarios
- Scenario subitems are created under the project row when a scenario is saved in Base44.

## Required Fields (Inputs)
- passings
- build_months
- total_capex
- arpu_start
- penetration_start_pct
- penetration_target_pct
- ramp_months
- opex_per_sub
- discount_rate_pct

## Calculated Fields
- npv
- irr_pct
- moic
- actual_cash_invested
- peak_subscribers
- peak_ebitda

## Deployed Today
- Monday → AWS sync with computed financials.
- Scenario subitems creation.

## Planned / Future
- Reliable webhook automation to trigger sync on updates.
- UI-only trigger (button/checkbox) if webhooks unavailable.

