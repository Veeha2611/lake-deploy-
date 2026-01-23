CREATE DATABASE IF NOT EXISTS curated_core;

-- Mapping table: YOU populate these 74 plan IDs with system_key + business_model (bulk|retail)
CREATE TABLE IF NOT EXISTS curated_core.vetro_plan_map (
  plan_id string,
  system_key string,
  business_model string
)
WITH (
  format='PARQUET',
  parquet_compression='SNAPPY'
);

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
FROM raw_vetro.raw_vetro_files r
LEFT JOIN curated_core.vetro_plan_map m
  ON m.plan_id = r.plan_id
GROUP BY 1,2,3,4;

-- Final split rollup (scaffold):
CREATE OR REPLACE VIEW curated_core.v_passings_bulk_retail_split_vetro_scaffold AS
SELECT
  dt,
  business_model,
  SUM(raw_rows) AS rows_total
FROM curated_core.v_vetro_passings_by_plan
GROUP BY 1,2
ORDER BY dt DESC, business_model;
