CREATE TABLE IF NOT EXISTS curated.curated_salesforce_opportunities
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  sf_opportunity_id AS opportunity_id,
  account_id,
  stage,
  amount,
  close_date,
  probability,
  '{{dt}}' AS dt
FROM gwi_raw.raw_salesforce_opportunities
WHERE dt = '{{dt}}';
