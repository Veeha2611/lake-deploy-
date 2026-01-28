-- SSOT framework rollup table for daily proofs
CREATE DATABASE IF NOT EXISTS curated_recon;

CREATE TABLE IF NOT EXISTS curated_recon.ssot_daily_summary (
  run_date date,
  system varchar,
  entity varchar,
  ssot_count bigint,
  exception_count bigint,
  guard_ok boolean,
  max_business_date date,
  max_future_date date,
  qid_ssot_count varchar,
  qid_max_business_date varchar,
  qid_exception_count varchar,
  qid_max_future_date varchar,
  manifest_s3_uri varchar,
  updated_at timestamp
)
WITH (
  format = 'PARQUET'
);
