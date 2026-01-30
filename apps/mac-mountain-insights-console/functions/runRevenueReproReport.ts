import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      report_name,
      report_mode,
      plat_id_definition = 'customer_spine',
      date_range,
      filters = {},
      comparison_data = null
    } = body;

    if (!report_name || !report_mode || !date_range?.start_month || !date_range.end_month) {
      return Response.json({
        success: false,
        error: 'Missing required fields: report_name, report_mode, date_range.start_month, date_range.end_month'
      }, { status: 400 });
    }

    const run_id = `run_${Date.now()}`;
    const run_at = new Date().toISOString();
    const evidence = {
      query_executions: [],
      generated_sql: [],
      definition_used: plat_id_definition
    };

    // Configure S3
    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
    const bucket = 'gwi-raw-us-east-2-pc';
    const s3Prefix = `raw/projects_pipeline/runner_reports/${report_name.replace(/[^a-zA-Z0-9_-]/g, '_')}/${run_id}/`;

    // Step 1: Get Total Plat IDs using selected definition
    let plat_ids_result = null;
    const plat_ids_sql = plat_id_definition === 'customer_spine'
      ? `SELECT COUNT(*) AS rows_total, COUNT(DISTINCT customer_id) AS distinct_plat_ids FROM curated_core.dim_customer_platt LIMIT 1`
      : `SELECT COUNT(*) AS rows_total, COUNT(DISTINCT id) AS distinct_plat_ids FROM raw_platt.customer LIMIT 1`;

    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: plat_ids_sql }
      });

      if (response.data.ok === false || response.data.error) {
        return Response.json({
          success: false,
          error: `Plat IDs query failed: ${response.data.error}`,
          evidence: {
            sql: plat_ids_sql,
            athena_query_execution_id: response.data.athena_query_execution_id,
            error: response.data.error
          }
        });
      }

      plat_ids_result = {
        rows: response.data.data_rows,
        execution_id: response.data.athena_query_execution_id
      };

      evidence.query_executions.push(response.data.athena_query_execution_id);
      evidence.generated_sql.push({ purpose: 'Total Plat IDs', sql: plat_ids_sql });
    } catch (error) {
      return Response.json({
        success: false,
        error: `Plat IDs query exception: ${error.message}`,
        evidence: { sql: plat_ids_sql }
      });
    }

    // Step 2: Monthly Revenue Query
    const { start_month, end_month } = date_range;
    
    // Discover columns first
    const discoverySql = `SHOW COLUMNS FROM curated_core.v_monthly_mrr_platt`;
    let columns = [];
    
    try {
      const discoveryResponse = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: discoverySql }
      });
      
      columns = discoveryResponse.data?.data_rows?.map(row => {
        const vals = Array.isArray(row) ? row : Object.values(row);
        return vals[0];
      }) || [];
      
      evidence.generated_sql.push({ purpose: 'Column Discovery', sql: discoverySql });
    } catch (error) {
      console.error('Column discovery failed:', error);
    }

    // Build monthly revenue query
    const revenueSql = `
      SELECT
        period_month,
        customer_id,
        mrr_total
      FROM curated_core.v_monthly_mrr_platt
      WHERE period_month >= DATE '${start_month}'
        AND period_month <= DATE '${end_month}'
      ORDER BY period_month DESC, customer_id
      LIMIT 10000
    `;

    let revenue_result = null;
    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: revenueSql }
      });

      if (response.data.ok === false || response.data.error) {
        return Response.json({
          success: false,
          error: `Revenue query failed: ${response.data.error}`,
          evidence: {
            sql: revenueSql,
            athena_query_execution_id: response.data.athena_query_execution_id,
            error: response.data.error
          }
        });
      }

      revenue_result = {
        rows: response.data.data_rows || [],
        columns: response.data.columns || [],
        execution_id: response.data.athena_query_execution_id
      };

      evidence.query_executions.push(response.data.athena_query_execution_id);
      evidence.generated_sql.push({ purpose: 'Monthly Revenue Detail', sql: revenueSql });
    } catch (error) {
      return Response.json({
        success: false,
        error: `Revenue query exception: ${error.message}`,
        evidence: { sql: revenueSql }
      });
    }

    // Step 3: Compute summary, detail, and trailing 3-month
    const summary = [];
    const detail = revenue_result.rows.slice(0, 500);
    
    const monthlyGroups = revenue_result.rows.reduce((acc, row) => {
      const values = Array.isArray(row) ? row : Object.values(row);
      const month = values[0];
      const customerId = values[1];
      const mrr = Number(values[2]) || 0;
      
      if (!acc[month]) acc[month] = { customers: new Set(), revenue: 0 };
      acc[month].customers.add(customerId);
      acc[month].revenue += mrr;
      
      return acc;
    }, {});

    Object.entries(monthlyGroups).forEach(([month, data]) => {
      summary.push({
        period_month: month,
        revenue_total: Math.round(data.revenue),
        customer_count: data.customers.size,
        arpu: Math.round(data.revenue / data.customers.size)
      });
    });

    summary.sort((a, b) => b.period_month.localeCompare(a.period_month));

    // Trailing 3-month calculation
    const trailing3m = summary.map((row, idx) => {
      const next2 = summary.slice(idx + 1, idx + 3);
      const trailing_revenue = row.revenue_total + next2.reduce((sum, r) => sum + r.revenue_total, 0);
      const trailing_customers = row.customer_count; // Simplified - could do rolling distinct
      
      return {
        period_month: row.period_month,
        trailing_3m_revenue_total: trailing_revenue,
        trailing_3m_customer_count: trailing_customers
      };
    });

    // Step 4: Comparison logic (if provided)
    let comparison = null;
    if (comparison_data) {
      const parsedComparison = parseComparisonCSV(comparison_data);
      comparison = summary.map(lakeRow => {
        const emilieRow = parsedComparison.find(e => e.period_month === lakeRow.period_month);
        if (!emilieRow) return null;
        
        const delta = lakeRow.revenue_total - emilieRow.revenue_total;
        const delta_pct = (delta / emilieRow.revenue_total) * 100;
        
        return {
          period_month: lakeRow.period_month,
          emilie_total: emilieRow.revenue_total,
          lake_total: lakeRow.revenue_total,
          delta: Math.round(delta),
          delta_pct: delta_pct.toFixed(2),
          needs_review: Math.abs(delta_pct) > 0.5 ? 'YES' : 'NO'
        };
      }).filter(Boolean);
    }

    // Step 5: Write to S3
    const artifacts = {};

    // Summary CSV
    const summaryCsv = [
      'period_month,revenue_total,customer_count,arpu',
      ...summary.map(r => `${r.period_month},${r.revenue_total},${r.customer_count},${r.arpu}`)
    ].join('\n');
    
    const summaryKey = `${s3Prefix}summary.csv`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: summaryKey,
      Body: summaryCsv,
      ContentType: 'text/csv'
    }));
    artifacts.summary_csv = summaryKey;

    // Detail CSV
    const detailCsv = [
      'period_month,customer_id,mrr_total',
      ...detail.map(r => {
        const vals = Array.isArray(r) ? r : Object.values(r);
        return `${vals[0]},${vals[1]},${vals[2]}`;
      })
    ].join('\n');
    
    const detailKey = `${s3Prefix}detail.csv`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: detailKey,
      Body: detailCsv,
      ContentType: 'text/csv'
    }));
    artifacts.detail_csv = detailKey;

    // Trailing 3m CSV
    const trailing3mCsv = [
      'period_month,trailing_3m_revenue_total,trailing_3m_customer_count',
      ...trailing3m.map(r => `${r.period_month},${r.trailing_3m_revenue_total},${r.trailing_3m_customer_count}`)
    ].join('\n');
    
    const trailing3mKey = `${s3Prefix}trailing_3m.csv`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: trailing3mKey,
      Body: trailing3mCsv,
      ContentType: 'text/csv'
    }));
    artifacts.trailing_3m_csv = trailing3mKey;

    // Comparison CSV (if provided)
    if (comparison) {
      const comparisonCsv = [
        'period_month,emilie_total,lake_total,delta,delta_pct,needs_review',
        ...comparison.map(r => `${r.period_month},${r.emilie_total},${r.lake_total},${r.delta},${r.delta_pct},${r.needs_review}`)
      ].join('\n');
      
      const comparisonKey = `${s3Prefix}comparison.csv`;
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: comparisonKey,
        Body: comparisonCsv,
        ContentType: 'text/csv'
      }));
      artifacts.comparison_csv = comparisonKey;
    }

    // Evidence JSON
    const evidenceJson = JSON.stringify({
      run_id,
      run_at,
      report_name,
      report_mode,
      definition_used: plat_id_definition,
      filters,
      date_range,
      athena_query_execution_ids: evidence.query_executions,
      generated_sql: evidence.generated_sql
    }, null, 2);
    
    const evidenceKey = `${s3Prefix}evidence.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: evidenceKey,
      Body: evidenceJson,
      ContentType: 'application/json'
    }));
    artifacts.evidence_json = evidenceKey;

    // Step 6: Save ReportRun entity
    await base44.asServiceRole.entities.ReportRun.create({
      report_name,
      report_mode,
      definition_used: plat_id_definition,
      filters_json: filters,
      date_range,
      run_at,
      evidence,
      result_summary_json: { summary, plat_ids: plat_ids_result.rows[0] },
      s3_artifacts: artifacts
    });

    return Response.json({
      success: true,
      run_id,
      run_at,
      plat_ids: {
        rows: plat_ids_result.rows,
        execution_id: plat_ids_result.execution_id,
        definition_used: plat_id_definition
      },
      summary,
      detail: detail.slice(0, 100), // Limit in response
      trailing_3m: trailing3m,
      comparison,
      evidence,
      s3_artifacts: artifacts
    });

  } catch (error) {
    console.error('Revenue repro report error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

function parseComparisonCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  const monthIdx = headers.findIndex(h => h.includes('month') || h.includes('period'));
  const revenueIdx = headers.findIndex(h => h.includes('revenue') || h.includes('total') || h.includes('mrr'));
  
  if (monthIdx === -1 || revenueIdx === -1) {
    throw new Error('Comparison CSV must have month and revenue columns');
  }
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return {
      period_month: values[monthIdx],
      revenue_total: Number(values[revenueIdx]) || 0
    };
  }).filter(r => r.period_month);
}