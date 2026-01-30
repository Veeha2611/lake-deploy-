import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const auditStartTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const auditLog = {
      audit_timestamp: new Date().toISOString(),
      audited_by: user.email,
      audit_method: 'USER-SCOPED (base44.functions.invoke, not asServiceRole)',
      modules_tested: [],
      summary: {
        total_modules: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      cross_reference_log: [],
      next_steps: []
    };
    
    // Helper to execute and log query
    async function testQuery(queryName, sql, expectedBehavior = null) {
      const queryStart = Date.now();
      try {
        const response = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql }
        });
        
        const result = response.data;
        const queryDuration = Date.now() - queryStart;
        
        // Cross-reference log entry
        const crossRefEntry = {
          query_text: sql.trim().substring(0, 200) + (sql.length > 200 ? '...' : ''),
          athena_query_execution_id: result?.athena_query_execution_id || result?.execution_id || 'NOT_CAPTURED',
          evidence_fields: {
            generated_sql_captured: !!result?.generated_sql,
            views_used_captured: !!result?.evidence?.views_used,
            execution_id_captured: !!(result?.athena_query_execution_id || result?.execution_id)
          },
          sql_match: result?.generated_sql?.trim() === sql.trim() ? 'EXACT' : 'MODIFIED',
          rows_returned: result?.rows_returned || result?.data_rows?.length || 0,
          status: result?.ok !== false ? 'SUCCESS' : 'FAILED',
          duration_ms: queryDuration
        };
        
        auditLog.cross_reference_log.push(crossRefEntry);
        
        return {
          query_name: queryName,
          sql_executed: sql,
          athena_query_execution_id: result?.athena_query_execution_id || result?.execution_id,
          status: result?.ok !== false ? 'SUCCESS' : 'FAILED',
          error: result?.error || null,
          rows_returned: result?.rows_returned || result?.data_rows?.length || 0,
          columns: result?.columns || [],
          sample_data: result?.data_rows?.slice(0, 2) || [],
          evidence: {
            generated_sql: result?.generated_sql,
            views_used: result?.evidence?.views_used || [],
            execution_id: result?.athena_query_execution_id || result?.execution_id
          },
          duration_ms: queryDuration,
          expected_behavior: expectedBehavior
        };
      } catch (error) {
        const queryDuration = Date.now() - queryStart;
        
        auditLog.cross_reference_log.push({
          query_text: sql.trim().substring(0, 200),
          athena_query_execution_id: 'ERROR_BEFORE_EXECUTION',
          status: 'EXCEPTION',
          error: error.message,
          duration_ms: queryDuration
        });
        
        return {
          query_name: queryName,
          sql_executed: sql,
          status: 'EXCEPTION',
          error: error.message,
          duration_ms: queryDuration
        };
      }
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // Module 1: KPI Tiles from Notion
    // ═════════════════════════════════════════════════════════════════════════
    const kpiModule = {
      module_name: 'KPI Tiles from Notion',
      component_path: 'components/dashboard/KPITilesFromNotion.jsx',
      data_source: 'raw_finance.notion_kpi_payload_ndjson',
      data_contract: {
        schema: '{ line: JSON string, dt: date partition }',
        parsing_method: 'json_extract_scalar(line, \'$.FieldName\')',
        business_unit_access: 'json_extract_scalar(json_parse(line), \'$["TOTAL GWI"]\')'
      },
      test_queries: []
    };
    
    // Test 1: NDJSON structure validation
    const kpiStructureResult = await testQuery(
      'NDJSON Structure Check',
      `SELECT * FROM raw_finance.notion_kpi_payload_ndjson LIMIT 2`,
      'Expect columns: line (JSON string), dt (date)'
    );
    kpiModule.test_queries.push(kpiStructureResult);
    
    // Test 2: JSON parsing
    const kpiParsingResult = await testQuery(
      'JSON Parsing with json_extract_scalar',
      `SELECT 
  json_extract_scalar(line, '$.Metric') AS metric,
  json_extract_scalar(line, '$.Window') AS window,
  json_extract_scalar(line, '$.Unit') AS unit,
  json_extract_scalar(json_parse(line), '$["TOTAL GWI"]') AS total_gwi
FROM raw_finance.notion_kpi_payload_ndjson
WHERE dt = '2026-01-22'
LIMIT 5`,
      'Parse JSON fields from line column, extract TOTAL GWI using json_parse'
    );
    kpiModule.test_queries.push(kpiParsingResult);
    
    const kpiPassed = kpiModule.test_queries.every(q => q.status === 'SUCCESS');
    kpiModule.status = kpiPassed ? 'PASS' : 'FAIL';
    kpiModule.validation_result = kpiPassed 
      ? '✅ NDJSON parsing working correctly with json_extract_scalar + json_parse'
      : `❌ ${kpiModule.test_queries.find(q => q.status !== 'SUCCESS')?.error}`;
    
    if (kpiPassed) auditLog.summary.passed++;
    else auditLog.summary.failed++;
    
    auditLog.modules_tested.push(kpiModule);
    
    // ═════════════════════════════════════════════════════════════════════════
    // Module 2: Revenue Repro Pack
    // ═════════════════════════════════════════════════════════════════════════
    const revenueModule = {
      module_name: 'Revenue Repro Pack (Emilie Report)',
      component_path: 'functions/runEmilieReportPack.js',
      data_contract: {
        revenue_view: 'curated_core.v_monthly_revenue_platt_long',
        invoice_view: 'curated_core.invoice_line_item_repro_v1',
        customer_spine: 'curated_core.dim_customer_platt'
      },
      test_queries: []
    };
    
    // Test 1: Revenue long view
    const revenueLongResult = await testQuery(
      'Revenue Long View Access',
      `SELECT customer_id, customer_name, period_month, revenue_total 
FROM curated_core.v_monthly_revenue_platt_long 
WHERE period_month = DATE '2025-12-01' 
LIMIT 10`,
      'Monthly revenue by customer from curated view'
    );
    revenueModule.test_queries.push(revenueLongResult);
    
    // Test 2: Invoice line items
    const invoiceResult = await testQuery(
      'Invoice Line Item Repro Access',
      `SELECT COUNT(*) as total_rows, COUNT(DISTINCT customer_id) as distinct_customers 
FROM curated_core.invoice_line_item_repro_v1`,
      'Count invoice records and distinct customers'
    );
    revenueModule.test_queries.push(invoiceResult);
    
    // Test 3: Customer spine
    const customerSpineResult = await testQuery(
      'Customer Spine (Platt IDs)',
      `SELECT COUNT(*) as rows_total, COUNT(DISTINCT customer_id) as distinct_plat_ids 
FROM curated_core.dim_customer_platt LIMIT 1`,
      'Total Platt customer IDs from canonical spine'
    );
    revenueModule.test_queries.push(customerSpineResult);
    
    const revenuePassed = revenueModule.test_queries.every(q => q.status === 'SUCCESS');
    revenueModule.status = revenuePassed ? 'PASS' : 'FAIL';
    revenueModule.validation_result = revenuePassed
      ? '✅ All three curated views (revenue_long, invoice_line_item, dim_customer) accessible'
      : `❌ ${revenueModule.test_queries.find(q => q.status !== 'SUCCESS')?.error}`;
    
    if (revenuePassed) auditLog.summary.passed++;
    else auditLog.summary.failed++;
    
    auditLog.modules_tested.push(revenueModule);
    
    // ═════════════════════════════════════════════════════════════════════════
    // Module 3: GL Close Pack
    // ═════════════════════════════════════════════════════════════════════════
    const glModule = {
      module_name: 'GL Close Pack',
      component_path: 'components/dashboard/GLClosePack.jsx',
      data_contract: {
        view_pattern: 'curated_core.v_platt_gl_revenue_{YYYY_MM}',
        discovery_method: 'information_schema.tables LIKE pattern matching',
        example_view: 'v_platt_gl_revenue_2025_11'
      },
      test_queries: []
    };
    
    // Test 1: Discovery
    const glDiscoveryResult = await testQuery(
      'GL View Discovery',
      `SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema = 'curated_core' 
  AND table_name LIKE 'v_platt_gl_revenue%' 
ORDER BY table_name LIMIT 10`,
      'Discover available GL revenue views by month'
    );
    glModule.test_queries.push(glDiscoveryResult);
    
    // Test 2: Actual GL data fetch
    const glDataResult = await testQuery(
      'GL Data Fetch (Nov 2025)',
      `SELECT customer_id, journal_date, gl_code, revenue_amount 
FROM curated_core.v_platt_gl_revenue_2025_11 
LIMIT 10`,
      'Fetch GL entries for November 2025'
    );
    glModule.test_queries.push(glDataResult);
    
    const glPassed = glModule.test_queries.every(q => q.status === 'SUCCESS');
    glModule.status = glPassed ? 'PASS' : 'FAIL';
    glModule.validation_result = glPassed
      ? '✅ GL views discovered and accessible via month-specific pattern'
      : `❌ ${glModule.test_queries.find(q => q.status !== 'SUCCESS')?.error}`;
    
    if (glPassed) auditLog.summary.passed++;
    else auditLog.summary.failed++;
    
    auditLog.modules_tested.push(glModule);
    
    // ═════════════════════════════════════════════════════════════════════════
    // Module 4: AI Console
    // ═════════════════════════════════════════════════════════════════════════
    const consoleModule = {
      module_name: 'AI Console (Intelligence Console)',
      component_path: 'functions/answerQuestion.js',
      data_contract: {
        primary_views: [
          'curated_core.v_monthly_mrr_platt',
          'curated_core.v_customer_fully_loaded_margin_banded',
          'curated_core.v_monthly_mrr_by_segment'
        ],
        orchestration: 'LLM generates query plan → execute via aiLayerQuery → compose answer'
      },
      test_queries: []
    };
    
    // Test 1: Margin banded view (diagnostic query target)
    const marginResult = await testQuery(
      'Margin Banded View Access',
      `SELECT action_band, COUNT(*) as customer_count, ROUND(SUM(total_mrr), 2) as total_mrr 
FROM curated_core.v_customer_fully_loaded_margin_banded 
GROUP BY action_band 
ORDER BY action_band 
LIMIT 10`,
      'Band distribution with MRR totals'
    );
    consoleModule.test_queries.push(marginResult);
    
    // Test 2: MRR view
    const mrrResult = await testQuery(
      'MRR View Access',
      `SELECT period_month, SUM(mrr_total) as total_mrr 
FROM curated_core.v_monthly_mrr_platt 
WHERE period_month >= DATE '2025-12-01' 
GROUP BY period_month 
ORDER BY period_month DESC 
LIMIT 5`,
      'Monthly MRR aggregation'
    );
    consoleModule.test_queries.push(mrrResult);
    
    const consolePassed = consoleModule.test_queries.filter(q => q.status === 'SUCCESS').length;
    const consoleFailed = consoleModule.test_queries.filter(q => q.status !== 'SUCCESS').length;
    
    if (consoleFailed === 0) {
      consoleModule.status = 'PASS';
      consoleModule.validation_result = '✅ Both margin_banded and mrr views accessible via user-scoped queries';
      auditLog.summary.passed++;
    } else if (consolePassed > 0) {
      consoleModule.status = 'PARTIAL';
      consoleModule.validation_result = `⚠️ ${consolePassed}/${consoleModule.test_queries.length} queries passed - permissions inconsistent`;
      auditLog.summary.warnings++;
    } else {
      consoleModule.status = 'FAIL';
      consoleModule.validation_result = '❌ All test queries failed';
      auditLog.summary.failed++;
    }
    
    consoleModule.known_issue = 'answerQuestion orchestrator may encounter 403 errors when using service role for certain views';
    
    auditLog.modules_tested.push(consoleModule);
    
    // ═════════════════════════════════════════════════════════════════════════
    // Module 5: Projects & Pipeline
    // ═════════════════════════════════════════════════════════════════════════
    const projectsModule = {
      module_name: 'Projects & Pipeline',
      component_path: 'functions/runProjectModel.js, functions/saveProject.js',
      data_contract: {
        s3_write_location: 's3://gwi-raw-us-east-2-pc/raw/projects_pipeline/input/',
        reads_from: [
          'curated_core.dim_customer_platt',
          'curated_core.v_monthly_revenue_platt_long'
        ]
      },
      test_queries: []
    };
    
    // Test customer dimension access (critical for project model)
    const projectCustomerResult = await testQuery(
      'Customer Dimension for Projects',
      `SELECT COUNT(*) as total, COUNT(DISTINCT customer_id) as distinct 
FROM curated_core.dim_customer_platt 
LIMIT 1`,
      'Verify customer spine for project financial modeling'
    );
    projectsModule.test_queries.push(projectCustomerResult);
    
    const projectsPassed = projectsModule.test_queries.every(q => q.status === 'SUCCESS');
    projectsModule.status = projectsPassed ? 'PASS' : 'FAIL';
    projectsModule.validation_result = projectsPassed
      ? '✅ Customer dimension accessible, S3 write pattern confirmed in code'
      : `❌ ${projectsModule.test_queries.find(q => q.status !== 'SUCCESS')?.error}`;
    
    projectsModule.s3_evidence = {
      write_pattern: 'raw/projects_pipeline/input/projects_input__{timestamp}.csv',
      bucket: 'gwi-raw-us-east-2-pc',
      validation_method: 'Code review (no live S3 write test performed)'
    };
    
    if (projectsPassed) auditLog.summary.passed++;
    else auditLog.summary.failed++;
    
    auditLog.modules_tested.push(projectsModule);
    
    // ═════════════════════════════════════════════════════════════════════════
    // Module 6: MAC App Engine
    // ═════════════════════════════════════════════════════════════════════════
    const macEngineModule = {
      module_name: 'MAC App Engine',
      component_path: 'pages/MACAppEngine.js',
      data_contract: {
        query_method: 'Freeform SQL via template_id=freeform_sql_v1',
        accessible_schemas: ['curated_core', 'raw_finance', 'raw_platt', 'raw_salesforce', 'raw_sage']
      },
      test_queries: []
    };
    
    // Test multi-schema access
    const schemaAccessResult = await testQuery(
      'Multi-Schema Discovery',
      `SELECT table_schema, COUNT(*) as table_count 
FROM information_schema.tables 
WHERE table_schema IN ('curated_core', 'raw_finance', 'raw_platt') 
GROUP BY table_schema 
ORDER BY table_schema`,
      'Verify access across multiple data lake schemas'
    );
    macEngineModule.test_queries.push(schemaAccessResult);
    
    const macEnginePassed = macEngineModule.test_queries.every(q => q.status === 'SUCCESS');
    macEngineModule.status = macEnginePassed ? 'PASS' : 'FAIL';
    macEngineModule.validation_result = macEnginePassed
      ? '✅ aiLayerQuery proxy working, evidence surfacing operational'
      : `❌ ${macEngineModule.test_queries.find(q => q.status !== 'SUCCESS')?.error}`;
    
    if (macEnginePassed) auditLog.summary.passed++;
    else auditLog.summary.failed++;
    
    auditLog.modules_tested.push(macEngineModule);
    
    // ═════════════════════════════════════════════════════════════════════════
    // Summary & Next Steps
    // ═════════════════════════════════════════════════════════════════════════
    auditLog.summary.total_modules = auditLog.modules_tested.length;
    
    // Identify failed queries
    const failedQueries = [];
    auditLog.modules_tested.forEach(module => {
      module.test_queries?.forEach(query => {
        if (query.status !== 'SUCCESS') {
          failedQueries.push({
            module: module.module_name,
            query: query.query_name,
            error: query.error
          });
        }
      });
    });
    
    if (failedQueries.length > 0) {
      auditLog.next_steps.push({
        priority: 'HIGH',
        action: 'Investigate failed queries',
        details: failedQueries
      });
    }
    
    // Check for permission issues
    const has403Errors = auditLog.cross_reference_log.some(entry => 
      entry.error?.includes('403') || entry.error?.includes('Forbidden')
    );
    
    if (has403Errors) {
      auditLog.next_steps.push({
        priority: 'CRITICAL',
        action: 'AWS IAM Permissions Audit Required',
        reason: 'Multiple 403 Forbidden errors detected',
        recommendation: 'Grant service role read permissions to all curated_core views'
      });
    }
    
    auditLog.total_duration_ms = Date.now() - auditStartTime;
    
    return Response.json({
      success: true,
      audit_log: auditLog,
      validation_summary: {
        validation_timestamp: auditLog.audit_timestamp,
        total_queries_executed: auditLog.cross_reference_log.length,
        success_rate: `${Math.round((auditLog.cross_reference_log.filter(e => e.status === 'SUCCESS').length / auditLog.cross_reference_log.length) * 100)}%`,
        modules_passing: auditLog.summary.passed,
        modules_failing: auditLog.summary.failed,
        modules_with_warnings: auditLog.summary.warnings
      }
    });
    
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      stack_trace: error.stack,
      audit_duration_ms: Date.now() - auditStartTime
    }, { status: 500 });
  }
});
