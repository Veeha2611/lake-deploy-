import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
      return Response.json({ error: 'Access restricted' }, { status: 403 });
    }

    const body = await req.json();
    const { definition = 'customer_spine' } = body;

    const run_at = new Date().toISOString();

    // Select SQL based on definition
    const sql = definition === 'customer_spine'
      ? `SELECT COUNT(*) AS rows_total, COUNT(DISTINCT customer_id) AS distinct_plat_ids FROM curated_core.dim_customer_platt LIMIT 1`
      : `SELECT COUNT(*) AS rows_total, COUNT(DISTINCT id) AS distinct_plat_ids FROM raw_platt.customer LIMIT 1`;

    const definitionLabel = definition === 'customer_spine'
      ? 'A) Customer Spine (dim_customer_platt)'
      : 'B) Raw Platt Customer (raw_platt.customer)';

    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql }
      });

      if (response.data.ok === false || response.data.error) {
        return Response.json({
          success: false,
          error: `Query failed: ${response.data.error}`,
          evidence: {
            run_at,
            generated_sql: sql,
            athena_query_execution_id: response.data.athena_query_execution_id,
            definition_used: definitionLabel,
            error: response.data.error
          }
        });
      }

      const row = response.data.data_rows[0];
      const values = Array.isArray(row) ? row : Object.values(row);

      return Response.json({
        success: true,
        run_at,
        definition_used: definitionLabel,
        rows_total: values[0],
        distinct_plat_ids: values[1],
        evidence: {
          run_at,
          generated_sql: sql,
          athena_query_execution_id: response.data.athena_query_execution_id,
          definition_used: definitionLabel
        }
      });

    } catch (error) {
      return Response.json({
        success: false,
        error: `Query exception: ${error.message}`,
        evidence: {
          run_at,
          generated_sql: sql,
          definition_used: definitionLabel
        }
      });
    }

  } catch (error) {
    console.error('Total Plat IDs error:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});