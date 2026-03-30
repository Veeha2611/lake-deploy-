import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Show columns
    const columnsQuery = `SHOW COLUMNS FROM curated_core.projects_enriched`;
    
    // 2. Show view definition if it exists
    const viewDefQuery = `SHOW CREATE VIEW curated_core.projects_enriched`;
    
    // 3. Sample data with all columns
    const sampleQuery = `SELECT * FROM curated_core.projects_enriched LIMIT 3`;
    
    // 4. Check raw source table
    const rawSourceQuery = `SELECT * FROM raw.projects_pipeline_lc_pipeline LIMIT 3`;

    const columnsResponse = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: columnsQuery }
    });

    let viewDefResponse;
    try {
      viewDefResponse = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: viewDefQuery }
      });
    } catch (e) {
      viewDefResponse = { data: { error: 'Not a view or SHOW CREATE VIEW failed' } };
    }

    const sampleResponse = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: sampleQuery }
    });

    let rawSourceResponse;
    try {
      rawSourceResponse = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: rawSourceQuery }
      });
    } catch (e) {
      rawSourceResponse = { data: { error: 'Raw table not found or query failed' } };
    }

    return Response.json({
      success: true,
      columns: columnsResponse.data?.data_rows || [],
      view_definition: viewDefResponse.data?.data_rows || viewDefResponse.data?.error,
      sample_data: sampleResponse.data?.data_rows || [],
      sample_columns: sampleResponse.data?.columns || [],
      raw_source_sample: rawSourceResponse.data?.data_rows || rawSourceResponse.data?.error,
      raw_source_columns: rawSourceResponse.data?.columns || []
    });

  } catch (error) {
    console.error('Schema discovery error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});