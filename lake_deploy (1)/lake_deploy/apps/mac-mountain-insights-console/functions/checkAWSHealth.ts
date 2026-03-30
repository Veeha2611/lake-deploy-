import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ 
        athena_connected: false,
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get environment info first
    const lambdaEndpoint = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');
    const apiKey = Deno.env.get('AWS_AI_LAYER_API_KEY');
    const hasApiKey = !!apiKey;

    if (!lambdaEndpoint || !apiKey) {
      return Response.json({
        athena_connected: false,
        error: 'AWS secrets not configured. Set AWS_AI_LAYER_INVOKE_URL and AWS_AI_LAYER_API_KEY',
        lambda_endpoint: lambdaEndpoint || null,
        environment: 'Unknown',
        athena_workgroup: 'N/A',
        s3_output_bucket: 'N/A',
        api_key_configured: hasApiKey
      });
    }

    // Test Athena connection with a simple query
    const testResponse = await base44.asServiceRole.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: 'SELECT 1 as test_value LIMIT 1' }
    });

    const testData = testResponse.data;
    const athenaConnected = testData?.ok !== false && !testData?.error;

    // Determine environment from URL
    let environment = 'Unknown';
    if (lambdaEndpoint.includes('execute-api')) {
      environment = 'HTTP API ($default)';
    } else if (lambdaEndpoint.includes('lambda-url')) {
      environment = 'Lambda URL';
    }

    return Response.json({
      athena_connected: athenaConnected,
      last_successful_query: athenaConnected ? new Date().toISOString() : null,
      lambda_endpoint: lambdaEndpoint,
      environment: environment,
      athena_workgroup: athenaConnected ? 'primary' : 'N/A',
      s3_output_bucket: athenaConnected ? 's3://aws-athena-query-results-us-east-2-...' : 'N/A',
      api_key_configured: hasApiKey,
      test_query_result: testData,
      error: athenaConnected ? null : (testData?.error || 'Connection test failed')
    });

  } catch (error) {
    const lambdaEndpoint = Deno.env.get('AWS_AI_LAYER_INVOKE_URL') || null;
    return Response.json({
      athena_connected: false,
      error: error.message,
      lambda_endpoint: lambdaEndpoint,
      environment: 'Unknown',
      athena_workgroup: 'N/A',
      s3_output_bucket: 'N/A'
    });
  }
});