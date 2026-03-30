// Tile SQL Definitions with Period Support
// Period modes: 'current' | 'ytd' | 'monthly'

export const getTileSql = (tileId, periodMode = 'current') => {
  const sqlDefinitions = {
    active_customers: {
      supports: ['current'],
      current: `SELECT
  COUNT(*) AS customers_total,
  SUM(CASE WHEN has_active_service = true AND is_test_internal = false THEN 1 ELSE 0 END) AS customers_active_v1
FROM curated_core.dim_customer_platt
LIMIT 1`
    },
    
    account_movement: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT *
FROM curated_core.v_monthly_account_churn_by_segment
ORDER BY period_month DESC, segment
LIMIT 30`,
      monthly: `SELECT *
FROM curated_core.v_monthly_account_churn_by_segment
WHERE period_month >= DATE_FORMAT(DATE_ADD('month', -12, CURRENT_DATE), '%Y-%m')
ORDER BY period_month DESC, segment
LIMIT 200`,
      ytd: `WITH base AS (
  SELECT *
  FROM curated_core.v_monthly_account_churn_by_segment
  WHERE period_month >= CONCAT(CAST(year(current_date) AS VARCHAR), '-01')
)
SELECT
  segment,
  SUM(accounts_added) AS accounts_added_ytd,
  SUM(accounts_lost) AS accounts_lost_ytd,
  SUM(net_accounts) AS net_accounts_ytd,
  SUM(active_accounts_proxy) AS active_accounts_proxy_ytd
FROM base
GROUP BY 1
ORDER BY 1
LIMIT 50`
    },
    
    mrr_summary: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT *
FROM curated_core.v_monthly_mrr_and_churn_summary
ORDER BY period_month DESC
LIMIT 12`,
      monthly: `SELECT *
FROM curated_core.v_monthly_mrr_and_churn_summary
WHERE period_month >= DATE_FORMAT(DATE_ADD('month', -12, CURRENT_DATE), '%Y-%m')
ORDER BY period_month DESC
LIMIT 12`,
      ytd: `WITH base AS (
  SELECT *
  FROM curated_core.v_monthly_mrr_and_churn_summary
  WHERE period_month >= CONCAT(CAST(year(current_date) AS VARCHAR), '-01')
)
SELECT
  SUM(ending_mrr) AS ending_mrr_ytd,
  SUM(new_mrr) AS new_mrr_ytd,
  SUM(churned_mrr) AS churned_mrr_ytd,
  SUM(expansion_mrr) AS expansion_mrr_ytd,
  SUM(contraction_mrr) AS contraction_mrr_ytd,
  SUM(ending_customer_count) AS avg_customer_count
FROM base
LIMIT 50`
    },
    
    band_distribution: {
      supports: ['current'],
      current: `SELECT
  action_band,
  COUNT(*) AS customer_count,
  SUM(total_mrr) AS total_mrr,
  ROUND(AVG(total_mrr), 2) AS avg_mrr,
  SUM(total_cost) AS total_cost
FROM curated_core.v_customer_fully_loaded_margin_banded
GROUP BY 1
ORDER BY 1
LIMIT 50`
    },
    
    worst_e_band: {
      supports: ['current'],
      current: `SELECT *
FROM curated_core.v_cci_e_band_exit_accounts
LIMIT 50`
    },
    
    hosted_pbx: {
      supports: ['current'],
      current: `SELECT *
FROM curated_core.v_hosted_pbx_migration
WHERE mrr_uplift_to_50 > 1000
ORDER BY mrr_uplift_to_50 DESC
LIMIT 200`
    },
    
    ticket_trend: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT 
  CAST(NULL AS date) as ticket_date,
  CAST(NULL AS bigint) as ticket_count
WHERE 1 = 0`,
      monthly: `SELECT 
  CAST(NULL AS date) as ticket_date,
  CAST(NULL AS bigint) as ticket_count
WHERE 1 = 0`,
      ytd: `SELECT 
  CAST(NULL AS date) as ticket_date,
  CAST(NULL AS bigint) as ticket_count
WHERE 1 = 0`
    },
    
    raw_tickets_cci: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT
  CAST(NULL AS varchar) as st_number,
  CAST(NULL AS varchar) as customer_name,
  CAST(NULL AS varchar) as type,
  CAST(NULL AS varchar) as priority,
  CAST(NULL AS varchar) as service_area,
  CAST(NULL AS timestamp) as created_time
WHERE 1 = 0`,
      monthly: `SELECT
  CAST(NULL AS varchar) as st_number,
  CAST(NULL AS varchar) as customer_name,
  CAST(NULL AS varchar) as type,
  CAST(NULL AS varchar) as priority,
  CAST(NULL AS varchar) as service_area,
  CAST(NULL AS timestamp) as created_time
WHERE 1 = 0`,
      ytd: `SELECT
  CAST(NULL AS varchar) as st_number,
  CAST(NULL AS varchar) as customer_name,
  CAST(NULL AS varchar) as type,
  CAST(NULL AS varchar) as priority,
  CAST(NULL AS varchar) as service_area,
  CAST(NULL AS timestamp) as created_time
WHERE 1 = 0`
    },
    
    ticket_burden_lake: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT 
  customer_id,
  customer_name,
  ticket_count_lake
FROM curated_core.v_ticket_burden_lake
ORDER BY ticket_count_lake DESC
LIMIT 200`
    },
    
    ticket_burden_customer: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT 
  c.customer_id,
  c.customer_name,
  b.ticket_count_lake,
  b.ticket_burden_band
FROM curated_core.v_ticket_burden_banded b
LEFT JOIN curated_core.dim_customer_platt_v1_1 c
  ON c.customer_id = b.customer_id
ORDER BY b.ticket_count_lake DESC
LIMIT 200`
    },
    
    ticket_burden_banded: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT 
  ticket_burden_band,
  COUNT(*) as customer_count,
  SUM(ticket_count_lake) as total_tickets
FROM curated_core.v_ticket_burden_banded
GROUP BY ticket_burden_band
ORDER BY
  CASE ticket_burden_band
    WHEN '0' THEN 0
    WHEN '1-5' THEN 1
    WHEN '6-20' THEN 2
    WHEN '20+' THEN 3
    ELSE 4
  END`
    },
    
    margin_tickets: {
      supports: ['current', 'ytd', 'monthly'],
      current: `SELECT 
  customer_id,
  customer_name,
  total_mrr,
  total_cci_cost,
  gross_margin_dollars,
  gross_margin_pct,
  ticket_count_lake,
  ticket_burden_band,
  partner_pct,
  hosted_pbx_flag
FROM curated_core.v_customer_margin_plus_tickets
ORDER BY
  ticket_count_lake DESC,
  gross_margin_pct ASC
LIMIT 500`
    }
  };

  const tileDef = sqlDefinitions[tileId];
  
  if (!tileDef) {
    throw new Error(`Unknown tile ID: ${tileId}`);
  }

  // Check if period is supported
  if (!tileDef.supports.includes(periodMode)) {
    // Fall back to current if period not supported
    periodMode = 'current';
  }

  return {
    sql: tileDef[periodMode],
    supportedPeriods: tileDef.supports
  };
};

// Helper to check if a tile supports a period mode
export const tileSupports = (tileId, periodMode) => {
  try {
    const { supportedPeriods } = getTileSql(tileId, 'current');
    return supportedPeriods.includes(periodMode);
  } catch {
    return false;
  }
};