# SSOT Daily Runbook

## Goal
Produce definitive, reconciled SSOT answers with audit proofs.

## Steps
0) Run **global SSOT gates** (hard block on failure):
   - `runbooks/ssot_global_gates.sh`
1) Run ingestion or validate upstream schedule success.
2) Refresh Glue partitions/crawlers.
3) Apply SSOT transforms:
   - curated_raw
   - current
   - exceptions
   - canonical dimensions + crosswalks
4) Run proof queries and write manifest.
5) Append to `curated_recon.ssot_daily_summary`.

## Intacct AWS-Only Runbooks
- 24-month backfill: `docs/ssot/intacct_aws_backfill_24mo_runbook_2026-02-07.md`
- Full-history ingestion: `docs/ssot/intacct_aws_full_history_runbook_2026-02-07.md`
- Evidence artifact: `docs/ssot/EA_1005_COMPLETENESS_2026-02-07.md`
- Independent audit prompt: `docs/ssot/intacct_24mo_audit_prompt_2026-02-07.md`

## Standing Order: Intacct Reconcile-on-Arrival
Any landed Intacct run_date must be reconciled, crawled, and made SSOT-usable automatically.

Scripts:
- `runbooks/intacct_reconcile_on_arrival.sh` (per run_date recon + evidence)
- `runbooks/intacct_reconcile_watchdog.sh` (scans for new run_dates, triggers recon)

AWS schedule:
- EventBridge rule: `intacct-reconcile-watchdog-30min`
- Target: ECS `intacct-ingest-cluster` using task `intacct-ingest-task:18`
- Script source: `s3://gwi-raw-us-east-2-pc/orchestration/intacct/intacct_reconcile_watchdog.sh`

Evidence output:
- `s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/dt=<RUN_DATE>/`
  - `status.json`
  - `object_integrity.tsv`
  - `glue_crawler_status.json`
  - `qids.tsv`
  - `athena_values.json`

## Canonical SSOT (cross-system)
- Definitions live in `athena/curated/ssot/60_ssot_canonical_dimensions.sql`
- Source priority rules in `athena/curated/ssot/61_ssot_source_priority_rules.sql`
- Coverage views in `athena/curated/ssot/62_ssot_reconciliation_views.sql`

## Proof queries (examples)
### Customers (canonical)
```sql
SELECT COUNT(*) FROM curated_core.customer_current;
SELECT MAX(business_date) FROM curated_core.customer_current;
SELECT COUNT(*) FROM curated_recon.customer_exceptions;
SELECT MAX(business_date) FROM curated_recon.customer_exceptions;
```

### Salesforce Accounts (SSOT)
```sql
SELECT COUNT(*) FROM curated_core.salesforce_account_current_ssot;
SELECT MAX(business_date) FROM curated_core.salesforce_account_current_ssot;
SELECT COUNT(*) FROM curated_recon.salesforce_account_exceptions;
```

### Platt Customers (SSOT)
```sql
SELECT COUNT(*) FROM curated_core.platt_customer_current_ssot;
SELECT MAX(business_date) FROM curated_core.platt_customer_current_ssot;
SELECT COUNT(*) FROM curated_recon.platt_customer_exceptions;
```

### Canonical Dimensions (coverage)
```sql
SELECT * FROM curated_recon.ssot_dim_counts ORDER BY entity;
SELECT * FROM curated_recon.ssot_xwalk_coverage ORDER BY entity, source_system;
```

## Failure handling
- If guards fail, mark manifest status `failed` and include errors.
- Do not overwrite last known good SSOT results.
- SSOT claims require proof artifacts + QIDs (see `docs/proofs/proofs.md`).
