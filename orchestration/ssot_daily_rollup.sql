-- SSOT daily rollup (template)
-- Replace :run_date with YYYY-MM-DD when running
INSERT INTO curated_recon.ssot_daily_summary
SELECT
  ':run_date' AS run_date,
  'core' AS system,
  'customer' AS entity,
  COUNT(*) AS ssot_count,
  (SELECT COUNT(*) FROM curated_recon.customer_exceptions) AS exception_count,
  true AS guard_ok,
  CAST(MAX(business_date) AS varchar) AS max_business_date,
  CAST((SELECT MAX(business_date) FROM curated_recon.customer_exceptions) AS varchar) AS max_future_date,
  CAST(NULL AS varchar) AS ssot_count_qid,
  CAST(NULL AS varchar) AS ssot_max_business_date_qid,
  CAST(NULL AS varchar) AS exception_count_qid,
  CAST(NULL AS varchar) AS exception_max_future_date_qid,
  CAST(NULL AS varchar) AS run_id
FROM curated_core.customer_current;
