import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { view_name } = body;

    if (!view_name) {
      return Response.json({ error: 'Missing view_name parameter' }, { status: 400 });
    }

    // Query to discover schema
    const result = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: {
        sql: `SHOW COLUMNS IN ${view_name}`
      }
    });

    return Response.json(result.data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});