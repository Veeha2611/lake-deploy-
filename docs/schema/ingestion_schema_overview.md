# Ingestion Schema Overview

This document lists raw-layer schema contracts for each source and points to the DDLs used in Athena.

## Raw DDLs (authoritative)
- Intacct GL entries: `athena/raw/legacy_ddls/raw_intacct_gl_entries.sql`
- Salesforce accounts: `athena/raw/legacy_ddls/raw_salesforce_accounts.sql`
- Salesforce opportunities: `athena/raw/legacy_ddls/raw_salesforce_opportunities.sql`
- Platt customer: `athena/raw/legacy_ddls/raw_platt_customer.sql`
- Vetro exports: `athena/raw/legacy_ddls/raw_vetro_exports.sql`

## Notes
- DDLs are marked legacy but reflect the current raw landing contracts.
- Curated and SSOT views are documented under `docs/schema/` and `docs/ssot/`.
