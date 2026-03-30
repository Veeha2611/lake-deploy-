-- Revenue report benchmark vs lake GL (Intacct)

CREATE OR REPLACE VIEW curated_recon.revenue_report_benchmark AS
WITH base AS (
  SELECT
    customer_id,
    system_id,
    report_month,
    amount,
    regexp_extract("$path", 'dt=([0-9\\-]+)', 1) AS dt
  FROM raw_finance.revenue_report_long
),
latest AS (
  SELECT MAX(dt) AS dt FROM base
)
SELECT
  customer_id,
  system_id,
  CAST(report_month AS date) AS report_month,
  SUM(amount) AS report_amount
FROM base
WHERE dt = (SELECT dt FROM latest)
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW curated_recon.revenue_report_vs_gl AS
WITH report AS (
  SELECT
    customer_id,
    system_id,
    report_month,
    report_amount
  FROM curated_recon.revenue_report_benchmark
),
report_ids AS (
  SELECT DISTINCT
    customer_id,
    report_month
  FROM report
),
-- NOTE: Filter to revenue accounts using COA category.
gl AS (
  SELECT
    customerid AS customer_id,
    date_trunc('month', business_date) AS report_month,
    SUM(CAST(amount AS double)) AS gl_amount
  FROM curated_core.intacct_gl_entries_current_ssot
  JOIN report_ids r
    ON r.customer_id = customerid
   AND r.report_month = date_trunc('month', business_date)
  WHERE business_date >= DATE '2024-01-01'
    AND business_date < DATE '2026-01-01'
    AND account_category LIKE 'Revenue%'
    AND customerid IS NOT NULL
    AND TRIM(CAST(customerid AS varchar)) <> ''
  GROUP BY 1, 2
)
SELECT
  COALESCE(report.customer_id, gl.customer_id) AS customer_id,
  report.system_id,
  COALESCE(report.report_month, gl.report_month) AS report_month,
  report.report_amount,
  gl.gl_amount,
  (COALESCE(gl.gl_amount, 0) - COALESCE(report.report_amount, 0)) AS amount_delta
FROM report
FULL OUTER JOIN gl
  ON report.customer_id = gl.customer_id
 AND report.report_month = gl.report_month;
