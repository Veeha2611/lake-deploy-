import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Main query: 10 sample rows with all columns
    const sampleQuery = `
      SELECT 
        project_name,
        entity,
        state,
        project_type,
        stage,
        priority,
        owner
      FROM curated_core.projects_enriched
      ORDER BY entity, project_name
      LIMIT 10
    `;

    // Distribution counts
    const countsQuery = `
      SELECT 'entity' as dimension, entity as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      GROUP BY entity
      
      UNION ALL
      
      SELECT 'state' as dimension, state as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      WHERE state IS NOT NULL
      GROUP BY state
      
      UNION ALL
      
      SELECT 'project_type' as dimension, project_type as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      WHERE project_type IS NOT NULL
      GROUP BY project_type
      
      UNION ALL
      
      SELECT 'stage' as dimension, stage as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      WHERE stage IS NOT NULL
      GROUP BY stage
      
      UNION ALL
      
      SELECT 'priority' as dimension, priority as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      WHERE priority IS NOT NULL
      GROUP BY priority
      
      ORDER BY dimension, count DESC
    `;

    const sampleResponse = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: sampleQuery }
    });

    const countsResponse = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: countsQuery }
    });

    return Response.json({
      success: true,
      sample_rows: sampleResponse.data?.data_rows || [],
      counts: countsResponse.data?.data_rows || []
    });

  } catch (error) {
    console.error('Debug proof query error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});