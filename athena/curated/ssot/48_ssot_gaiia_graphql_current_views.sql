-- Gaiia GraphQL current-state views (tenant + id latest)
-- NOTE: Excludes accounts + invoices (handled in 49/51 SSOT files).
-- Requires Glue crawler tables under raw_gaiia.raw_gaiia_graphql_*.

CREATE OR REPLACE VIEW curated_core.gaiia_billing_subscriptions_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.billingsubscriptions.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_billingsubscriptions
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.priceoverrideincents AS priceoverrideincents,
    node.priceoverridereason AS priceoverridereason,
    node.status AS status,
    node.unassignedat AS unassignedat,
    node.unassignat AS unassignat,
    node.suspendedat AS suspendedat,
    node.assignedat AS assignedat,
    node.activatedat AS activatedat,
    node.createdat AS createdat,
    node.updatedat AS updatedat,
    node.productversion AS productversion,
    node.shareconfiguration AS shareconfiguration,
    node.startsat AS startsat,
    node.expiresat AS expiresat,
    node.internalnote AS internalnote,
    node.quantity AS quantity,
    node.numberofrecurrencedelay AS numberofrecurrencedelay,
    node.bundle AS bundle,
    node.bundleassignationid AS bundleassignationid,
    node.invoicenameoverride AS invoicenameoverride,
    node.invoicedescriptionoverride AS invoicedescriptionoverride,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  priceoverrideincents,
  priceoverridereason,
  status,
  unassignedat,
  unassignat,
  suspendedat,
  assignedat,
  activatedat,
  createdat,
  updatedat,
  productversion,
  shareconfiguration,
  startsat,
  expiresat,
  internalnote,
  quantity,
  numberofrecurrencedelay,
  bundle,
  bundleassignationid,
  invoicenameoverride,
  invoicedescriptionoverride,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_payment_methods_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.paymentmethods.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_paymentmethods
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.createdat AS createdat,
    node.updatedat AS updatedat,
    node.autopaymentenabled AS autopaymentenabled,
    node.archived AS archived,
    node.creditcard AS creditcard,
    node.bankaccount AS bankaccount,
    node.status AS status,
    node.failurecode AS failurecode,
    node.failuremessage AS failuremessage,
    node.type AS type,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  createdat,
  updatedat,
  autopaymentenabled,
  archived,
  creditcard,
  bankaccount,
  status,
  failurecode,
  failuremessage,
  type,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_products_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.products.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_products
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.slug AS slug,
    node.name AS name,
    node.description AS description,
    node.type AS type,
    node.createdat AS createdat,
    node.updatedat AS updatedat,
    node.isarchived AS isarchived,
    node.productcategory AS productcategory,
    node.primaryproductversion AS primaryproductversion,
    node.rawspecificationvalue AS rawspecificationvalue,
    node.currency AS currency,
    node.taxable AS taxable,
    node.taxsetup AS taxsetup,
    node.numberofrecurrences AS numberofrecurrences,
    node.numberofrecurrencedelay AS numberofrecurrencedelay,
    node.generalledgercode AS generalledgercode,
    node.discountable AS discountable,
    node.availabilitystartdate AS availabilitystartdate,
    node.availabilityenddate AS availabilityenddate,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  slug,
  name,
  description,
  type,
  createdat,
  updatedat,
  isarchived,
  productcategory,
  primaryproductversion,
  rawspecificationvalue,
  currency,
  taxable,
  taxsetup,
  numberofrecurrences,
  numberofrecurrencedelay,
  generalledgercode,
  discountable,
  availabilitystartdate,
  availabilityenddate,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_properties_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.properties.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_properties
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.readableid AS readableid,
    node.name AS name,
    node.type AS type,
    node.propertygroup AS propertygroup,
    node.physicaladdress AS physicaladdress,
    node.mailingaddress AS mailingaddress,
    node.billingmanagement AS billingmanagement,
    node.requiresrightofentry AS requiresrightofentry,
    node.displayonlypropertyproducts AS displayonlypropertyproducts,
    node.createdat AS createdat,
    node.updatedat AS updatedat,
    node.billingsettings AS billingsettings,
    node.billinginformation AS billinginformation,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  readableid,
  name,
  type,
  propertygroup,
  physicaladdress,
  mailingaddress,
  billingmanagement,
  requiresrightofentry,
  displayonlypropertyproducts,
  createdat,
  updatedat,
  billingsettings,
  billinginformation,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_units_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.units.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_units
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.property AS property,
    node.address AS address,
    node.createdat AS createdat,
    node.updatedat AS updatedat,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  property,
  address,
  createdat,
  updatedat,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_tickets_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.tickets.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_tickets
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.readableid AS readableid,
    node.title AS title,
    node.description AS description,
    node.type AS type,
    node.priority AS priority,
    node.customstatus AS customstatus,
    node.link AS link,
    node.duedate AS duedate,
    node.createdat AS createdat,
    node.updatedat AS updatedat,
    node.hasunreadcomments AS hasunreadcomments,
    node.visibility AS visibility,
    node.workorder AS workorder,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  readableid,
  title,
  description,
  type,
  priority,
  customstatus,
  link,
  duedate,
  createdat,
  updatedat,
  hasunreadcomments,
  visibility,
  workorder,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_work_orders_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.workorders.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_workorders
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.readableid AS readableid,
    node.worktype AS worktype,
    node.description AS description,
    node.status AS status,
    node.priority AS priority,
    node.autoassignationstatus AS autoassignationstatus,
    node.autoassignationfailurecode AS autoassignationfailurecode,
    node.account AS account,
    node.networksite AS networksite,
    node.startdate AS startdate,
    node.enddate AS enddate,
    node.createdat AS createdat,
    node.updatedat AS updatedat,
    node.durationoverrideinseconds AS durationoverrideinseconds,
    node.procedurevalue AS procedurevalue,
    node.procedureschema AS procedureschema,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  readableid,
  worktype,
  description,
  status,
  priority,
  autoassignationstatus,
  autoassignationfailurecode,
  account,
  networksite,
  startdate,
  enddate,
  createdat,
  updatedat,
  durationoverrideinseconds,
  procedurevalue,
  procedureschema,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_users_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.users.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_users
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.email AS email,
    node.firstname AS firstname,
    node.lastname AS lastname,
    node.lastconnected AS lastconnected,
    node.deactivated AS deactivated,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  email,
  firstname,
  lastname,
  lastconnected,
  deactivated,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_inventory_items_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.inventoryitems.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_inventoryitems
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.model AS model,
    node.equipmentconditiontype AS equipmentconditiontype,
    node.purchasepriceincents AS purchasepriceincents,
    node.status AS status,
    node.assignation AS assignation,
    node.createdat AS createdat,
    node.ipaddressv4 AS ipaddressv4,
    node.ipaddressv6 AS ipaddressv6,
    node.ipblock AS ipblock,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  model,
  equipmentconditiontype,
  purchasepriceincents,
  status,
  assignation,
  createdat,
  ipaddressv4,
  ipaddressv6,
  ipblock,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_inventory_models_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.inventorymodels.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_inventorymodels
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.name AS name,
    node.https AS https,
    node.port AS port,
    node.manufacturer AS manufacturer,
    node.category AS category,
    node.assignedquantity AS assignedquantity,
    node.availablequantity AS availablequantity,
    node.returnedquantity AS returnedquantity,
    node.quantity AS quantity,
    node.devicetype AS devicetype,
    node.isdeletable AS isdeletable,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  name,
  https,
  port,
  manufacturer,
  category,
  assignedquantity,
  availablequantity,
  returnedquantity,
  quantity,
  devicetype,
  isdeletable,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;

CREATE OR REPLACE VIEW curated_core.gaiia_inventory_locations_current AS
WITH base AS (
  SELECT
    tenant,
    dt,
    data.inventorylocations.nodes AS nodes
  FROM raw_gaiia.raw_gaiia_graphql_inventorylocations
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM base
  CROSS JOIN UNNEST(nodes) AS t(node)
),
ranked AS (
  SELECT
    tenant,
    dt,
    node.id AS id,
    node.name AS name,
    node.isdeletable AS isdeletable,
    CAST(NULL AS timestamp) AS _fetched_at,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, node.id
      ORDER BY dt DESC
    ) AS rn
  FROM exploded
)
SELECT
  id,
  name,
  isdeletable,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;
