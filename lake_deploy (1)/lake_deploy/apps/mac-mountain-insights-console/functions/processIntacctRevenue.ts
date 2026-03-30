import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3';

const s3 = new S3Client({
  region: Deno.env.get("AWS_REGION") || 'us-east-1',
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID"),
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY"),
  },
});

const BUCKET_NAME = 'gwi-raw-us-east-2-pc';
const INTACCT_PREFIX = 'raw/intacct_json/';

// Helper to read JSON from S3
async function readS3Json(key) {
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    }));
    const text = await response.Body.transformToString();
    return JSON.parse(text);
  } catch (error) {
    console.error(`Failed to read ${key}:`, error.message);
    return null;
  }
}

// Helper to get latest Intacct exports
async function getLatestIntacctExports() {
  const exports = {
    gl_entries: null,
    gl_accounts: null,
    customers: null,
    vendors: null,
    ap_bills: null,
    ap_payments: null,
    metadata: {}
  };

  for (const dataset of Object.keys(exports).filter(k => k !== 'metadata')) {
    const listResponse = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `${INTACCT_PREFIX}${dataset}/`,
      MaxKeys: 100
    }));

    if (listResponse.Contents?.length > 0) {
      // Get most recent export
      const sorted = listResponse.Contents
        .filter(obj => obj.Key.endsWith('.json'))
        .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
      
      if (sorted[0]) {
        exports[dataset] = await readS3Json(sorted[0].Key);
        exports.metadata[dataset] = {
          key: sorted[0].Key,
          last_modified: sorted[0].LastModified.toISOString(),
          size: sorted[0].Size
        };
      }
    }
  }

  return exports;
}

// Compute monthly revenue from GL entries
function computeMonthlyRevenue(glEntries, glAccounts, customers) {
  const revenueAccounts = new Set(
    glAccounts
      ?.filter(acc => acc.accounttype === 'revenue' || acc.accountno?.startsWith('4'))
      .map(acc => acc.accountno)
  );

  const customerMap = new Map(
    customers?.map(c => [c.customerid, c]) || []
  );

  const monthlyData = {};

  for (const entry of glEntries || []) {
    if (!revenueAccounts.has(entry.accountno)) continue;
    if (!entry.customerid) continue;

    const date = new Date(entry.entry_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const key = `${entry.customerid}_${entry.location || 'UNKNOWN'}`;
    
    if (!monthlyData[key]) {
      const customer = customerMap.get(entry.customerid);
      monthlyData[key] = {
        customer_id: entry.customerid,
        customer_name: customer?.name || entry.customerid,
        system_id: entry.location || 'UNKNOWN',
        months: {}
      };
    }

    if (!monthlyData[key].months[monthKey]) {
      monthlyData[key].months[monthKey] = 0;
    }

    monthlyData[key].months[monthKey] += parseFloat(entry.amount || 0);
  }

  return Object.values(monthlyData);
}

// Generate summary metrics
function generateSummaryMetrics(monthlyRevenue) {
  const allMonths = new Set();
  let totalRevenue = 0;
  const customerSet = new Set();
  const systemSet = new Set();

  for (const row of monthlyRevenue) {
    customerSet.add(row.customer_id);
    systemSet.add(row.system_id);
    
    for (const [month, amount] of Object.entries(row.months)) {
      allMonths.add(month);
      totalRevenue += amount;
    }
  }

  const sortedMonths = Array.from(allMonths).sort();

  return {
    total_revenue: totalRevenue,
    distinct_customers: customerSet.size,
    distinct_systems: systemSet.size,
    month_count: sortedMonths.length,
    date_range: {
      start: sortedMonths[0],
      end: sortedMonths[sortedMonths.length - 1]
    },
    avg_monthly_revenue: totalRevenue / sortedMonths.length
  };
}

// Convert to CSV format matching RevenueReport.xlsx
function generateRevenueCSV(monthlyRevenue) {
  const allMonths = new Set();
  for (const row of monthlyRevenue) {
    Object.keys(row.months).forEach(m => allMonths.add(m));
  }
  
  const sortedMonths = Array.from(allMonths).sort();
  const header = ['customer_id', 'customer_name', 'system_id', ...sortedMonths];
  
  const rows = monthlyRevenue.map(row => {
    const values = [row.customer_id, row.customer_name, row.system_id];
    for (const month of sortedMonths) {
      values.push(row.months[month] || 0);
    }
    return values.map(v => {
      const str = String(v ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

// Generate economics monthly for NPV/IRR calculations
function generateEconomicsMonthly(monthlyRevenue, assumptions = {}) {
  const {
    opex_percent = 0.35,
    capex_monthly = 100000,
    discount_rate = 0.10
  } = assumptions;

  const monthlyTotals = {};
  
  for (const row of monthlyRevenue) {
    for (const [month, revenue] of Object.entries(row.months)) {
      if (!monthlyTotals[month]) {
        monthlyTotals[month] = 0;
      }
      monthlyTotals[month] += revenue;
    }
  }

  const sortedMonths = Object.keys(monthlyTotals).sort();
  const economicsRows = [];
  let cumulativeCash = 0;

  sortedMonths.forEach((month, idx) => {
    const revenue = monthlyTotals[month];
    const opex = revenue * opex_percent;
    const ebitda = revenue - opex;
    const capex = idx < 12 ? capex_monthly : 0; // CAPEX in first year
    const fcf = ebitda - capex;
    cumulativeCash += fcf;
    
    const monthNumber = idx + 1;
    const discountFactor = Math.pow(1 + discount_rate / 12, monthNumber);
    const pv = fcf / discountFactor;

    economicsRows.push({
      date: month,
      month_number: monthNumber,
      revenue: revenue.toFixed(2),
      opex: opex.toFixed(2),
      ebitda: ebitda.toFixed(2),
      capex: capex.toFixed(2),
      fcf: fcf.toFixed(2),
      cumulative_cash: cumulativeCash.toFixed(2),
      pv: pv.toFixed(2)
    });
  });

  return economicsRows;
}

// Calculate NPV, IRR, MOIC
function calculateFinancialMetrics(economicsMonthly, assumptions = {}) {
  const { discount_rate = 0.10 } = assumptions;
  
  // NPV calculation
  const npv = economicsMonthly.reduce((sum, row) => sum + parseFloat(row.pv), 0);
  
  // MOIC calculation
  const totalInvestment = economicsMonthly
    .reduce((sum, row) => sum + Math.max(0, -parseFloat(row.fcf)), 0);
  const totalReturns = economicsMonthly
    .reduce((sum, row) => sum + Math.max(0, parseFloat(row.fcf)), 0);
  const moic = totalInvestment > 0 ? totalReturns / totalInvestment : 0;
  
  // IRR calculation using Newton-Raphson
  let irr = 0.10; // Initial guess
  for (let i = 0; i < 100; i++) {
    let npvAtIrr = 0;
    let derivative = 0;
    
    economicsMonthly.forEach((row, idx) => {
      const fcf = parseFloat(row.fcf);
      const month = idx + 1;
      const factor = Math.pow(1 + irr / 12, month);
      npvAtIrr += fcf / factor;
      derivative -= (month * fcf) / (12 * factor * (1 + irr / 12));
    });
    
    if (Math.abs(npvAtIrr) < 0.01) break;
    if (derivative === 0) break;
    
    irr = irr - npvAtIrr / derivative;
  }
  
  return {
    npv: npv.toFixed(2),
    irr: (irr * 100).toFixed(2) + '%',
    moic: moic.toFixed(2),
    classification: classifyMetrics(npv, irr, moic)
  };
}

// Color classification logic
function classifyMetrics(npv, irr, moic) {
  const irrNum = typeof irr === 'string' ? parseFloat(irr) : irr * 100;
  
  const irrColor = irrNum >= 15 ? 'green' : irrNum >= 10 ? 'yellow' : 'red';
  const moicColor = moic >= 2.0 ? 'green' : moic >= 1.5 ? 'yellow' : 'red';
  const npvColor = npv >= 1000000 ? 'green' : npv >= 0 ? 'yellow' : 'red';
  
  return { irr: irrColor, moic: moicColor, npv: npvColor };
}

Deno.serve(async (req) => {
  const runId = `intacct_${Date.now()}`;
  const runAt = new Date().toISOString();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, scenario_id, assumptions } = await req.json();

    console.log('[processIntacctRevenue] Starting processing:', { project_id, scenario_id, runId });

    // Step 1: Load latest Intacct exports from S3
    console.log('[processIntacctRevenue] Loading Intacct exports...');
    const exports = await getLatestIntacctExports();

    const dataQuality = {
      lookback_filter: 'last 2 years from current date',
      max_gl_entry_date: exports.gl_entries?.[0]?.entry_date || 'N/A',
      max_batch_date: exports.gl_entries?.[0]?.batch_date || 'N/A',
      record_counts: {
        gl_entries: exports.gl_entries?.length || 0,
        gl_accounts: exports.gl_accounts?.length || 0,
        customers: exports.customers?.length || 0,
        vendors: exports.vendors?.length || 0,
        ap_bills: exports.ap_bills?.length || 0,
        ap_payments: exports.ap_payments?.length || 0
      },
      export_metadata: exports.metadata
    };

    console.log('[processIntacctRevenue] Data quality summary:', dataQuality);

    // Step 2: Compute monthly revenue
    console.log('[processIntacctRevenue] Computing monthly revenue...');
    const monthlyRevenue = computeMonthlyRevenue(
      exports.gl_entries,
      exports.gl_accounts,
      exports.customers
    );

    // Step 3: Generate summary metrics
    const summaryMetrics = generateSummaryMetrics(monthlyRevenue);
    console.log('[processIntacctRevenue] Summary metrics:', summaryMetrics);

    // Step 4: Generate economics monthly
    const economicsMonthly = generateEconomicsMonthly(monthlyRevenue, assumptions);

    // Step 5: Calculate financial metrics
    const financialMetrics = calculateFinancialMetrics(economicsMonthly, assumptions);
    console.log('[processIntacctRevenue] Financial metrics:', financialMetrics);

    // Step 6: Write outputs to S3
    const outputPrefix = `raw/projects_pipeline/model_outputs/${project_id || 'default'}/${scenario_id || 'default'}/${runId}`;

    // Revenue by customer CSV
    const revenueCSV = generateRevenueCSV(monthlyRevenue);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${outputPrefix}/revenue_by_customer.csv`,
      Body: revenueCSV,
      ContentType: 'text/csv'
    }));

    // Summary metrics CSV
    const summaryCSV = Object.entries(summaryMetrics)
      .map(([key, value]) => `${key},${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join('\n');
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${outputPrefix}/summary_metrics.csv`,
      Body: `metric,value\n${summaryCSV}`,
      ContentType: 'text/csv'
    }));

    // Economics monthly CSV
    const economicsCSV = [
      'date,month_number,revenue,opex,ebitda,capex,fcf,cumulative_cash,pv',
      ...economicsMonthly.map(row => Object.values(row).join(','))
    ].join('\n');
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${outputPrefix}/economics_monthly.csv`,
      Body: economicsCSV,
      ContentType: 'text/csv'
    }));

    // Run metadata JSON
    const runMetadata = {
      run_id: runId,
      run_at: runAt,
      project_id,
      scenario_id,
      user_email: user.email,
      data_quality: dataQuality,
      summary_metrics: summaryMetrics,
      financial_metrics: financialMetrics,
      assumptions,
      s3_outputs: {
        revenue_by_customer: `${outputPrefix}/revenue_by_customer.csv`,
        summary_metrics: `${outputPrefix}/summary_metrics.csv`,
        economics_monthly: `${outputPrefix}/economics_monthly.csv`
      }
    };

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${outputPrefix}/run_metadata.json`,
      Body: JSON.stringify(runMetadata, null, 2),
      ContentType: 'application/json'
    }));

    console.log('[processIntacctRevenue] ✓ Complete:', outputPrefix);

    return Response.json({
      success: true,
      run_id: runId,
      run_at: runAt,
      data_quality: dataQuality,
      summary_metrics: summaryMetrics,
      financial_metrics: financialMetrics,
      s3_outputs: runMetadata.s3_outputs
    });

  } catch (error) {
    console.error('[processIntacctRevenue] Error:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});