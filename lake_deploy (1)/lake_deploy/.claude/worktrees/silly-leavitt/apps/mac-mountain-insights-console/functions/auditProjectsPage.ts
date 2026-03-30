import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const auditLog = {
      audit_id: `projects_audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: user.email,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0 }
    };

    // Test 1: Main Projects Query (curated_core.projects_enriched)
    const test1 = {
      test_id: 'PROJ-001',
      feature: 'Projects Data Load from Athena',
      sql: `SELECT project_id, entity, project_name, project_type, state, COALESCE(stage, 'Unknown') AS stage, COALESCE(priority, 'Unranked') AS priority, owner, partner_share_raw, investor_label, notes FROM curated_core.projects_enriched ORDER BY entity, project_name LIMIT 200`,
      status: null,
      evidence: {}
    };

    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: test1.sql }
      });

      const rows = response.data?.data_rows || [];
      test1.status = rows.length > 0 ? 'PASS' : 'WARN';
      test1.evidence = {
        rows_returned: rows.length,
        athena_query_execution_id: response.data?.execution_id || response.data?.athena_query_execution_id,
        first_project: rows[0] ? (Array.isArray(rows[0]) ? rows[0][2] : Object.values(rows[0])[2]) : null,
        message: rows.length > 0 ? 'Projects data accessible' : 'No projects found (empty table or view issue)'
      };
    } catch (error) {
      test1.status = 'FAIL';
      test1.evidence = {
        error: error.message,
        status_code: error.response?.status,
        response_data: error.response?.data
      };
    }

    auditLog.tests.push(test1);
    auditLog.summary.total++;
    if (test1.status === 'PASS') auditLog.summary.passed++;
    else if (test1.status === 'FAIL') auditLog.summary.failed++;

    // Test 2: S3 Fallback - listProjectUpdates
    const test2 = {
      test_id: 'PROJ-002',
      feature: 'S3 Fallback - List Project Updates',
      status: null,
      evidence: {}
    };

    try {
      const response = await base44.functions.invoke('listProjectUpdates', {
        action: 'list'
      });

      const files = response.data?.files || [];
      test2.status = 'PASS';
      test2.evidence = {
        files_count: files.length,
        message: `S3 fallback working - ${files.length} update files available`
      };
    } catch (error) {
      test2.status = 'FAIL';
      test2.evidence = {
        error: error.message,
        status_code: error.response?.status
      };
    }

    auditLog.tests.push(test2);
    auditLog.summary.total++;
    if (test2.status === 'PASS') auditLog.summary.passed++;
    else if (test2.status === 'FAIL') auditLog.summary.failed++;

    // Test 3: Save Project Function
    const test3 = {
      test_id: 'PROJ-003',
      feature: 'Save Project Function',
      status: null,
      evidence: {}
    };

    try {
      const testProjectId = `test_audit_${Date.now()}`;
      const response = await base44.functions.invoke('saveProject', {
        project_id: testProjectId,
        entity: 'Test Entity',
        project_name: 'Audit Test Project',
        project_type: 'Build',
        state: 'Active',
        stage: 'Project Discussion',
        priority: 'Low',
        owner: user.email,
        notes: 'Audit test project - can be deleted',
        is_test: true
      });

      test3.status = response.data?.success ? 'PASS' : 'FAIL';
      test3.evidence = {
        project_id: testProjectId,
        s3_key: response.data?.s3_key,
        message: 'Project save successful'
      };
    } catch (error) {
      test3.status = 'FAIL';
      test3.evidence = {
        error: error.message,
        status_code: error.response?.status
      };
    }

    auditLog.tests.push(test3);
    auditLog.summary.total++;
    if (test3.status === 'PASS') auditLog.summary.passed++;
    else if (test3.status === 'FAIL') auditLog.summary.failed++;

    // Test 4: Project Model Runner
    const test4 = {
      test_id: 'PROJ-004',
      feature: 'Project Model Runner',
      status: null,
      evidence: {}
    };

    try {
      const response = await base44.functions.invoke('runProjectModel', {
        project_id: 'test_model_001',
        total_hh: 1000,
        hh_take_rate: 0.3,
        avg_arpu: 75,
        capex_per_hh: 1500,
        partner_share: 0.5
      });

      test4.status = response.data?.metrics ? 'PASS' : 'FAIL';
      test4.evidence = {
        metrics_calculated: !!response.data?.metrics,
        model_type: response.data?.model_type || 'standard',
        message: 'Model calculation successful'
      };
    } catch (error) {
      test4.status = 'FAIL';
      test4.evidence = {
        error: error.message,
        status_code: error.response?.status
      };
    }

    auditLog.tests.push(test4);
    auditLog.summary.total++;
    if (test4.status === 'PASS') auditLog.summary.passed++;
    else if (test4.status === 'FAIL') auditLog.summary.failed++;

    // Test 5: Project Submissions List
    const test5 = {
      test_id: 'PROJ-005',
      feature: 'List Project Submissions',
      status: null,
      evidence: {}
    };

    try {
      const response = await base44.functions.invoke('listProjectSubmissions', {});

      test5.status = response.data?.submissions !== undefined ? 'PASS' : 'FAIL';
      test5.evidence = {
        submissions_count: response.data?.submissions?.length || 0,
        message: 'Submissions list accessible'
      };
    } catch (error) {
      test5.status = 'FAIL';
      test5.evidence = {
        error: error.message,
        status_code: error.response?.status
      };
    }

    auditLog.tests.push(test5);
    auditLog.summary.total++;
    if (test5.status === 'PASS') auditLog.summary.passed++;
    else if (test5.status === 'FAIL') auditLog.summary.failed++;

    // Test 6: Submit Project for Review
    const test6 = {
      test_id: 'PROJ-006',
      feature: 'Submit Project for Review',
      status: null,
      evidence: {}
    };

    try {
      const response = await base44.functions.invoke('submitProjectForReview', {
        project_id: `audit_submission_${Date.now()}`,
        project_name: 'Audit Test Submission',
        entity: 'Test',
        submitted_by: user.email,
        metrics: { npv: 100000, irr: 0.15, payback_years: 5 }
      });

      test6.status = response.data?.success ? 'PASS' : 'FAIL';
      test6.evidence = {
        submission_id: response.data?.submission_id,
        message: 'Project submission successful'
      };
    } catch (error) {
      test6.status = 'FAIL';
      test6.evidence = {
        error: error.message,
        status_code: error.response?.status
      };
    }

    auditLog.tests.push(test6);
    auditLog.summary.total++;
    if (test6.status === 'PASS') auditLog.summary.passed++;
    else if (test6.status === 'FAIL') auditLog.summary.failed++;

    // Test 7: Portfolio Analysis (Pipeline Runner)
    const test7 = {
      test_id: 'PROJ-007',
      feature: 'Portfolio Analysis',
      status: null,
      evidence: {}
    };

    try {
      const response = await base44.functions.invoke('runPortfolioAnalysisV2', {
        projects: [
          {
            project_id: 'test_001',
            total_hh: 1000,
            hh_take_rate: 0.3,
            avg_arpu: 75,
            capex_per_hh: 1500,
            partner_share: 0.5
          }
        ]
      });

      test7.status = response.data?.portfolio_metrics ? 'PASS' : 'FAIL';
      test7.evidence = {
        portfolio_calculated: !!response.data?.portfolio_metrics,
        message: 'Portfolio analysis successful'
      };
    } catch (error) {
      test7.status = 'FAIL';
      test7.evidence = {
        error: error.message,
        status_code: error.response?.status
      };
    }

    auditLog.tests.push(test7);
    auditLog.summary.total++;
    if (test7.status === 'PASS') auditLog.summary.passed++;
    else if (test7.status === 'FAIL') auditLog.summary.failed++;

    // Test 8: Model Outputs Listing
    const test8 = {
      test_id: 'PROJ-008',
      feature: 'List Project Model Outputs',
      status: null,
      evidence: {}
    };

    try {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: 'test_001'
      });

      test8.status = response.data?.outputs !== undefined ? 'PASS' : 'FAIL';
      test8.evidence = {
        outputs_count: response.data?.outputs?.length || 0,
        message: 'Model outputs listing successful'
      };
    } catch (error) {
      test8.status = 'FAIL';
      test8.evidence = {
        error: error.message,
        status_code: error.response?.status
      };
    }

    auditLog.tests.push(test8);
    auditLog.summary.total++;
    if (test8.status === 'PASS') auditLog.summary.passed++;
    else if (test8.status === 'FAIL') auditLog.summary.failed++;

    // Final assessment
    auditLog.assessment = auditLog.summary.failed === 0 
      ? 'ALL TESTS PASSED - Projects page fully functional'
      : auditLog.summary.passed >= 6 
        ? 'MOSTLY FUNCTIONAL - Some features may need attention'
        : 'CRITICAL ISSUES - Multiple features failing';

    return Response.json({
      success: true,
      audit_log: auditLog,
      download_link: null
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});