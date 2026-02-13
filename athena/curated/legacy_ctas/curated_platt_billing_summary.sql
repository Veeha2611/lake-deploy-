-- Curated Platt billing summary (Parquet)
CREATE DATABASE IF NOT EXISTS curated_platt;

CREATE TABLE IF NOT EXISTS curated_platt.billing_summary
WITH (
  format='PARQUET',
  external_location='s3://gwi-raw-us-east-2-pc/curated/platt/billing_summary/',
  partitioned_by=ARRAY['dt']
)
AS SELECT * FROM raw_platt.billing_summary;
