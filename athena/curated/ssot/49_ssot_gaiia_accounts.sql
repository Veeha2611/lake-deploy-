-- Gaiia accounts current (gwi tenant), parsed from GraphQL JSON snapshot to avoid schema drift.
CREATE OR REPLACE VIEW curated_core.gaiia_accounts_current AS
WITH source AS (
  SELECT
    json_parse(data) AS payload,
    COALESCE(tenant, 'gwi') AS tenant,
    dt
  FROM raw_gaiia.raw_gaiia_graphql_accounts_json
  WHERE data IS NOT NULL
),
exploded AS (
  SELECT
    tenant,
    dt,
    node
  FROM source
  CROSS JOIN UNNEST(CAST(json_extract(payload, '$.accounts.nodes') AS array(json))) AS t(node)
),
normalized AS (
  SELECT
    tenant,
    dt,
    json_extract_scalar(node, '$.id') AS id,
    CAST(json_extract_scalar(node, '$.readableId') AS varchar) AS readableid,
    json_extract_scalar(node, '$.name') AS name,
    json_extract_scalar(node, '$.displayName') AS displayname,
    CAST(ROW(json_extract_scalar(node, '$.primaryContact.id')) AS ROW(id varchar)) AS primarycontact,
    CAST(ROW(json_extract_scalar(node, '$.status.id')) AS ROW(id varchar)) AS status,
    CAST(ROW(json_extract_scalar(node, '$.type.id')) AS ROW(id varchar)) AS type,
    json_extract_scalar(node, '$.internetProvider') AS internetprovider,
    CAST(ROW(json_extract_scalar(node, '$.physicalAddress.id')) AS ROW(id varchar)) AS physicaladdress,
    CAST(ROW(json_extract_scalar(node, '$.mailingAddress.id')) AS ROW(id varchar)) AS mailingaddress,
    CAST(ROW(json_extract_scalar(node, '$.clientPortalUser.id')) AS ROW(id varchar)) AS clientportaluser,
    CAST(
      ROW(
        COALESCE(
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["Plat ID"]'),
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["plat id"]')
        ),
        COALESCE(
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["Vetro ID"]'),
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["vetro id"]')
        ),
        COALESCE(
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["Drop active"]'),
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["drop active"]')
        ),
        COALESCE(
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["Lead Source"]'),
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["lead source"]')
        ),
        COALESCE(
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["Salesperson"]'),
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["salesperson"]')
        ),
        COALESCE(
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["System ID"]'),
          json_extract_scalar(COALESCE(json_extract(node, '$.customFields'), json_extract(node, '$.customfields')), '$["system id"]')
        )
      )
      AS ROW(
        platid varchar,
        vetroid varchar,
        dropactive varchar,
        leadsource varchar,
        salesperson varchar,
        systemid varchar
      )
    ) AS customfields,
    json_extract_scalar(node, '$.activationDate') AS activationdate,
    json_extract_scalar(node, '$.deactivationDate') AS deactivationdate,
    json_extract_scalar(node, '$.createdAt') AS createdat,
    json_extract_scalar(node, '$.updatedAt') AS updatedat,
    CAST(NULL AS timestamp) AS _fetched_at
  FROM exploded
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, id
      ORDER BY dt DESC
    ) AS rn
  FROM normalized
)
SELECT
  id,
  readableid,
  name,
  displayname,
  primarycontact,
  status,
  type,
  internetprovider,
  physicaladdress,
  mailingaddress,
  clientportaluser,
  customfields,
  activationdate,
  deactivationdate,
  createdat,
  updatedat,
  tenant,
  dt,
  _fetched_at
FROM ranked
WHERE rn = 1;
