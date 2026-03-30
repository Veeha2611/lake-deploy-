import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const results = {
      timestamp: new Date().toISOString(),
      tested_by: user.email,
      credentials: {}
    };

    // Test AWS credentials
    const AWS_REGION = Deno.env.get('AWS_REGION');
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const athena_workgroup = Deno.env.get('athena_workgroup');
    const athena_output_location = Deno.env.get('athena_output_location');
    const AWS_AI_LAYER_API_KEY = Deno.env.get('AWS_AI_LAYER_API_KEY');
    const AWS_AI_LAYER_INVOKE_URL = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');
    const MONDAY_API_KEY = Deno.env.get('MONDAY_API_KEY');

    // Check if secrets are set
    results.credentials.aws_access_key = AWS_ACCESS_KEY_ID ? '✅ SET' : '❌ MISSING';
    results.credentials.aws_secret_key = AWS_SECRET_ACCESS_KEY ? '✅ SET' : '❌ MISSING';
    results.credentials.aws_region = AWS_REGION ? `✅ SET (${AWS_REGION})` : '❌ MISSING';
    results.credentials.athena_workgroup = athena_workgroup ? `✅ SET (${athena_workgroup})` : '❌ MISSING';
    results.credentials.athena_output_location = athena_output_location ? `✅ SET (${athena_output_location})` : '❌ MISSING';
    results.credentials.ai_layer_api_key = AWS_AI_LAYER_API_KEY ? '✅ SET' : '❌ MISSING';
    results.credentials.ai_layer_invoke_url = AWS_AI_LAYER_INVOKE_URL ? `✅ SET (${AWS_AI_LAYER_INVOKE_URL?.split('/')[2]})` : '❌ MISSING';
    results.credentials.monday_api_key = MONDAY_API_KEY ? '✅ SET' : '❌ MISSING';

    // Test Query Layer connectivity
    if (AWS_AI_LAYER_INVOKE_URL && AWS_AI_LAYER_API_KEY) {
      try {
        const testResp = await fetch(`${AWS_AI_LAYER_INVOKE_URL}/query`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            template_id: 'freeform_sql_v1',
            params: { sql: 'SELECT 1 as test' }
          })
        });
        
        results.ai_layer_connectivity = {
          status: testResp.ok ? '✅ CONNECTED' : `❌ HTTP ${testResp.status}`,
          response_ok: testResp.ok,
          response_status: testResp.status
        };
      } catch (e) {
        results.ai_layer_connectivity = {
          status: `❌ CONNECTION FAILED`,
          error: e.message
        };
      }
    }

    // Test Monday.com connectivity
    if (MONDAY_API_KEY) {
      try {
        const mondayResp = await fetch('https://api.monday.com/graphql', {
          method: 'POST',
          headers: {
            'authorization': MONDAY_API_KEY,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            query: '{ boards(limit: 1) { id name } }'
          })
        });
        
        const mondayData = await mondayResp.json();
        results.monday_connectivity = {
          status: !mondayData.errors ? '✅ CONNECTED' : `❌ ${mondayData.errors[0]?.message}`,
          response_ok: mondayResp.ok,
          has_errors: !!mondayData.errors
        };
      } catch (e) {
        results.monday_connectivity = {
          status: `❌ CONNECTION FAILED`,
          error: e.message
        };
      }
    }

    // Summary
    const missing = Object.values(results.credentials).filter(v => v.includes('MISSING')).length;
    results.summary = {
      total_secrets: Object.keys(results.credentials).length,
      set: Object.keys(results.credentials).length - missing,
      missing,
      overall_status: missing === 0 ? '✅ ALL CREDENTIALS SET' : `⚠️ ${missing} MISSING`
    };

    return Response.json(results);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});