const pad2 = (value) => String(value).padStart(2, '0');

const isoDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const monthLabel = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

const buildDailySeries = (days = 30, base = 40) => {
  const rows = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wave = Math.sin(i / 4) * 6;
    const count = Math.max(6, Math.round(base + wave + (i % 7)));
    rows.push([isoDate(d), count]);
  }
  return rows;
};

const buildMonthlySeries = (months = 12, base = 1100000) => {
  const rows = [];
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1));
  for (let i = 0; i < months; i += 1) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    const growth = base + (i * 25000);
    const churn = Math.round((Math.sin(i / 3) * 0.02 + 0.01) * growth);
    rows.push([monthLabel(d), growth, -Math.abs(churn)]);
  }
  return rows;
};

const buildBandDistribution = () => ([
  ['A', 120, 480000],
  ['B', 95, 310000],
  ['C', 70, 210000],
  ['D', 35, 90000],
  ['E', 18, 42000]
]);

const buildTicketBurden = () => ([
  ['0', 82, 0],
  ['1-5', 146, 430],
  ['6-20', 61, 720],
  ['20+', 18, 540]
]);

const buildBucketSummary = () => ([
  ['owned_fttp', 410, 220, 620000, 2818.18],
  ['contracted_fttp', 190, 140, 360000, 2571.43],
  ['clec_business', 95, 80, 120000, 1500.0]
]);

const buildProjects = () => ([
  ['P-1001', 'Mac Mountain', 'Summit Ridge', 'FTTP', 'NY', 'Build', 'High', 'Alex', '60%', 'Investor A', 'Phase 1'],
  ['P-1002', 'Mac Mountain', 'Pine Valley', 'FTTP', 'PA', 'Design', 'Medium', 'Jordan', '55%', 'Investor B', 'Permitting'],
  ['P-1003', 'Mac Mountain', 'River Bend', 'CLEC', 'OH', 'Active', 'High', 'Casey', '40%', 'Investor C', 'Launch']
]);

const buildRawTickets = () => ({
  columns: [
    'ticket_number',
    'customer_name',
    'customer_display_name',
    'service_location_city',
    'service_location_state',
    'status',
    'type',
    'priority',
    'service_area',
    'operations_code',
    'equipment_name',
    'estimated_arrival_time',
    'work_done_preview',
    'case_or_ticket_number',
    'created_time'
  ],
  data_rows: [
    ['ST-10021', 'North Hills ISP', 'North Hills', 'Scranton', 'PA', 'Open', 'Outage', 'High', 'NE', 'OPS-1', 'OLT-3', '2026-02-06 14:00', 'Investigating fiber cut', 'CASE-88', '2026-02-06'],
    ['ST-10022', 'River Valley', 'River Valley', 'Erie', 'PA', 'In Progress', 'Install', 'Medium', 'NE', 'OPS-2', 'ONT-7', '2026-02-06 16:30', 'Technician dispatched', 'CASE-89', '2026-02-06'],
    ['ST-10023', 'Pine Valley Co', 'Pine Valley', 'State College', 'PA', 'Open', 'Performance', 'Low', 'NE', 'OPS-2', 'Router-2', '2026-02-07 09:00', 'Monitoring latency', 'CASE-90', '2026-02-05'],
    ['ST-10024', 'Summit Ridge', 'Summit Ridge', 'Buffalo', 'NY', 'Resolved', 'Outage', 'High', 'NE', 'OPS-3', 'OLT-1', '2026-02-05 11:30', 'Splice completed', 'CASE-91', '2026-02-04'],
    ['ST-10025', 'Lakeview LLC', 'Lakeview', 'Pittsburgh', 'PA', 'Open', 'Billing', 'Low', 'NE', 'OPS-1', 'N/A', '2026-02-07 10:15', 'Billing review', 'CASE-92', '2026-02-05']
  ]
});

const buildNetworkHealth = () => ({
  columns: ['network', 'network_type', 'customer_type', 'passings', 'subscriptions', 'arpu', 'mrr'],
  data_rows: [
    ['Summit Ridge', 'Owned FTTP', 'Owned Customer', 4200, 1620, 62.5, 101250],
    ['Pine Valley', 'Contracted', 'Contracted Customer', 3100, 980, 54.2, 53100],
    ['River Bend', 'CLEC', 'Owned Customer', 2200, 660, 48.8, 32200],
    ['North Hills', 'Owned FTTP', 'Owned Customer', 3800, 1450, 58.9, 85400]
  ]
});

const buildGLDiscovery = () => ({
  columns: ['table_schema', 'table_name'],
  data_rows: [
    ['curated_core', 'v_platt_gl_revenue_2025_12'],
    ['curated_core', 'v_platt_gl_revenue_by_customer_2025_12'],
    ['curated_core', 'v_platt_gl_revenue']
  ]
});

const buildGLSummary = () => ({
  columns: ['period_month', 'gl_account', 'amount'],
  data_rows: [
    ['2025-12', '4000-Revenue', 420000],
    ['2025-12', '4010-Voice', 85000],
    ['2025-12', '4020-Data', 125000]
  ]
});

const buildAtRiskRows = () => ([
  ['C-1001', 'North Hills ISP', 'D_PRICE_PLUS_SIMPLIFY', -12.4],
  ['C-1002', 'River Valley', 'E_EXIT_OR_RESCOPE', -18.2],
  ['C-1003', 'Pine Valley Co', 'D_PRICE_PLUS_SIMPLIFY', -9.1],
  ['C-1004', 'Summit Ridge', 'E_EXIT_OR_RESCOPE', -22.7],
  ['C-1005', 'Lakeview LLC', 'D_PRICE_PLUS_SIMPLIFY', -11.3]
]);

const buildHostedPbx = () => ({
  columns: ['customer_id', 'customer_name', 'mrr_uplift_to_50', 'current_mrr'],
  data_rows: [
    ['C-2001', 'Summit Ridge', 2500, 1800],
    ['C-2002', 'North Hills ISP', 2100, 1500],
    ['C-2003', 'Pine Valley Co', 1500, 1200]
  ]
});

const buildWorstEBand = () => ({
  columns: ['customer_id', 'customer_name', 'total_mrr', 'margin_pct'],
  data_rows: [
    ['C-3101', 'EdgeNet', 3200, -28.4],
    ['C-3102', 'Atlas Fiber', 2800, -24.1],
    ['C-3103', 'FrontierLink', 2600, -21.7]
  ]
});

const buildAccountMovement = () => ({
  columns: ['period_month', 'segment', 'churned_accounts', 'gross_adds'],
  data_rows: [
    ['2025-12', 'SMB', 12, 18],
    ['2025-12', 'Enterprise', 3, 5],
    ['2025-11', 'SMB', 10, 14],
    ['2025-11', 'Enterprise', 2, 4]
  ]
});

const buildMrrSummary = () => ({
  columns: ['period_month', 'ending_mrr', 'mrr_churn'],
  data_rows: buildMonthlySeries(12, 980000)
});

const buildFy2025Monthly = () => ({
  columns: ['period_month', 'total_mrr'],
  data_rows: buildMonthlySeries(12, 920000).map(row => [row[0], row[1]])
});

const buildFy2025TopCustomers = () => ({
  columns: ['customer_id', 'customer_name', 'fy2025_mrr_total'],
  data_rows: [
    ['C-5001', 'Summit Ridge', 220000],
    ['C-5002', 'North Hills ISP', 180000],
    ['C-5003', 'River Valley', 150000]
  ]
});

const buildDataFreshness = () => ({
  columns: ['latest_dt', 'ssot_count', 'exception_count'],
  data_rows: [['2025-12-01', 145220, 0]]
});

const buildCountOnly = () => ({
  columns: ['ssot_count', 'exception_count'],
  data_rows: [[820, 0]]
});

const buildActiveCustomers = () => ({
  columns: ['active_customers'],
  data_rows: [[468]]
});

export function getMockData({ queryId, sql } = {}) {
  const key = (queryId || '').toLowerCase();
  const sqlLower = (sql || '').toLowerCase();

  const registry = {
    total_mrr: { columns: ['total_mrr', 'customer_count', 'period_month'], data_rows: [[1245000, 342, '2025-12-01']] },
    total_mrr_detail: { columns: ['total_mrr', 'customer_count'], data_rows: [[1245000, 342]] },
    active_accounts: { columns: ['customers_with_mrr', 'period_month'], data_rows: [[452, '2025-12-01']] },
    active_accounts_detail: { columns: ['customers_total', 'customers_active', 'customers_with_mrr'], data_rows: [[520, 480, 452]] },
    active_customers: { columns: ['customers_with_mrr'], data_rows: [[452]] },
    at_risk_customers: { columns: ['customer_id', 'customer_name', 'action_band', 'fully_loaded_margin_pct', 'total_mrr'], data_rows: buildAtRiskRows().map(row => [...row, 4200]) },
    at_risk_detail: { columns: ['customer_id', 'customer_name', 'action_band', 'fully_loaded_margin_pct'], data_rows: buildAtRiskRows() },
    health_score_detail: { columns: ['action_band', 'count', 'mrr'], data_rows: buildBandDistribution().map(row => [row[0], row[1], row[2]]) },
    band_distribution: { columns: ['action_band', 'customer_count', 'total_mrr'], data_rows: buildBandDistribution() },
    ae_band_distribution: { columns: ['action_band', 'customer_count', 'total_mrr'], data_rows: buildBandDistribution() },
    ticket_burden_banded: { columns: ['ticket_burden_band', 'customer_count', 'total_tickets'], data_rows: buildTicketBurden() },
    ticket_burden_lake: { columns: ['customer_id', 'customer_name', 'ticket_count_lake'], data_rows: [['C-1001', 'Summit Ridge', 28], ['C-1002', 'North Hills ISP', 24], ['C-1003', 'River Valley', 18]] },
    ticket_trend: { columns: ['ticket_date', 'ticket_count'], data_rows: buildDailySeries(30, 36) },
    ticket_trend_90d: { columns: ['ticket_date', 'ticket_count'], data_rows: buildDailySeries(30, 36) },
    raw_tickets_cci: buildRawTickets(),
    bucket_summary: { columns: ['bucket', 'fsa_count', 'customer_count', 'total_mrr', 'revenue_per_customer'], data_rows: buildBucketSummary() },
    projects_pipeline: { columns: ['project_id', 'entity', 'project_name', 'project_type', 'state', 'stage', 'priority', 'owner', 'partner_share_raw', 'investor_label', 'notes'], data_rows: buildProjects() },
    mrr_summary: buildMrrSummary(),
    mrr_summary_12m: buildMrrSummary(),
    account_movement: buildAccountMovement(),
    account_movement_6m: buildAccountMovement(),
    network_health: buildNetworkHealth(),
    glclosepack_discovery: buildGLDiscovery(),
    hosted_pbx: buildHostedPbx(),
    worst_e_band: buildWorstEBand()
  };

  if (registry[key]) {
    return registry[key];
  }

  if (sqlLower.includes('v_monthly_mrr_and_churn_summary')) {
    return buildMrrSummary();
  }

  if (sqlLower.includes('v_monthly_mrr_platt') && sqlLower.includes('sum(mrr_total')) {
    return { columns: ['total_mrr', 'customer_count'], data_rows: [[1245000, 342]] };
  }

  if (sqlLower.includes('v_customer_fully_loaded_margin_banded') && sqlLower.includes('action_band')) {
    return { columns: ['action_band', 'count', 'mrr'], data_rows: buildBandDistribution().map(row => [row[0], row[1], row[2]]) };
  }

  if (sqlLower.includes('v_ticket_burden_banded')) {
    return { columns: ['ticket_burden_band', 'customer_count', 'total_tickets'], data_rows: buildTicketBurden() };
  }

  if (sqlLower.includes('v_ticket_burden_lake')) {
    return { columns: ['customer_id', 'customer_name', 'ticket_count_lake'], data_rows: [['C-1001', 'Summit Ridge', 28]] };
  }

  if (sqlLower.includes('v_cci_tickets_clean') && sqlLower.includes('ticket_date')) {
    return { columns: ['ticket_date', 'ticket_count'], data_rows: buildDailySeries(30, 36) };
  }

  if (sqlLower.includes('v_cci_tickets_clean')) {
    return buildRawTickets();
  }

  if (sqlLower.includes('projects_enriched')) {
    return { columns: ['project_id', 'entity', 'project_name', 'project_type', 'state', 'stage', 'priority', 'owner', 'partner_share_raw', 'investor_label', 'notes'], data_rows: buildProjects() };
  }

  if (sqlLower.includes('information_schema.tables')) {
    return buildGLDiscovery();
  }

  if (sqlLower.includes('v_platt_gl_revenue')) {
    return buildGLSummary();
  }

  if (sqlLower.includes('count(*)') && sqlLower.includes('exception_count')) {
    return buildCountOnly();
  }

  if (sqlLower.includes('count(*) as active_customers')) {
    return buildActiveCustomers();
  }

  return { columns: [], data_rows: [] };
}
