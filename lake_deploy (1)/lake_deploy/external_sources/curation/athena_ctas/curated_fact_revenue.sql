CREATE TABLE IF NOT EXISTS curated.curated_fact_revenue
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  gl.recordno,
  gl.entry_date,
  gl.customer_id,
  gl.amount AS revenue_amount,
  pl.customer_name AS platt_customer,
  sf.stage AS sf_stage,
  sf.amount AS sf_pipeline_amount,
  '{{dt}}' AS dt
FROM curated.curated_intacct_gl_entries gl
LEFT JOIN curated.curated_platt_customer pl
  ON gl.customer_id = pl.customer_id AND pl.dt = gl.dt
LEFT JOIN curated.curated_salesforce_opportunities sf
  ON pl.customer_id = sf.account_id AND sf.dt = gl.dt
WHERE gl.dt = '{{dt}}';
