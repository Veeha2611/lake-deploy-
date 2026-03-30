CREATE TABLE IF NOT EXISTS curated.curated_vetro_exports
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY'
)
AS
SELECT
  plan_id,
  export_ts,
  status,
  data,
  PARSE_DATETIME('%Y-%m-%d', '{{dt}}') AS dt
FROM gwi_raw.raw_vetro_exports
WHERE plan_id IN (
  SELECT plan_id FROM gwi_raw.raw_vetro_exports LIMIT 1
)
LIMIT 1000;
