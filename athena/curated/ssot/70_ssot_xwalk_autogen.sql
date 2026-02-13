-- Auto-generated crosswalks (deterministic, read-only joins)
-- Accounts: Salesforce primary (link Gaiia when customer_id__c matches readableid or id)
INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('sf:', sf.id) AS ssot_account_id,
  'salesforce' AS source_system,
  sf.id AS source_id,
  1.0 AS match_confidence,
  'primary_salesforce' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.salesforce_account_current sf
WHERE sf.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('sf:', sf.id)
      AND xa.source_system = 'salesforce'
      AND xa.source_id = sf.id
  );

-- Accounts: Intacct customers mapped to Platt via deterministic 1:1 crosswalk
INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('platt:', x.platt_customer_id) AS ssot_account_id,
  'intacct' AS source_system,
  x.intacct_customer_id AS source_id,
  x.match_confidence AS match_confidence,
  x.match_rule AS match_rule,
  false AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  'platt-intacct 1:1 crosswalk' AS notes
FROM curated_crosswalks.platt_to_intacct_customer_1to1 x
WHERE x.platt_customer_id IS NOT NULL
  AND x.intacct_customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.source_system = 'intacct'
      AND xa.source_id = x.intacct_customer_id
  );

-- Accounts: Intacct customers mapped via Salesforce customer_id__c
INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('sf:', sf.id) AS ssot_account_id,
  'intacct' AS source_system,
  c.customerid AS source_id,
  0.95 AS match_confidence,
  'sf_system_id_to_intacct_customerid' AS match_rule,
  false AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.salesforce_account_current sf
JOIN gwi_raw_intacct.customers c
  ON COALESCE(NULLIF(sf.customer_id__c, ''), NULLIF(sf.primary_system_id__c, '')) = c.customerid
WHERE sf.id IS NOT NULL
  AND COALESCE(NULLIF(sf.customer_id__c, ''), NULLIF(sf.primary_system_id__c, '')) IS NOT NULL
  AND c.customerid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('sf:', sf.id)
      AND xa.source_system = 'intacct'
      AND xa.source_id = c.customerid
  );

-- Accounts: Intacct customers mapped via SF->Platt->Intacct (hybrid) + name+ZIP residuals
INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('sf:', x.sf_account_id) AS ssot_account_id,
  'intacct' AS source_system,
  x.intacct_customer_id AS source_id,
  x.match_confidence AS match_confidence,
  x.match_rule AS match_rule,
  false AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  'sf->platt->intacct hybrid (plus name+ZIP residuals)' AS notes
FROM curated_crosswalks.sf_account_to_intacct_customer_final x
WHERE x.sf_account_id IS NOT NULL
  AND x.intacct_customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('sf:', x.sf_account_id)
      AND xa.source_system = 'intacct'
      AND xa.source_id = x.intacct_customer_id
  );

INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('sf:', sf.id) AS ssot_account_id,
  'gaiia' AS source_system,
  g.id AS source_id,
  0.9 AS match_confidence,
  'sf_customer_id__c_to_gaiia' AS match_rule,
  false AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  'matched by customer_id__c' AS notes
FROM curated_core.salesforce_account_current sf
JOIN curated_core.gaiia_accounts_current g
  ON sf.customer_id__c IS NOT NULL
 AND (sf.customer_id__c = CAST(g.readableid AS varchar) OR sf.customer_id__c = g.id)
WHERE sf.id IS NOT NULL AND g.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('sf:', sf.id)
      AND xa.source_system = 'gaiia'
      AND xa.source_id = g.id
  );

INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('sf:', sf.id) AS ssot_account_id,
  'gaiia' AS source_system,
  g.id AS source_id,
  0.85 AS match_confidence,
  'sf_plat_id__c_to_gaiia_platid' AS match_rule,
  false AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  'matched by plat_id__c to gaiia customfields.platid' AS notes
FROM curated_core.salesforce_account_current sf
JOIN curated_core.gaiia_accounts_current g
  ON sf.plat_id__c IS NOT NULL
 AND g.customfields.platid IS NOT NULL
 AND sf.plat_id__c = g.customfields.platid
WHERE sf.id IS NOT NULL AND g.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('sf:', sf.id)
      AND xa.source_system = 'gaiia'
      AND xa.source_id = g.id
  );

INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('gaiia:', g.id) AS ssot_account_id,
  'gaiia' AS source_system,
  g.id AS source_id,
  0.7 AS match_confidence,
  'standalone_gaiia' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.gaiia_accounts_current g
LEFT JOIN curated_core.salesforce_account_current sf
  ON (
    sf.customer_id__c IS NOT NULL
    AND (sf.customer_id__c = CAST(g.readableid AS varchar) OR sf.customer_id__c = g.id)
  )
  OR (
    sf.plat_id__c IS NOT NULL
    AND g.customfields.platid IS NOT NULL
    AND sf.plat_id__c = g.customfields.platid
  )
WHERE g.id IS NOT NULL AND sf.id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('gaiia:', g.id)
      AND xa.source_system = 'gaiia'
      AND xa.source_id = g.id
  );

-- Locations: Gaiia properties as primary location identity
INSERT INTO curated_ssot.xwalk_location
SELECT
  CONCAT('gaiia_property:', p.id) AS ssot_location_id,
  'gaiia' AS source_system,
  p.id AS source_id,
  0.8 AS match_confidence,
  'gaiia_property_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.gaiia_properties_current p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_location xl
    WHERE xl.ssot_location_id = CONCAT('gaiia_property:', p.id)
      AND xl.source_system = 'gaiia'
      AND xl.source_id = p.id
  );

-- Assets: Gaiia inventory items
INSERT INTO curated_ssot.xwalk_asset
SELECT
  CONCAT('gaiia_inventory_item:', i.id) AS ssot_asset_id,
  'gaiia' AS source_system,
  i.id AS source_id,
  0.8 AS match_confidence,
  'gaiia_inventory_item_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.gaiia_inventory_items_current i
WHERE i.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_asset xa
    WHERE xa.ssot_asset_id = CONCAT('gaiia_inventory_item:', i.id)
      AND xa.source_system = 'gaiia'
      AND xa.source_id = i.id
  );

-- Products: Gaiia products
INSERT INTO curated_ssot.xwalk_product
SELECT
  CONCAT('gaiia_product:', p.id) AS ssot_product_id,
  'gaiia' AS source_system,
  p.id AS source_id,
  0.8 AS match_confidence,
  'gaiia_product_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.gaiia_products_current p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_product xp
    WHERE xp.ssot_product_id = CONCAT('gaiia_product:', p.id)
      AND xp.source_system = 'gaiia'
      AND xp.source_id = p.id
  );

-- Contracts: Gaiia billing subscriptions
INSERT INTO curated_ssot.xwalk_contract
SELECT
  CONCAT('gaiia_subscription:', s.id) AS ssot_contract_id,
  'gaiia' AS source_system,
  s.id AS source_id,
  0.7 AS match_confidence,
  'gaiia_subscription_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.gaiia_billing_subscriptions_current s
WHERE s.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_contract xc
    WHERE xc.ssot_contract_id = CONCAT('gaiia_subscription:', s.id)
      AND xc.source_system = 'gaiia'
      AND xc.source_id = s.id
  );

-- Tickets: Gaiia tickets
INSERT INTO curated_ssot.xwalk_ticket
SELECT
  CONCAT('gaiia_ticket:', t.id) AS ssot_ticket_id,
  'gaiia' AS source_system,
  t.id AS source_id,
  0.7 AS match_confidence,
  'gaiia_ticket_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.gaiia_tickets_current t
WHERE t.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_ticket xt
    WHERE xt.ssot_ticket_id = CONCAT('gaiia_ticket:', t.id)
      AND xt.source_system = 'gaiia'
      AND xt.source_id = t.id
  );

-- Payments: Gaiia payment methods
INSERT INTO curated_ssot.xwalk_payment
SELECT
  CONCAT('intacct_ar_payment:', p.recordno) AS ssot_payment_id,
  'intacct' AS source_system,
  p.recordno AS source_id,
  0.95 AS match_confidence,
  'intacct_ar_payment_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM gwi_raw_intacct.ar_payments p
WHERE p.recordno IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_payment xp
    WHERE xp.ssot_payment_id = CONCAT('intacct_ar_payment:', p.recordno)
      AND xp.source_system = 'intacct'
      AND xp.source_id = CAST(p.recordno AS varchar)
  );

INSERT INTO curated_ssot.xwalk_payment
SELECT
  CONCAT('gaiia_payment_method:', p.id) AS ssot_payment_id,
  'gaiia' AS source_system,
  p.id AS source_id,
  0.7 AS match_confidence,
  'gaiia_payment_method_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.gaiia_payment_methods_current p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_payment xp
    WHERE xp.ssot_payment_id = CONCAT('gaiia_payment_method:', p.id)
      AND xp.source_system = 'gaiia'
      AND xp.source_id = p.id
  );

-- Accounts: Platt customers
INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('platt:', p.id) AS ssot_account_id,
  'platt' AS source_system,
  p.id AS source_id,
  0.95 AS match_confidence,
  'platt_customer_primary' AS match_rule,
  true AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  NULL AS notes
FROM curated_core.platt_customer_current_ssot p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('platt:', p.id)
      AND xa.source_system = 'platt'
      AND xa.source_id = p.id
  );

INSERT INTO curated_ssot.xwalk_account
SELECT
  CONCAT('platt:', p.id) AS ssot_account_id,
  'salesforce' AS source_system,
  sf.id AS source_id,
  0.9 AS match_confidence,
  'sf_plat_id__c_to_platt' AS match_rule,
  false AS is_primary,
  current_timestamp AS effective_at,
  current_timestamp AS updated_at,
  'matched by plat_id__c' AS notes
FROM curated_core.platt_customer_current_ssot p
JOIN curated_core.salesforce_account_current sf
  ON sf.plat_id__c IS NOT NULL
 AND sf.plat_id__c = p.id
WHERE p.id IS NOT NULL AND sf.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.xwalk_account xa
    WHERE xa.ssot_account_id = CONCAT('platt:', p.id)
      AND xa.source_system = 'salesforce'
      AND xa.source_id = sf.id
  );
