import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const AUTHORIZED_EMAILS = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'];
    if (!AUTHORIZED_EMAILS.includes(user.email?.toLowerCase())) {
      return Response.json({ 
        error: 'Access denied - Patch only', 
        user_email: user.email 
      }, { status: 403 });
    }

    const { start_month, end_month, export_name } = await req.json();

    if (!start_month || !end_month) {
      return Response.json({ 
        error: 'Missing required parameters: start_month, end_month' 
      }, { status: 400 });
    }

    // Generate month list
    const startDate = new Date(start_month);
    const endDate = new Date(end_month);
    const months = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    // Build CASE statements for each month
    const caseClauses = months.map(month => {
      const monthDate = `${month}-01`;
      return `CAST(ROUND(SUM(CASE WHEN period_month = DATE '${monthDate}' THEN revenue_total ELSE 0 END), 2) AS DECIMAL(12,2)) AS "${month}"`;
    }).join(',\n  ');

    const sql = `
WITH base AS (
  SELECT
    gwi_system,
    period_month,
    revenue_total
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN DATE '${start_month}' AND DATE '${end_month}'
)
SELECT
  gwi_system AS system_id,
  ${caseClauses}
FROM base
GROUP BY gwi_system
ORDER BY gwi_system
LIMIT 200000;
    `.trim();

    console.log('🔍 RevenueBySystem SQL:', sql);

    const queryResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Execute this SQL query via the Query Layer and return the results:\n\n${sql}`,
      add_context_from_internet: false
    });

    const aiResponse = queryResponse;
    
    // Build CSV
    const columns = ['system_id', ...months];
    let csv = columns.join(',') + '\n';
    
    if (aiResponse.data_rows && aiResponse.data_rows.length > 0) {
      aiResponse.data_rows.forEach(row => {
        const rowData = Array.isArray(row) ? row : Object.values(row);
        csv += rowData.map(v => v === null ? '' : String(v)).join(',') + '\n';
      });
    }

    // Upload to S3
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${export_name || 'revenue_by_system'}_${timestamp}.csv`;
    
    const uploadResponse = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new Blob([csv], { type: 'text/csv' })
    });

    const s3Key = uploadResponse.file_url;

    // Create ReportRun entity
    await base44.asServiceRole.entities.ReportRun.create({
      report_name: export_name || 'RevenueBySystem',
      report_mode: 'RevenueBySystem',
      date_range: { start_month, end_month },
      run_at: new Date().toISOString(),
      evidence: {
        generated_sql: sql,
        athena_query_execution_id: aiResponse.athena_query_execution_id || 'N/A'
      },
      result_summary_json: {
        rows_returned: aiResponse.data_rows?.length || 0,
        months_included: months
      },
      s3_artifacts: {
        csv: s3Key
      }
    });

    return Response.json({
      success: true,
      columns,
      data_rows: aiResponse.data_rows || [],
      row_count: aiResponse.data_rows?.length || 0,
      evidence: {
        generated_sql: sql,
        athena_query_execution_id: aiResponse.athena_query_execution_id || 'N/A'
      },
      s3_artifacts: {
        csv: s3Key
      }
    });

  } catch (error) {
    console.error('❌ runRevenueBySystem error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});