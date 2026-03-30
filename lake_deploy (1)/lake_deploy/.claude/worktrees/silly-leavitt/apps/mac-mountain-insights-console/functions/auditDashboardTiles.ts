import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const auditLog = {
      audit_id: `dashboard_tiles_audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: user.email,
      tiles_tested: [],
      summary: { total: 0, passed: 0, failed: 0, warnings: 0 }
    };

    const AWS_AI_LAYER_API_KEY = Deno.env.get('AWS_AI_LAYER_API_KEY');
    const AWS_AI_LAYER_INVOKE_URL = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');

    if (!AWS_AI_LAYER_API_KEY || !AWS_AI_LAYER_INVOKE_URL) {
      return Response.json({ 
        error: 'AWS Query Layer credentials not configured',
        missing: !AWS_AI_LAYER_API_KEY ? 'AWS_AI_LAYER_API_KEY' : 'AWS_AI_LAYER_INVOKE_URL'
      }, { status: 500 });
    }

    // Helper function to query Query Layer directly
    async function queryAILayer(sql, tileName) {
      const url = `${AWS_AI_LAYER_INVOKE_URL}/query`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': AWS_AI_LAYER_API_KEY
        },
        body: JSON.stringify({
          template_id: 'freeform_sql_v1',
          params: { sql }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Query Layer returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      if (result.ok === false) {
        throw new Error(result.error || 'Query Layer query failed');
      }

      return result;
    }

    // Tile 1: Total MRR
    const tile1 = {
      tile_id: 'TILE-001',
      tile_name: 'Total MRR',
      status: null,
      evidence: {}
    };

    try {
      const sql = `WITH customer_month AS (
        SELECT customer_id, SUM(mrr_total) AS mrr_total_customer_month
        FROM curated_core.v_monthly_mrr_platt
        WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
        GROUP BY 1
      )
      SELECT SUM(mrr_total_customer_month) as total_mrr FROM customer_month LIMIT 1`;
      const result = await queryAILayer(sql, 'Total MRR');
      
      const mrr = result.data_rows?.[0]?.[0];
      
      if (mrr !== null && mrr !== undefined && !isNaN(mrr)) {
        tile1.status = 'PASS';
        tile1.evidence = {
          total_mrr: parseFloat(mrr),
          formatted: `$${(parseFloat(mrr) / 1000000).toFixed(2)}M`,
          rows_returned: result.rows?.length || 0,
          query_execution_id: result.query_execution_id,
          message: 'MRR data loading successfully'
        };
      } else {
        tile1.status = 'FAIL';
        tile1.evidence = {
          result,
          message: 'MRR value is null or invalid'
        };
      }
    } catch (error) {
      tile1.status = 'FAIL';
      tile1.evidence = {
        error: error.message,
        message: 'Failed to query MRR data'
      };
    }

    auditLog.tiles_tested.push(tile1);
    auditLog.summary.total++;
    if (tile1.status === 'PASS') auditLog.summary.passed++;
    else if (tile1.status === 'FAIL') auditLog.summary.failed++;

    // Tile 2: Active Accounts
    const tile2 = {
      tile_id: 'TILE-002',
      tile_name: 'Active Accounts',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT COUNT(DISTINCT customer_id) as active_accounts FROM curated_core.v_monthly_mrr_platt WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt) AND mrr_total > 0 LIMIT 1`;
      const result = await queryAILayer(sql, 'Active Accounts');
      
      const count = result.data_rows?.[0]?.[0];
      
      if (count !== null && count !== undefined && !isNaN(count)) {
        tile2.status = 'PASS';
        tile2.evidence = {
          active_accounts: parseInt(count),
          rows_returned: result.rows?.length || 0,
          query_execution_id: result.query_execution_id,
          message: 'Active accounts data loading successfully'
        };
      } else {
        tile2.status = 'FAIL';
        tile2.evidence = {
          result,
          message: 'Active accounts value is null or invalid'
        };
      }
    } catch (error) {
      tile2.status = 'FAIL';
      tile2.evidence = {
        error: error.message,
        message: 'Failed to query active accounts data'
      };
    }

    auditLog.tiles_tested.push(tile2);
    auditLog.summary.total++;
    if (tile2.status === 'PASS') auditLog.summary.passed++;
    else if (tile2.status === 'FAIL') auditLog.summary.failed++;

    // Tile 3: At Risk Customers
    const tile3 = {
      tile_id: 'TILE-003',
      tile_name: 'At Risk Customers',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT COUNT(*) as at_risk FROM curated_core.v_customer_fully_loaded_margin_banded WHERE action_band IN ('D_PRICE_PLUS_SIMPLIFY', 'E_EXIT_OR_RESCOPE') LIMIT 1`;
      const result = await queryAILayer(sql, 'At Risk Customers');
      
      const count = result.data_rows?.[0]?.[0];
      
      if (count !== null && count !== undefined && !isNaN(count)) {
        tile3.status = 'PASS';
        tile3.evidence = {
          at_risk_customers: parseInt(count),
          rows_returned: result.rows?.length || 0,
          query_execution_id: result.query_execution_id,
          message: 'At risk customers data loading successfully'
        };
      } else {
        tile3.status = 'FAIL';
        tile3.evidence = {
          result,
          message: 'At risk customers value is null or invalid'
        };
      }
    } catch (error) {
      tile3.status = 'FAIL';
      tile3.evidence = {
        error: error.message,
        message: 'Failed to query at risk customers data'
      };
    }

    auditLog.tiles_tested.push(tile3);
    auditLog.summary.total++;
    if (tile3.status === 'PASS') auditLog.summary.passed++;
    else if (tile3.status === 'FAIL') auditLog.summary.failed++;

    // Tile 4: MRR Trend Chart
    const tile4 = {
      tile_id: 'TILE-004',
      tile_name: 'MRR Trend Chart',
      status: null,
      evidence: {}
    };

    try {
      const sql = `WITH customer_month AS (
        SELECT period_month, customer_id, SUM(mrr_total) AS mrr
        FROM curated_core.v_monthly_mrr_platt
        GROUP BY 1, 2
      )
      SELECT period_month, SUM(mrr) as total_mrr
      FROM customer_month
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12`;
      const result = await queryAILayer(sql, 'MRR Trend Chart');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile4.status = 'PASS';
        tile4.evidence = {
          months_returned: result.data_rows.length,
          date_range: {
            start: result.data_rows[result.data_rows.length - 1][0],
            end: result.data_rows[0][0]
          },
          sample_data: result.data_rows.slice(0, 3),
          query_execution_id: result.athena_query_execution_id,
          message: 'MRR trend data loading successfully'
        };
      } else {
        tile4.status = 'FAIL';
        tile4.evidence = {
          result,
          message: 'No MRR trend data returned'
        };
      }
    } catch (error) {
      tile4.status = 'FAIL';
      tile4.evidence = {
        error: error.message,
        message: 'Failed to query MRR trend data'
      };
    }

    auditLog.tiles_tested.push(tile4);
    auditLog.summary.total++;
    if (tile4.status === 'PASS') auditLog.summary.passed++;
    else if (tile4.status === 'FAIL') auditLog.summary.failed++;

    // Tile 5: Account Movement Chart
    const tile5 = {
      tile_id: 'TILE-005',
      tile_name: 'Account Movement (Action Bands)',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT action_band, COUNT(*) as count FROM curated_core.v_customer_fully_loaded_margin_banded GROUP BY action_band ORDER BY count DESC LIMIT 10`;
      const result = await queryAILayer(sql, 'Account Movement');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile5.status = 'PASS';
        tile5.evidence = {
          bands_returned: result.data_rows.length,
          total_accounts: result.data_rows.reduce((sum, row) => sum + parseInt(row[1] || 0), 0),
          bands_data: result.data_rows.slice(0, 5),
          query_execution_id: result.athena_query_execution_id,
          message: 'Account movement data loading successfully'
        };
      } else {
        tile5.status = 'FAIL';
        tile5.evidence = {
          result,
          message: 'No account movement data returned'
        };
      }
    } catch (error) {
      tile5.status = 'FAIL';
      tile5.evidence = {
        error: error.message,
        message: 'Failed to query account movement data'
      };
    }

    auditLog.tiles_tested.push(tile5);
    auditLog.summary.total++;
    if (tile5.status === 'PASS') auditLog.summary.passed++;
    else if (tile5.status === 'FAIL') auditLog.summary.failed++;

    // Tile 6: KPIs from Notion
    const tile6 = {
      tile_id: 'TILE-006',
      tile_name: 'KPIs from Notion',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT metric_name, metric_value, metric_unit, metric_window, metric_owner, metric_definition FROM curated_core.kpis_notion ORDER BY metric_name LIMIT 50`;
      const result = await queryAILayer(sql, 'KPIs from Notion');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile6.status = 'PASS';
        tile6.evidence = {
          kpis_returned: result.data_rows.length,
          sample_kpis: result.data_rows.slice(0, 3).map(r => ({
            name: r[0],
            value: r[1],
            unit: r[2]
          })),
          query_execution_id: result.athena_query_execution_id,
          message: 'KPIs from Notion loading successfully'
        };
      } else {
        tile6.status = 'WARN';
        tile6.evidence = {
          result,
          message: 'No KPI data returned (may not be populated yet)'
        };
      }
    } catch (error) {
      tile6.status = 'FAIL';
      tile6.evidence = {
        error: error.message,
        message: 'Failed to query KPI data'
      };
    }

    auditLog.tiles_tested.push(tile6);
    auditLog.summary.total++;
    if (tile6.status === 'PASS') auditLog.summary.passed++;
    else if (tile6.status === 'FAIL') auditLog.summary.failed++;
    else if (tile6.status === 'WARN') auditLog.summary.warnings++;

    // Tile 7: Network Map
    const tile7 = {
      tile_id: 'TILE-007',
      tile_name: 'Network Map',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT entity_name, latitude, longitude, location_type FROM curated_core.network_locations LIMIT 100`;
      const result = await queryAILayer(sql, 'Network Map');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile7.status = 'PASS';
        tile7.evidence = {
          locations_returned: result.data_rows.length,
          sample_location: result.data_rows[0],
          query_execution_id: result.athena_query_execution_id,
          message: 'Network map data loading successfully'
        };
      } else {
        tile7.status = 'WARN';
        tile7.evidence = {
          result,
          message: 'No network location data returned (may not be populated yet)'
        };
      }
    } catch (error) {
      tile7.status = 'FAIL';
      tile7.evidence = {
        error: error.message,
        message: 'Failed to query network map data'
      };
    }

    auditLog.tiles_tested.push(tile7);
    auditLog.summary.total++;
    if (tile7.status === 'PASS') auditLog.summary.passed++;
    else if (tile7.status === 'FAIL') auditLog.summary.failed++;
    else if (tile7.status === 'WARN') auditLog.summary.warnings++;

    // Tile 8: Bucket Summary
    const tile8 = {
      tile_id: 'TILE-008',
      tile_name: 'Customer Segment Overview',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT segment, SUM(ending_mrr) as segment_mrr, SUM(active_accounts_proxy) as count FROM curated_core.v_monthly_account_churn_by_segment WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_account_churn_by_segment) GROUP BY segment ORDER BY segment_mrr DESC LIMIT 20`;
      const result = await queryAILayer(sql, 'Customer Segment Overview');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile8.status = 'PASS';
        tile8.evidence = {
          segments_returned: result.data_rows.length,
          total_mrr: result.data_rows.reduce((sum, row) => sum + parseFloat(row[1] || 0), 0),
          segments_data: result.data_rows.slice(0, 5),
          query_execution_id: result.athena_query_execution_id,
          message: 'Customer segment data loading successfully'
        };
      } else {
        tile8.status = 'FAIL';
        tile8.evidence = {
          result,
          message: 'No customer segment data returned'
        };
      }
    } catch (error) {
      tile8.status = 'FAIL';
      tile8.evidence = {
        error: error.message,
        message: 'Failed to query customer segment data'
      };
    }

    auditLog.tiles_tested.push(tile8);
    auditLog.summary.total++;
    if (tile8.status === 'PASS') auditLog.summary.passed++;
    else if (tile8.status === 'FAIL') auditLog.summary.failed++;

    // Tile 9: Health Score
    const tile9 = {
      tile_id: 'TILE-009',
      tile_name: 'Health Score',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT action_band, COUNT(*) as count FROM curated_core.v_customer_fully_loaded_margin_banded GROUP BY action_band ORDER BY action_band LIMIT 10`;
      const result = await queryAILayer(sql, 'Health Score');
      
      const totalCustomers = result.data_rows?.reduce((sum, row) => sum + parseInt(row[1] || 0), 0) || 0;
      const healthyCustomers = result.data_rows?.find(row => row[0]?.includes('A_'))?.[ 1] || 0;
      const score = totalCustomers > 0 ? (healthyCustomers / totalCustomers) * 100 : 0;
      
      if (score !== null && score !== undefined && !isNaN(score)) {
        tile9.status = 'PASS';
        tile9.evidence = {
          health_score: parseFloat(score).toFixed(1),
          formatted: `${parseFloat(score).toFixed(1)}%`,
          total_customers: totalCustomers,
          healthy_customers: healthyCustomers,
          band_distribution: result.data_rows,
          query_execution_id: result.athena_query_execution_id,
          message: 'Health score data loading successfully'
        };
      } else {
        tile9.status = 'FAIL';
        tile9.evidence = {
          result,
          message: 'Health score value is null or invalid'
        };
      }
    } catch (error) {
      tile9.status = 'FAIL';
      tile9.evidence = {
        error: error.message,
        message: 'Failed to query health score data'
      };
    }

    auditLog.tiles_tested.push(tile9);
    auditLog.summary.total++;
    if (tile9.status === 'PASS') auditLog.summary.passed++;
    else if (tile9.status === 'FAIL') auditLog.summary.failed++;

    // Tile 10: GL Close Pack
    const tile10 = {
      tile_id: 'TILE-010',
      tile_name: 'GL Close Pack (Revenue Summary)',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT DISTINCT period_month FROM curated_core.v_monthly_mrr_platt ORDER BY period_month DESC LIMIT 6`;
      const result = await queryAILayer(sql, 'GL Close Pack');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile10.status = 'PASS';
        tile10.evidence = {
          months_available: result.data_rows.length,
          latest_month: result.data_rows[0][0],
          query_execution_id: result.athena_query_execution_id,
          message: 'GL Close Pack data available'
        };
      } else {
        tile10.status = 'FAIL';
        tile10.evidence = {
          result,
          message: 'No GL data months available'
        };
      }
    } catch (error) {
      tile10.status = 'FAIL';
      tile10.evidence = {
        error: error.message,
        message: 'Failed to query GL data'
      };
    }

    auditLog.tiles_tested.push(tile10);
    auditLog.summary.total++;
    if (tile10.status === 'PASS') auditLog.summary.passed++;
    else if (tile10.status === 'FAIL') auditLog.summary.failed++;

    // Tile 11: MRR by Action Band Chart
    const tile11 = {
      tile_id: 'TILE-011',
      tile_name: 'MRR by Action Band Chart',
      status: null,
      evidence: {}
    };

    try {
      const sql = `SELECT action_band, SUM(total_mrr) as band_mrr FROM curated_core.v_customer_fully_loaded_margin_banded GROUP BY action_band ORDER BY band_mrr DESC LIMIT 10`;
      const result = await queryAILayer(sql, 'MRR by Action Band');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile11.status = 'PASS';
        tile11.evidence = {
          bands_returned: result.data_rows.length,
          total_mrr: result.data_rows.reduce((sum, row) => sum + parseFloat(row[1] || 0), 0),
          bands_data: result.data_rows.slice(0, 5),
          query_execution_id: result.athena_query_execution_id,
          message: 'MRR by action band chart data loading successfully'
        };
      } else {
        tile11.status = 'FAIL';
        tile11.evidence = {
          result,
          message: 'No action band MRR data returned'
        };
      }
    } catch (error) {
      tile11.status = 'FAIL';
      tile11.evidence = {
        error: error.message,
        message: 'Failed to query action band MRR data'
      };
    }

    auditLog.tiles_tested.push(tile11);
    auditLog.summary.total++;
    if (tile11.status === 'PASS') auditLog.summary.passed++;
    else if (tile11.status === 'FAIL') auditLog.summary.failed++;

    // Tile 12: FY2025 MRR Forecast
    const tile12 = {
      tile_id: 'TILE-012',
      tile_name: 'FY2025 MRR Forecast',
      status: null,
      evidence: {}
    };

    try {
      const sql = `WITH customer_month AS (
        SELECT period_month, customer_id, SUM(mrr_total) AS mrr
        FROM curated_core.v_monthly_mrr_platt
        WHERE period_month >= '2024-11' AND period_month <= '2025-10'
        GROUP BY 1, 2
      )
      SELECT period_month, SUM(mrr) as total_mrr
      FROM customer_month
      GROUP BY 1
      ORDER BY 1
      LIMIT 12`;
      const result = await queryAILayer(sql, 'FY2025 MRR Forecast');
      
      if (result.data_rows && result.data_rows.length > 0) {
        tile12.status = 'PASS';
        tile12.evidence = {
          months_returned: result.data_rows.length,
          fy_range: {
            start: result.data_rows[0][0],
            end: result.data_rows[result.data_rows.length - 1][0]
          },
          total_fy_mrr: result.data_rows.reduce((sum, row) => sum + parseFloat(row[1] || 0), 0),
          query_execution_id: result.athena_query_execution_id,
          message: 'FY2025 MRR forecast data loading successfully'
        };
      } else {
        tile12.status = 'WARN';
        tile12.evidence = {
          result,
          message: 'No FY2025 data available yet'
        };
      }
    } catch (error) {
      tile12.status = 'FAIL';
      tile12.evidence = {
        error: error.message,
        message: 'Failed to query FY2025 data'
      };
    }

    auditLog.tiles_tested.push(tile12);
    auditLog.summary.total++;
    if (tile12.status === 'PASS') auditLog.summary.passed++;
    else if (tile12.status === 'FAIL') auditLog.summary.failed++;
    else if (tile12.status === 'WARN') auditLog.summary.warnings++;

    // Final Assessment
    const criticalTiles = ['TILE-001', 'TILE-002', 'TILE-004', 'TILE-011'];
    const criticalFails = auditLog.tiles_tested.filter(t => 
      criticalTiles.includes(t.tile_id) && t.status === 'FAIL'
    ).length;

    if (criticalFails > 0) {
      auditLog.assessment = '❌ CRITICAL FAILURES - Core dashboard metrics not loading';
    } else if (auditLog.summary.failed > 0) {
      auditLog.assessment = '⚠️ MOSTLY FUNCTIONAL - Some tiles need attention';
    } else if (auditLog.summary.warnings > 0) {
      auditLog.assessment = '✅ FUNCTIONAL WITH WARNINGS - All critical tiles operational';
    } else {
      auditLog.assessment = '✅ ALL TILES PASSED - Dashboard fully functional and displaying current data';
    }

    return Response.json({
      success: true,
      audit_log: auditLog
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});