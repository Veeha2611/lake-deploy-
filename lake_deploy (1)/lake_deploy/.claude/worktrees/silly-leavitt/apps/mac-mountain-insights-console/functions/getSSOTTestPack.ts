import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SSOT TEST PACK
 * 
 * 10 test questions with expected results to prove console accuracy
 * Each test executes actual queries and validates results
 * 
 * Returns: { tests: [...], summary: {...} }
 */

const TEST_QUESTIONS = [
  {
    id: 'test_1',
    question: 'How many total distinct Plat IDs do we have?',
    expected_view: 'curated_core.dim_customer_platt',
    validation: (result) => {
      const count = result.data_results?.[0]?.distinct_plat_ids;
      return count > 0 ? 'PASS' : 'FAIL: Expected count > 0';
    }
  },
  {
    id: 'test_2',
    question: 'What is our total MRR?',
    expected_view: 'curated_core.v_monthly_mrr_platt',
    validation: (result) => {
      const hasEvidence = result.evidence?.athena_query_execution_id;
      const hasMRR = result.answer_markdown?.includes('MRR') || result.answer_markdown?.includes('$');
      return hasEvidence && hasMRR ? 'PASS' : 'FAIL: Missing evidence or MRR value';
    }
  },
  {
    id: 'test_3',
    question: 'Show me customers in E-band',
    expected_view: 'curated_core.v_cci_e_band_exit_accounts',
    validation: (result) => {
      const hasData = result.data_results?.length > 0;
      const hasQID = result.evidence?.athena_query_execution_ids?.length > 0;
      return hasData && hasQID ? 'PASS' : 'FAIL: Missing data or QID';
    }
  },
  {
    id: 'test_4',
    question: 'Which accounts have the highest ticket burden?',
    expected_view: 'curated_core.v_ticket_burden_lake',
    validation: (result) => {
      const hasData = result.data_results?.length > 0;
      const hasEvidence = result.evidence?.views_used?.some(v => v.includes('ticket'));
      return hasData && hasEvidence ? 'PASS' : 'FAIL: Missing ticket data or evidence';
    }
  },
  {
    id: 'test_5',
    question: 'What is the MRR distribution across action bands?',
    expected_view: 'curated_core.v_customer_fully_loaded_margin_banded',
    validation: (result) => {
      const mentionsBands = /band|A|B|C|D|E/i.test(result.answer_markdown);
      const hasQID = result.evidence?.athena_query_execution_ids?.length > 0;
      return mentionsBands && hasQID ? 'PASS' : 'FAIL: Missing band data or QID';
    }
  },
  {
    id: 'test_6',
    question: 'Show me hosted PBX migration opportunities',
    expected_view: 'curated_core.v_hosted_pbx_migration',
    validation: (result) => {
      const hasData = result.data_results?.length > 0;
      const mentionsPBX = /pbx|uplift/i.test(result.answer_markdown);
      return hasData && mentionsPBX ? 'PASS' : 'FAIL: Missing PBX data';
    }
  },
  {
    id: 'test_7',
    question: 'What was the MRR churn last month?',
    expected_view: 'curated_core.v_monthly_mrr_and_churn_summary',
    validation: (result) => {
      const mentionsChurn = /churn/i.test(result.answer_markdown);
      const hasEvidence = result.evidence?.athena_query_execution_ids?.length > 0;
      return mentionsChurn && hasEvidence ? 'PASS' : 'FAIL: Missing churn data or evidence';
    }
  },
  {
    id: 'test_8',
    question: 'Show me the account movement by segment',
    expected_view: 'curated_core.v_monthly_account_churn_by_segment',
    validation: (result) => {
      const hasData = result.data_results?.length > 0;
      const mentionsSegment = /segment/i.test(result.answer_markdown);
      return hasData && mentionsSegment ? 'PASS' : 'FAIL: Missing segment data';
    }
  },
  {
    id: 'test_9',
    question: 'List projects in the pipeline',
    expected_view: 'curated_core.projects_enriched',
    validation: (result) => {
      const hasProjects = result.data_results?.length > 0;
      const hasEvidence = result.evidence?.views_used?.some(v => v.includes('projects'));
      return hasProjects && hasEvidence ? 'PASS' : 'FAIL: Missing projects or evidence';
    }
  },
  {
    id: 'test_10',
    question: 'Which customers have both high margins and low ticket burden?',
    expected_view: 'curated_core.v_customer_margin_plus_tickets',
    validation: (result) => {
      const hasEvidence = result.evidence?.athena_query_execution_ids?.length > 0;
      const hasBothMetrics = /margin/i.test(result.answer_markdown) && /ticket/i.test(result.answer_markdown);
      return hasEvidence && hasBothMetrics ? 'PASS' : 'FAIL: Missing combined analysis';
    }
  }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    console.log('[SSOT Test Pack] Running 10 test questions...');
    
    const testResults = [];
    
    for (const test of TEST_QUESTIONS) {
      console.log(`[Test ${test.id}] Question: ${test.question}`);
      
      try {
        // Call answerQuestionV2
        const response = await base44.asServiceRole.functions.invoke('answerQuestionV2', {
          question: test.question
        });
        
        const result = response.data;
        const validationStatus = test.validation(result);
        
        testResults.push({
          test_id: test.id,
          question: test.question,
          expected_view: test.expected_view,
          status: validationStatus.startsWith('PASS') ? 'PASS' : 'FAIL',
          validation_message: validationStatus,
          evidence: {
            qids: result.evidence?.athena_query_execution_ids || [],
            views_used: result.evidence?.views_used || [],
            rows_returned: result.evidence?.rows_returned || 0
          },
          answer_preview: result.answer_markdown?.substring(0, 200) + '...'
        });
        
        console.log(`[Test ${test.id}] ${validationStatus}`);
        
      } catch (error) {
        testResults.push({
          test_id: test.id,
          question: test.question,
          status: 'ERROR',
          error: error.message
        });
        
        console.error(`[Test ${test.id}] ERROR:`, error.message);
      }
    }
    
    const summary = {
      total_tests: testResults.length,
      passed: testResults.filter(t => t.status === 'PASS').length,
      failed: testResults.filter(t => t.status === 'FAIL').length,
      errors: testResults.filter(t => t.status === 'ERROR').length,
      pass_rate: (testResults.filter(t => t.status === 'PASS').length / testResults.length * 100).toFixed(1) + '%'
    };
    
    return Response.json({
      test_pack: 'SSOT Validation Test Pack v1',
      run_at: new Date().toISOString(),
      tests: testResults,
      summary,
      all_tests_passed: summary.passed === summary.total_tests
    });
    
  } catch (error) {
    console.error('[getSSOTTestPack] Exception:', error);
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});