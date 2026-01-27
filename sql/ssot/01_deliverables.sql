-- Deliverables table populated from SSOT rollups and manifests.
CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.deliverables (
  dt string,
  system string,
  entity string,
  ssot_count bigint,
  exception_count bigint,
  guard_ok boolean,
  manifest_path string,
  run_id string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/deliverables/';

-- Daily load example (parameterize run_date in orchestration):
-- INSERT INTO curated_ssot.deliverables
-- SELECT
--   run_date AS dt,
--   system,
--   entity,
--   ssot_count,
--   exception_count,
--   guard_ok,
--   CONCAT('s3://gwi-raw-us-east-2-pc/orchestration/', system, '_daily/run_date=', run_date, '/manifest.json') AS manifest_path,
--   run_id
-- FROM curated_recon.ssot_daily_summary
-- WHERE run_date = '<YYYY-MM-DD>';
