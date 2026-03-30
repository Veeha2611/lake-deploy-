-- Finance KPI latest snapshot.
-- Authoritative source: Platt (curated_core.v_monthly_mrr_platt + movement table).
CREATE OR REPLACE VIEW curated_core.v_finance_kpis_latest AS
WITH latest AS (
  SELECT MAX(period_month) AS period_month
  FROM curated_core.v_monthly_mrr_platt
),
mrr_rollup AS (
  SELECT
    m.period_month,
    SUM(m.mrr_total) AS total_mrr,
    COUNT(DISTINCT CASE WHEN m.mrr_total > 0 THEN m.customer_id END) AS mrr_customers
  FROM curated_core.v_monthly_mrr_platt m
  JOIN latest l
    ON m.period_month = l.period_month
  GROUP BY 1
),
active_accounts AS (
  SELECT COUNT(DISTINCT customer_id) AS active_accounts
  FROM curated_core.dim_customer_platt
  WHERE has_active_service = true AND is_test_internal = false
),
churn_rollup AS (
  SELECT
    COUNT(DISTINCT CASE WHEN movement_type = 'CHURN' THEN customer_id END) AS churned_customers,
    COUNT(DISTINCT CASE WHEN prev_mrr > 0 THEN customer_id END) AS prev_customers
  FROM curated_core.v_monthly_mrr_platt_movement
  WHERE period_month = (SELECT period_month FROM latest)
)
SELECT
  m.period_month,
  m.total_mrr,
  m.mrr_customers,
  a.active_accounts,
  CASE
    WHEN c.prev_customers IS NOT NULL AND c.prev_customers <> 0
      THEN CAST(c.churned_customers AS double) / CAST(c.prev_customers AS double)
    ELSE NULL
  END AS churn_rate,
  c.churned_customers,
  c.prev_customers
FROM mrr_rollup m
CROSS JOIN active_accounts a
CROSS JOIN churn_rollup c
;
