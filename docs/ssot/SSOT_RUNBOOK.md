# SSOT Daily Runbook

## Goal
Produce definitive, reconciled SSOT answers with audit proofs.

## Steps
1) Run ingestion or validate upstream schedule success.
2) Refresh Glue partitions/crawlers.
3) Apply SSOT transforms:
   - curated_raw
   - current
   - exceptions
4) Run proof queries and write manifest.
5) Append to `curated_recon.ssot_daily_summary`.

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

## Failure handling
- If guards fail, mark manifest status `failed` and include errors.
- Do not overwrite last known good SSOT results.

