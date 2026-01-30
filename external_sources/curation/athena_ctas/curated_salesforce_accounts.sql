CREATE TABLE IF NOT EXISTS curated.curated_salesforce_accounts
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  sf_account_id AS account_id,
  name,
  industry,
  region,
  annual_revenue,
  created_date,
  '{{dt}}' AS dt
FROM gwi_raw.raw_salesforce_accounts
WHERE dt = '{{dt}}';
