import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID"),
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY"),
  },
});

const BUCKET_NAME = 'gwi-raw-us-east-2-pc';

// Helper to create a step log entry
function createStepLog(stepName) {
  return {
    step_name: stepName,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_ms: null,
    generated_sql: null,
    athena_query_execution_id: null,
    row_count: null,
    s3_export_attempts: [],
    error: null
  };
}

// Helper to finalize a step log
function finalizeStepLog(step, success = true, error = null, extraData = {}) {
  step.ended_at = new Date().toISOString();
  step.duration_ms = new Date(step.ended_at).getTime() - new Date(step.started_at).getTime();
  if (error) {
    step.error = typeof error === 'string' ? error : (error.message || String(error));
    if (error.stack) {
      step.error += '\n\nStack trace:\n' + error.stack;
    }
  }
  Object.assign(step, extraData);
  return step;
}

// Calculate month-start dates from start_date to end_date
function deriveMonthWindow(start_date_exact, end_date_exact) {
  const startDate = new Date(start_date_exact);
  const endDate = new Date(end_date_exact);
  
  // Derive start_month and end_month (first day of month)
  const start_month = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end_month = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  
  // Build month columns (YYYY-MM format)
  const months = [];
  const current = new Date(start_month);
  
  while (current <= end_month) {
    months.push(current.toISOString().substring(0, 7)); // YYYY-MM
    current.setMonth(current.getMonth() + 1);
  }
  
  return {
    start_month: start_month.toISOString().split('T')[0],
    end_month: end_month.toISOString().split('T')[0],
    months
  };
}

// Build pivot SQL for monthly columns
function buildMonthlyPivotSQL(months, valueColumn = 'revenue_total', aggregateFunc = 'SUM') {
  return months.map(month => {
    const monthDate = `DATE '${month}-01'`;
    return `${aggregateFunc}(CASE WHEN period_month = ${monthDate} THEN ${valueColumn} ELSE 0 END) AS "${month}"`;
  }).join(',\n      ');
}

// Build count pivot SQL
function buildCountPivotSQL(months) {
  return months.map(month => {
    const monthDate = `DATE '${month}-01'`;
    return `COUNT(DISTINCT CASE WHEN period_month = ${monthDate} THEN customer_id END) AS "${month}"`;
  }).join(',\n      ');
}

// Helper to convert rows to CSV
function rowsToCSV(columns, rows) {
  const header = columns.join(',');
  const dataLines = rows.map(row => {
    const values = Array.isArray(row) ? row : Object.values(row);
    return values.map(v => {
      const str = String(v ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',');
  });
  return [header, ...dataLines].join('\n');
}

Deno.serve(async (req) => {
  const runStartTime = Date.now();
  const run_id = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const run_at = new Date().toISOString();
  
  // Initialize run log
  const runLog = {
    run_id,
    run_at,
    tab_name: 'all_tabs',
    request_url: req.url,
    http_status: null,
    rndr_id: req.headers.get('rndr-id') || null,
    cf_ray: req.headers.get('cf-ray') || null,
    user_email: null,
    input_params: null,
    window_alignment: null,
    steps: [],
    total_duration_ms: null,
    error: null
  };

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    runLog.user_email = user?.email || 'unknown';

    if (!user) {
      runLog.error = 'Unauthorized';
      runLog.http_status = 401;
      return Response.json({ error: 'Unauthorized', run_log: runLog }, { status: 401 });
    }

    // Access control
    const CAPITAL_COMMITTEE = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'];
    if (!CAPITAL_COMMITTEE.includes(user.email?.toLowerCase())) {
      runLog.error = 'Access restricted to Capital Committee members';
      runLog.http_status = 403;
      return Response.json({ 
        error: 'Access restricted to Capital Committee members',
        run_log: runLog
      }, { status: 403 });
    }

    const { 
      report_name, 
      start_date, 
      end_date, 
      include_id_count_checks = true,
      collapse_invoice_duplicates = false,
      debug_mode = false
    } = await req.json();

    runLog.input_params = {
      report_name,
      start_date,
      end_date,
      include_id_count_checks,
      collapse_invoice_duplicates,
      debug_mode
    };

    if (!report_name || !start_date || !end_date) {
      runLog.error = 'Missing required fields: report_name, start_date, end_date';
      runLog.http_status = 400;
      return Response.json({ 
        error: 'Missing required fields: report_name, start_date, end_date',
        run_log: runLog
      }, { status: 400 });
    }

    const s3_prefix = `raw/revenue_repro/${report_name}/${run_id}`;
    const log_s3_prefix = `raw/revenue_repro/run_logs/${report_name}/${run_id}`;

    // Derive month window
    const { start_month, end_month, months } = deriveMonthWindow(start_date, end_date);
    
    if (months.length === 0) {
      runLog.error = 'No months in range. Check Start Date and End Date.';
      runLog.http_status = 400;
      return Response.json({ 
        error: 'No months in range. Check Start Date and End Date.',
        run_log: runLog
      }, { status: 400 });
    }

    runLog.window_alignment = {
      invoice_window: { start: start_date, end: end_date },
      revenue_window: { start_month, end_month, months }
    };

    // Declare all result variables and column definitions at function scope
    let revenueReportRows = [];
    let revenueReportSQL = '';
    let revenueReportExecId = null;
    let revenueReportColumns = [];

    let revBySystemRows = [];
    let revBySystemSQL = '';
    let revBySystemExecId = null;
    let revBySystemColumns = [];

    let countPivotRows = [];
    let countPivotSQL = '';
    let countPivotExecId = null;
    let countPivotColumns = [];

    let invoiceDetailRows = [];
    let invoiceDetailSQL = '';
    let invoiceDetailExecId = null;
    let invoiceDetailColumns = [];
    let invoiceDetailPreview = [];

    let diagnostics = null;

    // Initialize column definitions after declarations
    revenueReportColumns = ['customer_id', 'customer_name', 'system_id', ...months];
    revBySystemColumns = ['system_id', ...months];
    countPivotColumns = ['system_id', ...months];
    invoiceDetailColumns = ['customer_id', 'system', 'invoice_id', 'invoice_date', 'product', 'total'];

    // ============================================
    // 1. Revenue by Customer (Monthly)
    // ============================================
    const revenueReportStep = createStepLog('RevenueReport');
    runLog.steps.push(revenueReportStep);

    revenueReportSQL = `
WITH revenue AS (
  SELECT
    customer_id,
    customer_name,
    system_id,
    period_month,
    revenue_total
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN DATE '${start_month}' AND DATE '${end_month}'
)
SELECT
  customer_id,
  customer_name,
  system_id,
  ${buildMonthlyPivotSQL(months)}
FROM revenue
GROUP BY
  customer_id,
  customer_name,
  system_id
ORDER BY
  customer_name;
    `.trim();

    revenueReportStep.generated_sql = revenueReportSQL;

    try {
      const revenueReportResponse = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: revenueReportSQL }
      });

      revenueReportRows = revenueReportResponse.data?.data_rows || [];
      revenueReportExecId = revenueReportResponse.data?.execution_id;

      finalizeStepLog(revenueReportStep, true, null, {
        athena_query_execution_id: revenueReportExecId,
        row_count: revenueReportRows.length
      });
    } catch (error) {
      finalizeStepLog(revenueReportStep, false, error);
      throw error;
    }

    // ============================================
    // 2. Revenue by System (Monthly)
    // ============================================
    const revBySystemStep = createStepLog('Revenue by System ID');
    runLog.steps.push(revBySystemStep);

    revBySystemSQL = `
WITH revenue AS (
  SELECT
    system_id,
    period_month,
    revenue_total
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN DATE '${start_month}' AND DATE '${end_month}'
)
SELECT
  system_id,
  ${buildMonthlyPivotSQL(months)}
FROM revenue
GROUP BY system_id
ORDER BY system_id;
    `.trim();

    revBySystemStep.generated_sql = revBySystemSQL;

    try {
      const revBySystemResponse = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: revBySystemSQL }
      });

      revBySystemRows = revBySystemResponse.data?.data_rows || [];
      revBySystemExecId = revBySystemResponse.data?.execution_id;

      finalizeStepLog(revBySystemStep, true, null, {
        athena_query_execution_id: revBySystemExecId,
        row_count: revBySystemRows.length
      });
    } catch (error) {
      finalizeStepLog(revBySystemStep, false, error);
      throw error;
    }

    // ============================================
    // 3. Customer Counts (Monthly)
    // ============================================
    const countPivotStep = createStepLog('Count Pivot');
    runLog.steps.push(countPivotStep);

    countPivotSQL = `
WITH base AS (
  SELECT DISTINCT
    customer_id,
    system_id,
    period_month
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN DATE '${start_month}' AND DATE '${end_month}'
)
SELECT
  system_id,
  ${buildCountPivotSQL(months)}
FROM base
GROUP BY system_id
ORDER BY system_id;
    `.trim();

    countPivotStep.generated_sql = countPivotSQL;

    try {
      const countPivotResponse = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: countPivotSQL }
      });

      countPivotRows = countPivotResponse.data?.data_rows || [];
      countPivotExecId = countPivotResponse.data?.execution_id;

      finalizeStepLog(countPivotStep, true, null, {
        athena_query_execution_id: countPivotExecId,
        row_count: countPivotRows.length
      });
    } catch (error) {
      finalizeStepLog(countPivotStep, false, error);
      throw error;
    }

    // ============================================
    // 4. Invoice Detail (Line Items)
    // ============================================
    const invoiceDetailStep = createStepLog('Invoice Detail');
    runLog.steps.push(invoiceDetailStep);

    if (collapse_invoice_duplicates) {
      invoiceDetailSQL = `
SELECT
  customer_id,
  system,
  invoice_id,
  invoice_date,
  product,
  SUM(total) AS total
FROM curated_core.invoice_line_item_repro_v1
WHERE invoice_date >= DATE '${start_date}'
  AND invoice_date < DATE '${end_date}'
GROUP BY
  customer_id,
  system,
  invoice_id,
  invoice_date,
  product
ORDER BY
  invoice_date,
  customer_id,
  system,
  invoice_id,
  product
LIMIT 200000;
      `.trim();
    } else {
      invoiceDetailSQL = `
SELECT
  customer_id,
  system,
  invoice_id,
  invoice_date,
  product,
  total
FROM curated_core.invoice_line_item_repro_v1
WHERE invoice_date >= DATE '${start_date}'
  AND invoice_date < DATE '${end_date}'
ORDER BY
  invoice_date,
  customer_id,
  system,
  invoice_id,
  product
LIMIT 200000;
      `.trim();
    }

    invoiceDetailStep.generated_sql = invoiceDetailSQL;

    try {
      const invoiceDetailResponse = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: invoiceDetailSQL }
      });

      invoiceDetailRows = invoiceDetailResponse.data?.data_rows || [];
      invoiceDetailExecId = invoiceDetailResponse.data?.execution_id;

      invoiceDetailPreview = invoiceDetailRows.slice(0, 10).map(row => {
        const values = Array.isArray(row) ? row : Object.values(row);
        return {
          customer_id: values[0],
          system: values[1],
          invoice_id: values[2],
          invoice_date: values[3],
          product: values[4],
          total: values[5]
        };
      });

      finalizeStepLog(invoiceDetailStep, true, null, {
        athena_query_execution_id: invoiceDetailExecId,
        row_count: invoiceDetailRows.length
      });
    } catch (error) {
      finalizeStepLog(invoiceDetailStep, false, error);
      throw error;
    }

    // ============================================
    // 5. Diagnostics (3 separate queries)
    // ============================================
    if (include_id_count_checks) {
      const diagnosticsStep = createStepLog('Diagnostics');
      runLog.steps.push(diagnosticsStep);

      const customerSpineSQL = `
SELECT
  COUNT(*) AS rows_total,
  COUNT(DISTINCT customer_id) AS distinct_plat_ids
FROM curated_core.dim_customer_platt
LIMIT 1;
      `.trim();

      const allDiagnosticsSQL = `${customerSpineSQL}\n\n-- NEXT QUERY --\n\nSELECT\n  COUNT(*) AS rows_total,\n  COUNT(DISTINCT id) AS distinct_plat_ids\nFROM raw_platt.customer\nLIMIT 1;\n\n-- NEXT QUERY --\n\nSELECT\n  COUNT(DISTINCT customer_id) AS distinct_invoiced_customers\nFROM curated_core.invoice_line_item_repro_v1\nWHERE invoice_date >= DATE '${start_date}'\n  AND invoice_date < DATE '${end_date}';`;

      diagnosticsStep.generated_sql = allDiagnosticsSQL;

      let customerSpineValues = [0, 0];
      let customerSpineExecId = null;

      try {
        const customerSpineResponse = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql: customerSpineSQL }
        });

        const customerSpineRow = customerSpineResponse.data?.data_rows?.[0];
        customerSpineValues = Array.isArray(customerSpineRow) ? customerSpineRow : Object.values(customerSpineRow || {});
        customerSpineExecId = customerSpineResponse.data?.execution_id;
      } catch (error) {
        finalizeStepLog(diagnosticsStep, false, error);
        throw error;
      }

      const rawPlattSQL = `
SELECT
  COUNT(*) AS rows_total,
  COUNT(DISTINCT id) AS distinct_plat_ids
FROM raw_platt.customer
LIMIT 1;
      `.trim();

      let rawPlattValues = [0, 0];
      let rawPlattExecId = null;

      try {
        const rawPlattResponse = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql: rawPlattSQL }
        });

        const rawPlattRow = rawPlattResponse.data?.data_rows?.[0];
        rawPlattValues = Array.isArray(rawPlattRow) ? rawPlattRow : Object.values(rawPlattRow || {});
        rawPlattExecId = rawPlattResponse.data?.execution_id;
      } catch (error) {
        finalizeStepLog(diagnosticsStep, false, error);
        throw error;
      }

      let invoicedCustomersValue = 0;
      let invoicedCustomersExecId = null;

      const invoicedCustomersSQL = `
SELECT
  COUNT(DISTINCT customer_id) AS distinct_invoiced_customers
FROM curated_core.invoice_line_item_repro_v1
WHERE invoice_date >= DATE '${start_date}'
  AND invoice_date < DATE '${end_date}';
      `.trim();

      try {
        const invoicedCustomersResponse = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql: invoicedCustomersSQL }
        });

        const invoicedCustomersRow = invoicedCustomersResponse.data?.data_rows?.[0];
        invoicedCustomersValue = Array.isArray(invoicedCustomersRow) 
          ? invoicedCustomersRow[0] 
          : Object.values(invoicedCustomersRow || {})[0];
        invoicedCustomersExecId = invoicedCustomersResponse.data?.execution_id;

        finalizeStepLog(diagnosticsStep, true, null, {
          athena_query_execution_id: customerSpineExecId,
          row_count: 3
        });
      } catch (error) {
        finalizeStepLog(diagnosticsStep, false, error);
        throw error;
      }

      diagnostics = {
        customer_spine: {
          rows_total: customerSpineValues[0],
          distinct_plat_ids: customerSpineValues[1],
          execution_id: customerSpineExecId
        },
        raw_platt: {
          rows_total: rawPlattValues[0],
          distinct_plat_ids: rawPlattValues[1],
          execution_id: rawPlattExecId
        },
        distinct_invoiced_customers: {
          count: invoicedCustomersValue,
          execution_id: invoicedCustomersExecId
        }
      };
    }

    // ============================================
    // Write CSV artifacts to S3
    // ============================================
    const s3ExportStep = createStepLog('S3 Export');
    runLog.steps.push(s3ExportStep);

    try {
      // Revenue by Customer CSV
      const revenueReportCSV = rowsToCSV(revenueReportColumns, revenueReportRows);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${s3_prefix}/revenue_by_customer.csv`,
        Body: revenueReportCSV,
        ContentType: 'text/csv'
      }));
      s3ExportStep.s3_export_attempts.push({
        key: `${s3_prefix}/revenue_by_customer.csv`,
        bucket: BUCKET_NAME,
        success: true,
        error: null
      });

      // Revenue by System CSV
      const revBySystemCSV = rowsToCSV(revBySystemColumns, revBySystemRows);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${s3_prefix}/revenue_by_system.csv`,
        Body: revBySystemCSV,
        ContentType: 'text/csv'
      }));
      s3ExportStep.s3_export_attempts.push({
        key: `${s3_prefix}/revenue_by_system.csv`,
        bucket: BUCKET_NAME,
        success: true,
        error: null
      });

      // Customer Counts CSV
      const countPivotCSV = rowsToCSV(countPivotColumns, countPivotRows);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${s3_prefix}/customer_counts.csv`,
        Body: countPivotCSV,
        ContentType: 'text/csv'
      }));
      s3ExportStep.s3_export_attempts.push({
        key: `${s3_prefix}/customer_counts.csv`,
        bucket: BUCKET_NAME,
        success: true,
        error: null
      });

      // Invoice Detail CSV
      const invoiceDetailCSV = rowsToCSV(invoiceDetailColumns, invoiceDetailRows);
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${s3_prefix}/${collapse_invoice_duplicates ? 'invoice_detail_collapsed.csv' : 'invoice_detail.csv'}`,
        Body: invoiceDetailCSV,
        ContentType: 'text/csv'
      }));
      s3ExportStep.s3_export_attempts.push({
        key: `${s3_prefix}/${collapse_invoice_duplicates ? 'invoice_detail_collapsed.csv' : 'invoice_detail.csv'}`,
        bucket: BUCKET_NAME,
        success: true,
        error: null
      });

      // Diagnostics CSVs (if applicable)
      if (diagnostics) {
        const spineCSV = `rows_total,distinct_plat_ids\n${diagnostics.customer_spine.rows_total},${diagnostics.customer_spine.distinct_plat_ids}`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${s3_prefix}/diagnostics_plat_ids_spine.csv`,
          Body: spineCSV,
          ContentType: 'text/csv'
        }));
        s3ExportStep.s3_export_attempts.push({
          key: `${s3_prefix}/diagnostics_plat_ids_spine.csv`,
          bucket: BUCKET_NAME,
          success: true,
          error: null
        });

        const rawCSV = `rows_total,distinct_plat_ids\n${diagnostics.raw_platt.rows_total},${diagnostics.raw_platt.distinct_plat_ids}`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${s3_prefix}/diagnostics_plat_ids_raw.csv`,
          Body: rawCSV,
          ContentType: 'text/csv'
        }));
        s3ExportStep.s3_export_attempts.push({
          key: `${s3_prefix}/diagnostics_plat_ids_raw.csv`,
          bucket: BUCKET_NAME,
          success: true,
          error: null
        });

        const invoicedCSV = `distinct_invoiced_customers\n${diagnostics.distinct_invoiced_customers.count}`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: `${s3_prefix}/diagnostics_distinct_invoiced_customers.csv`,
          Body: invoicedCSV,
          ContentType: 'text/csv'
        }));
        s3ExportStep.s3_export_attempts.push({
          key: `${s3_prefix}/diagnostics_distinct_invoiced_customers.csv`,
          bucket: BUCKET_NAME,
          success: true,
          error: null
        });
      }

      finalizeStepLog(s3ExportStep, true);
    } catch (error) {
      finalizeStepLog(s3ExportStep, false, error);
      throw error;
    }

    // ============================================
    // Finalize run log and save to S3
    // ============================================
    runLog.total_duration_ms = Date.now() - runStartTime;
    runLog.http_status = 200;

    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${log_s3_prefix}/run_log.json`,
        Body: JSON.stringify(runLog, null, 2),
        ContentType: 'application/json'
      }));
    } catch (error) {
      console.error('Failed to save run log to S3:', error);
    }

    // ============================================
    // Return unified response
    // ============================================
    return Response.json({
      success: true,
      run_id,
      run_at,
      report_name,
      window_alignment: runLog.window_alignment,
      revenue_report: {
        row_count: revenueReportRows.length,
        columns: revenueReportColumns,
        evidence: {
          athena_query_execution_id: revenueReportExecId,
          generated_sql: revenueReportSQL
        },
        s3_artifacts: {
          csv: `${s3_prefix}/revenue_by_customer.csv`
        }
      },
      revenue_by_system: {
        row_count: revBySystemRows.length,
        columns: revBySystemColumns,
        evidence: {
          athena_query_execution_id: revBySystemExecId,
          generated_sql: revBySystemSQL
        },
        s3_artifacts: {
          csv: `${s3_prefix}/revenue_by_system.csv`
        }
      },
      count_pivot: {
        row_count: countPivotRows.length,
        columns: countPivotColumns,
        evidence: {
          athena_query_execution_id: countPivotExecId,
          generated_sql: countPivotSQL
        },
        s3_artifacts: {
          csv: `${s3_prefix}/customer_counts.csv`
        }
      },
      invoice_detail: {
        row_count: invoiceDetailRows.length,
        columns: invoiceDetailColumns,
        preview: invoiceDetailPreview,
        mode: collapse_invoice_duplicates ? 'collapsed' : 'default',
        evidence: {
          athena_query_execution_id: invoiceDetailExecId,
          generated_sql: invoiceDetailSQL
        },
        s3_artifacts: {
          csv: `${s3_prefix}/${collapse_invoice_duplicates ? 'invoice_detail_collapsed.csv' : 'invoice_detail.csv'}`
        }
      },
      diagnostics: diagnostics,
      run_log: runLog
    });

  } catch (error) {
    console.error('Report generation error:', error);
    
    // Finalize error in run log
    runLog.error = error.message;
    if (error.stack) {
      runLog.error += '\n\nStack trace:\n' + error.stack;
    }
    runLog.total_duration_ms = Date.now() - runStartTime;
    runLog.http_status = 500;

    // Always try to save error logs to S3
    try {
      const errorLogPrefix = runLog.input_params?.report_name 
        ? `raw/revenue_repro/run_logs/${runLog.input_params.report_name}/${run_id}`
        : `raw/revenue_repro/run_logs/unknown/${run_id}`;
      
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${errorLogPrefix}/run_log.json`,
        Body: JSON.stringify(runLog, null, 2),
        ContentType: 'application/json'
      }));
    } catch (s3Error) {
      console.error('Failed to save error log to S3:', s3Error);
    }

    return Response.json({ 
      success: false,
      error: error.message,
      run_log: runLog
    }, { status: 500 });
  }
});