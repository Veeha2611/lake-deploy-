CREATE TABLE IF NOT EXISTS curated.curated_platt_customer
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  customer_id,
  customer_name,
  sales_rep,
  status,
  created_at,
  '{{dt}}' AS dt
FROM gwi_raw.raw_platt_customer
WHERE dt = '{{dt}}';
