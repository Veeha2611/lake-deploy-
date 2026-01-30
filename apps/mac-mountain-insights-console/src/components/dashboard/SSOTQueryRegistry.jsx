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
  
  // MRR & Revenue
  'curated_core.v_monthly_mrr_platt': 'Monthly MRR by customer/CRID - SSOT for revenue',
  'curated_core.v_monthly_mrr_by_segment': 'MRR rollups by segment',
  'curated_core.v_monthly_mrr_platt_movement_segmented': 'MRR movement with adds/churns',
  'curated_core.v_monthly_mrr_and_churn_summary': 'MRR and churn summary metrics',
  
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
  'curated_core.project_updates': 'Append-only project update log',
  
  // SSOT Tables
  'curated_ssot.deliverables': 'Deliverables SSOT (partitioned by dt)'
};

// Query templates with evidence tracking
export const QUERY_REGISTRY = {
  // Dashboard KPIs
  total_mrr: {
    id: 'total_mrr',
    name: 'Total MRR',
    description: 'Current month total MRR from all customers',
    sql: `WITH customer_month AS (
      SELECT
        period_month,
        customer_id,
        SUM(mrr_total) AS mrr_total_customer_month
      FROM curated_core.v_monthly_mrr_platt
      WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
      GROUP BY 1, 2
    )
    SELECT 
      SUM(mrr_total_customer_month) as total_mrr,
      COUNT(DISTINCT customer_id) as customer_count,
      MAX(period_month) as period_month
    FROM customer_month
    LIMIT 1`,
    views: ['curated_core.v_monthly_mrr_platt'],
    evidence_required: ['athena_query_execution_id', 'generated_sql', 'period_month']
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
    FROM curated_core.projects_enriched
    ORDER BY entity, project_name
    LIMIT 200`,
    views: ['curated_core.projects_enriched'],
    evidence_required: ['athena_query_execution_id', 'generated_sql']
  }
};

// Validate if a query uses only approved views
export function validateQueryAgainstAllowlist(sql) {
  const sqlLower = sql.toLowerCase();
  
  // Extract all FROM and JOIN table references
  const tablePattern = /(?:from|join)\s+([\w.]+)/gi;
  const matches = [...sql.matchAll(tablePattern)];
  const referencedTables = matches.map(m => m[1].toLowerCase().trim());
  
  const approvedViewsLower = Object.keys(APPROVED_VIEWS).map(v => v.toLowerCase());
  const unauthorizedTables = referencedTables.filter(t => 
    !approvedViewsLower.includes(t) && 
    !t.includes('information_schema') &&
    t !== 'dual'
  );
  
  if (unauthorizedTables.length > 0) {
    return {
      valid: false,
      error: `Unauthorized tables/views referenced: ${unauthorizedTables.join(', ')}`,
      hint: 'Only curated_ssot.* and curated_core.* views are approved. Never query raw.* or curated_raw.*'
    };
  }
  
  // Block raw/curated_raw access
  if (/\b(raw\.|curated_raw\.)/i.test(sql)) {
    return {
      valid: false,
      error: 'Raw data access prohibited',
      hint: 'Query must use curated_ssot.* or curated_core.* views only'
    };
  }
  
  return { valid: true };
}

// Get latest partition for a table
export function getLatestPartitionSQL(tableName) {
  return `SELECT MAX(dt) as latest_dt FROM ${tableName} LIMIT 1`;
}

// Self-diagnosis queries for empty results
export const DIAGNOSTIC_QUERIES = {
  verify_partition: (tableName) => ({
    id: 'verify_partition',
    purpose: 'Verify latest partition exists',
    sql: `SELECT MAX(dt) as latest_dt, COUNT(*) as row_count FROM ${tableName} LIMIT 1`
  }),
  
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