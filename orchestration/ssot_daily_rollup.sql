-- SSOT daily rollup (example template)
-- Replace :run_date with YYYY-MM-DD when running
INSERT INTO curated_recon.ssot_daily_summary
SELECT
  date(':run_date') AS run_date,
  'core' AS system,
  'customer' AS entity,
  COUNT(*) AS ssot_count,
  (SELECT COUNT(*) FROM curated_recon.customer_exceptions) AS exception_count,
  true AS guard_ok,
  MAX(business_date) AS max_business_date,
  (SELECT MAX(business_date) FROM curated_recon.customer_exceptions) AS max_future_date,
  NULL AS qid_ssot_count,
  NULL AS qid_max_business_date,
  NULL AS qid_exception_count,
  NULL AS qid_max_future_date,
  NULL AS manifest_s3_uri,
  current_timestamp AS updated_at
FROM curated_core.customer_current;
