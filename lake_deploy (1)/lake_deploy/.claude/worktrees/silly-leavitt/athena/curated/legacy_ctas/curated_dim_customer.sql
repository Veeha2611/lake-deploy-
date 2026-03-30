CREATE TABLE IF NOT EXISTS curated.curated_dim_customer
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
WITH combined AS (
  SELECT
    customer_id,
    customer_id AS canonical_id,
    customer_name,
    'platt' AS source,
    dt
  FROM curated.curated_platt_customer
  WHERE dt = '{{dt}}'
  UNION ALL
  SELECT
    customer_id,
    customer_id AS canonical_id,
    memo AS customer_name,
    'intacct' AS source,
    dt
  FROM curated.curated_intacct_gl_entries
  WHERE dt = '{{dt}}'
)
SELECT
  canonical_id AS customer_id,
  MAX(customer_name) AS customer_name,
  COUNT(DISTINCT source) AS source_count,
  CASE WHEN COUNT(DISTINCT source) > 1 THEN 'HIGH' ELSE 'LOW' END AS confidence_flag,
  '{{dt}}' AS dt
FROM combined
GROUP BY canonical_id;
