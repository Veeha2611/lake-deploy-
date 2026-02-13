CREATE DATABASE IF NOT EXISTS curated_recon;

-- Manual network alias overrides (workbook -> canonical network).
-- Source CSV: s3://gwi-raw-us-east-2-pc/curated_recon/vetro_network_alias_override/dt=2026-02-11/vetro_network_alias_override.csv
CREATE EXTERNAL TABLE IF NOT EXISTS curated_recon.vetro_network_alias_override (
  network_harness string,
  network_canonical string,
  match_rule string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/curated_recon/vetro_network_alias_override/dt=2026-02-11/'
TBLPROPERTIES ('skip.header.line.count' = '1');

-- Associated Project -> Network mapping (derived from Vetro layer metadata).
-- Source CSV: s3://gwi-raw-us-east-2-pc/curated_recon/vetro_associated_project_network_map/dt=2026-02-11/vetro_associated_project_network_map.csv
CREATE EXTERNAL TABLE IF NOT EXISTS curated_recon.vetro_associated_project_network_map (
  associated_project string,
  network_canonical string,
  match_rule string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/curated_recon/vetro_associated_project_network_map/dt=2026-02-11/'
TBLPROPERTIES ('skip.header.line.count' = '1');

-- Normalize workbook networks to canonical names for reconciliation.
CREATE OR REPLACE VIEW curated_recon.v_investor_revenue_mix_latest_norm AS
WITH alias AS (
  SELECT
    LOWER(TRIM(network_harness)) AS network_raw_norm,
    network_canonical
  FROM curated_recon.vetro_network_alias_override
),
base AS (
  SELECT
    network,
    network_type,
    as_of_date,
    revenue,
    plat_id_count,
    monthly_arpu
  FROM curated_core.v_investor_revenue_mix_latest
)
SELECT
  COALESCE(a.network_canonical, b.network) AS network_canonical,
  b.network AS network_source,
  b.network_type,
  b.as_of_date,
  b.revenue,
  b.plat_id_count,
  b.monthly_arpu,
  REGEXP_REPLACE(LOWER(COALESCE(a.network_canonical, b.network)), '[^a-z0-9]', '') AS network_key
FROM base b
LEFT JOIN alias a
  ON LOWER(TRIM(b.network)) = a.network_raw_norm;

-- Vetro service locations with Associated Project metadata (plan + geo).
CREATE OR REPLACE VIEW curated_recon.v_vetro_service_locations_ap AS
SELECT
  plan_id,
  COALESCE(
    json_extract_scalar(raw_line, '$.properties[\"Associated Project\"]'),
    json_extract_scalar(raw_line, '$.properties.Associated_Project'),
    json_extract_scalar(raw_line, '$.properties.associated_project')
  ) AS associated_project,
  json_extract_scalar(raw_line, '$.properties.City') AS city,
  json_extract_scalar(raw_line, '$.properties.State') AS state,
  json_extract_scalar(raw_line, '$.properties.County') AS county,
  json_extract_scalar(raw_line, '$.properties.BSL_ID') AS bsl_id,
  TRY_CAST(json_extract_scalar(raw_line, '$.geometry.coordinates[1]') AS DOUBLE) AS latitude,
  TRY_CAST(json_extract_scalar(raw_line, '$.geometry.coordinates[0]') AS DOUBLE) AS longitude
FROM raw_vetro.raw_vetro_lines
WHERE json_extract_scalar(raw_line, '$.x-vetro.feature_type') = 'service_location';

-- Plan -> network mapping using Associated Project labels.
CREATE OR REPLACE VIEW curated_recon.v_vetro_plan_network_from_ap AS
WITH ap_map AS (
  SELECT
    LOWER(TRIM(associated_project)) AS associated_project_key,
    MAX(network_canonical) AS network
  FROM curated_recon.vetro_associated_project_network_map
  WHERE associated_project IS NOT NULL AND TRIM(associated_project) <> ''
  GROUP BY 1
),
sl AS (
  SELECT
    plan_id,
    LOWER(TRIM(associated_project)) AS associated_project_key
  FROM curated_recon.v_vetro_service_locations_ap
  WHERE associated_project IS NOT NULL AND TRIM(associated_project) <> ''
)
SELECT
  sl.plan_id,
  MAX(ap_map.network) AS network,
  COUNT(*) AS service_location_count
FROM sl
LEFT JOIN ap_map
  ON sl.associated_project_key = ap_map.associated_project_key
GROUP BY sl.plan_id;

-- Plan -> network crosswalk (merge sheet map + associated project map + canonical aliasing).
CREATE OR REPLACE VIEW curated_core.v_vetro_network_plan_xwalk_v2 AS
WITH plans AS (
  SELECT
    CAST(nm.plan_id AS varchar) AS plan_id,
    COUNT(*) AS feature_count
  FROM curated_core.v_vetro_network_map_layers_v1 nm
  JOIN curated_core.v_vetro_plans_as_built ab
    ON nm.plan_id = ab.plan_id
  WHERE nm.plan_id IS NOT NULL
  GROUP BY CAST(nm.plan_id AS varchar)
),
sheet_map AS (
  SELECT
    CAST(plan_id AS varchar) AS plan_id,
    network,
    network_norm,
    system_key,
    status,
    resolved_method,
    resolved_score
  FROM (
    SELECT
      plan_id,
      network,
      network_norm,
      system_key,
      status,
      resolved_method,
      resolved_score,
      feature_count,
      ROW_NUMBER() OVER (
        PARTITION BY plan_id
        ORDER BY resolved_score DESC NULLS LAST, feature_count DESC NULLS LAST, network
      ) AS rn
    FROM raw_sheets.vetro_network_plan_map_auto
  )
  WHERE rn = 1
),
ap_map AS (
  SELECT
    CAST(plan_id AS varchar) AS plan_id,
    network
  FROM curated_recon.v_vetro_plan_network_from_ap
  WHERE network IS NOT NULL
),
alias AS (
  SELECT
    LOWER(TRIM(network_harness)) AS network_raw_norm,
    network_canonical
  FROM curated_recon.vetro_network_alias_override
),
resolved AS (
  SELECT
    p.plan_id,
    p.feature_count,
    COALESCE(sm.network, ap.network) AS network_raw,
    sm.network_norm,
    sm.system_key,
    sm.status,
    COALESCE(
      sm.resolved_method,
      CASE WHEN ap.network IS NOT NULL THEN 'associated_project' END
    ) AS resolved_method,
    sm.resolved_score,
    CASE
      WHEN sm.plan_id IS NOT NULL THEN 'mapped'
      WHEN ap.network IS NOT NULL THEN 'mapped'
      ELSE 'unmapped'
    END AS map_status
  FROM plans p
  LEFT JOIN sheet_map sm
    ON p.plan_id = sm.plan_id
  LEFT JOIN ap_map ap
    ON p.plan_id = ap.plan_id
)
SELECT
  r.plan_id,
  r.feature_count,
  COALESCE(a.network_canonical, r.network_raw) AS network,
  r.network_norm,
  r.system_key,
  r.status,
  r.resolved_method,
  r.resolved_score,
  r.map_status
FROM resolved r
LEFT JOIN alias a
  ON LOWER(TRIM(r.network_raw)) = a.network_raw_norm;

-- Reconcile billed MRR (Platt) to investor harness by canonical network.
CREATE OR REPLACE VIEW curated_recon.v_investor_network_mrr_recon_latest AS
WITH billed AS (
  SELECT
    COALESCE(cs.network, 'unmapped') AS network,
    SUM(cm.mrr_total_customer_month) AS billed_mrr,
    COUNT(DISTINCT cm.customer_id) AS billed_customers
  -- NOTE: use billing snapshot built from raw_platt.iheader_raw (latest dt).
  -- This keeps billed customer counts aligned with Platt source-of-truth.
  FROM curated_core.v_platt_billing_customer_month_latest cm
  LEFT JOIN curated_core.dim_customer_system_latest cs
    ON CAST(cm.customer_id AS varchar) = CAST(cs.customer_id AS varchar)
  WHERE cm.mrr_total_customer_month > 0
  GROUP BY 1
),
alias AS (
  SELECT
    LOWER(TRIM(network_harness)) AS network_raw_norm,
    network_canonical
  FROM curated_recon.vetro_network_alias_override
),
billed_norm AS (
  SELECT
    COALESCE(a.network_canonical, b.network) AS network_canonical,
    SUM(b.billed_mrr) AS billed_mrr,
    SUM(b.billed_customers) AS billed_customers
  FROM billed b
  LEFT JOIN alias a
    ON LOWER(TRIM(b.network)) = a.network_raw_norm
  GROUP BY 1
),
harness AS (
  SELECT
    network_canonical,
    MAX(as_of_date) AS as_of_date,
    SUM(revenue) AS harness_mrr,
    SUM(plat_id_count) AS harness_customers,
    AVG(monthly_arpu) AS harness_arpu
  FROM curated_recon.v_investor_revenue_mix_latest_norm
  GROUP BY 1
)
SELECT
  h.network_canonical,
  h.as_of_date,
  h.harness_mrr,
  b.billed_mrr,
  (b.billed_mrr - h.harness_mrr) AS mrr_delta,
  h.harness_customers,
  b.billed_customers,
  (b.billed_customers - h.harness_customers) AS customer_delta,
  h.harness_arpu
FROM harness h
LEFT JOIN billed_norm b
  ON h.network_canonical = b.network_canonical;
