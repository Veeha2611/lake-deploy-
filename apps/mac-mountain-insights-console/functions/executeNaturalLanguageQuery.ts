import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { question } = await req.json();

        if (!question) {
            return Response.json({ error: 'Question is required' }, { status: 400 });
        }

        // Step 1: Generate SQL from natural language with strict guardrails
        const sqlGenerationPrompt = `You are a SQL query generator for AWS Athena querying ALL accessible databases.

User question: "${question}"

Generate a safe, read-only SQL query that answers this question.

HARD RULES (non-negotiable):
- Only SELECT statements (or WITH...SELECT). NEVER use: INSERT, UPDATE, DELETE, CTAS, CREATE, ALTER, DROP, UNLOAD, COPY, MERGE, TRUNCATE, MSCK, REPAIR, VACUUM, OPTIMIZE, ANALYZE, SHOW, DESCRIBE, EXPLAIN, GRANT, REVOKE, CALL
- You may query ANY Athena database/table/view the user asks for
- Only one SQL statement
- MUST include LIMIT clause (default 200 if not specified, max 2000)
- Most common database is curated_core with these views:
  • curated_core.dim_customer_platt (active customer definitions)
  • curated_core.v_customer_margin_plus_tickets (customer margin with tickets)
  • curated_core.v_customer_fully_loaded_margin_banded (A/B/C/D/E action bands)
  • curated_core.v_hosted_pbx_migration (Hosted PBX uplift opportunities)
  • curated_core.v_customer_sf_map (Salesforce mapping)

Return JSON:
{
  "sql": "SELECT ... FROM database.table WHERE ... ORDER BY ... LIMIT 200",
  "explanation": "brief explanation of what the query does",
  "error": "if question cannot be safely answered"
}`;

        const sqlResponse = await base44.integrations.Core.InvokeLLM({
            prompt: sqlGenerationPrompt,
            response_json_schema: {
                type: "object",
                properties: {
                    sql: { type: "string" },
                    explanation: { type: "string" },
                    error: { type: "string" }
                }
            }
        });

        if (sqlResponse.error) {
            console.log('[nlToSqlAndQuery] LLM returned error:', sqlResponse.error);
            return Response.json({ 
                error: sqlResponse.error,
                http_status: 400
            }, { status: 400 });
        }

        // Step 2: Validate SQL against guardrails
        let sql = sqlResponse.sql.trim();
        const sqlUpper = sql.toUpperCase();

        // Check must start with SELECT or WITH
        if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
            return Response.json({ 
                error: 'SQL must start with SELECT or WITH',
                http_status: 403
            }, { status: 403 });
        }

        // Check for forbidden operations
        const forbiddenKeywords = [
            'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 
            'TRUNCATE', 'MERGE', 'COPY', 'UNLOAD', 'CTAS', 'MSCK', 
            'REPAIR', 'VACUUM', 'OPTIMIZE', 'ANALYZE', 'SHOW', 'DESCRIBE', 
            'EXPLAIN', 'GRANT', 'REVOKE', 'CALL'
        ];
        
        for (const keyword of forbiddenKeywords) {
            const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
            if (pattern.test(sql)) {
                return Response.json({ 
                    error: `Forbidden operation: ${keyword}. Only read-only SELECT queries allowed.`,
                    http_status: 403
                }, { status: 403 });
            }
        }

        // Check for multiple statements (semicolons)
        const statements = sql.split(';').filter(s => s.trim());
        if (statements.length > 1) {
            return Response.json({ 
                error: 'Only one SQL statement allowed per query',
                http_status: 403
            }, { status: 403 });
        }

        // No database restriction - allow querying any accessible Athena database

        // Enforce LIMIT clause
        if (!sqlUpper.includes('LIMIT')) {
            sql = `${sql} LIMIT 200`;
            console.log('[nlToSqlAndQuery] Added default LIMIT 200');
        } else {
            // Extract and validate limit
            const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
            if (limitMatch) {
                const limitValue = parseInt(limitMatch[1]);
                if (limitValue > 2000) {
                    sql = sql.replace(/LIMIT\s+\d+/i, 'LIMIT 2000');
                    console.log('[nlToSqlAndQuery] Capped LIMIT to 2000');
                }
            }
        }

        console.log('[nlToSqlAndQuery] Final SQL (preview):', sql.slice(0, 300));

        // Step 3: Call AWS Query Layer via aiLayerQuery backend function
        const result = await base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: { sql }
        });

        if (!result || !result.data) {
            console.error('[nlToSqlAndQuery] No data in result:', result);
            return Response.json({
                ok: false,
                error: 'No response from AWS Query Layer',
                http_status: 500,
                generated_sql: sql,
                template_id: 'freeform_sql_v1'
            }, { status: 200 });
        }

        const awsData = result.data;

        console.log('[nlToSqlAndQuery] AWS response status:', awsData.ok !== false ? 'success' : 'error');

        // Check for errors - AWS may return ok: false
        if (awsData.ok === false) {
            console.error('[nlToSqlAndQuery] AWS returned error:', {
                error: awsData.error,
                http_status: awsData.http_status,
                sql_preview: sql.slice(0, 200)
            });
            return Response.json({
                ok: false,
                error: awsData.error || 'AWS query failed',
                aws_error_body: awsData.aws_error_body,
                http_status: awsData.http_status || 500,
                generated_sql: sql,
                template_id: 'freeform_sql_v1',
                hint: awsData.hint
            }, { status: 200 });
        }

        // Step 4: Return AWS response directly (it's already in correct format)
        // AWS returns: { answer_markdown, columns, data_rows, evidence }
        const response = {
            answer_markdown: awsData.answer_markdown || sqlResponse.explanation,
            columns: awsData.columns || [],
            data_rows: awsData.data_rows || [],
            visualization_type: awsData.visualization_type || 'table',
            suggested_follow_ups: awsData.suggested_follow_ups || [],
            evidence: {
                views_used: awsData.evidence?.views_used || extractViewsFromSQL(sql),
                athena_query_execution_id: awsData.evidence?.athena_query_execution_id,
                generated_sql: awsData.evidence?.generated_sql || sql,
                sql_template_id: awsData.evidence?.sql_template_id || 'freeform_sql_v1',
                result_csv_url: awsData.evidence?.result_csv_url
            }
        };
        
        console.log('[nlToSqlAndQuery] Returning', response.data_rows.length, 'rows');

        return Response.json(response);

    } catch (error) {
        console.error('[nlToSqlAndQuery] Exception:', error.message);
        return Response.json({ 
            error: error.message,
            http_status: 500
        }, { status: 500 });
    }
});

// Helper function to extract database.table references from SQL
function extractViewsFromSQL(sql) {
    const views = [];
    // Match database.table or database.view patterns
    const pattern = /\b([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\b/gi;
    const matches = sql.match(pattern);
    
    if (matches) {
        // Deduplicate and return
        views.push(...new Set(matches.map(m => m.toLowerCase())));
    }
    
    return views;
}