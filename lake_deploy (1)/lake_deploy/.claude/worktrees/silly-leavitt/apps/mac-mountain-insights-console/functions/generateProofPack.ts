import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// CRITICAL: Backend functions cannot call other backend functions per Base44 platform policy.
// Solution: This function returns audit structure with SQL queries that the UI will execute.
// The UI will run each query and send results back to populate the Proof Pack.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow patrick.cochran@icloud.com for now
    if (user.email !== 'patrick.cochran@icloud.com') {
      return Response.json({ error: 'Access restricted' }, { status: 403 });
    }

    const startTime = Date.now();
    const auditId = `proof_pack_${Date.now()}`;

    // Initialize Proof Pack Test Plan (UI will execute and return results)
    const testPlan = {
      audit_id: auditId,
      generated_at: new Date().toISOString(),
      generated_by: user.email,
      scope: 'Full Application End-to-End Audit',
      execution_mode: 'CLIENT_SIDE',
      note: 'Backend functions cannot call other backend functions. UI must execute these tests and return results.',
      pages_to_audit: [],
      total_tests: 0
    };

    // =========================================
    // DASHBOARD PAGE AUDIT
    // =========================================
    const dashboardTests = {
      page_name: 'Dashboard',
      route: '/Dashboard',
      tests: [
        {
          test_id: 'DASH-001',
          feature: 'KPI Strip - Total MRR',
          ui_steps: 'Load Dashboard → Observe KPI Strip → Check Total MRR tile',
          expected: 'MRR value displayed from curated_core.v_customer_fully_loaded_margin_banded',
          sql: `SELECT SUM(total_mrr) as total_mrr FROM curated_core.v_customer_fully_loaded_margin_banded WHERE total_mrr > 0 LIMIT 1`,
          validation: 'row_count >= 1 AND mrr_value > 0'
        }

        ,
        {
          test_id: 'DASH-002',
          feature: 'Active Accounts Tile',
          ui_steps: 'Load Dashboard → Check Active Accounts tile',
          expected: 'Active customer count from dim_customer_platt',
          sql: `SELECT COUNT(*) as total, SUM(CASE WHEN has_active_service = true AND is_test_internal = false THEN 1 ELSE 0 END) as active FROM curated_core.dim_customer_platt LIMIT 1`,
          validation: 'active_count > 0'
        }

        ,
        {
          test_id: 'DASH-003',
          feature: 'At Risk (D/E Band) Tile',
          ui_steps: 'Load Dashboard → Check At Risk tile',
          expected: 'Count of D/E band customers',
          sql: `SELECT action_band, COUNT(*) as count FROM curated_core.v_customer_fully_loaded_margin_banded WHERE action_band IN ('D', 'E') GROUP BY action_band LIMIT 10`,
          validation: 'row_count > 0'
        }

        ,
        {
          test_id: 'DASH-004',
          feature: 'KPI Tiles from Notion Canonical (dt=2026-01-22)',
          ui_steps: 'Load Dashboard → Check KPI Tiles From Notion component',
          expected: 'Finance KPIs displayed from raw_finance.notion_kpi_payload_ndjson',
          sql: `SELECT json_extract_scalar(line, '$.Metric') AS metric_key, json_extract_scalar(line, '$.Window') AS window, json_extract_scalar(line, '$.Unit') AS unit, json_extract_scalar(line, '$.Owner') AS owner, json_extract_scalar(line, '$.Definition') AS definition, json_extract_scalar(json_parse(line), '$["TOTAL GWI"]') AS total_gwi FROM raw_finance.notion_kpi_payload_ndjson WHERE dt = '2026-01-22' ORDER BY metric_key LIMIT 20`,
          validation: 'row_count > 0'
        }

        ,
        {
          test_id: 'DASH-005',
          feature: 'Main Chart Card - MRR by Action Band',
          ui_steps: 'Load Dashboard → Check Main Chart Card',
          expected: 'Bar chart showing MRR by action band',
          sql: `WITH customer_month AS (SELECT customer_id, SUM(mrr_total) AS mrr_total_customer_month FROM curated_core.v_monthly_mrr_platt WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt) GROUP BY 1), customer_bands AS (SELECT cm.customer_id, cm.mrr_total_customer_month, b.action_band FROM customer_month cm LEFT JOIN curated_core.v_customer_fully_loaded_margin_banded b ON b.customer_id = cm.customer_id WHERE cm.mrr_total_customer_month > 0) SELECT action_band, SUM(mrr_total_customer_month) as total_mrr FROM customer_bands WHERE action_band IS NOT NULL GROUP BY action_band ORDER BY action_band LIMIT 10`,
          validation: 'row_count > 0'
        }
      ]
    };

    testPlan.pages_to_audit.push(dashboardTests);
    testPlan.total_tests = dashboardTests.tests.length;

    // Finalize
    const execution_time_ms = Date.now() - startTime;

    return Response.json({
      success: true,
      test_plan: testPlan,
      execution_time_ms,
      instructions: 'UI must execute each test SQL via aiLayerQuery, collect results, and submit back via submitProofPackResults function.',
      next_step: 'Call submitProofPackResults with completed test results'
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});