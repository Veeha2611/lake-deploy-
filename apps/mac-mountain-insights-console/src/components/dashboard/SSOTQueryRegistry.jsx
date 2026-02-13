/**
 * SSOT QUERY REGISTRY & ALLOWLIST
 * 
 * Centralized contract for approved queries and views
 * Only queries registered here can execute against the data lake
 * 
 * Architecture:
 * - All queries MUST use curated_ssot.* or curated_core.*_current views
 * - Never raw.* or curated_raw.*
 * - Every query returns evidence (QID, SQL, views, manifest links)
 */

// APPROVED SSOT VIEWS (Allowlist)
export const APPROVED_VIEWS = {
  // Customer & Account Data
  'curated_core.dim_customer_platt': 'Customer spine - canonical customer definitions',
  'curated_core.dim_customer_platt_v1_1': 'Customer dimension v1.1 with enrichments',
  'curated_core.dim_customer_platt_with_system': 'Customer spine with system mapping',
  
  // MRR & Revenue
  'curated_core.v_monthly_mrr_platt': 'Monthly MRR by customer/CRID - SSOT for revenue',
  'curated_core.v_platt_billing_customer_month_latest': 'Latest month customer billing snapshot (Platt)',
  'curated_core.v_monthly_mrr_by_segment': 'MRR rollups by segment',
  'curated_core.v_monthly_mrr_platt_movement_segmented': 'MRR movement with adds/churns',
  'curated_core.v_monthly_mrr_and_churn_summary': 'MRR and churn summary metrics',
  'curated_core.v_monthly_revenue_platt_long': 'Monthly revenue (long) for SSOT reporting',
  'curated_core.v_finance_kpis_latest': 'Finance KPI snapshot (MRR, churn, active accounts)',
  'curated_core.v_investor_revenue_mix_latest': 'Investor revenue mix (network-level)',
  'curated_core.v_investor_revenue_mix_totals_latest': 'Investor revenue mix totals (workbook Total row)',
  'curated_core.v_platt_billing_mrr_monthly': 'Platt billing monthly MRR rollup (authoritative billing)',
  'curated_core.v_platt_gl_revenue': 'GL revenue summary (generic view)',
  'curated_core.v_platt_gl_revenue_by_customer': 'GL revenue by customer (generic view)',
  'curated_core.intacct_gl_entries_current_ssot': 'Intacct GL entries SSOT (enriched)',

  // Discovery (read-only)
  'information_schema.tables': 'Athena information schema tables (read-only discovery)',
  
  // Margin & Bands
  'curated_core.v_customer_fully_loaded_margin_banded': 'Customer margin analysis with A-E bands',
  'curated_core.v_cci_e_band_exit_accounts': 'Worst E-band accounts requiring action',
  
  // Churn & Movement
  'curated_core.v_monthly_account_churn_by_segment': 'Account churn by segment',
  
  // Tickets & Support
  'curated_core.v_cci_tickets_clean': 'CCI ticket feed - cleaned',
  'curated_core.v_ticket_burden_lake': 'Ticket count per customer',
  'curated_core.v_ticket_burden_banded': 'Ticket burden bands (0, 1-5, 6-20, 20+)',
  'curated_core.v_customer_margin_plus_tickets': 'Margin combined with ticket metrics',
  
  // Hosted PBX
  'curated_core.v_hosted_pbx_migration': 'PBX migration uplift opportunities',
  
  // Projects Pipeline
  'curated_core.projects_enriched': 'Projects pipeline master table',
  'curated_core.projects_enriched_live': 'Projects pipeline live view (latest)',
  'curated_core.project_updates': 'Append-only project update log',

  // Network Mix / Health (billing-aligned)
  'curated_recon.v_network_mix_billing_aligned_latest': 'Network mix aligned to billing + active services (latest)',
  'curated_recon.v_network_active_services_latest': 'Active services by network (Platt SSOT)',
  'curated_recon.v_network_mrr_recon_latest': 'Billed vs modeled MRR reconciliation by network',
  'curated_recon.v_unmapped_network_services_latest': 'Unmapped GWI system rollup (active services + billed customers)',
  'curated_recon.v_unmapped_network_customers_latest': 'Unmapped customer detail (active services)',

  // GIS / Network Map
  'curated_core.v_vetro_service_locations': 'Vetro service locations (preview map points)',
  'curated_core.v_vetro_network_map_counts_v1': 'Vetro network map counts (networks/locations/served)',
  'curated_core.v_vetro_network_map_layers_v1': 'Vetro GIS layer registry (points)',
  'curated_core.v_vetro_map_lines_layers_v1': 'Vetro GIS line layers (placement)',
  'curated_core.v_vetro_map_lines_owner_v1': 'Vetro GIS line layers (owner)',
  'curated_core.v_vetro_map_polygons_v1': 'Vetro GIS polygons',
  'curated_core.v_fcc_fiber_h3_counts_me_nh_2026_01': 'FCC fiber H3 summary (ME/NH)',
  'curated_core.v_fcc_nonfiber_h3_counts_me_nh_2026_01': 'FCC non-fiber H3 summary (ME/NH)',

  // Bucket / System Mapping
  'curated_core.dim_customer_system': 'Customer to system mapping (bucket rollups)',
  'curated_core.dim_system_bucket': 'System bucket lookup',
  'curated_core.v_vetro_fsa_tagged': 'Vetro FSA tagged (bucket rollups)',
  
  // SSOT Tables
  'curated_ssot.deliverables': 'Deliverables SSOT (partitioned by dt)'
};

// Query templates with evidence tracking
export const QUERY_REGISTRY = {
  // Dashboard KPIs
  total_mrr: {
    id: 'total_mrr',
    name: 'Total MRR',
    description: 'Latest closed month total MRR from Platt SSOT',
    sql: `SELECT
      period_month,
      total_mrr,
      mrr_customers AS customer_count
    FROM curated_core.v_finance_kpis_latest
    LIMIT 1`,
    views: ['curated_core.v_finance_kpis_latest'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'period_month']
  },

  finance_kpis_latest: {
    id: 'finance_kpis_latest',
    name: 'Finance KPIs (Latest)',
    description: 'Latest finance KPI snapshot from SSOT sources',
    sql: `SELECT
      period_month,
      total_mrr,
      mrr_customers,
      active_accounts,
      churn_rate,
      churned_customers,
      prev_customers
    FROM curated_core.v_finance_kpis_latest
    LIMIT 1`,
    views: ['curated_core.v_finance_kpis_latest'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'period_month']
  },

  glclosepack_discovery: {
    id: 'glclosepack_discovery',
    name: 'GL Close Pack Discovery',
    description: 'Discover available Intacct close months (last 24 months)',
    sql: `WITH base AS (
  SELECT COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt
  FROM curated_core.intacct_gl_entries_current_ssot
  WHERE business_date IS NOT NULL OR entry_date IS NOT NULL
)
SELECT date_format(entry_dt, '%Y-%m') AS period_month
FROM base
WHERE entry_dt IS NOT NULL
  AND entry_dt >= date_add('month', -24, current_date)
GROUP BY 1
ORDER BY 1 DESC
LIMIT 36`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  glclosepack_summary: {
    id: 'glclosepack_summary',
    name: 'GL Close Pack Summary',
    description: 'Intacct GL revenue summary for a month',
    sql: `WITH base AS (
  SELECT
    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,
    accountno,
    account_title,
    account_category,
    TRY_CAST(amount AS double) AS amount
  FROM curated_core.intacct_gl_entries_current_ssot
)
SELECT
  account_category,
  accountno,
  account_title,
  SUM(amount) AS amount_total
FROM base
WHERE entry_dt >= date_parse(concat(\${period_month}, '-01'), '%Y-%m-%d')
  AND entry_dt < date_add('month', 1, date_parse(concat(\${period_month}, '-01'), '%Y-%m-%d'))
  AND account_category IS NOT NULL
  AND (account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts')
GROUP BY 1,2,3
ORDER BY 1,2
LIMIT \${limit}`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'period_month']
  },

  glclosepack_detail: {
    id: 'glclosepack_detail',
    name: 'GL Close Pack Detail',
    description: 'Intacct GL revenue detail for a month',
    sql: `WITH base AS (
  SELECT
    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,
    accountno,
    account_title,
    account_category,
    customerid,
    customername,
    document,
    description,
    TRY_CAST(amount AS double) AS amount
  FROM curated_core.intacct_gl_entries_current_ssot
)
SELECT
  entry_dt,
  account_category,
  accountno,
  account_title,
  customerid,
  customername,
  amount,
  document,
  description
FROM base
WHERE entry_dt >= date_parse(concat(\${period_month}, '-01'), '%Y-%m-%d')
  AND entry_dt < date_add('month', 1, date_parse(concat(\${period_month}, '-01'), '%Y-%m-%d'))
  AND account_category IS NOT NULL
  AND (account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts')
ORDER BY entry_dt DESC
LIMIT \${limit}`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'period_month']
  },

  forecast_ap_spend: {
    id: 'forecast_ap_spend',
    name: 'AP Spend Forecast',
    description: 'Monthly Accounts Payable totals from Intacct GL',
    sql: `WITH base AS (
  SELECT
    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,
    account_category,
    TRY_CAST(amount AS double) AS amount
  FROM curated_core.intacct_gl_entries_current_ssot
  WHERE business_date IS NOT NULL OR entry_date IS NOT NULL
), windowed AS (
  SELECT *
  FROM base
  WHERE entry_dt IS NOT NULL
    AND entry_dt >= DATE \${start_date}
    AND entry_dt < date_add('month', 1, date_trunc('month', DATE \${end_date}))
)
SELECT
  date_format(date_trunc('month', entry_dt), '%Y-%m') AS period_month,
  SUM(amount) AS amount_total
FROM windowed
WHERE account_category LIKE 'Accounts Payable%'
GROUP BY 1
ORDER BY 1`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  forecast_revenue: {
    id: 'forecast_revenue',
    name: 'Revenue Forecast',
    description: 'Monthly revenue totals from SSOT billing',
    sql: `SELECT
  date_format(period_month, '%Y-%m') AS period_month,
  SUM(revenue_total) AS total_revenue
FROM curated_core.v_monthly_revenue_platt_long
WHERE period_month >= DATE \${start_date}
  AND period_month < date_add('month', 1, date_trunc('month', DATE \${end_date}))
GROUP BY 1
ORDER BY 1`,
    views: ['curated_core.v_monthly_revenue_platt_long'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  forecast_vendor_spend: {
    id: 'forecast_vendor_spend',
    name: 'Vendor Spend Forecast',
    description: 'Monthly spend for top vendors (Intacct GL)',
    sql: `WITH base AS (
  SELECT
    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,
    account_category,
    vendor_name_dim,
    vendorname,
    vendorid,
    TRY_CAST(amount AS double) AS amount
  FROM curated_core.intacct_gl_entries_current_ssot
  WHERE business_date IS NOT NULL OR entry_date IS NOT NULL
), windowed AS (
  SELECT *
  FROM base
  WHERE entry_dt IS NOT NULL
    AND entry_dt >= DATE \${start_date}
    AND entry_dt < date_add('month', 1, date_trunc('month', DATE \${end_date}))
), ranked AS (
  SELECT
    COALESCE(NULLIF(vendor_name_dim, ''), NULLIF(vendorname, ''), NULLIF(vendorid, ''), 'Unknown') AS vendor,
    SUM(ABS(amount)) AS total_abs
  FROM windowed
  GROUP BY 1
  ORDER BY total_abs DESC
  LIMIT 10
), monthly AS (
  SELECT
    date_format(date_trunc('month', entry_dt), '%Y-%m') AS period_month,
    COALESCE(NULLIF(vendor_name_dim, ''), NULLIF(vendorname, ''), NULLIF(vendorid, ''), 'Unknown') AS vendor,
    SUM(amount) AS amount_total
  FROM windowed
  WHERE COALESCE(NULLIF(vendor_name_dim, ''), NULLIF(vendorname, ''), NULLIF(vendorid, ''), 'Unknown') IN (SELECT vendor FROM ranked)
  GROUP BY 1,2
)
SELECT period_month, vendor, amount_total
FROM monthly
ORDER BY period_month, vendor`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  forecast_gl_account: {
    id: 'forecast_gl_account',
    name: 'GL Account Forecast',
    description: 'Monthly totals for top GL accounts (Intacct GL)',
    sql: `WITH base AS (
  SELECT
    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,
    accountno,
    account_title,
    TRY_CAST(amount AS double) AS amount
  FROM curated_core.intacct_gl_entries_current_ssot
  WHERE business_date IS NOT NULL OR entry_date IS NOT NULL
), windowed AS (
  SELECT *
  FROM base
  WHERE entry_dt IS NOT NULL
    AND entry_dt >= DATE \${start_date}
    AND entry_dt < date_add('month', 1, date_trunc('month', DATE \${end_date}))
), ranked AS (
  SELECT accountno, account_title, SUM(ABS(amount)) AS total_abs
  FROM windowed
  WHERE accountno IS NOT NULL AND account_title IS NOT NULL
  GROUP BY 1,2
  ORDER BY total_abs DESC
  LIMIT 15
)
SELECT
  date_format(date_trunc('month', w.entry_dt), '%Y-%m') AS period_month,
  w.accountno,
  w.account_title,
  SUM(w.amount) AS amount_total
FROM windowed w
JOIN ranked r
  ON w.accountno = r.accountno AND w.account_title = r.account_title
GROUP BY 1,2,3
ORDER BY period_month, accountno`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  forecast_cash_flow: {
    id: 'forecast_cash_flow',
    name: 'Cash Flow Forecast',
    description: 'Monthly revenue vs expense proxy (Intacct GL)',
    sql: `WITH base AS (
  SELECT
    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,
    account_category,
    TRY_CAST(amount AS double) AS amount
  FROM curated_core.intacct_gl_entries_current_ssot
  WHERE business_date IS NOT NULL OR entry_date IS NOT NULL
), windowed AS (
  SELECT *
  FROM base
  WHERE entry_dt IS NOT NULL
    AND entry_dt >= DATE \${start_date}
    AND entry_dt < date_add('month', 1, date_trunc('month', DATE \${end_date}))
)
SELECT
  date_format(date_trunc('month', entry_dt), '%Y-%m') AS period_month,
  SUM(CASE WHEN account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts' THEN amount ELSE 0 END) AS revenue,
  SUM(CASE WHEN account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts' THEN 0 ELSE ABS(amount) END) AS expenses,
  SUM(CASE WHEN account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts' THEN amount ELSE 0 END)
    - SUM(CASE WHEN account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts' THEN 0 ELSE ABS(amount) END) AS cash_flow
FROM windowed
GROUP BY 1
ORDER BY 1`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  forecast_expense_category: {
    id: 'forecast_expense_category',
    name: 'Expense Category Forecast',
    description: 'Monthly totals by expense category (Intacct GL)',
    sql: `WITH base AS (
  SELECT
    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,
    account_category,
    TRY_CAST(amount AS double) AS amount
  FROM curated_core.intacct_gl_entries_current_ssot
  WHERE business_date IS NOT NULL OR entry_date IS NOT NULL
), windowed AS (
  SELECT *
  FROM base
  WHERE entry_dt IS NOT NULL
    AND entry_dt >= DATE \${start_date}
    AND entry_dt < date_add('month', 1, date_trunc('month', DATE \${end_date}))
)
SELECT
  date_format(date_trunc('month', entry_dt), '%Y-%m') AS period_month,
  account_category,
  SUM(amount) AS amount_total
FROM windowed
WHERE account_category IS NOT NULL
  AND NOT (account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts')
GROUP BY 1,2
ORDER BY 1,2`,
    views: ['curated_core.intacct_gl_entries_current_ssot'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  copper_customers_count: {
    id: 'copper_customers_count',
    name: 'Copper Customers (SSOT)',
    description: 'Active copper customers as tagged in SSOT customer type',
    sql: `WITH base AS (
  SELECT
    CAST(id AS varchar) AS customer_id,
    username,
    gwi_customer_type,
    active,
    sensitive_p
  FROM curated_core.platt_customer_current_ssot
  WHERE username IS NOT NULL AND TRIM(username) <> ''
    AND LOWER(COALESCE(sensitive_p, '')) <> 'y'
), mapped AS (
  SELECT
    b.customer_id,
    b.username,
    b.gwi_customer_type,
    b.active,
    d.gwi_system,
    d.network,
    d.system_key
  FROM base b
  LEFT JOIN curated_core.dim_customer_system_latest d
    ON CAST(b.customer_id AS varchar) = CAST(d.customer_id AS varchar)
)
SELECT
  COUNT(DISTINCT CASE
    WHEN (
      LOWER(COALESCE(gwi_customer_type, '')) LIKE '%copper%'
      OR LOWER(COALESCE(gwi_system, '')) LIKE '%copper%'
      OR LOWER(COALESCE(network, '')) LIKE '%copper%'
      OR LOWER(COALESCE(system_key, '')) LIKE '%copper%'
    )
    AND LOWER(COALESCE(active, '')) IN ('y','yes','true','1')
    THEN username
  END) AS copper_customer_count,
  COUNT(DISTINCT CASE
    WHEN (
      LOWER(COALESCE(gwi_customer_type, '')) LIKE '%copper%'
      OR LOWER(COALESCE(gwi_system, '')) LIKE '%copper%'
      OR LOWER(COALESCE(network, '')) LIKE '%copper%'
      OR LOWER(COALESCE(system_key, '')) LIKE '%copper%'
    )
    THEN username
  END) AS copper_customer_count_all
FROM mapped
LIMIT 1`,
    views: ['curated_core.platt_customer_current_ssot', 'curated_core.dim_customer_system_latest'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  copper_customers_network_mix: {
    id: 'copper_customers_network_mix',
    name: 'Copper Customers (Network Mix)',
    description: 'Copper customers via SSOT customer type + system mapping (billing + active services)',
    sql: `WITH copper_customers AS (
  SELECT
    CAST(id AS varchar) AS customer_id,
    username,
    active
  FROM curated_core.platt_customer_current_ssot
  WHERE username IS NOT NULL AND TRIM(username) <> ''
    AND LOWER(COALESCE(gwi_customer_type, '')) LIKE '%copper%'
    AND LOWER(COALESCE(sensitive_p, '')) <> 'y'
), scoped AS (
  SELECT
    c.customer_id,
    d.gwi_system,
    d.network,
    d.system_key
  FROM copper_customers c
  LEFT JOIN curated_core.dim_customer_system_latest d
    ON CAST(c.customer_id AS varchar) = CAST(d.customer_id AS varchar)
), latest_billing AS (
  SELECT MAX(period_month) AS period_month
  FROM curated_core.v_platt_billing_customer_month_latest
), billing AS (
  SELECT
    customer_id,
    period_month,
    mrr_total_customer_month
  FROM curated_core.v_platt_billing_customer_month_latest
  WHERE period_month = (SELECT period_month FROM latest_billing)
    AND mrr_total_customer_month > 0
), active_services AS (
  SELECT customer_id
  FROM curated_core.dim_customer_platt_v1_1
  WHERE has_active_service = true
    AND (is_test_internal = false OR is_test_internal IS NULL)
)
SELECT
  COUNT(DISTINCT b.customer_id) AS copper_billed_customers,
  COUNT(DISTINCT a.customer_id) AS copper_active_services,
  COUNT(DISTINCT s.customer_id) AS copper_subscriptions,
  SUM(b.mrr_total_customer_month) AS copper_mrr_billed,
  MAX(b.period_month) AS period_month
FROM scoped s
LEFT JOIN billing b
  ON CAST(s.customer_id AS varchar) = CAST(b.customer_id AS varchar)
LEFT JOIN active_services a
  ON CAST(s.customer_id AS varchar) = CAST(a.customer_id AS varchar)
WHERE (
  \${network} = ''
  OR LOWER(COALESCE(s.network, '')) = LOWER(\${network})
  OR LOWER(COALESCE(s.gwi_system, '')) = LOWER(\${network})
  OR LOWER(COALESCE(s.system_key, '')) = LOWER(\${network})
  OR LOWER(COALESCE(s.network, '')) LIKE LOWER(\${network_prefix})
  OR LOWER(COALESCE(s.gwi_system, '')) LIKE LOWER(\${network_prefix})
  OR LOWER(COALESCE(s.system_key, '')) LIKE LOWER(\${network_prefix})
)
LIMIT 1`,
    views: [
      'curated_core.platt_customer_current_ssot',
      'curated_core.dim_customer_system_latest',
      'curated_core.v_platt_billing_customer_month_latest',
      'curated_core.dim_customer_platt_v1_1'
    ],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  platt_billing_mrr_latest: {
    id: 'platt_billing_mrr_latest',
    name: 'Platt Billing MRR (Latest)',
    description: 'Latest month billing MRR rollup from Platt invoice headers',
    sql: `WITH latest AS (
      SELECT MAX(period_month) AS latest_month
      FROM curated_core.v_platt_billing_mrr_monthly
    ),
    mix AS (
      SELECT
        SUM(subscriptions) AS active_subscriptions,
        SUM(passings) AS total_passings,
        SUM(mrr) AS total_mrr_modeled,
        SUM(mrr_billed) AS total_mrr_billed,
        MAX(period_month) AS mix_period_month
      FROM curated_recon.v_network_mix_billing_aligned_latest
      WHERE network <> 'Unmapped'
    ),
    active AS (
      SELECT COUNT(DISTINCT customer_id) AS active_customers
      FROM curated_core.dim_customer_platt_v1_1
      WHERE has_active_service = true
        AND (is_test_internal = false OR is_test_internal IS NULL)
    ),
    recent AS (
      SELECT period_month, total_mrr, customer_count
      FROM curated_core.v_platt_billing_mrr_monthly
      WHERE period_month >= date_add('month', -11, (SELECT latest_month FROM latest))
    ),
    ytd AS (
      SELECT
        SUM(total_mrr) AS ytd_total_mrr,
        AVG(total_mrr) AS ytd_avg_mrr,
        COUNT(*) AS ytd_months
      FROM curated_core.v_platt_billing_mrr_monthly
      WHERE date_trunc('year', period_month) = date_trunc('year', (SELECT latest_month FROM latest))
    ),
    latest_row AS (
      SELECT total_mrr, customer_count, period_month
      FROM curated_core.v_platt_billing_mrr_monthly
      WHERE period_month = (SELECT latest_month FROM latest)
    )
    SELECT
      CAST(MAX(latest.latest_month) AS DATE) AS period_month,
      MAX(latest_row.total_mrr) AS latest_total_mrr,
      MAX(mix.active_subscriptions) AS active_subscriptions,
      MAX(active.active_customers) AS active_customers,
      CASE
        WHEN MAX(mix.active_subscriptions) > 0 THEN MAX(latest_row.total_mrr) / MAX(mix.active_subscriptions)
        ELSE NULL
      END AS latest_arpu,
      MAX(latest_row.customer_count) AS latest_billing_customers,
      SUM(recent.total_mrr) AS ttm_total_mrr,
      AVG(recent.total_mrr) AS ttm_avg_mrr,
      MAX(ytd.ytd_total_mrr) AS ytd_total_mrr,
      MAX(ytd.ytd_months) AS ytd_months
    FROM latest
    CROSS JOIN mix
    CROSS JOIN active
    CROSS JOIN latest_row
    CROSS JOIN recent
    CROSS JOIN ytd
    LIMIT 1`,
    views: [
      'curated_core.v_platt_billing_mrr_monthly',
      'curated_recon.v_network_mix_billing_aligned_latest',
      'curated_core.dim_customer_platt_v1_1'
    ],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'period_month']
  },

  network_health: {
    id: 'network_health',
    name: 'Network Mix (Billing-Aligned)',
    description: 'Network mix aligned to billing + active services (excludes Unmapped)',
    sql: `SELECT *
    FROM curated_recon.v_network_mix_billing_aligned_latest
    WHERE network <> 'Unmapped'
    LIMIT 2000`,
    views: ['curated_recon.v_network_mix_billing_aligned_latest'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'row_count']
  },

  unmapped_network_services: {
    id: 'unmapped_network_services',
    name: 'Unmapped Network Services (Reconciliation)',
    description: 'Unmapped GWI system rollup (active services + billed customers)',
    sql: `SELECT *
    FROM curated_recon.v_unmapped_network_services_latest
    ORDER BY active_services DESC`,
    views: ['curated_recon.v_unmapped_network_services_latest'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'row_count']
  },

  unmapped_network_customers: {
    id: 'unmapped_network_customers',
    name: 'Unmapped Network Customers (Detail)',
    description: 'Unmapped customer detail (active services)',
    sql: `SELECT *
    FROM curated_recon.v_unmapped_network_customers_latest`,
    views: ['curated_recon.v_unmapped_network_customers_latest'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'row_count']
  },

  platt_billing_mrr_trend_12m: {
    id: 'platt_billing_mrr_trend_12m',
    name: 'Platt Billing MRR Trend (12m)',
    description: 'Last 12 months of billing MRR (Platt)',
    sql: `WITH latest AS (
      SELECT MAX(period_month) AS latest_month
      FROM curated_core.v_platt_billing_mrr_monthly
    )
    SELECT
      period_month,
      total_mrr,
      customer_count
    FROM curated_core.v_platt_billing_mrr_monthly
    WHERE period_month >= date_add('month', -11, (SELECT latest_month FROM latest))
    ORDER BY period_month
    LIMIT 12`,
    views: ['curated_core.v_platt_billing_mrr_monthly'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'row_count']
  },
  
  active_accounts: {
    id: 'active_accounts',
    name: 'Active Accounts',
    description: 'Count of customers with active MRR',
    sql: `SELECT 
      COUNT(DISTINCT customer_id) as customers_with_mrr,
      MAX(period_month) as period_month
    FROM curated_core.v_monthly_mrr_platt
    WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
      AND mrr_total > 0
    LIMIT 1`,
    views: ['curated_core.v_monthly_mrr_platt'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'period_month']
  },
  
  at_risk_customers: {
    id: 'at_risk_customers',
    name: 'At Risk Customers (D/E)',
    description: 'Customers in D or E action bands',
    sql: `SELECT
      b.customer_id,
      c.customer_name,
      b.action_band,
      b.fully_loaded_margin_pct,
      b.total_mrr
    FROM curated_core.v_customer_fully_loaded_margin_banded b
    LEFT JOIN curated_core.dim_customer_platt_v1_1 c
      ON c.customer_id = b.customer_id
    WHERE b.action_band IN ('D_PRICE_PLUS_SIMPLIFY', 'E_EXIT_OR_RESCOPE')
    ORDER BY b.fully_loaded_margin_pct ASC
    LIMIT 500`,
    views: ['curated_core.v_customer_fully_loaded_margin_banded', 'curated_core.dim_customer_platt_v1_1'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'row_count']
  },
  
  band_distribution: {
    id: 'band_distribution',
    name: 'A-E Band Distribution',
    description: 'Customer and MRR distribution across action bands',
    sql: `WITH customer_month AS (
      SELECT
        customer_id,
        SUM(mrr_total) AS mrr_total_customer_month
      FROM curated_core.v_monthly_mrr_platt
      WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
      GROUP BY 1
    ),
    customer_bands AS (
      SELECT
        cm.customer_id,
        cm.mrr_total_customer_month,
        b.action_band
      FROM customer_month cm
      LEFT JOIN curated_core.v_customer_fully_loaded_margin_banded b
        ON b.customer_id = cm.customer_id
      WHERE cm.mrr_total_customer_month > 0
    )
    SELECT
      action_band,
      COUNT(*) AS customer_count,
      SUM(mrr_total_customer_month) AS total_mrr
    FROM customer_bands
    WHERE action_band IS NOT NULL
    GROUP BY 1
    ORDER BY 1
    LIMIT 50`,
    views: ['curated_core.v_monthly_mrr_platt', 'curated_core.v_customer_fully_loaded_margin_banded'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },
  
  projects_pipeline: {
    id: 'projects_pipeline',
    name: 'Projects Pipeline',
    description: 'Active projects from pipeline',
    sql: `SELECT
      project_id,
      entity,
      project_name,
      project_type,
      state,
      COALESCE(stage, 'Unknown') AS stage,
      COALESCE(priority, 'Unranked') AS priority,
      owner,
      partner_share_raw,
      investor_label,
      notes
    FROM curated_core.projects_enriched_live
    ORDER BY entity, project_name
    LIMIT 200`,
    views: ['curated_core.projects_enriched_live'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },
  projects_pipeline_defaults: {
    id: 'projects_pipeline_defaults',
    name: 'Projects Pipeline Defaults',
    description: 'Median defaults for baseline modeling',
    sql: `SELECT
      approx_percentile(passings, 0.5) AS passings_p50,
      approx_percentile(months_to_completion, 0.5) AS build_months_p50,
      approx_percentile(arpu, 0.5) AS arpu_p50,
      approx_percentile(COALESCE(investment, construction_plus_install_cost), 0.5) AS total_capex_p50,
      approx_percentile(capex_per_passing, 0.5) AS capex_per_passing_p50,
      approx_percentile(install_cost_per_subscriber, 0.5) AS install_cost_per_subscriber_p50,
      approx_percentile(opex_per_sub, 0.5) AS opex_per_sub_p50
    FROM curated_core.projects_enriched
    WHERE passings > 0
      AND months_to_completion > 0
      AND arpu > 0`,
    views: ['curated_core.projects_enriched'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },
  project_detail: {
    id: 'project_detail',
    name: 'Project Detail (Baseline Inputs)',
    description: 'Baseline inputs for a single project',
    sql: `SELECT
      entity,
      project_name,
      passings,
      months_to_completion AS build_months,
      COALESCE(investment, construction_plus_install_cost) AS total_capex,
      arpu AS arpu_start,
      penetration_start_pct,
      penetration_target_pct,
      ramp_months,
      total_cost_per_passing AS capex_per_passing,
      opex_per_sub,
      discount_rate_pct
    FROM curated_core.projects_enriched_live
    WHERE project_id = \${project_id}
    LIMIT 1`,
    params: ['project_id'],
    views: ['curated_core.projects_enriched_live'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  projects_pipeline_full: {
    id: 'projects_pipeline_full',
    name: 'Projects Pipeline (Full)',
    description: 'Full projects pipeline with financial metrics',
    sql: `WITH latest_updates AS (
      SELECT
        project_id,
        state,
        stage,
        priority,
        owner,
        notes,
        updated_ts,
        ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY updated_ts DESC) AS rn
      FROM curated_core.project_updates
    ),
    base AS (
      SELECT
        project_id,
        entity,
        project_name,
        project_type,
        state,
        partner,
        split_code,
        split_pct,
        investor,
        investment,
        irr,
        moic,
        project_specs_code,
        passings,
        subscribers,
        take_rate,
        revenue,
        cash_flow,
        coc_return,
        construction_cost,
        construction_cost_per_passing,
        install_cost,
        install_cost_per_subscriber,
        construction_plus_install_cost,
        total_cost_per_passing,
        arpu,
        months_to_completion,
        contract_date,
        start_date,
        end_date,
        funnel_value,
        funnel_multiple,
        due_date
      FROM curated_core.projects_enriched_live
      WHERE project_id IS NOT NULL
        AND TRIM(CAST(project_id AS varchar)) <> ''
        AND LOWER(TRIM(CAST(project_id AS varchar))) <> 'nan'
    )
    SELECT
      b.project_id,
      b.entity,
      b.project_name,
      b.project_type,
      COALESCE(u.state, b.state) AS state,
      COALESCE(u.stage, b.stage) AS stage,
      u.priority AS priority,
      u.owner AS owner,
      u.notes AS notes,
      b.partner,
      b.split_code,
      b.split_pct,
      b.investor,
      b.investment,
      b.irr,
      b.moic,
      b.project_specs_code,
      b.passings,
      b.subscribers,
      b.take_rate,
      b.revenue,
      b.cash_flow,
      b.coc_return,
      b.construction_cost,
      b.construction_cost_per_passing,
      b.install_cost,
      b.install_cost_per_subscriber,
      b.construction_plus_install_cost,
      b.total_cost_per_passing,
      b.arpu,
      b.months_to_completion,
      b.contract_date,
      b.start_date,
      b.end_date,
      b.funnel_value,
      b.funnel_multiple,
      b.due_date
    FROM base b
    LEFT JOIN latest_updates u
      ON b.project_id = u.project_id AND u.rn = 1
    ORDER BY entity, project_name
    LIMIT 500`,
    views: ['curated_core.projects_enriched_live', 'curated_core.project_updates'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  // Network Map Preview + GIS Layers
  network_map_points: {
    id: 'network_map_points',
    name: 'Network Map Preview Points',
    description: 'Service location preview points for the map tile',
    sql: `SELECT
  service_location_id,
  latitude,
  longitude,
  broadband_status,
  build,
  plan_id
FROM curated_core.v_vetro_service_locations
LIMIT 100`,
    views: ['curated_core.v_vetro_service_locations'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },

  network_map_counts: {
    id: 'network_map_counts',
    name: 'Network Map Counts',
    description: 'Counts for plans + unique service locations + build coverage',
    sql: `WITH plan_cte AS (
  SELECT
    COUNT(DISTINCT plan_id) AS plan_count
  FROM curated_core.v_vetro_network_map_layers_v1
  WHERE plan_id IS NOT NULL AND TRIM(CAST(plan_id AS varchar)) <> ''
), sl_cte AS (
  SELECT
    COUNT(DISTINCT service_location_id) AS service_locations_unique,
    COUNT(DISTINCT CASE WHEN build = 'Yes' THEN service_location_id END) AS build_yes_unique
  FROM curated_core.v_vetro_service_locations_tbl
)
SELECT
  plan_cte.plan_count,
  sl_cte.service_locations_unique,
  sl_cte.build_yes_unique
FROM plan_cte
CROSS JOIN sl_cte;`,
    views: ['curated_core.v_vetro_network_map_layers_v1', 'curated_core.v_vetro_service_locations_tbl'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  },
  
  rowcount_by_partition: (tableName, limit = 10) => ({
    id: 'rowcount_by_partition',
    purpose: 'Get rowcount by partition (backward search)',
    sql: `SELECT dt, COUNT(*) as row_count 
          FROM ${tableName} 
          GROUP BY dt 
          ORDER BY dt DESC 
          LIMIT ${limit}`
  }),
  
  sample_data: (tableName, limit = 5) => ({
    id: 'sample_data',
    purpose: 'Sample data from latest partition',
    sql: `SELECT * FROM ${tableName} 
          WHERE dt = (SELECT MAX(dt) FROM ${tableName})
          LIMIT ${limit}`
  })
};

// Allowlist validation (schema.table only; ignore CTEs)
export function validateQueryAgainstAllowlist(sql) {
  if (!sql) return { valid: false, error: 'Missing SQL' };
  const normalized = String(sql).toLowerCase();
  const refs = new Set();
  const regex = /([a-z_][a-z0-9_]*)\\.([a-z0-9_]+)/g;
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    refs.add(`${match[1]}.${match[2]}`);
  }
  const unauthorized = Array.from(refs).filter((ref) => !APPROVED_VIEWS[ref]);
  if (unauthorized.length > 0) {
    return { valid: false, error: `Unauthorized tables/views referenced: ${unauthorized.join(', ')}` };
  }
  return { valid: true, views_used: Array.from(refs) };
}
