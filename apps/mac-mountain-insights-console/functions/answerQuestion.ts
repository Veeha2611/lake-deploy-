// Base44 Backend Function: answerQuestion
// Purpose: Multi-query orchestrator for natural language questions
// Implements: Plan → Execute → Compose pattern
//
// Input: { question: "..." }
// Output: { answer_markdown, data_results, evidence, ... }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// SQL Safety validator
function validateAndSanitizeSQL(sql) {
  const trimmed = sql.trim();
  
  // Must start with SELECT or WITH
  if (!/^(SELECT|WITH)\s/i.test(trimmed)) {
    throw new Error('SQL must start with SELECT or WITH');
  }
  
  // Single statement only (no semicolons except at end)
  const statements = trimmed.replace(/;+$/, '').split(';');
  if (statements.length > 1) {
    throw new Error('Only one SQL statement allowed per query');
  }
  
  // Block dangerous keywords
  const dangerous = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|GRANT|REVOKE|TRUNCATE|EXEC|EXECUTE)\b/i;
  if (dangerous.test(trimmed)) {
    throw new Error('SQL contains prohibited keywords');
  }
  
  // Ensure LIMIT exists
  let finalSql = trimmed.replace(/;+$/, '');
  if (!/\bLIMIT\s+\d+/i.test(finalSql)) {
    finalSql += ' LIMIT 200';
  } else {
    // Cap LIMIT at 2000
    finalSql = finalSql.replace(/\bLIMIT\s+(\d+)/i, (match, num) => {
      const limit = Math.min(parseInt(num, 10), 2000);
      return `LIMIT ${limit}`;
    });
  }
  
  return finalSql;
}

// Discovery query to find available tables
async function discoverTables(base44, searchPattern) {
  const discoverySql = `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('curated_core','raw_platt','raw_salesforce','raw_sheets','raw_sage')
      AND (
        table_name ILIKE '%${searchPattern}%'
      )
    ORDER BY table_schema, table_name
    LIMIT 200
  `;
  
  try {
    const result = await runSql(base44, discoverySql);
    return result.data_rows || [];
  } catch (error) {
    console.error('[discoverTables] Discovery failed:', error.message);
    return [];
  }
}

// Discover columns in a view
async function discoverColumns(base44, viewName) {
  try {
    const sql = `SHOW COLUMNS IN ${viewName}`;
    const result = await runSql(base44, sql);
    return result.data_rows?.map(row => {
      const vals = Array.isArray(row) ? row : Object.values(row);
      return vals[0]; // First column is the column name
    }) || [];
  } catch (error) {
    console.error(`[discoverColumns] Failed for ${viewName}:`, error.message);
    return [];
  }
}

// Intelligent SQL fixer - tries to fix common errors
async function fixAndRetrySQL(base44, originalSql, error, attemptNumber = 1) {
  if (attemptNumber > 3) {
    throw new Error(`Max retry attempts reached: ${error}`);
  }

  console.log(`[fixAndRetrySQL] Attempt ${attemptNumber} to fix SQL...`);
  
  // Extract view name from SQL
  const viewMatch = originalSql.match(/FROM\s+([\w\.]+)/i);
  if (!viewMatch) {
    throw error;
  }
  
  const viewName = viewMatch[1];
  
  // If column not found, discover correct columns
  if (/column.*cannot be resolved|column.*not found/i.test(error.message)) {
    console.log(`[fixAndRetrySQL] Column error detected, discovering columns in ${viewName}...`);
    const columns = await discoverColumns(base44, viewName);
    
    if (columns.length === 0) {
      throw new Error(`Could not discover columns in ${viewName}`);
    }
    
    console.log(`[fixAndRetrySQL] Discovered ${columns.length} columns:`, columns.slice(0, 10));
    
    // Try to find the column the query was looking for
    const colMatch = error.message.match(/column['\s]+([^\s']+)/i);
    if (colMatch) {
      const missingCol = colMatch[1].toLowerCase();
      
      // Find similar columns
      const similar = columns.filter(c => 
        c.toLowerCase().includes(missingCol) || 
        missingCol.includes(c.toLowerCase())
      );
      
      if (similar.length > 0) {
        console.log(`[fixAndRetrySQL] Found similar column: ${similar[0]}`);
        const fixedSql = originalSql.replace(
          new RegExp(`\\b${missingCol}\\b`, 'gi'),
          similar[0]
        );
        return await runSql(base44, fixedSql);
      }
      
      // If looking for mrr-like column, find any column with 'mrr' in it
      if (/mrr|revenue/i.test(missingCol)) {
        const mrrCols = columns.filter(c => /mrr|revenue/i.test(c));
        if (mrrCols.length > 0) {
          console.log(`[fixAndRetrySQL] Found MRR column: ${mrrCols[0]}`);
          const fixedSql = originalSql.replace(
            new RegExp(`\\b${missingCol}\\b`, 'gi'),
            mrrCols[0]
          );
          return await runSql(base44, fixedSql);
        }
      }
    }
    
    // If we can't fix it intelligently, try a generic query
    console.log(`[fixAndRetrySQL] Cannot fix specific column, trying SELECT * approach...`);
    const genericSql = `SELECT * FROM ${viewName} LIMIT 100`;
    return await runSql(base44, genericSql);
  }
  
  // If table/view not found, try to find similar ones
  if (/table.*not found|does not exist/i.test(error.message)) {
    console.log(`[fixAndRetrySQL] Table not found, discovering similar tables...`);
    const tableMatch = error.message.match(/table[:\s]+([^\s,]+)/i);
    if (tableMatch) {
      const searchTerm = tableMatch[1].split('.').pop().replace(/_/g, '');
      const discovered = await discoverTables(base44, searchTerm);
      
      if (discovered.length > 0) {
        const suggestion = `${discovered[0][0]}.${discovered[0][1]}`;
        console.log(`[fixAndRetrySQL] Found alternative table: ${suggestion}`);
        const fixedSql = originalSql.replace(viewName, suggestion);
        return await runSql(base44, fixedSql);
      }
    }
  }
  
  throw error;
}

// Execute single SQL via freeform_sql_v1 with retries
async function runSql(base44, sql, retryCount = 0) {
  const maxRetries = 2;
  const sanitized = validateAndSanitizeSQL(sql);
  
  try {
    const result = await base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql: sanitized }
    });
    
    const response = result.data;
    
    // Check for errors
    if (response.ok === false || response.error) {
      // If LIMIT too high, reduce and retry
      if (retryCount < maxRetries && /limit/i.test(response.error)) {
        console.log('[runSql] Reducing LIMIT and retrying...');
        const reducedSql = sanitized.replace(/LIMIT\s+\d+/i, 'LIMIT 100');
        return await runSql(base44, reducedSql, retryCount + 1);
      }
      
      throw new Error(`MAC data lake error: ${response.error} (HTTP ${response.http_status || 'unknown'})`);
    }
    
    return {
      columns: response.columns || [],
      data_rows: response.data_rows || [],
      evidence: {
        athena_query_execution_id: response.athena_query_execution_id || response.execution_id,
        rows_returned: response.rows_returned || response.data_rows?.length || 0,
        generated_sql: response.generated_sql || sanitized,
        rows_truncated: response.rows_truncated || false
      },
      sql: sanitized
    };
  } catch (error) {
    // Network or timeout errors - retry with backoff
    if (retryCount < maxRetries && !/MAC data lake error/.test(error.message)) {
      const backoffMs = Math.pow(2, retryCount + 1) * 1000;
      console.log(`[runSql] Retry ${retryCount + 1}/${maxRetries} after ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return await runSql(base44, sql, retryCount + 1);
    }
    throw error;
  }
}

// Main orchestrator
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null); // Allow public access

    const { question } = await req.json();
    
    if (!question) {
      return Response.json({
        ok: false,
        error: 'Missing question field'
      }, { status: 200 });
    }

    console.log('[answerQuestion] Question:', question);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP -1: PLAT ID COUNT ROUTING (MANDATORY)
    // ═══════════════════════════════════════════════════════════════════════════
    // This uses the SAME query as Revenue Repro Pack's "Total Plat IDs" feature
    // to ensure consistent answers: curated_core.dim_customer_platt
    
    const platIdPatterns = /how many (total |distinct |unique )?(plat(t)? ?ids?|platt (customer )?ids?)|total (number of )?(plat(t)? ?ids?)|count (of )?(plat(t)? ?ids?)/i;
    
    if (platIdPatterns.test(question)) {
      console.log('[answerQuestion] PLAT ID QUESTION DETECTED - Using dim_customer_platt (same as Revenue Repro)');
      
      const run_at = new Date().toISOString();
      const sql = `SELECT COUNT(*) AS rows_total, COUNT(DISTINCT customer_id) AS distinct_plat_ids FROM curated_core.dim_customer_platt LIMIT 1`;
      
      try {
        const response = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql }
        });
        
        const result = response.data;
        
        if (result.ok === false || result.error) {
          return Response.json({
            ok: false,
            error: `Plat ID count query failed: ${result.error}`,
            answer_markdown: `## ❌ Plat ID Count Query Failed

**Error**: ${result.error}

**Evidence**:
- **Athena Query Execution ID**: \`${result.evidence?.athena_query_execution_id || 'N/A'}\`
- **SQL Executed**: 
\`\`\`sql
${sql}
\`\`\`

**Next Steps**:
1. Check Athena permissions for curated_core.dim_customer_platt
2. Verify the view exists
3. Review the execution ID in AWS Athena console`,
            evidence: {
              run_at,
              generated_sql: sql,
              athena_query_execution_id: result.evidence?.athena_query_execution_id,
              error: result.error
            }
          });
        }
        
        // Parse results
        const row = result.data_rows?.[0];
        const values = Array.isArray(row) ? row : Object.values(row || {});
        const rowsTotal = values[0] || 'N/A';
        const distinctPlatIds = values[1] || 'N/A';
        
        const answer = `## Total Plat IDs

Based on the **Customer Spine** definition (\`curated_core.dim_customer_platt\`):

### Key Metrics:
- **Total Rows**: **${typeof rowsTotal === 'number' ? rowsTotal.toLocaleString() : rowsTotal}**
- **Distinct Plat IDs**: **${typeof distinctPlatIds === 'number' ? distinctPlatIds.toLocaleString() : distinctPlatIds}**

### Definition Used:
- **Source**: \`curated_core.dim_customer_platt\` (Customer Spine)
- This is the same query used by the Revenue Reconciliation Pack's "Total Plat IDs" feature

### Evidence:
- **Run At**: ${run_at}
- **Athena Query Execution ID**: \`${result.evidence?.athena_query_execution_id || 'N/A'}\`
- **SQL Executed**:
\`\`\`sql
${sql}
\`\`\``;
        
        return Response.json({
          answer_markdown: answer,
          data_results: [{ rows_total: rowsTotal, distinct_plat_ids: distinctPlatIds }],
          visualization_type: 'table',
          evidence: {
            run_at,
            views_used: ['curated_core.dim_customer_platt'],
            athena_query_execution_id: result.evidence?.athena_query_execution_id,
            generated_sql: [{ step: 'plat_id_count', purpose: 'Count distinct Plat IDs', sql }]
          }
        });
        
      } catch (error) {
        console.error('[answerQuestion] Plat ID count error:', error);
        return Response.json({
          ok: false,
          error: `Plat ID count exception: ${error.message}`,
          answer_markdown: `## ❌ Plat ID Count Query Exception

**Error**: ${error.message}

**Evidence**:
- **SQL Attempted**: \`${sql}\`

**Next Steps**:
1. Check AWS AI Layer connectivity
2. Review backend function logs`,
          evidence: {
            run_at,
            generated_sql: sql,
            error: error.message
          }
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP -0.5: CUSTOMER COUNT TEMPLATE ROUTING (MANDATORY)
    // ═══════════════════════════════════════════════════════════════════════════
    
    const customerCountPatterns = /how many (total |distinct |unique )?(customers?|customer ids?|accounts?)|total (number of )?(customers?|accounts?)|count (of )?(customers?|accounts?)|customer count|number of (active )?customers?/i;
    
    if (customerCountPatterns.test(question)) {
      console.log('[answerQuestion] CUSTOMER COUNT QUESTION DETECTED - Using template_id=customer_count_v1');
      
      try {
        const response = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'customer_count_v1',
          params: {}
        });
        
        const result = response.data;
        
        if (result.ok === false || result.error) {
          // Template call failed - return explicit error with evidence
          const errorMsg = result.error || 'Template execution failed';
          const executionId = result.athena_query_execution_id || 'N/A';
          const sql = result.sql || 'N/A';
          
          return Response.json({
            ok: false,
            error: `Customer count template failed: ${errorMsg}`,
            answer_markdown: `## ❌ Customer Count Query Failed

**Error**: ${errorMsg}

**Evidence**:
- **Athena Query Execution ID**: \`${executionId}\`
- **SQL Template**: \`customer_count_v1\`
- **SQL Executed**: 
\`\`\`sql
${sql}
\`\`\`

**Next Steps**:
1. Check Athena permissions for the customer_count_v1 template
2. Verify the template SQL is valid
3. Review the execution ID in AWS Athena console for detailed logs`,
            evidence: {
              template_id: 'customer_count_v1',
              athena_query_execution_id: executionId,
              sql_executed: sql,
              error: errorMsg
            }
          });
        }
        
        // Success - extract the two key metrics
        const data = result.data_rows || [];
        const columns = result.columns || [];
        
        // Parse the results (adjust column names based on actual template output)
        const totals = data[0] || [];
        const distinctPlattIds = Array.isArray(totals) ? totals[0] : totals.distinct_platt_customer_ids || 'N/A';
        const activeCustomers = Array.isArray(totals) ? totals[1] : totals.active_customers_v1 || 'N/A';
        
        const answer = `## Customer Count Summary

Based on the **Data Lake Project** definitions:

### Key Metrics:
- **Total Distinct Platt Customer IDs (Last 24 Months)**: **${distinctPlattIds.toLocaleString()}**
- **Active Customers V1 (Billed in Last 12 Months, Non-Test)**: **${activeCustomers.toLocaleString()}**

### Definitions Used:
- **Distinct Platt Customer IDs**: Unique customer identifiers with activity in the past 24 months
- **Active Customers V1**: Customers who were billed in the last 12 months, excluding test accounts

### Evidence:
- **Template ID**: \`customer_count_v1\`
- **Athena Query Execution ID**: \`${result.athena_query_execution_id || 'N/A'}\`
- **Data Source**: GWI Commercial Data Lake`;
        
        return Response.json({
          answer_markdown: answer,
          data_results: data.map((row, idx) => {
            if (Array.isArray(row)) {
              const obj = {};
              columns.forEach((col, i) => { obj[col] = row[i]; });
              return obj;
            }
            return row;
          }),
          visualization_type: 'table',
          evidence: {
            template_id: 'customer_count_v1',
            athena_query_execution_id: result.athena_query_execution_id,
            columns,
            sql_executed: result.sql || 'customer_count_v1 template'
          }
        });
        
      } catch (error) {
        console.error('[answerQuestion] Customer count template error:', error);
        return Response.json({
          ok: false,
          error: `Customer count template exception: ${error.message}`,
          answer_markdown: `## ❌ Customer Count Query Exception

**Error**: ${error.message}

**Evidence**:
- **Template ID**: \`customer_count_v1\`
- **Exception Type**: ${error.name || 'Unknown'}

**Next Steps**:
1. Verify the customer_count_v1 template exists in the AWS AI Layer
2. Check AWS Lambda permissions for template execution
3. Review backend function logs for detailed stack trace`,
          evidence: {
            template_id: 'customer_count_v1',
            error: error.message
          }
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 0: AUTOMATIC INTENT CLASSIFICATION (MANDATORY)
    // ═══════════════════════════════════════════════════════════════════════════
    
    const strategyPatterns = /approach to|how (do|does) we (talk|position|frame|present|pitch|sell|explain|describe|discuss)|our (strategy|philosophy|narrative|positioning|playbook|messaging)|investor (narrative|story|pitch|deck)|playbook|what (do|does) we tell|how we (talk|position|frame)/i;
    const metricPatterns = /what is (the|our)? ?(total|current|latest)? ?\b(mrr|revenue|churn|count|margin|band)\b|show me|how many|calculate|breakdown|by segment|trend|over time|last (month|quarter|year)|december|january|customers?|accounts?/i;
    
    const isStrategyQuestion = strategyPatterns.test(question);
    const isMetricQuestion = metricPatterns.test(question);
    
    let intentCategory;
    if (isStrategyQuestion && isMetricQuestion) {
      intentCategory = 'MIXED';
    } else if (isStrategyQuestion) {
      intentCategory = 'STRATEGY_OR_PLAYBOOK';
    } else {
      intentCategory = 'METRIC_OR_ANALYTICS';
    }
    
    console.log(`[answerQuestion] INTENT CLASSIFICATION: ${intentCategory}`);
    
    // Step 0: Check knowledge base based on intent
    let knowledgeBaseAnswer = null;
    const shouldCheckKnowledge = intentCategory === 'STRATEGY_OR_PLAYBOOK' || intentCategory === 'MIXED';
    
    if (shouldCheckKnowledge) {
      console.log(`[answerQuestion] [${intentCategory}] Checking knowledge S3 bucket as PRIMARY source...`);
      try {
        // List available documents
        const docsResponse = await base44.functions.invoke('s3KnowledgeCatalog', { action: 'list' });
        const documents = docsResponse.data?.documents || [];
        
        console.log(`[answerQuestion] Found ${documents.length} documents in S3 knowledge bucket`);
        
        // Search for relevant documents based on question keywords
        const questionLower = question.toLowerCase();
        let relevantDocs = [];
        
        if (/investor|investment|funding|series/i.test(questionLower)) {
          relevantDocs = documents.filter(d => 
            /investor|investment|faq|series|deck|pitch/i.test(d.name)
          );
        } else if (/strategy|approach|playbook|positioning/i.test(questionLower)) {
          relevantDocs = documents.filter(d => 
            /strategy|playbook|approach|positioning|narrative/i.test(d.name)
          );
        } else {
          // Fall back to investor docs for general strategy questions
          relevantDocs = documents.filter(d => 
            /investor|faq|strategy|deck/i.test(d.name)
          );
        }
        
        console.log(`[answerQuestion] Identified ${relevantDocs.length} relevant documents:`, relevantDocs.map(d => d.name));
        
        if (relevantDocs.length === 0 && documents.length > 0) {
          // If no specific match, try the first document
          relevantDocs = [documents[0]];
          console.log('[answerQuestion] No specific match, using first available document:', documents[0].name);
        }
        
        if (relevantDocs.length > 0) {
          // Process up to 3 most relevant documents
          const docsToProcess = relevantDocs.slice(0, 3);
          const extractedContent = [];
          
          for (const doc of docsToProcess) {
            try {
              console.log(`[answerQuestion] Processing document: ${doc.name}`);
              
              // Get signed URL for secure access
              const signedUrlResponse = await base44.functions.invoke('s3KnowledgeCatalog', {
                action: 'get_signed_url',
                key: doc.key
              });
              
              const signedUrl = signedUrlResponse.data?.signed_url;
              
              if (signedUrl) {
                // Use LLM with the document to extract relevant information
                const docContent = await base44.integrations.Core.InvokeLLM({
                  prompt: `You are analyzing a GWI/Mac Mountain internal document (${doc.name}) to answer this question:

"${question}"

Your task:
1. Extract ALL information directly relevant to answering this question
2. Include specific details: strategies, approaches, messaging, positioning, key metrics we show, narratives we use
3. Quote or paraphrase key sections accurately
4. If this is about "approach to investors", extract: investment thesis, growth story, how we position risk/opportunity, key metrics we highlight, competitive advantages
5. Format as clear, detailed bullet points with section headers where appropriate
6. If the document doesn't contain relevant information, say "No relevant information found in this document"

Extract the relevant information:`,
                  file_urls: [signedUrl]
                });
                
                extractedContent.push({
                  document: doc.name,
                  content: docContent
                });
                
                console.log(`[answerQuestion] Extracted content from ${doc.name}`);
              }
            } catch (docError) {
              console.error(`[answerQuestion] Failed to process ${doc.name}:`, docError.message);
            }
          }
          
          if (extractedContent.length > 0) {
            knowledgeBaseAnswer = extractedContent.map(item => 
              `**From ${item.document}:**\n${item.content}`
            ).join('\n\n');
            console.log(`[answerQuestion] Successfully extracted knowledge from ${extractedContent.length} document(s)`);
          }
        } else {
          console.log('[answerQuestion] No documents found in S3 knowledge bucket');
        }
      } catch (error) {
        console.error('[answerQuestion] Knowledge base lookup failed:', error.message);
      }
    }
    
    // Determine if we should skip data lake queries (pure strategy question with complete answer)
    const skipDataLake = intentCategory === 'STRATEGY_OR_PLAYBOOK' && 
                        knowledgeBaseAnswer && 
                        !/not found|don't have|cannot find|no information|no relevant/i.test(knowledgeBaseAnswer);

    // Skip data lake if pure strategy question with complete answer
    if (skipDataLake) {
      console.log('[answerQuestion] [STRATEGY_OR_PLAYBOOK] Complete answer from knowledge S3, skipping data lake...');
      
      // Enhance with AI suggestions
      const enrichedAnswer = await base44.integrations.Core.InvokeLLM({
        prompt: `You are the GWI/Mac Mountain AI assistant. A user asked: "${question}"

Here is the factual information from our knowledge base:
${knowledgeBaseAnswer}

Your task:
1. Present the knowledge base facts clearly and professionally
2. Add a "💡 AI Insights & Suggestions" section with:
   - Strategic recommendations based on the facts
   - Potential deeper dive questions the user might want to explore
   - Connections to operational metrics or data they could review
   - 3-5 specific next steps or considerations

Format in clear markdown with sections. Start with the facts, then add insights.`
      });
      
      return Response.json({
        answer_markdown: enrichedAnswer + '\n\n---\n\n**Source**: GWI knowledge docs (S3 - MASTER_Investor_FAQs.pdf)',
        data_results: [],
        visualization_type: 'none',
        evidence: {
          intent_category: intentCategory,
          source: 'knowledge_s3_bucket',
          document_used: 'MASTER_Investor_FAQs.pdf',
          views_used: [],
          generated_sql: []
        },
        metadata: {
          intent_category: intentCategory,
          source_type: 'knowledge_s3_primary',
          external_context_used: false
        }
      });
    }

    // Log source routing based on intent
    if (intentCategory === 'METRIC_OR_ANALYTICS') {
      console.log('[answerQuestion] [METRIC_OR_ANALYTICS] Data lake is PRIMARY source');
    } else if (intentCategory === 'MIXED') {
      console.log('[answerQuestion] [MIXED] Using BOTH: knowledge S3 (narrative) + data lake (metrics)');
    }

    // Step A: Generate query plan using LLM
    const planPrompt = `You are the AI assistant for the GWI / Mac Mountain Commercial Data Lake (AWS Athena).

═══════════════════════════════════════════════════════════════════════════
PRIME DIRECTIVE — DO NOT BREAK WHAT WORKS
═══════════════════════════════════════════════════════════════════════════
- Data is fetched via the existing aiLayerQuery backend function only
- SQL queries use template_id="freeform_sql_v1"
- Never rename, replace, or remove this working infrastructure

═══════════════════════════════════════════════════════════════════════════
HARD SAFETY BOUNDARY (ENFORCE)
═══════════════════════════════════════════════════════════════════════════
Allowed SQL types:
  • SELECT / WITH (for data queries)
  • SHOW / DESCRIBE (for schema discovery only)

Rules:
  • Single statement only (Athena requirement)
  • REQUIRE LIMIT for SELECT/WITH: if missing, append "LIMIT 200", cap at "LIMIT 2000"
  • BLOCK write/admin keywords: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, MERGE, CTAS, UNLOAD, MSCK, GRANT, REVOKE

═══════════════════════════════════════════════════════════════════════════
DEFENSIVE DATETIME PARSING (MANDATORY FOR ALL DATE/TIME QUERIES)
═══════════════════════════════════════════════════════════════════════════
Many lake columns storing dates/times are VARCHAR and may contain invalid strings.

NEVER call date functions directly on VARCHAR columns. ALWAYS use defensive parsing:

✓ CORRECT PATTERN:
  WITH parsed AS (
    SELECT
      TRY(parse_datetime(created_time, 'yyyy-MM-dd HH:mm:ss')) AS created_ts,
      other_columns
    FROM curated_core.v_cci_tickets_clean
  )
  SELECT
    DATE_TRUNC('day', created_ts) AS ticket_date,
    COUNT(*) AS ticket_count
  FROM parsed
  WHERE created_ts IS NOT NULL
  GROUP BY DATE_TRUNC('day', created_ts)
  ORDER BY ticket_date DESC
  LIMIT 100

✗ WRONG (will fail on bad data):
  SELECT DATE_TRUNC('day', parse_datetime(created_time, ...))

Key Rules:
  • Use TRY(parse_datetime(...)) or TRY(date_parse(...)) in a CTE/subquery
  • Filter with WHERE parsed_ts IS NOT NULL in outer query
  • Apply to: created_time, estimated_arrival_time, any VARCHAR date fields
  • If INVALID_FUNCTION_ARGUMENT error → switch to TRY() pattern and retry

═══════════════════════════════════════════════════════════════════════════
RELIABILITY RULES (PREVENTS HALLUCINATIONS)
═══════════════════════════════════════════════════════════════════════════
YOU MUST NOT GUESS TABLE NAMES OR COLUMN NAMES.

Mandatory Discovery:
  • If not 100% sure a table exists → run: SELECT table_schema, table_name FROM information_schema.tables ORDER BY 1,2 LIMIT 200
  • If not 100% sure a column exists → run: SHOW COLUMNS IN <schema>.<table>

Only generate SQL using discovered objects/columns.

═══════════════════════════════════════════════════════════════════════════
CANONICAL "KNOWN-GOOD" SURFACES (PREFER THESE FIRST)
═══════════════════════════════════════════════════════════════════════════
Use these objects as your PRIMARY data sources:

  📊 Customers / Active Definition:
     curated_core.dim_customer_platt

  💰 MRR (Monthly Recurring Revenue) — AUTHORITATIVE SOURCES:
     curated_core.v_monthly_mrr_platt (customer/CRID detail by month)
     curated_core.v_monthly_mrr_by_segment (segment rollups by month)
     curated_core.v_monthly_mrr_platt_movement_segmented (movement + adds/churns by segment)

  📉 Churn + Movement:
     curated_core.v_monthly_account_churn_by_segment
     curated_core.v_monthly_mrr_and_churn_summary

  🎯 Action Bands A–E:
     curated_core.v_customer_fully_loaded_margin_banded

  ⚠️ Worst E-Band List:
     curated_core.v_cci_e_band_exit_accounts

  📞 Hosted PBX Uplift:
     curated_core.v_hosted_pbx_migration

  🎫 Complexity Drivers (P–V):
     curated_core.v_customer_margin_plus_tickets

CRITICAL MRR RULES:
- For ANY MRR question, use v_monthly_mrr_* views ONLY
- Common columns: period_month (DATE), customer_id, mrr_total, segment, total_mrr
- Do NOT use total_mrr from v_customer_fully_loaded_margin_banded for MRR reporting
- Always filter by period_month for specific time periods

═══════════════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════════════
User Question: "${question}"

Follow this execution model: PLAN → DISCOVER → EXECUTE

1) PLAN: Identify which canonical surface(s) answer this question
2) DISCOVER: First step MUST be "SHOW COLUMNS IN <canonical_view>" if not 100% certain of column names
3) EXECUTE: Generate SELECT query using discovered columns

Return JSON only (no markdown):
{
  "intent": "customers|churn|bands|hosted_pbx|worst_e|other",
  "steps": [
    {
      "id": "step1",
      "purpose": "Discover columns in v_customer_fully_loaded_margin_banded",
      "sql": "SHOW COLUMNS IN curated_core.v_customer_fully_loaded_margin_banded",
      "is_discovery": true
    },
    {
      "id": "step2", 
      "purpose": "Calculate total MRR by action band",
      "sql": "SELECT action_band, SUM(total_mrr) as total_mrr FROM curated_core.v_customer_fully_loaded_margin_banded GROUP BY action_band ORDER BY action_band LIMIT 10",
      "is_discovery": false
    }
  ],
  "answer_approach": "Present band distribution with totals",
  "fallback_needed": false
}

IMPORTANT: Only set "fallback_needed": true if the question is about data COMPLETELY OUTSIDE the GWI commercial domain (e.g., HR, shipping logistics, product inventory). If it's about customers, revenue, margins, churn, accounts, pricing, uplift, or operations → set false and use canonical views.

Query must:
  • Start with SHOW COLUMNS for discovery (step 1)
  • Use only curated_core database and canonical views above
  • Include LIMIT for all SELECT queries
  • Be simple and focused (1-3 steps max)`;

    const planResult = await base44.integrations.Core.InvokeLLM({
      prompt: planPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                purpose: { type: "string" },
                sql: { type: "string" },
                expected_output: { type: "string" },
                is_discovery: { type: "boolean" }
              },
              required: ["id", "purpose", "sql"]
            }
          },
          answer_approach: { type: "string" },
          fallback_needed: { type: "boolean" }
        },
        required: ["steps", "fallback_needed"]
      }
    });

    console.log('[answerQuestion] Plan generated:', planResult.steps.length, 'steps');
    
    // If fallback is flagged, log it but DON'T give up - we'll run diagnostics anyway
    if (planResult.fallback_needed) {
      console.log('[answerQuestion] Plan suggests fallback, but will attempt diagnostic investigation...');
    }

    // Step B: Execute steps (sequential, max 2 concurrent if needed)
    const results = [];
    const evidence = {
      query_executions: [],
      views_used: new Set(),
      generated_sql: []
    };

    for (const step of planResult.steps) {
      let retryAttempt = 0;
      let queryResult = null;
      let lastError = null;
      
      while (retryAttempt < 4 && !queryResult) {
        try {
          console.log(`[answerQuestion] Executing ${step.id}:`, step.purpose, retryAttempt > 0 ? `(retry ${retryAttempt})` : '');
          
          if (retryAttempt === 0) {
            // First attempt with original SQL
            queryResult = await runSql(base44, step.sql);
          } else {
            // Retry with intelligent fixing
            queryResult = await fixAndRetrySQL(base44, step.sql, lastError, retryAttempt);
          }
          
          results.push({
            step_id: step.id,
            purpose: step.purpose,
            columns: queryResult.columns,
            data_rows: queryResult.data_rows,
            sql_executed: queryResult.sql,
            success: true,
            retry_count: retryAttempt
          });

          // Collect evidence
          if (queryResult.evidence?.athena_query_execution_id) {
            evidence.query_executions.push(queryResult.evidence.athena_query_execution_id);
          }
          if (queryResult.evidence?.views_used) {
            queryResult.evidence.views_used.forEach(v => evidence.views_used.add(v));
          }
          evidence.generated_sql.push({
            step: step.id,
            purpose: step.purpose,
            sql: queryResult.sql,
            retry_count: retryAttempt
          });
          
          break; // Success, exit retry loop

        } catch (error) {
          lastError = error;
          retryAttempt++;
          
          if (retryAttempt >= 4) {
            // Max retries reached, log error
            console.error(`[answerQuestion] Step ${step.id} failed after ${retryAttempt} attempts:`, error.message);
            
            const errorDetails = {
              step_id: step.id,
              purpose: step.purpose,
              error: error.message,
              success: false,
              retry_count: retryAttempt
            };

            results.push(errorDetails);
            
            evidence.generated_sql.push({
              step: step.id,
              purpose: step.purpose,
              sql: step.sql,
              error: error.message,
              retry_count: retryAttempt
            });
          } else {
            console.log(`[answerQuestion] Retry ${retryAttempt} for ${step.id}...`);
          }
        }
      }
    }

    // Check if any queries succeeded
    const successfulSteps = results.filter(r => r.success);
    const failedSteps = results.filter(r => !r.success);
    
    // Detect ambiguous questions that need deeper investigation
    const isAmbiguous = /uplift|improve|opportunity|problem|issue|concern|better|optimize|worst|best|where|what.*do|should.*focus|pricing|price|c-band|d-band|e-band|margin|low.*ticket/i.test(question);
    const needsInvestigation = (failedSteps.length > 0 || successfulSteps.length === 0 || isAmbiguous || planResult.fallback_needed);
    
    // ALWAYS run investigation if we don't have good data yet
    if (needsInvestigation) {
      console.log('[answerQuestion] Running investigative diagnostic queries...');
      
      // Comprehensive diagnostic queries covering all common question types
      const diagnosticQueries = [
        {
          id: 'low_margin_accounts',
          purpose: 'Find accounts with lowest margins for immediate action',
          sql: `SELECT account_number, account_name, total_mrr, action_band, total_cost, 
                       (total_mrr - total_cost) as net_margin,
                       ROUND((total_mrr - total_cost) / NULLIF(total_mrr, 0) * 100, 1) as margin_percent
                FROM curated_core.v_customer_fully_loaded_margin_banded
                WHERE action_band IN ('D', 'E') AND total_mrr > 0
                ORDER BY net_margin ASC
                LIMIT 25`
        },
        {
          id: 'c_band_pricing_opportunities',
          purpose: 'C-Band accounts with low ticket size - pricing improvement opportunities',
          sql: `SELECT account_number, account_name, total_mrr, action_band,
                       total_cost, (total_mrr - total_cost) as net_margin
                FROM curated_core.v_customer_fully_loaded_margin_banded
                WHERE action_band = 'C' AND total_mrr < 500
                ORDER BY total_mrr ASC
                LIMIT 30`
        },
        {
          id: 'all_band_pricing',
          purpose: 'Pricing opportunities across all bands with low MRR',
          sql: `SELECT account_number, account_name, total_mrr, action_band, total_cost
                FROM curated_core.v_customer_fully_loaded_margin_banded
                WHERE total_mrr < 300 AND action_band IN ('B', 'C', 'D')
                ORDER BY action_band, total_mrr ASC
                LIMIT 40`
        },
        {
          id: 'high_uplift_opportunities',
          purpose: 'Identify migration opportunities with significant revenue potential',
          sql: `SELECT account_number, mrr_uplift_to_50, target_mrr_at_50,
                       ROUND(mrr_uplift_to_50 / NULLIF(target_mrr_at_50, 0) * 100, 1) as uplift_percent
                FROM curated_core.v_hosted_pbx_migration
                WHERE mrr_uplift_to_50 > 500
                ORDER BY mrr_uplift_to_50 DESC
                LIMIT 20`
        },
        {
          id: 'band_distribution',
          purpose: 'Show customer health distribution across action bands',
          sql: `SELECT action_band, COUNT(*) as customer_count, 
                       SUM(total_mrr) as total_mrr,
                       ROUND(AVG(total_mrr), 2) as avg_mrr,
                       SUM(total_cost) as total_cost
                FROM curated_core.v_customer_fully_loaded_margin_banded
                GROUP BY action_band
                ORDER BY action_band
                LIMIT 10`
        },
        {
          id: 'low_ticket_summary',
          purpose: 'Summary of low-ticket accounts needing pricing review',
          sql: `SELECT 
                  CASE 
                    WHEN total_mrr < 100 THEN 'Under $100'
                    WHEN total_mrr < 200 THEN '$100-$200'
                    WHEN total_mrr < 300 THEN '$200-$300'
                    ELSE '$300-$500'
                  END as mrr_range,
                  action_band,
                  COUNT(*) as account_count,
                  SUM(total_mrr) as total_mrr
                FROM curated_core.v_customer_fully_loaded_margin_banded
                WHERE total_mrr < 500
                GROUP BY mrr_range, action_band
                ORDER BY action_band, mrr_range
                LIMIT 30`
        }
      ];
      
      for (const query of diagnosticQueries) {
        try {
          console.log(`[answerQuestion] Running diagnostic: ${query.purpose}`);
          const diagnosticResult = await runSql(base44, query.sql);
          
          results.push({
            step_id: query.id,
            purpose: query.purpose,
            columns: diagnosticResult.columns,
            data_rows: diagnosticResult.data_rows,
            sql_executed: diagnosticResult.sql,
            success: true,
            is_diagnostic: true
          });
          
          evidence.generated_sql.push({
            step: query.id,
            purpose: query.purpose,
            sql: diagnosticResult.sql,
            note: 'Automatic diagnostic investigation'
          });
          
          if (diagnosticResult.evidence?.views_used) {
            diagnosticResult.evidence.views_used.forEach(v => evidence.views_used.add(v));
          }
        } catch (error) {
          console.error(`[answerQuestion] Diagnostic ${query.id} failed:`, error.message);
        }
      }
    }
    
    // Re-evaluate successful steps after diagnostics
    const updatedSuccessfulSteps = results.filter(r => r.success);
    
    // If ALL steps failed after retries AND diagnostics, we need to try one more discovery approach
    if (updatedSuccessfulSteps.length === 0) {
      console.log('[answerQuestion] All steps failed, attempting final discovery...');
      
      // Try to discover ALL available views and their columns
      try {
        const allViewsSql = `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'curated_core' 
          LIMIT 50
        `;
        const viewsResult = await runSql(base44, allViewsSql);
        const availableViews = viewsResult.data_rows?.map(row => {
          const vals = Array.isArray(row) ? row : Object.values(row);
          return vals[0];
        }) || [];
        
        console.log('[answerQuestion] Available views:', availableViews);
        
        // Try to guess which view might have the data we need based on question
        const questionLower = question.toLowerCase();
        let bestView = null;
        
        if (/mrr|revenue|margin|band/i.test(questionLower)) {
          bestView = availableViews.find(v => /margin|band|mrr/i.test(v));
        } else if (/churn|movement|lost|new/i.test(questionLower)) {
          bestView = availableViews.find(v => /churn|movement/i.test(v));
        } else if (/customer|account/i.test(questionLower)) {
          bestView = availableViews.find(v => /customer|dim/i.test(v));
        }
        
        if (!bestView && availableViews.length > 0) {
          bestView = availableViews[0];
        }
        
        if (bestView) {
          console.log(`[answerQuestion] Attempting fallback query on ${bestView}...`);
          const fallbackSql = `SELECT * FROM curated_core.${bestView} LIMIT 100`;
          const fallbackResult = await runSql(base44, fallbackSql);
          
          results.push({
            step_id: 'fallback_discovery',
            purpose: 'Fallback data retrieval',
            columns: fallbackResult.columns,
            data_rows: fallbackResult.data_rows,
            sql_executed: fallbackResult.sql,
            success: true,
            is_fallback: true
          });
          
          evidence.generated_sql.push({
            step: 'fallback_discovery',
            sql: fallbackResult.sql,
            note: 'Emergency fallback after all planned queries failed'
          });
        }
      } catch (fallbackError) {
        console.error('[answerQuestion] Final discovery also failed:', fallbackError.message);
      }
    }
    
    // Re-check success after fallback and diagnostics
    const finalSuccessfulSteps = results.filter(r => r.success);
    const diagnosticSteps = results.filter(r => r.is_diagnostic && r.success);
    
    // Step B.5: After internal data is retrieved, optionally fetch external context
    const needsExternalContext = /market trend|industry|competitor|benchmark|best practice|what.*should.*do|how.*other|economic|inflation|regulatory|compliance|tech stack|technology comparison/i.test(question);
    
    let externalContext = null;
    if (needsExternalContext && finalSuccessfulSteps.length > 0) {
      console.log('[answerQuestion] Internal data retrieved. Now fetching supplementary external context...');
      try {
        externalContext = await base44.integrations.Core.InvokeLLM({
          prompt: `User question: "${question}"\n\nProvide relevant industry context, benchmarks, or best practices that would help answer this question. Focus on telecom/ISP industry if relevant. Keep it concise (3-5 key points).`,
          add_context_from_internet: true
        });
        console.log('[answerQuestion] External context retrieved');
      } catch (error) {
        console.error('[answerQuestion] External context fetch failed:', error.message);
      }
    }
    
    if (finalSuccessfulSteps.length === 0) {
      return Response.json({
        ok: false,
        error: 'All query attempts exhausted',
        answer_markdown: `I tried multiple approaches to get your answer but ran into persistent data access issues. This might require additional IAM permissions on the AWS side.\n\nPlease check:\n1. IAM permissions for the AI Layer Lambda\n2. Athena workgroup permissions\n3. S3 bucket access for query results\n\nError details have been logged for your data team to investigate.`,
        data_results: [],
        visualization_type: 'none',
        evidence: {
          views_used: [],
          generated_sql: evidence.generated_sql,
          retry_attempts: results.reduce((sum, r) => sum + (r.retry_count || 0), 0)
        }
      });
    }

    // Step C: Compose final answer using LLM
    const composePrompt = `You are the GWI Data Lake AI assistant answering: "${question}"

═══════════════════════════════════════════════════════════════════════════
INTERNAL SOURCES (PRIORITY ORDER)
═══════════════════════════════════════════════════════════════════════════

${knowledgeBaseAnswer ? `
📄 KNOWLEDGE BASE CONTEXT (from MASTER_Investor_FAQs.pdf):
${knowledgeBaseAnswer}

` : ''}

📊 DATA LAKE QUERY RESULTS:
(See Query Execution Results below)

${externalContext ? `
🌐 SUPPLEMENTARY EXTERNAL CONTEXT (for comparison only):
${externalContext}
` : ''}

═══════════════════════════════════════════════════════════════════════════
RESPONSE STRUCTURE REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════

YOU MUST structure your answer in this exact order:

1. **Internal Data First** - Present GWI's actual data/facts from queries and knowledge base
2. **Knowledge Base Integration** - If relevant KB context exists, weave it naturally into your analysis
3. **External Comparison** - Only if external context provided, compare as secondary insight
4. **AI Insights & Suggestions** - REQUIRED section at the end with:
   - Strategic recommendations based on the data
   - Deeper dive questions to explore
   - Specific next steps (3-5 actionable items)
   - Data quality considerations or additional analysis suggestions

═══════════════════════════════════════════════════════════════════════════

Query Execution Results:
${results.map(r => {
  if (!r.success) {
    return `❌ ${r.step_id}: FAILED - ${r.error}`;
  }
  if (r.purpose?.toLowerCase().includes('discover') || r.purpose?.toLowerCase().includes('columns')) {
    return `✓ ${r.step_id}: Schema discovery completed - ${r.data_rows.length} columns found`;
  }
  const isInvestigative = r.is_diagnostic ? ' [DIAGNOSTIC]' : '';
  return `✓ ${r.step_id}${isInvestigative}: ${r.purpose}
   Rows: ${r.data_rows.length} | Columns: ${r.columns.join(', ')}
   Sample: ${JSON.stringify(r.data_rows.slice(0, 3))}`;
}).join('\n\n')}

CRITICAL INSTRUCTIONS FOR EVIDENCE-BASED DECISION MAKING:

${diagnosticSteps.length > 0 ? `
🔍 INVESTIGATIVE DATA AVAILABLE: I ran automatic diagnostic queries to find specific examples and patterns.
Use this investigative data to provide CONCRETE, ACTIONABLE insights with real numbers and account examples.
` : ''}

${failedSteps.length > 0 ? `
⚠️ IMPORTANT: Some queries failed, but you MUST still provide actionable insights:

1. ANALYZE WHAT SUCCEEDED: Look at the data that DID come back - what does it tell us?
2. MAKE INTELLIGENT INFERENCES: Based on the question and partial data, what can we reasonably conclude?
3. PROVIDE SPECIFIC RECOMMENDATIONS: Even with incomplete data, suggest concrete next steps:
   - What additional views/tables should be queried?
   - What patterns in the successful data suggest opportunities?
   - What business actions can be taken with the available information?
4. IDENTIFY DATA GAPS: Be specific about what's missing and why it matters
5. SUGGEST WORKAROUNDS: How can we answer parts of the question with current data?

Example approach for "where do we need uplift":
- Use investigative diagnostic data to show SPECIFIC accounts (with account numbers) that need attention
- If low margin data available → "Account X has only $Y margin with $Z MRR - immediate pricing review needed"
- If uplift opportunities available → "Account A could generate $X additional MRR through PBX migration"
- If band distribution available → "15 customers in E-band represent $XXX,XXX at-risk MRR"
- Always be specific with numbers, account names/numbers, and dollar amounts
- Create a prioritized action list based on the investigative findings
` : ''}

═══════════════════════════════════════════════════════════════════════════
REQUIRED RESPONSE FORMAT (GWI Data Lake Standard)
═══════════════════════════════════════════════════════════════════════════

Your response MUST follow this exact structure:

## 1) SUMMARY (2–5 sentences, plain English)
Lead with the direct answer. Example:
"Based on the latest data, you have **247 active customers** generating **$1.2M in MRR**. The biggest opportunities are in C-band pricing adjustments and hosted PBX migrations."

Use **bold** for key numbers, *italics* for emphasis. No table names in summary.

## 2) RESULTS (small table or top-N list)
Present data visually using markdown tables:

| Account | MRR | Band | Opportunity |
|---------|-----|------|-------------|
| ACC001 | $450 | C | Price increase to $600 |
| ACC002 | $380 | C | PBX migration +$220 |

OR bullet points for top findings:
- **Account ACC001**: $450 MRR in C-band → pricing opportunity
- **Account ACC002**: $380 MRR → PBX migration potential

Limit to 10-15 rows maximum for readability.

## 3) DEFINITIONS USED (only if needed)
Explain any technical terms:
- **Action Band**: A–E rating based on margin and complexity
- **MRR**: Monthly Recurring Revenue

## 4) EVIDENCE (required)
Include exactly:
- **Query Execution ID**: \`<athena_query_execution_id>\`
- **Views Used**: ${Array.from(evidence.views_used).join(', ')}
- **Generated SQL**: (show the final SELECT query)
${externalContext ? '\n- **External Sources**: Industry benchmarks and context from web search' : ''}

═══════════════════════════════════════════════════════════════════════════
TONE & STYLE REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════

✓ DO:
  • Write as a trusted business advisor (conversational but authoritative)
  • Say "Here's what stands out..." not "The data shows..."
  • Use **bold** for numbers, *italics* for emphasis
  • Create tables for comparative data
  • End with "Next Steps" section (3 actionable items)
  • Reference canonical views naturally: "Looking at your margin-banded customer data..."

✗ DON'T:
  • Use technical jargon or table names in the summary
  • Write walls of text (2-3 sentence paragraphs max)
  • Say "I don't have access" (work with available data)
  • Include generic recommendations without specific data backing

EXAMPLE STRUCTURE:
Based on your margin analysis, **23 C-band accounts** generating **$8,400 MRR** have pricing improvement potential...

| Account | Current MRR | Target | Uplift |
|---------|-------------|--------|--------|
| ACC123  | $295        | $450   | +$155  |

> **Key Insight**: Low-ticket C-band accounts represent $45K in uplift opportunity.

**Next Steps:**
1. Sales review pricing for accounts under $300 MRR
2. CSM outreach to top 10 accounts this week
3. Track conversion rate monthly

═══════════════════════════════════════════════════════════════════════════
MANDATORY: AI INSIGHTS & SUGGESTIONS SECTION
═══════════════════════════════════════════════════════════════════════════

Every response MUST end with:

## 💡 AI Insights & Suggestions

**Strategic Recommendations:**
- (Based on the data, what actions should be prioritized?)
- (What patterns or opportunities stand out?)

**Deeper Dive Questions:**
- (What additional questions would reveal more insights?)
- (What related metrics should be examined?)

**Next Steps:**
1. (Specific actionable item)
2. (Specific actionable item)
3. (Specific actionable item)

**Data Considerations:**
- (Any data quality notes or additional analysis that would help)`;

    const finalAnswer = await base44.integrations.Core.InvokeLLM({
      prompt: composePrompt
    });

    console.log('[answerQuestion] Answer composed');

    // Prepare data_results for visualization
    const combinedData = finalSuccessfulSteps
      .filter(r => r.data_rows.length > 0)
      .flatMap(r => r.data_rows.map(row => {
        if (Array.isArray(row)) {
          const obj = {};
          r.columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        }
        return row;
      }));

    return Response.json({
      answer_markdown: finalAnswer,
      data_results: combinedData,
      visualization_type: 'table',
      evidence: {
        intent_category: intentCategory,
        knowledge_base_used: !!knowledgeBaseAnswer,
        views_used: Array.from(evidence.views_used),
        athena_query_execution_ids: evidence.query_executions,
        generated_sql: evidence.generated_sql,
        rows_returned: combinedData.length,
        query_plan: planResult.steps.map(s => ({ id: s.id, purpose: s.purpose })),
        kb_sources: knowledgeBaseAnswer ? ['s3://gwi-raw-us-east-2-pc/knowledge_base/'] : []
      },
      metadata: {
        intent_category: intentCategory,
        steps_executed: results.length,
        steps_succeeded: finalSuccessfulSteps.length,
        steps_failed: results.filter(r => !r.success).length,
        total_retries: results.reduce((sum, r) => sum + (r.retry_count || 0), 0),
        external_context_used: !!externalContext,
        knowledge_base_used: !!knowledgeBaseAnswer
      }
    });

  } catch (error) {
    console.error('[answerQuestion] Exception:', error.message);
    return Response.json({
      ok: false,
      error: error.message,
      hint: 'Multi-query orchestration failed. Check function logs.'
    }, { status: 200 });
  }
});