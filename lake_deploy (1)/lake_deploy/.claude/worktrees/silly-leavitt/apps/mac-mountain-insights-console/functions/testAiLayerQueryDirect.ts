import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    
    // Test 1: Direct aiLayerQuery call from backend with user context
    const test1Results = {
      test_name: 'Direct aiLayerQuery with user context',
      invocation_code: 'base44.functions.invoke("aiLayerQuery", {...})',
      request_timestamp: new Date().toISOString(),
      user_context: {
        email: user.email,
        role: user.role,
        authenticated: true
      },
      request_payload: null,
      response_payload: null,
      status: null,
      error: null
    };

    const sql1 = `SELECT SUM(total_mrr) as total_mrr FROM curated_core.v_customer_fully_loaded_margin_banded WHERE total_mrr > 0 LIMIT 1`;
    test1Results.request_payload = {
      template_id: 'freeform_sql_v1',
      params: { sql: sql1 }
    };

    try {
      const response1 = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: sql1 }
      });

      test1Results.status = 'SUCCESS';
      test1Results.response_payload = {
        data_rows: response1.data?.data_rows || [],
        row_count: response1.data?.data_rows?.length || 0,
        execution_id: response1.data?.execution_id || response1.data?.athena_query_execution_id,
        columns: response1.data?.columns || []
      };
    } catch (error) {
      test1Results.status = 'FAIL';
      test1Results.error = {
        message: error.message,
        status_code: error.response?.status,
        response_data: error.response?.data,
        stack: error.stack
      };
    }

    // Test 2: Different query to confirm pattern
    const test2Results = {
      test_name: 'Direct aiLayerQuery - Active Accounts',
      invocation_code: 'base44.functions.invoke("aiLayerQuery", {...})',
      request_timestamp: new Date().toISOString(),
      request_payload: null,
      response_payload: null,
      status: null,
      error: null
    };

    const sql2 = `SELECT COUNT(*) as total, SUM(CASE WHEN has_active_service = true AND is_test_internal = false THEN 1 ELSE 0 END) as active FROM curated_core.dim_customer_platt LIMIT 1`;
    test2Results.request_payload = {
      template_id: 'freeform_sql_v1',
      params: { sql: sql2 }
    };

    try {
      const response2 = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: sql2 }
      });

      test2Results.status = 'SUCCESS';
      test2Results.response_payload = {
        data_rows: response2.data?.data_rows || [],
        row_count: response2.data?.data_rows?.length || 0,
        execution_id: response2.data?.execution_id || response2.data?.athena_query_execution_id
      };
    } catch (error) {
      test2Results.status = 'FAIL';
      test2Results.error = {
        message: error.message,
        status_code: error.response?.status,
        response_data: error.response?.data,
        stack: error.stack
      };
    }

    const duration = Date.now() - startTime;

    return Response.json({
      success: true,
      execution_context: 'Backend function with user-scoped base44 client',
      user_email: user.email,
      tests: [test1Results, test2Results],
      duration_ms: duration,
      conclusion: test1Results.status === 'SUCCESS' && test2Results.status === 'SUCCESS' 
        ? 'Backend functions CAN call aiLayerQuery with user context'
        : '403 boundary confirmed - backend functions CANNOT call aiLayerQuery'
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});