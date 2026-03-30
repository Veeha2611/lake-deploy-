CREATE DATABASE IF NOT EXISTS curated_core;

-- Vetro plan catalog extracted from raw_vetro_plans_json (v2 /plans JSON).
CREATE OR REPLACE VIEW curated_core.v_vetro_plans_catalog AS
WITH src AS (
  SELECT
    dt,
    TRY(CAST(json_extract(raw_line, '$.result.plans') AS array(json))) AS plans
  FROM raw_vetro.raw_vetro_plans_json
  WHERE raw_line IS NOT NULL
),
expanded AS (
  SELECT
    dt,
    p AS plan_json
  FROM src
  CROSS JOIN UNNEST(plans) AS t(p)
  WHERE plans IS NOT NULL
)
SELECT
  dt,
  json_extract_scalar(plan_json, '$.id') AS plan_id,
  json_extract_scalar(plan_json, '$.label') AS plan_label,
  json_extract_scalar(plan_json, '$.project_id') AS project_id,
  json_extract_scalar(plan_json, '$.phase_id') AS phase_id,
  json_format(json_extract(plan_json, '$.tags')) AS tags_json
FROM expanded
WHERE plan_json IS NOT NULL;

CREATE OR REPLACE VIEW curated_core.v_vetro_plans_catalog_current AS
WITH ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY dt DESC) AS rn
  FROM curated_core.v_vetro_plans_catalog
)
SELECT
  dt,
  plan_id,
  plan_label,
  project_id,
  phase_id,
  tags_json
FROM ranked
WHERE rn = 1;

-- AS-BUILT plan filter (per Chris Vetro transcript: authoritative plans are tagged as-built).
CREATE OR REPLACE VIEW curated_core.v_vetro_plans_as_built AS
SELECT
  plan_id,
  plan_label,
  project_id,
  phase_id,
  tags_json
FROM curated_core.v_vetro_plans_catalog_current
WHERE (
    LOWER(plan_label) LIKE '%bsl%'
    OR LOWER(plan_label) LIKE '%as built%'
    OR LOWER(tags_json) LIKE '%as built%'
  )
  AND (tags_json IS NULL OR LOWER(tags_json) NOT LIKE '%archived%');

-- Mapping table: YOU populate these plan IDs with system_key + business_model (bulk|retail)
CREATE EXTERNAL TABLE IF NOT EXISTS curated_core.vetro_plan_map (
  plan_id string,
  system_key string,
  business_model string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_core/vetro_plan_map/';

-- Placeholder "passings" view:
-- Replace the json_extract paths once you identify the correct fields from your Vetro export.
-- Right now it produces counts per plan_id/dt and joins to mapping.
CREATE OR REPLACE VIEW curated_core.v_vetro_passings_by_plan AS
SELECT
  m.system_key,
  m.business_model,
  r.plan_id,
  r.dt,
  COUNT(*) AS raw_rows
FROM raw_vetro.raw_vetro_lines r
JOIN curated_core.v_vetro_plans_as_built ab
  ON ab.plan_id = r.plan_id
LEFT JOIN curated_core.vetro_plan_map m
  ON m.plan_id = r.plan_id
WHERE json_extract_scalar(r.raw_line, '$.x-vetro.feature_type') = 'service_location'
  AND LOWER(json_extract_scalar(r.raw_line, '$.properties.Build')) = 'yes'
  AND r.dt >= date_format(date_add('day', -7, current_date), '%Y-%m-%d')
GROUP BY 1,2,3,4;

-- Authoritative BSL/passings by associated project (from automation BSL plans)
CREATE OR REPLACE VIEW curated_core.v_vetro_bsl_passings_by_project AS
SELECT
  COALESCE(
    json_extract_scalar(r.raw_line, '$.properties[\"Associated Project\"]'),
    json_extract_scalar(r.raw_line, '$.properties.Associated_Project'),
    json_extract_scalar(r.raw_line, '$.properties.associated_project')
  ) AS associated_project,
  COUNT(*) AS passings
FROM raw_vetro.raw_vetro_lines r
JOIN curated_core.v_vetro_plans_as_built ab
  ON ab.plan_id = r.plan_id
WHERE json_extract_scalar(r.raw_line, '$.x-vetro.feature_type') = 'service_location'
  AND LOWER(json_extract_scalar(r.raw_line, '$.properties.Build')) = 'yes'
  AND r.dt >= date_format(date_add('day', -7, current_date), '%Y-%m-%d')
GROUP BY 1;

-- Final split rollup (scaffold):
CREATE OR REPLACE VIEW curated_core.v_passings_bulk_retail_split_vetro_scaffold AS
SELECT
  dt,
  business_model,
  SUM(raw_rows) AS rows_total
FROM curated_core.v_vetro_passings_by_plan
GROUP BY 1,2
ORDER BY dt DESC, business_model;
