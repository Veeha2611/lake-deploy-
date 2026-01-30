import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query to get comprehensive project data with scenario counts
    const debugQuery = `
      WITH scenario_counts AS (
        SELECT 
          project_id,
          COUNT(*) as scenario_count,
          MAX(updated_at) as latest_scenario_update
        FROM (
          -- This would need to be populated from S3 scenario registry files
          -- For now, return 0 for all projects
          SELECT project_id, 0 as scenario_count, NULL as latest_scenario_update
          FROM curated_core.projects_enriched
          WHERE 1=0
        )
        GROUP BY project_id
      )
      SELECT 
        p.project_name,
        p.entity,
        p.state,
        p.project_type,
        p.stage,
        p.priority,
        COALESCE(s.scenario_count, 0) as scenario_count,
        s.latest_scenario_update as latest_run_ts
      FROM curated_core.projects_enriched p
      LEFT JOIN scenario_counts s ON p.project_id = s.project_id
      ORDER BY p.entity, p.project_name
      LIMIT 20
    `;

    const countQueries = `
      SELECT 'entity' as dimension, entity as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      GROUP BY entity
      
      UNION ALL
      
      SELECT 'state' as dimension, state as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      GROUP BY state
      
      UNION ALL
      
      SELECT 'project_type' as dimension, project_type as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      GROUP BY project_type
      
      UNION ALL
      
      SELECT 'stage' as dimension, stage as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      GROUP BY stage
      
      UNION ALL
      
      SELECT 'priority' as dimension, priority as value, COUNT(*) as count
      FROM curated_core.projects_enriched
      GROUP BY priority
      
      ORDER BY dimension, value
    `;

    const debugResponse = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: debugQuery }
    });

    const countsResponse = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: countQueries }
    });

    return Response.json({
      success: true,
      debug_rows: debugResponse.data?.data_rows || [],
      counts: countsResponse.data?.data_rows || []
    });

  } catch (error) {
    console.error('Debug query error:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});