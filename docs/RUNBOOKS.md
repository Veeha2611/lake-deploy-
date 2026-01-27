# Daily Runbooks and Validation

All systems must write a manifest to:
- `s3://gwi-raw-us-east-2-pc/orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json`

Global SSOT rollup:
- `curated_recon.ssot_daily_summary`

## Intacct
Validate:
- `orchestration/intacct_daily/run_date=<today>/manifest.json`
- Athena:
  - `SELECT COUNT(*) FROM curated_core.intacct_gl_entries_current WHERE run_date='<today>'`
  - `SELECT MAX(business_date) FROM curated_core.intacct_gl_entries_current WHERE run_date='<today>'`

## Salesforce
Validate:
- `orchestration/salesforce_daily/run_date=<today>/manifest.json`
- Athena:
  - `SELECT COUNT(*) FROM curated_core.salesforce_account_current WHERE run_date='<today>'`

## Vetro
Validate:
- `orchestration/vetro_daily/run_date=<today>/manifest.json`
- Check state:
  - `s3://gwi-raw-us-east-2-pc/vetro_export_state/plan_index.json`

## Global SSOT
Validate:
- `SELECT * FROM curated_recon.ssot_daily_summary WHERE run_date='<today>' ORDER BY system, entity`

Guard policy:
- Guard status is computed from `*_current` tables only.
- Exceptions are recorded but do not fail the run unless thresholds are exceeded.

## Monday Deliverables Sync Prereqs
Secret:
- `monday/prod` in Secrets Manager with keys: `api_key`, `workspace_id`, `deliverables_board_id`

Athena table:
- `curated_ssot.deliverables` (see `sql/ssot/01_deliverables.sql`)

Proof query:
- `SELECT COUNT(*) FROM curated_ssot.deliverables WHERE dt = '<today>'`
