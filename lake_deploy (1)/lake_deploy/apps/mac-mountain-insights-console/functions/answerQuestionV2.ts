import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANSWER QUESTION V2 - EXPLORATORY DATA HUNT
 * 
 * Architecture:
 * - Pass 1: Discover available data & plan multi-source queries
 *   - Query curated views, raw tables, and schema information
 *   - Search for keyword matches (project names, types, networks, etc)
 * - Pass 2: Execute targeted queries across all matching data sources
 * - Pass 3: Synthesize comprehensive answer from all retrieved data
 * 
 * Data Access: Full - can access curated_ssot.*, curated_core.*, raw.*, curated_raw.*
 * Search Strategy: Fuzzy matching on column names, tables, and data values
 * 
 * Input: { question: "..." }
 * Output: { answer_markdown, data_results, evidence: {...} }
 */

// Validate SQL is safe to execute (no destructive operations)
function validateSQL(sql) {
  const sqlLower = sql.toLowerCase();
  
  // Block destructive operations
  const destructivePatterns = [
    /\bDROP\s+/i,
    /\bDELETE\s+/i,
    /\bUPDATE\s+/i,
    /\bINSERT\s+/i,
    /\bTRUNCATE\s+/i,
    /\bALTER\s+/i,
    /\bCREATE\s+(TABLE|DATABASE|SCHEMA)/i
  ];
  
  for (const pattern of destructivePatterns) {
    if (pattern.test(sql)) {
      return {
        valid: false,
        error: 'SQL Safety Check: Destructive operations not allowed',
        hint: 'Only SELECT queries are permitted'
      };
    }
  }
  
  return { valid: true };
}

// Execute query with full evidence tracking
async function executeSSOTQuery(base44, sql, purpose) {
  try {
    const response = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql },
      enforce_ssot: false
    });
    
    const data = response.data;
    
    // Check for SSOT violations or errors
    if (data.ok === false || data.error) {
      return {
        success: false,
        error: data.error,
        hint: data.hint,
        enforcement: data.enforcement
      };
    }
    
    // Extract evidence
    const evidence = {
      athena_query_execution_id: data.athena_query_execution_id || data.execution_id,
      generated_sql: data.generated_sql || sql,
      views_used: data.evidence?.views_used || [],
      dt_used: data.evidence?.dt_used,
      rows_returned: data.rows_returned || data.data_rows?.length || 0,
      queried_at: new Date().toISOString()
    };
    
    return {
      success: true,
      purpose,
      columns: data.columns || [],
      data_rows: data.data_rows || [],
      evidence,
      diagnosis: data.diagnosis,
      recommendations: data.recommendations
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      purpose
    };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    const { question } = await req.json();
    
    if (!question) {
      return Response.json({
        ok: false,
        error: 'Missing question field'
      }, { status: 400 });
    }
    
    console.log('[answerQuestionV2] Question:', question);
    
    const runTimestamp = new Date().toISOString();
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 1: RETRIEVE FACTS FROM ALL DATA SOURCES
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log('[answerQuestionV2] PASS 1: Planning queries across all data sources...');
    
    // Use LLM to plan queries (exploratory across all data sources)
    const planPrompt = `You are the MAC Intelligence Console query planner with access to ALL data sources.

DATA SOURCES AVAILABLE:
- Curated views: curated_core.*, curated_ssot.*
- Raw data: raw.*, curated_raw.* (all S3 accessible data)
- Projects, customers, networks, accounts, tickets, revenue, and more

SEARCH STRATEGY:
- For project queries: Search project_id, project_name, project_type, module_type in projects tables and raw data
- For customer queries: Search customer names, accounts, segments across all customer dimensions
- For network/technology: Search network_type, feature_name, plat_id, band in customer and projects data
- For keywords: Match on partial text in description, notes, and all text fields

QUERY RULES:
- Every query MUST include LIMIT (max 2000)
- Use SELECT or WITH statements only
- Search broadly - if you can't find exact match, use LIKE '%keyword%' for fuzzy matching
- Combine multiple tables if needed to cross-reference and find answers
- Include all potentially relevant columns

User Question: "${question}"

Generate a comprehensive query plan that hunts across ALL available data.

Return JSON:
{
  "requires_data": true/false,
  "strategy": "description of how you'll search the data",
  "queries": [
    {
      "id": "query1",
      "purpose": "Search description",
      "sql": "SELECT ... FROM ... WHERE ... LIMIT 2000",
      "searches_for": "what keywords/patterns this query hunts for"
    }
  ]
}

If question is NOT about data, set requires_data=false and queries=[].`;
    
    const plan = await base44.integrations.Core.InvokeLLM({
      prompt: planPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          requires_data: { type: "boolean" },
          strategy: { type: "string" },
          queries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                purpose: { type: "string" },
                sql: { type: "string" },
                searches_for: { type: "string" }
              },
              required: ["id", "purpose", "sql"]
            }
          }
        },
        required: ["requires_data", "queries"]
      }
    });
    
    console.log('[answerQuestionV2] Plan:', plan.queries.length, 'queries');
    console.log('[answerQuestionV2] Strategy:', plan.strategy);
    
    // If no data needed, respond immediately
    if (!plan.requires_data || plan.queries.length === 0) {
      const directAnswer = await base44.integrations.Core.InvokeLLM({
        prompt: `User asked: "${question}"\n\nThis is a conversational question not requiring data. Provide a helpful, friendly response.`
      });
      
      return Response.json({
        answer_markdown: directAnswer,
        data_results: [],
        visualization_type: 'none',
        evidence: {
          requires_data: false,
          run_at: runTimestamp
        }
      });
    }
    
    // Validate all queries are safe (no destructive operations)
    for (const query of plan.queries) {
      const validation = validateSQL(query.sql);
      if (!validation.valid) {
        return Response.json({
          ok: false,
          error: validation.error,
          hint: validation.hint,
          answer_markdown: `## 🚫 Query Validation Failed

**Error**: ${validation.error}

**Hint**: ${validation.hint}

Only SELECT queries are permitted for data exploration.`,
          evidence: {
            validation_failed: true,
            query_blocked: query.sql.substring(0, 500)
          }
        });
      }
    }
    
    // Execute all queries
    const queryResults = [];
    const allEvidence = {
      query_executions: [],
      views_used: new Set(),
      generated_sql: [],
      run_at: runTimestamp
    };
    
    for (const query of plan.queries) {
      console.log(`[answerQuestionV2] Executing: ${query.purpose}`);
      console.log(`[answerQuestionV2] SQL: ${query.sql.substring(0, 500)}`);
      const result = await executeSSOTQuery(base44, query.sql, query.purpose);
      console.log(`[answerQuestionV2] Result:`, { success: result.success, error: result.error, rows: result.data_rows?.length || 0 });
      
      queryResults.push(result);
      
      if (result.success && result.evidence) {
        if (result.evidence.athena_query_execution_id) {
          allEvidence.query_executions.push(result.evidence.athena_query_execution_id);
        }
        if (result.evidence.views_used) {
          result.evidence.views_used.forEach(v => allEvidence.views_used.add(v));
        }
        allEvidence.generated_sql.push({
          id: query.id,
          purpose: query.purpose,
          sql: result.evidence.generated_sql,
          qid: result.evidence.athena_query_execution_id,
          rows: result.evidence.rows_returned
        });
        
        // If empty results and diagnosis available, log it
        if (result.evidence.rows_returned === 0 && result.diagnosis) {
          console.log('[answerQuestionV2] Self-diagnosis triggered for empty results:', result.diagnosis);
        }
      }
    }
    
    const successfulQueries = queryResults.filter(r => r.success);
    const failedQueries = queryResults.filter(r => !r.success);
    
    // If ALL queries failed, return diagnostic report
    if (successfulQueries.length === 0) {
      console.error('[answerQuestionV2] All queries failed - details:', {
        total: queryResults.length,
        failures: failedQueries.map(f => ({ purpose: f.purpose, error: f.error, hint: f.hint }))
      });
      
      const diagnosticReport = `## 🔍 Query Diagnostic Report

All ${queryResults.length} planned queries failed to retrieve data.

### Failed Queries:
${failedQueries.map((q, i) => `
${i + 1}. **${q.purpose}**
   - Error: ${q.error}
   ${q.hint ? `- Hint: ${q.hint}` : ''}
`).join('\n')}

### Recommendations:
- Verify data sources are accessible
- Check Athena connectivity
- Review IAM roles for query execution
- Verify AWS_AI_LAYER credentials

### Evidence:
- **Run At**: ${runTimestamp}
- **Queries Attempted**: ${queryResults.length}
- **All Failed**: Unable to retrieve data`;
      
      return Response.json({
        ok: false,
        error: 'All queries failed',
        answer_markdown: diagnosticReport,
        data_results: [],
        visualization_type: 'none',
        evidence: {
          run_at: runTimestamp,
          queries_attempted: queryResults.length,
          queries_failed: failedQueries.length,
          errors: failedQueries.map(f => f.error),
          query_purposes: failedQueries.map(f => f.purpose)
        }
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PASS 2: SYNTHESIZE ANSWER FROM RETRIEVED DATA
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log('[answerQuestionV2] PASS 2: Composing answer from retrieved data...');
    
    const synthesisPrompt = `You are the MAC Intelligence Console answering: "${question}"

CRITICAL: Answer using ONLY the facts retrieved from the queries below. Never fabricate data.

Query Strategy Used: ${plan.strategy}

═══════════════════════════════════════════════════════════════════════════
RETRIEVED DATA FACTS:
═══════════════════════════════════════════════════════════════════════════

${successfulQueries.map((q, i) => `
### Query ${i + 1}: ${q.purpose}
**View**: ${allEvidence.generated_sql[i]?.sql?.match(/FROM\s+([\w.]+)/i)?.[1] || 'Unknown'}
**Rows**: ${q.data_rows.length}
**QID**: ${q.evidence.athena_query_execution_id || 'N/A'}

**Columns**: ${q.columns.join(', ')}

**Data Sample** (first 10 rows):
${JSON.stringify(q.data_rows.slice(0, 10), null, 2)}
`).join('\n')}

${failedQueries.length > 0 ? `
═══════════════════════════════════════════════════════════════════════════
FAILED QUERIES (${failedQueries.length}):
═══════════════════════════════════════════════════════════════════════════
${failedQueries.map(f => `- ${f.purpose}: ${f.error}`).join('\n')}
` : ''}

═══════════════════════════════════════════════════════════════════════════
ANSWER REQUIREMENTS:
═══════════════════════════════════════════════════════════════════════════

1. **Start with Direct Answer** (2-3 sentences)
2. **Key Findings** (bullet points with actual numbers from data)
3. **Evidence Section** (MANDATORY):
   - Query Execution IDs
   - Views used
   - Row counts
   - Partition dates if available
4. **Insights & Recommendations** (3-5 actionable next steps)

**Formatting**:
- Use **bold** for numbers
- Use markdown tables for comparative data
- Include specific account names/IDs from the data
- Reference actual row values, not summaries

**Never**:
- Fabricate data not in the results
- Make assumptions beyond the facts
- Provide generic advice without data backing

${queryResults.some(r => r.diagnosis) ? `
⚠️ **Self-Diagnosis Results Available**:
One or more queries returned empty. Include diagnostic findings in your answer.
` : ''}`;
    
    const finalAnswer = await base44.integrations.Core.InvokeLLM({
      prompt: synthesisPrompt
    });
    
    // Prepare combined data for visualization
    const combinedData = successfulQueries
      .filter(q => q.data_rows.length > 0)
      .flatMap(q => q.data_rows.map(row => {
        if (Array.isArray(row)) {
          const obj = {};
          q.columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        }
        return row;
      }));
    
    // Collect all diagnoses
    const diagnoses = queryResults
      .filter(r => r.diagnosis)
      .map(r => r.diagnosis);
    
    return Response.json({
      answer_markdown: finalAnswer,
      data_results: combinedData,
      visualization_type: combinedData.length > 0 ? 'table' : 'none',
      evidence: {
        run_at: runTimestamp,
        views_used: Array.from(allEvidence.views_used),
        athena_query_execution_ids: allEvidence.query_executions,
        generated_sql: allEvidence.generated_sql,
        rows_returned: combinedData.length,
        queries_executed: queryResults.length,
        queries_succeeded: successfulQueries.length,
        queries_failed: failedQueries.length,
        search_strategy: plan.strategy
      },
      diagnosis: diagnoses.length > 0 ? diagnoses : null,
      metadata: {
        architecture: 'exploratory_multi_source',
        queries_executed: queryResults.length,
        queries_successful: successfulQueries.length,
        evidence_complete: true
      }
    });
    
  } catch (error) {
    console.error('[answerQuestionV2] Exception:', error);
    return Response.json({
      ok: false,
      error: error.message,
      answer_markdown: `## ❌ Query Processing Failed

**Error**: ${error.message}

This is a system-level error. The SSOT query engine encountered an unexpected exception.

**Next Steps**:
1. Check backend function logs
2. Verify AWS Query Layer connectivity
3. Review IAM permissions`,
      evidence: {
        run_at: runTimestamp,
        error: error.message,
        stack: error.stack
      }
    }, { status: 200 });
  }
});