import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const AWS_AI_LAYER_INVOKE_URL = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');
    
    return Response.json({
      stored_url: AWS_AI_LAYER_INVOKE_URL,
      url_type: AWS_AI_LAYER_INVOKE_URL?.includes('lambda-url') ? 'Lambda URL (old)' : AWS_AI_LAYER_INVOKE_URL?.includes('execute-api') ? 'API Gateway (correct)' : 'Unknown',
      full_endpoint: `${AWS_AI_LAYER_INVOKE_URL}/query`,
      test_payload: {
        template_id: 'freeform_sql_v1',
        params: { sql: 'SELECT 1 as test' }
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});