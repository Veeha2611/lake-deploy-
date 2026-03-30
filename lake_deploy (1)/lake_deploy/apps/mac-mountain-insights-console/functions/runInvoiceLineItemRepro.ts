import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Access control - Patch only
    const allowedEmails = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'];
    if (!allowedEmails.includes(user.email?.toLowerCase())) {
      return Response.json({ error: 'Access restricted - Patch only' }, { status: 403 });
    }

    const body = await req.json();
    const {
      report_name,
      start_date,
      end_date,
      exclude_dtl_items = true,
      grouping_mode = 'customer_invoice_product',
      comparison_csv = null,
      include_id_count_checks = false
    } = body;

    if (!report_name || !start_date || !end_date) {
      return Response.json({
        success: false,
        error: 'Missing required fields: report_name, start_date, end_date'
      }, { status: 400 });
    }

    const run_id = `run_${Date.now()}`;
    const run_at = new Date().toISOString();
    const evidence = {
      query_executions: [],
      generated_sql: [],
      views_used: ['curated_core.invoice_line_item_repro_v1']
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
    const s3Prefix = `raw/revenue_repro/${report_name.replace(/[^a-zA-Z0-9_-]/g, '_')}/${run_id}/`;

    // Build canonical view query
    const detailSql = grouping_mode === 'customer_invoice_product'
      ? `SELECT * FROM curated_core.invoice_line_item_repro_v1 WHERE invoice_date >= DATE '${start_date}' AND invoice_date < DATE '${end_date}' LIMIT 2000`
      : `SELECT customer_id, system, invoice_id, invoice_date, product, SUM(total) AS total FROM curated_core.invoice_line_item_repro_v1 WHERE invoice_date >= DATE '${start_date}' AND invoice_date < DATE '${end_date}' GROUP BY 1,2,3,4,5 LIMIT 2000`;

    let detailResult = null;
    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: detailSql }
      });

      if (response.data.ok === false || response.data.error) {
        return Response.json({
          success: false,
          error: `Invoice detail query failed: ${response.data.error}`,
          evidence: {
            sql: detailSql,
            athena_query_execution_id: response.data.athena_query_execution_id,
            error: response.data.error
          }
        });
      }

      detailResult = {
        rows: response.data.data_rows || [],
        execution_id: response.data.athena_query_execution_id
      };

      evidence.query_executions.push(response.data.athena_query_execution_id);
      evidence.generated_sql.push({ purpose: 'Invoice Line Item Detail', sql: detailSql });
    } catch (error) {
      return Response.json({
        success: false,
        error: `Invoice detail query exception: ${error.message}`,
        evidence: { sql: detailSql }
      });
    }

    // Step 2: Optional ID count checks
    let idCountChecks = null;
    if (include_id_count_checks) {
      try {
        const [curatedResponse, rawResponse] = await Promise.all([
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: { sql: 'SELECT COUNT(DISTINCT customer_id) AS distinct_ids FROM curated_core.dim_customer_platt LIMIT 1' }
          }),
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: { sql: 'SELECT COUNT(DISTINCT id) AS distinct_ids FROM raw_platt.customer LIMIT 1' }
          })
        ]);

        const curatedVals = Array.isArray(curatedResponse.data.data_rows[0]) 
          ? curatedResponse.data.data_rows[0] 
          : Object.values(curatedResponse.data.data_rows[0]);
        const rawVals = Array.isArray(rawResponse.data.data_rows[0]) 
          ? rawResponse.data.data_rows[0] 
          : Object.values(rawResponse.data.data_rows[0]);

        idCountChecks = {
          curated_customer_count: curatedVals[0],
          raw_customer_count: rawVals[0],
          diagnostic_only: true
        };
      } catch (error) {
        idCountChecks = { error: error.message, diagnostic_only: true };
      }
    }

    // Step 3: Write to S3
    const artifacts = {};

    // Detail CSV (or collapsed CSV)
    const headers = ['customer_id', 'system', 'invoice_id', 'invoice_date', 'product', 'total'];
    const detailCsv = [
      headers.join(','),
      ...detailResult.rows.slice(0, 5000).map(r => {
        const vals = Array.isArray(r) ? r : Object.values(r);
        return vals.join(',');
      })
    ].join('\n');
    
    const fileName = grouping_mode === 'customer_invoice_product' ? 'detail.csv' : 'collapsed.csv';
    const detailKey = `${s3Prefix}${fileName}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: detailKey,
      Body: detailCsv,
      ContentType: 'text/csv'
    }));
    artifacts[fileName.replace('.csv', '_csv')] = detailKey;

    // Evidence JSON
    const evidenceJson = JSON.stringify({
      run_id,
      run_at,
      report_name,
      start_date,
      end_date,
      exclude_dtl_items,
      grouping_mode,
      athena_query_execution_ids: evidence.query_executions,
      generated_sql: evidence.generated_sql,
      views_used: evidence.views_used,
      id_count_checks: idCountChecks
    }, null, 2);
    
    const evidenceKey = `${s3Prefix}evidence.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: evidenceKey,
      Body: evidenceJson,
      ContentType: 'application/json'
    }));
    artifacts.evidence_json = evidenceKey;

    // Step 4: Save ReportRun entity
    await base44.asServiceRole.entities.ReportRun.create({
      report_name,
      report_mode: 'Invoice Line Item Repro',
      definition_used: 'curated_core.invoice_line_item_repro_v1',
      filters_json: { grouping_mode },
      date_range: { start_date, end_date },
      run_at,
      evidence,
      result_summary_json: {
        row_count: detailResult.rows.length,
        id_count_checks: idCountChecks
      },
      s3_artifacts: artifacts
    });

    return Response.json({
      success: true,
      run_id,
      run_at,
      detail: detailResult.rows.slice(0, 100),
      id_count_checks: idCountChecks,
      evidence,
      s3_artifacts: artifacts
    });

  } catch (error) {
    console.error('Invoice line item repro error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});