-- Auto-populate canonical dimensions from primary sources
-- Accounts (Salesforce primary + standalone Gaiia)
INSERT INTO curated_ssot.dim_account
SELECT
  CONCAT('sf:', sf.id) AS ssot_account_id,
  'salesforce' AS primary_source_system,
  sf.id AS primary_source_id,
  sf.name AS account_name,
  sf.type AS account_type,
  CASE WHEN sf.active__c THEN 'active' ELSE 'inactive' END AS status,
  sf.billingstreet AS billing_street,
  sf.billingcity AS billing_city,
  sf.billingstate AS billing_state,
  sf.billingpostalcode AS billing_postal_code,
  NULL AS service_address,
  CAST(
    COALESCE(
      TRY(from_iso8601_timestamp(regexp_replace(CAST(sf.createddate AS varchar), '([+-]\\d{2})(\\d{2})$', '$1:$2'))),
      TRY(date_parse(CAST(sf.createddate AS varchar), '%m/%d/%Y %H:%i:%s')),
      TRY(date_parse(CAST(sf.createddate AS varchar), '%m/%d/%Y')),
      TRY(date_parse(CAST(sf.createddate AS varchar), '%Y-%m-%d'))
    ) AS timestamp
  ) AS created_at,
  CAST(
    COALESCE(
      TRY(from_iso8601_timestamp(regexp_replace(CAST(sf.systemmodstamp AS varchar), '([+-]\\d{2})(\\d{2})$', '$1:$2'))),
      TRY(date_parse(CAST(sf.systemmodstamp AS varchar), '%m/%d/%Y %H:%i:%s')),
      TRY(date_parse(CAST(sf.systemmodstamp AS varchar), '%m/%d/%Y')),
      TRY(date_parse(CAST(sf.systemmodstamp AS varchar), '%Y-%m-%d'))
    ) AS timestamp
  ) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.salesforce_account_current sf
WHERE sf.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_account d
    WHERE d.ssot_account_id = CONCAT('sf:', sf.id)
  );

INSERT INTO curated_ssot.dim_account
SELECT
  CONCAT('gaiia:', g.id) AS ssot_account_id,
  'gaiia' AS primary_source_system,
  g.id AS primary_source_id,
  COALESCE(g.displayname, g.name) AS account_name,
  CAST(g.type.id AS varchar) AS account_type,
  CAST(g.status.id AS varchar) AS status,
  NULL AS billing_street,
  NULL AS billing_city,
  NULL AS billing_state,
  NULL AS billing_postal_code,
  CAST(g.physicaladdress.id AS varchar) AS service_address,
  CAST(try(from_iso8601_timestamp(g.createdat)) AS timestamp) AS created_at,
  CAST(try(from_iso8601_timestamp(g.updatedat)) AS timestamp) AS updated_at,
  current_timestamp AS effective_at,
  json_format(CAST(g.customfields AS json)) AS attributes_json
FROM curated_core.gaiia_accounts_current g
LEFT JOIN curated_core.salesforce_account_current sf
  ON (
    (sf.customer_id__c IS NOT NULL AND (sf.customer_id__c = CAST(g.readableid AS varchar) OR sf.customer_id__c = g.id))
    OR (sf.plat_id__c IS NOT NULL AND NULLIF(TRIM(g.customfields.platid), '') IS NOT NULL AND sf.plat_id__c = g.customfields.platid)
  )
WHERE g.id IS NOT NULL AND sf.id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_account d
    WHERE d.ssot_account_id = CONCAT('gaiia:', g.id)
  );

-- Locations (Gaiia properties)
INSERT INTO curated_ssot.dim_location
SELECT
  CONCAT('gaiia_property:', p.id) AS ssot_location_id,
  'gaiia' AS primary_source_system,
  p.id AS primary_source_id,
  CAST(p.physicaladdress.id AS varchar) AS address_line1,
  NULL AS address_line2,
  NULL AS city,
  NULL AS state,
  NULL AS postal_code,
  NULL AS latitude,
  NULL AS longitude,
  NULL AS status,
  CAST(try(from_iso8601_timestamp(p.createdat)) AS timestamp) AS created_at,
  CAST(try(from_iso8601_timestamp(p.updatedat)) AS timestamp) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.gaiia_properties_current p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_location d
    WHERE d.ssot_location_id = CONCAT('gaiia_property:', p.id)
  );

-- Assets (Gaiia inventory items)
INSERT INTO curated_ssot.dim_asset
SELECT
  CONCAT('gaiia_inventory_item:', i.id) AS ssot_asset_id,
  'gaiia' AS primary_source_system,
  i.id AS primary_source_id,
  CAST(i.model.id AS varchar) AS asset_type,
  CAST(i.model.id AS varchar) AS model,
  CAST(i.assignation.id AS varchar) AS serial_number,
  i.status AS status,
  NULL AS location_id,
  CAST(try(from_iso8601_timestamp(i.createdat)) AS timestamp) AS created_at,
  CAST(try(from_iso8601_timestamp(i.createdat)) AS timestamp) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.gaiia_inventory_items_current i
WHERE i.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_asset d
    WHERE d.ssot_asset_id = CONCAT('gaiia_inventory_item:', i.id)
  );

-- Products (Gaiia products)
INSERT INTO curated_ssot.dim_product
SELECT
  CONCAT('gaiia_product:', p.id) AS ssot_product_id,
  'gaiia' AS primary_source_system,
  p.id AS primary_source_id,
  p.name AS product_name,
  p.type AS product_type,
  p.slug AS plan_name,
  CASE WHEN p.isarchived THEN 'archived' ELSE 'active' END AS status,
  CAST(try(from_iso8601_timestamp(p.createdat)) AS timestamp) AS created_at,
  CAST(try(from_iso8601_timestamp(p.updatedat)) AS timestamp) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.gaiia_products_current p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_product d
    WHERE d.ssot_product_id = CONCAT('gaiia_product:', p.id)
  );

-- Contracts (Gaiia billing subscriptions)
INSERT INTO curated_ssot.dim_contract
SELECT
  CONCAT('gaiia_subscription:', s.id) AS ssot_contract_id,
  'gaiia' AS primary_source_system,
  s.id AS primary_source_id,
  NULL AS account_id,
  s.id AS contract_number,
  CAST(try(from_iso8601_timestamp(s.startsat)) AS date) AS start_date,
  CAST(try(from_iso8601_timestamp(s.expiresat)) AS date) AS end_date,
  s.status AS status,
  CAST(try(from_iso8601_timestamp(s.createdat)) AS timestamp) AS created_at,
  CAST(try(from_iso8601_timestamp(s.updatedat)) AS timestamp) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.gaiia_billing_subscriptions_current s
WHERE s.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_contract d
    WHERE d.ssot_contract_id = CONCAT('gaiia_subscription:', s.id)
  );

-- Invoices (Gaiia invoices as placeholder; replace with Intacct when ready)
INSERT INTO curated_ssot.dim_invoice
SELECT
  CONCAT('gaiia_invoice:', COALESCE(json_extract_scalar(i.record_json, '$.id'), i.record_id)) AS ssot_invoice_id,
  'gaiia' AS primary_source_system,
  COALESCE(json_extract_scalar(i.record_json, '$.id'), i.record_id) AS primary_source_id,
  NULL AS account_id,
  COALESCE(
    json_extract_scalar(i.record_json, '$.invoiceNumber'),
    json_extract_scalar(i.record_json, '$.invoice_number'),
    json_extract_scalar(i.record_json, '$.number'),
    json_extract_scalar(i.record_json, '$.billingNumber'),
    json_extract_scalar(i.record_json, '$.externalId')
  ) AS invoice_number,
  CAST(
    COALESCE(
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.createdAt'))),
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.created_at'))),
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.date'))),
      try(date_parse(json_extract_scalar(i.record_json, '$.date'), '%Y-%m-%d'))
    ) AS date
  ) AS invoice_date,
  CAST(
    COALESCE(
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.dueDate'))),
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.due_date')))
    ) AS date
  ) AS due_date,
  CAST(
    COALESCE(
      try_cast(json_extract_scalar(i.record_json, '$.total') AS double),
      try_cast(json_extract_scalar(i.record_json, '$.totalAmount') AS double),
      try_cast(json_extract_scalar(i.record_json, '$.amountTotal') AS double)
    ) AS double
  ) AS amount_total,
  CAST(
    COALESCE(
      try_cast(json_extract_scalar(i.record_json, '$.amountDue') AS double),
      try_cast(json_extract_scalar(i.record_json, '$.balance') AS double)
    ) AS double
  ) AS amount_due,
  COALESCE(
    json_extract_scalar(i.record_json, '$.currency'),
    json_extract_scalar(i.record_json, '$.currencyCode')
  ) AS currency,
  COALESCE(
    json_extract_scalar(i.record_json, '$.status'),
    json_extract_scalar(i.record_json, '$.state')
  ) AS status,
  CAST(
    COALESCE(
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.createdAt'))),
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.created_at')))
    ) AS timestamp
  ) AS created_at,
  CAST(
    COALESCE(
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.updatedAt'))),
      try(from_iso8601_timestamp(json_extract_scalar(i.record_json, '$.updated_at')))
    ) AS timestamp
  ) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.gaiia_invoices_current i
WHERE COALESCE(json_extract_scalar(i.record_json, '$.id'), i.record_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_invoice d
    WHERE d.ssot_invoice_id = CONCAT('gaiia_invoice:', COALESCE(json_extract_scalar(i.record_json, '$.id'), i.record_id))
  );

-- Payments (Intacct AR payments preferred; Gaiia payment methods as supplemental)
INSERT INTO curated_ssot.dim_payment (
  ssot_payment_id,
  primary_source_system,
  primary_source_id,
  account_id,
  payment_date,
  amount,
  currency,
  method,
  status,
  created_at,
  updated_at,
  effective_at,
  attributes_json
)
SELECT
  CONCAT('intacct_ar_payment:', p.recordno) AS ssot_payment_id,
  'intacct' AS primary_source_system,
  p.recordno AS primary_source_id,
  NULL AS account_id,
  CAST(
    COALESCE(
      try(date_parse(p.whenpaid, '%m/%d/%Y')),
      try(date_parse(p.whenpaid, '%Y-%m-%d'))
    ) AS date
  ) AS payment_date,
  CAST(
    COALESCE(
      try_cast(p.totalpaid AS double),
      try_cast(p.trx_totalpaid AS double),
      try_cast(p.totalentered AS double),
      try_cast(p.trx_totalentered AS double)
    ) AS double
  ) AS amount,
  COALESCE(p.currency, p.basecurr) AS currency,
  COALESCE(p.paymenttype, p.paymentservicer) AS method,
  COALESCE(p.status, p.state) AS status,
  CAST(
    COALESCE(
      try(date_parse(p.whencreated, '%m/%d/%Y %H:%i:%s')),
      try(date_parse(p.whencreated, '%m/%d/%Y')),
      try(date_parse(p.auwhencreated, '%m/%d/%Y %H:%i:%s')),
      try(date_parse(p.auwhencreated, '%m/%d/%Y'))
    ) AS timestamp
  ) AS created_at,
  CAST(
    COALESCE(
      try(date_parse(p.whenmodified, '%m/%d/%Y %H:%i:%s')),
      try(date_parse(p.whenmodified, '%m/%d/%Y'))
    ) AS timestamp
  ) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM gwi_raw_intacct.ar_payments p
WHERE p.recordno IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_payment d
    WHERE d.ssot_payment_id = CONCAT('intacct_ar_payment:', p.recordno)
  );

INSERT INTO curated_ssot.dim_payment (
  ssot_payment_id,
  primary_source_system,
  primary_source_id,
  account_id,
  payment_date,
  amount,
  currency,
  method,
  status,
  created_at,
  updated_at,
  effective_at,
  attributes_json
)
SELECT
  CONCAT('gaiia_payment_method:', p.id) AS ssot_payment_id,
  'gaiia' AS primary_source_system,
  p.id AS primary_source_id,
  NULL AS account_id,
  CAST(NULL AS date) AS payment_date,
  CAST(NULL AS double) AS amount,
  CAST(NULL AS varchar) AS currency,
  p.type AS method,
  p.status AS status,
  CAST(try(from_iso8601_timestamp(p.createdat)) AS timestamp) AS created_at,
  CAST(try(from_iso8601_timestamp(p.updatedat)) AS timestamp) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.gaiia_payment_methods_current p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_payment d
    WHERE d.ssot_payment_id = CONCAT('gaiia_payment_method:', p.id)
  );

-- Tickets (Gaiia tickets)
INSERT INTO curated_ssot.dim_ticket
SELECT
  CONCAT('gaiia_ticket:', t.id) AS ssot_ticket_id,
  'gaiia' AS primary_source_system,
  t.id AS primary_source_id,
  NULL AS account_id,
  NULL AS location_id,
  CAST(t.readableid AS varchar) AS ticket_number,
  CAST(t.type.id AS varchar) AS ticket_type,
  CAST(t.customstatus.id AS varchar) AS status,
  t.priority AS priority,
  CAST(try(from_iso8601_timestamp(t.createdat)) AS timestamp) AS opened_at,
  NULL AS closed_at,
  CAST(try(from_iso8601_timestamp(t.createdat)) AS timestamp) AS created_at,
  CAST(try(from_iso8601_timestamp(t.updatedat)) AS timestamp) AS updated_at,
  current_timestamp AS effective_at,
  NULL AS attributes_json
FROM curated_core.gaiia_tickets_current t
WHERE t.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM curated_ssot.dim_ticket d
    WHERE d.ssot_ticket_id = CONCAT('gaiia_ticket:', t.id)
  );
