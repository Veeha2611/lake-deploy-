-- Refresh curated Platt as-billed 24m parquet from raw_platt.platt_as_billed_24m
-- Writes to a new versioned location to avoid stale data reuse.

DROP TABLE IF EXISTS curated_core.platt_as_billed_24m_parquet;

CREATE TABLE curated_core.platt_as_billed_24m_parquet
WITH (
  format = 'PARQUET',
  parquet_compression = 'GZIP',
  external_location = 's3://gwi-curated-us-east-2-pc/core/platt_as_billed_24m_v6/'
) AS
SELECT
  date_trunc('month', COALESCE(
    TRY(date_parse(invoice_date, '%Y-%m-%d %H:%i:%s.%f')),
    TRY(date_parse(invoice_date, '%Y-%m-%d'))
  )) AS period_month,
  invoice_id,
  COALESCE(
    TRY(date_parse(invoice_date, '%Y-%m-%d %H:%i:%s.%f')),
    TRY(date_parse(invoice_date, '%Y-%m-%d'))
  ) AS invoice_date,
  TRY_CAST(invoice_total AS double) AS invoice_total,
  TRY_CAST(invoice_paid AS double) AS invoice_paid,
  customer_id,
  customer_name,
  crid,
  gl_item,
  line_description,
  TRY_CAST(qty AS double) AS qty,
  TRY_CAST(unit_price AS double) AS unit_price,
  TRY_CAST(line_amount AS double) AS line_amount
FROM raw_platt.platt_as_billed_24m
WHERE invoice_date IS NOT NULL;
