-- SSOT reconciliation/coverage views
CREATE DATABASE IF NOT EXISTS curated_recon;

-- Deduped crosswalk views (by ssot_id + source)
CREATE OR REPLACE VIEW curated_ssot.xwalk_account_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_account_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_account
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.xwalk_location_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_location_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_location
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.xwalk_asset_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_asset_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_asset
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.xwalk_product_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_product_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_product
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.xwalk_contract_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_contract_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_contract
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.xwalk_invoice_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_invoice_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_invoice
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.xwalk_payment_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_payment_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_payment
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_ssot.xwalk_ticket_current AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY ssot_ticket_id, source_system, source_id
      ORDER BY updated_at DESC NULLS LAST, effective_at DESC NULLS LAST
    ) AS rn
  FROM curated_ssot.xwalk_ticket
)
SELECT * FROM ranked WHERE rn = 1;

CREATE OR REPLACE VIEW curated_recon.ssot_xwalk_coverage AS
SELECT 'account' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_account_current
GROUP BY source_system
UNION ALL
SELECT 'location' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_location_current
GROUP BY source_system
UNION ALL
SELECT 'asset' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_asset_current
GROUP BY source_system
UNION ALL
SELECT 'product' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_product_current
GROUP BY source_system
UNION ALL
SELECT 'contract' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_contract_current
GROUP BY source_system
UNION ALL
SELECT 'invoice' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_invoice_current
GROUP BY source_system
UNION ALL
SELECT 'payment' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_payment_current
GROUP BY source_system
UNION ALL
SELECT 'ticket' AS entity, source_system, COUNT(*) AS row_count
FROM curated_ssot.xwalk_ticket_current
GROUP BY source_system;

CREATE OR REPLACE VIEW curated_recon.ssot_dim_counts AS
SELECT 'account' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_account_current
UNION ALL
SELECT 'location' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_location_current
UNION ALL
SELECT 'asset' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_asset_current
UNION ALL
SELECT 'product' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_product_current
UNION ALL
SELECT 'contract' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_contract_current
UNION ALL
SELECT 'invoice' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_invoice_current
UNION ALL
SELECT 'payment' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_payment_current
UNION ALL
SELECT 'ticket' AS entity, COUNT(*) AS row_count
FROM curated_ssot.dim_ticket_current;

CREATE OR REPLACE VIEW curated_recon.sf_intacct_crosswalk_summary AS
SELECT
  COUNT(DISTINCT sf.id) AS sf_accounts_total,
  COUNT(DISTINCT CASE WHEN COALESCE(NULLIF(sf.customer_id__c, ''), NULLIF(sf.primary_system_id__c, '')) IS NOT NULL THEN sf.id END) AS sf_accounts_with_customer_id,
  COUNT(DISTINCT CASE WHEN COALESCE(NULLIF(sf.customer_id__c, ''), NULLIF(sf.primary_system_id__c, '')) IS NULL THEN sf.id END) AS sf_accounts_missing_customer_id,
  COUNT(DISTINCT CASE WHEN xa.source_id IS NOT NULL THEN sf.id END) AS sf_accounts_with_intacct_match,
  COUNT(DISTINCT CASE WHEN xa.source_id IS NULL THEN sf.id END) AS sf_accounts_no_intacct_match
FROM curated_core.salesforce_account_current sf
LEFT JOIN curated_ssot.xwalk_account_current xa
  ON xa.ssot_account_id = CONCAT('sf:', sf.id)
 AND xa.source_system = 'intacct';

CREATE OR REPLACE VIEW curated_recon.sf_intacct_crosswalk_gaps AS
SELECT DISTINCT
  sf.id AS sf_account_id,
  sf.name AS sf_account_name,
  COALESCE(NULLIF(sf.customer_id__c, ''), NULLIF(sf.primary_system_id__c, '')) AS sf_customer_id,
  CASE
    WHEN xa.source_id IS NOT NULL THEN 'ok'
    WHEN COALESCE(NULLIF(sf.customer_id__c, ''), NULLIF(sf.primary_system_id__c, '')) IS NULL THEN 'missing_sf_customer_id'
    ELSE 'no_intacct_match'
  END AS gap_reason
FROM curated_core.salesforce_account_current sf
LEFT JOIN curated_ssot.xwalk_account_current xa
  ON xa.ssot_account_id = CONCAT('sf:', sf.id)
 AND xa.source_system = 'intacct'
WHERE xa.source_id IS NULL;

CREATE OR REPLACE VIEW curated_recon.platt_intacct_crosswalk_summary AS
SELECT
  COUNT(DISTINCT p.id) AS platt_customers_total,
  COUNT(DISTINCT CASE WHEN xa.source_id IS NOT NULL THEN p.id END) AS platt_customers_with_intacct_match,
  COUNT(DISTINCT CASE WHEN xa.source_id IS NULL THEN p.id END) AS platt_customers_no_intacct_match
FROM curated_core.platt_customer_current_ssot p
LEFT JOIN curated_ssot.xwalk_account_current xa
  ON xa.ssot_account_id = CONCAT('platt:', p.id)
 AND xa.source_system = 'intacct';

CREATE OR REPLACE VIEW curated_recon.platt_intacct_crosswalk_gaps AS
SELECT DISTINCT
  p.id AS platt_customer_id,
  p.name AS platt_customer_name,
  CASE
    WHEN xa.source_id IS NOT NULL THEN 'ok'
    ELSE 'no_intacct_match'
  END AS gap_reason
FROM curated_core.platt_customer_current_ssot p
LEFT JOIN curated_ssot.xwalk_account_current xa
  ON xa.ssot_account_id = CONCAT('platt:', p.id)
 AND xa.source_system = 'intacct'
WHERE xa.source_id IS NULL;
