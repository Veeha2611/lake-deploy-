CREATE DATABASE IF NOT EXISTS curated_recon;

-- Investor workbook revenue mix (Revenue, Plat ID Count, Monthly ARPU)
-- NOTE: In Athena engine v3, external CSV tables are created via Glue
-- (create_table / update_table) instead of CREATE TABLE DDL.
-- This DDL is kept only as schema reference for Glue:
-- metric_type, network, network_type, as_of_date, metric_value
-- Location: s3://gwi-raw-us-east-2-pc/curated_recon/investor_revenue_mix/dt=2026-02-11/

-- Latest monthly snapshot (uses latest date <= end of current month)
CREATE OR REPLACE VIEW curated_core.v_investor_revenue_mix_latest AS
WITH base AS (
  SELECT
    network,
    network_type,
    CAST(as_of_date AS date) AS as_of_date,
    metric_type,
    metric_value
  FROM curated_recon.investor_revenue_mix
  WHERE metric_value IS NOT NULL
    AND network <> 'Total'
    AND day(CAST(as_of_date AS date)) = 25
),
latest AS (
  SELECT MAX(as_of_date) AS as_of_date
  FROM base
  WHERE as_of_date <= current_date
)
SELECT
  b.network,
  b.network_type,
  b.as_of_date,
  SUM(CASE WHEN b.metric_type = 'Revenue' THEN b.metric_value END) AS revenue,
  SUM(CASE WHEN b.metric_type = 'PlatIdCount' THEN b.metric_value END) AS plat_id_count,
  SUM(CASE WHEN b.metric_type = 'MonthlyARPU' THEN b.metric_value END) AS monthly_arpu,
  LOWER(REGEXP_REPLACE(b.network, '[^a-z0-9]', '')) AS network_key
FROM base b
JOIN latest l
  ON b.as_of_date = l.as_of_date
GROUP BY 1,2,3,7;

-- Totals from workbook (explicit Total row)
CREATE OR REPLACE VIEW curated_core.v_investor_revenue_mix_totals_latest AS
WITH base AS (
  SELECT
    CAST(as_of_date AS date) AS as_of_date,
    metric_type,
    metric_value
  FROM curated_recon.investor_revenue_mix
  WHERE metric_value IS NOT NULL
    AND network = 'Total'
    AND day(CAST(as_of_date AS date)) = 25
),
latest AS (
  SELECT MAX(as_of_date) AS as_of_date
  FROM base
  WHERE as_of_date <= current_date
)
SELECT
  b.as_of_date,
  MAX(CASE WHEN b.metric_type = 'Revenue' THEN b.metric_value END) AS total_mrr,
  MAX(CASE WHEN b.metric_type = 'PlatIdCount' THEN b.metric_value END) AS total_subscriptions,
  MAX(CASE WHEN b.metric_type = 'MonthlyARPU' THEN b.metric_value END) AS avg_arpu
FROM base b
JOIN latest l
  ON b.as_of_date = l.as_of_date
GROUP BY 1;
