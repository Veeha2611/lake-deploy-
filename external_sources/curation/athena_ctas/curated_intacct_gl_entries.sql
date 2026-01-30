CREATE DATABASE IF NOT EXISTS curated;

CREATE TABLE IF NOT EXISTS curated.curated_intacct_gl_entries
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  recordno,
  entry_date,
  batch_id,
  customer_id,
  location_id,
  amount,
  memo,
  description,
  CAST(dimensions['key'] AS STRING) AS dimension_key,
  '{{dt}}' AS dt
FROM gwi_raw.raw_intacct_gl_entries
WHERE run_date = '{{dt}}' AND location_id = '10';
