# Schema / Table Inventory

This inventory enumerates the Athena tables by schema. The CSV source of record is `docs/schema/table_inventory.csv`.

## Counts by Schema
- curated_core: 117
- curated_finance: 13
- gwi_raw_intacct: 24
- raw_intacct: 4
- raw_sage: 2
- raw_salesforce: 10
- raw_sheets: 50
- raw_vetro: 1

## How to Regenerate
Run the inventory query against Athena and export to CSV. Store the result at `docs/schema/table_inventory.csv`.

```
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN (
  'curated_core','curated_finance','raw_salesforce','raw_sheets','raw_sage','raw_intacct','gwi_raw_intacct','raw_vetro'
)
ORDER BY table_schema, table_name;
```

