// Base44 Backend Function: aiLayerQuery
// Purpose: Proxy to AWS AI Layer (API Gateway -> Lambda -> Athena)
// 
// DATA ACCESS:
// 1. Queries can access ALL data sources (curated_ssot, curated_core, raw, etc.)
// 2. All responses MUST include evidence (QID, SQL, views, dt)
// 3. Empty results trigger automatic self-diagnosis
//
// Expected secrets:
// - AWS_AI_LAYER_INVOKE_URL  (host only, no trailing /query)
// - AWS_AI_LAYER_API_KEY
//
// Input (from UI):
// {
//   template_id: "customer_count_v1" | "freeform_sql_v1" | ...,
//   params: { sql: "...", ... },
//   enforce_ssot: true (default)
// }
//
// Output on success:
// { columns, data_rows, evidence: { athena_query_execution_id, sql, views_used, dt_used, row_count }, ... }
//
// Output on failure (HTTP 200, structured error):
// { ok: false, error: "...", diagnosis: {...}, recommendations: [...] }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null); // Allow public access

    const AWS_AI_LAYER_API_KEY = Deno.env.get('AWS_AI_LAYER_API_KEY');
    const AWS_AI_LAYER_INVOKE_URL = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');

    if (!AWS_AI_LAYER_API_KEY || !AWS_AI_LAYER_INVOKE_URL) {
      return Response.json({
        ok: false,
        error: 'AWS AI Layer credentials not configured',
        http_status: 500,
        hint: 'Set AWS_AI_LAYER_INVOKE_URL and AWS_AI_LAYER_API_KEY in Base44 secrets'
      }, { status: 200 });
    }

    const body = await req.json();
    const { template_id, params = {}, enforce_ssot = true } = body;

    if (!template_id) {
      return Response.json({
        ok: false,
        error: 'Missing template_id',
        http_status: 400,
        hint: 'Request must include template_id field'
      }, { status: 200 });
    }
    
    // SQL VALIDATION: Block destructive operations only
    if (params.sql) {
      const sqlUpper = params.sql.toUpperCase().trim();
      
      // Block destructive operations (not SELECT)
      if (/^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i.test(sqlUpper)) {
        return Response.json({
          ok: false,
          error: 'Security: Only SELECT queries permitted',
          hint: 'Data exploration queries must use SELECT. No INSERT, UPDATE, DELETE, or DDL.',
          sql_attempted: params.sql.substring(0, 500)
        }, { status: 200 });
      }
    }

    // Construct URL: ${AWS_AI_LAYER_INVOKE_URL}/query
    // Example: https://i12dt77a17.execute-api.us-east-2.amazonaws.com/query
    const url = `${AWS_AI_LAYER_INVOKE_URL}/query`;
    console.log('[aiLayerQuery] FULL URL being called:', url);
    console.log('[aiLayerQuery] → AWS HTTP API:', {
      template_id,
      param_keys: Object.keys(params),
      url_redacted: url.replace(/:\/\/[^\/]+/, '://<redacted>')
    });

    // Retry logic: attempt up to 3 times
    let resp;
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[aiLayerQuery] Attempt ${attempt}/${maxRetries}`);
        
        resp = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            template_id,
            params,
          }),
        });

        // If successful or client error (4xx), don't retry
        if (resp.ok || (resp.status >= 400 && resp.status < 500)) {
          break;
        }

        // Server error (5xx) - retry with backoff
        if (resp.status >= 500 && attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`[aiLayerQuery] Server error ${resp.status}, retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          lastError = `HTTP ${resp.status}`;
          continue;
        }

        break;
      } catch (fetchError) {
        lastError = fetchError.message;
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`[aiLayerQuery] Fetch error: ${fetchError.message}, retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (!resp) {
      return Response.json({
        ok: false,
        source: 'base44_backend',
        error: 'Failed to connect to AWS after 3 attempts',
        last_error: lastError,
        template_id,
        hint: 'Network issue or AWS endpoint unreachable. Check AWS_AI_LAYER_INVOKE_URL configuration.'
      }, { status: 200 });
    }

    // CRITICAL: Always read response body safely, never throw
    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error('[aiLayerQuery] Non-JSON from AWS:', text?.slice(0, 500));
      return Response.json({
        ok: false,
        source: 'aws_ai_layer',
        error: 'AWS returned non-JSON response',
        http_status: resp.status,
        template_id,
        params_keys: Object.keys(params),
        aws_error_body: text?.slice(0, 2000),
        hint: 'This is an AWS-side failure. Check Lambda logs and response format.'
      }, { status: 200 });
    }

    if (!resp.ok) {
      console.error('[aiLayerQuery] AWS error:', { 
        http_status: resp.status,
        template_id,
        params_sent: params,
        full_response: json,
        request_id: resp.headers.get('x-amzn-RequestId'),
        url_called: url
      });
      
      // Extract specific error message from AWS response
      let errorMessage = 'AWS AI Layer request failed';
      if (json?.error) {
        errorMessage = json.error;
      } else if (json?.message) {
        errorMessage = json.message;
      } else if (json?.errorMessage) {
        errorMessage = json.errorMessage;
      }
      
      return Response.json({
        ok: false,
        source: 'aws_ai_layer',
        error: errorMessage,
        http_status: resp.status,
        template_id,
        params_sent: params,
        aws_error_body: json,
        hint: resp.status === 400 
          ? 'Client error (400): Template not found, invalid params, or malformed request. Check that template exists on Lambda.'
          : 'This is an AWS-side failure. Check Lambda logs and Athena error details.'
      }, { status: 200 });
    }

    // Log full AWS response structure for debugging
    console.log('[aiLayerQuery] ✓ AWS Response Structure:', {
      template_id,
      top_level_keys: Object.keys(json),
      row_count: json.data_rows?.length || 0,
      evidence_keys: json.evidence ? Object.keys(json.evidence) : 'NO EVIDENCE OBJECT',
      execution_id_locations: {
        top_level_execution_id: json.execution_id || null,
        top_level_athena_query_execution_id: json.athena_query_execution_id || null,
        evidence_execution_id: json.evidence?.execution_id || null,
        evidence_athena_query_execution_id: json.evidence?.athena_query_execution_id || null,
        query_execution_id: json.query_execution_id || null,
        QueryExecutionId: json.QueryExecutionId || null
      }
    });

    // Surface ALL evidence fields at top level - check ALL possible locations
    const executionId = json.athena_query_execution_id 
      || json.execution_id 
      || json.query_execution_id
      || json.QueryExecutionId
      || json.evidence?.athena_query_execution_id 
      || json.evidence?.execution_id
      || json.evidence?.query_execution_id
      || json.evidence?.QueryExecutionId
      || null;

    // Set at top level for UI
    json.athena_query_execution_id = executionId;
    json.execution_id = executionId;
    json.rows_returned = json.rows_returned || json.data_rows?.length || 0;
    json.rows_truncated = json.rows_truncated || json.evidence?.rows_truncated || false;
    json.generated_sql = json.generated_sql || json.sql || json.evidence?.generated_sql || json.evidence?.sql || params?.sql || null;
    
    // Extract views/tables used from SQL
    const viewsUsed = [];
    if (json.generated_sql) {
      const tablePattern = /(?:from|join)\s+([\w.]+)/gi;
      const matches = [...json.generated_sql.matchAll(tablePattern)];
      matches.forEach(m => {
        const tableName = m[1].trim();
        if (!tableName.includes('information_schema') && tableName !== 'dual') {
          viewsUsed.push(tableName);
        }
      });
    }
    
    // Extract partition date if present
    const dtMatch = json.generated_sql?.match(/dt\s*=\s*'([^']+)'/i) || 
                   json.generated_sql?.match(/period_month\s*=\s*'([^']+)'/i);
    const dtUsed = dtMatch ? dtMatch[1] : null;

    // Consolidate evidence object
    if (!json.evidence) {
      json.evidence = {};
    }
    
    json.evidence = {
      ...json.evidence,
      athena_query_execution_id: executionId,
      generated_sql: json.generated_sql,
      views_used: viewsUsed.length > 0 ? viewsUsed : (json.evidence.views_used || []),
      dt_used: dtUsed,
      rows_returned: json.rows_returned,
      rows_truncated: json.rows_truncated,
      queried_at: new Date().toISOString()
    };

    // Add diagnostic metadata
    json._base44_meta = {
      queried_at: new Date().toISOString(),
      template_id,
      success: true,
      evidence_complete: {
        has_qid: !!executionId,
        has_sql: !!json.generated_sql,
        has_views: viewsUsed.length > 0,
        has_dt: !!dtUsed,
        rows: json.rows_returned
      }
    };

    console.log('[aiLayerQuery] ✅ Evidence Complete:', {
      qid: executionId ? executionId.substring(0, 20) + '...' : '❌ MISSING',
      sql_length: json.generated_sql?.length || 0,
      views: viewsUsed.length,
      dt: dtUsed || 'N/A',
      rows: json.rows_returned
    });
    
    // TRIGGER SELF-DIAGNOSIS if empty results
    if (json.rows_returned === 0 && viewsUsed.length > 0 && enforce_ssot) {
      console.log('[aiLayerQuery] ⚠️ Empty results detected - triggering self-diagnosis...');
      
      try {
        const diagnosisResult = await base44.asServiceRole.functions.invoke('runSelfDiagnosis', {
          table_name: viewsUsed[0],
          filters: {},
          days_back: 7
        });
        
        json.diagnosis = diagnosisResult.data.diagnosis;
        json.recommendations = diagnosisResult.data.recommendations;
        json.guard_status = diagnosisResult.data.guard_status;
        
        console.log('[aiLayerQuery] Self-diagnosis complete:', diagnosisResult.data.severity);
      } catch (diagError) {
        console.error('[aiLayerQuery] Self-diagnosis failed:', diagError.message);
      }
    }

    return Response.json(json);

  } catch (error) {
    console.error('[aiLayerQuery] Exception:', error.message);
    return Response.json({
      ok: false,
      source: 'base44_backend',
      error: error.message,
      http_status: 500,
      hint: 'This is a Base44 backend exception, not an AWS error. Check function logs.'
    }, { status: 200 });
  }
});