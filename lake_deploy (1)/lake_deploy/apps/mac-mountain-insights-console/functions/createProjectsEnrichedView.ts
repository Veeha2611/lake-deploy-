import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const awsUrl = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');
    const awsKey = Deno.env.get('AWS_AI_LAYER_API_KEY');

    // First, check if the view exists
    const checkSql = `SHOW TABLES IN curated_core LIKE 'projects_enriched'`;
    
    const checkResponse = await fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': awsKey
      },
      body: JSON.stringify({
        template_id: 'freeform_sql_v1',
        params: { sql: checkSql }
      })
    });

    const checkData = await checkResponse.json();
    const viewExists = checkData.data_rows?.length > 0;

    if (viewExists) {
      return Response.json({
        success: true,
        message: 'View curated_core.projects_enriched already exists',
        view_exists: true
      });
    }

    // Create the view
    const createViewSql = `
      CREATE OR REPLACE VIEW curated_core.projects_enriched AS
      SELECT 
        project_id,
        entity,
        project_name,
        project_type,
        state,
        COALESCE(stage, 'Unknown') AS stage,
        COALESCE(priority, 'Unranked') AS priority,
        owner,
        partner_share_raw,
        investor_label,
        notes,
        CAST(is_test AS BOOLEAN) AS is_test
      FROM raw_finance.projects_latest
    `;

    const createResponse = await fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': awsKey
      },
      body: JSON.stringify({
        template_id: 'freeform_sql_v1',
        params: { sql: createViewSql }
      })
    });

    if (createResponse.ok) {
      return Response.json({
        success: true,
        message: 'View curated_core.projects_enriched created successfully',
        view_exists: false,
        created: true
      });
    } else {
      const errorText = await createResponse.text();
      return Response.json({
        success: false,
        error: errorText,
        message: 'Failed to create view'
      }, { status: 500 });
    }

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});