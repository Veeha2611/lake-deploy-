-- Global SSOT rollup table. Guard values must be computed from *_current tables only.
CREATE EXTERNAL TABLE IF NOT EXISTS curated_recon.ssot_daily_summary (
  run_date string,
  system string,
  entity string,
  ssot_count bigint,
  exception_count bigint,
  guard_ok boolean,
  max_business_date string,
  max_future_date string,
  ssot_count_qid string,
  ssot_max_business_date_qid string,
  exception_count_qid string,
  exception_max_future_date_qid string,
  run_id string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_recon/ssot_daily_summary/';
