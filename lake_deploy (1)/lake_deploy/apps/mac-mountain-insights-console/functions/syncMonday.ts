import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Complete Monday.com board sync
 * 1. Fetch all items from Monday board
 * 2. Calculate financial metrics for items with inputs
 * 3. Write NPV, IRR, MOIC back to Monday
 * 4. Track sync status
 */

// Financial calculation engine (same as ScenarioModelDrawer)
function calculateFinancials(inputs) {
  const {
    passings = 0,
    build_months = 1,
    total_capex = 0,
    arpu_start = 63,
    penetration_start_pct = 0.10,
    penetration_target_pct = 0.40,
    ramp_months = 36,
    opex_per_sub = 25,
    discount_rate_pct = 10,
    analysis_months = 120
  } = inputs;

  const total_capex_book = total_capex || 0;
  if (total_capex_book <= 0) {
    return {
      npv: null,
      irr_pct: null,
      moic: null,
      actual_cash_invested: 0,
      peak_subscribers: 0,
      peak_ebitda: 0,
      error: 'Total CAPEX must be greater than zero'
    };
  }

  const monthly_rate = discount_rate_pct / 100 / 12;
  const monthly = [];
  const monthly_capex_schedule = total_capex_book / build_months;
  let cumulative_external_cash = 0;
  let peak_external_cash = 0;

  for (let month = 1; month <= analysis_months; month++) {
    const buildProgress = Math.min(month / build_months, 1);
    const rampProgress = Math.min(Math.max(month - build_months, 0) / ramp_months, 1);
    const penetration = penetration_start_pct + (penetration_target_pct - penetration_start_pct) * rampProgress;
    const subscribers = Math.floor(passings * buildProgress * penetration);

    const revenue = subscribers * arpu_start;
    const opex = subscribers * opex_per_sub;
    const ebitda = revenue - opex;
    const capex_book = month <= build_months ? monthly_capex_schedule : 0;

    let external_cash_this_month = 0;
    if (ebitda < 0) {
      external_cash_this_month = capex_book - ebitda;
    } else {
      external_cash_this_month = Math.max(0, capex_book - ebitda);
    }

    cumulative_external_cash += external_cash_this_month;
    peak_external_cash = Math.max(peak_external_cash, cumulative_external_cash);

    const fcf = ebitda - capex_book;
    const discountFactor = Math.pow(1 + monthly_rate, -month);
    const pv = fcf * discountFactor;

    monthly.push({
      month,
      subscribers,
      revenue,
      ebitda,
      capex_book,
      external_cash_this_month,
      cumulative_external_cash,
      fcf,
      pv
    });
  }

  const actual_cash_invested = peak_external_cash;
  const npv = monthly.reduce((sum, m) => sum + m.pv, -actual_cash_invested);

  // IRR calculation
  let irr_monthly_decimal = null;
  const cashflows = [-actual_cash_invested, ...monthly.map(m => m.fcf)];
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  const hasSignChange = minCF < 0 && maxCF > 0;

  if (actual_cash_invested > 0 && hasSignChange) {
    let rate = 0.10;
    for (let i = 0; i < 50; i++) {
      let npvAtRate = -actual_cash_invested;
      let derivative = 0;

      monthly.forEach((m, idx) => {
        const factor = Math.pow(1 + rate, -(idx + 1));
        npvAtRate += m.fcf * factor;
        derivative -= (idx + 1) * m.fcf * factor / (1 + rate);
      });

      if (Math.abs(npvAtRate) < 0.001) {
        irr_monthly_decimal = rate;
        break;
      }
      if (Math.abs(derivative) < 1e-10) break;
      rate = rate - npvAtRate / derivative;
      if (rate < -0.95) rate = -0.95;
      if (rate > 3.0) rate = 3.0;
    }
  }

  const irr_pct = irr_monthly_decimal !== null
    ? ((Math.pow(1 + irr_monthly_decimal, 12) - 1) * 100)
    : null;

  // MOIC calculation
  const distributed_sum_pos_fcf = monthly.reduce((sum, m) => sum + Math.max(0, m.fcf), 0);
  const moic = actual_cash_invested > 0 && distributed_sum_pos_fcf > 0
    ? distributed_sum_pos_fcf / actual_cash_invested
    : null;

  const peak_subscribers = Math.max(...monthly.map(m => m.subscribers));
  const peak_ebitda = Math.max(...monthly.map(m => m.ebitda));

  return {
    npv: Math.round(npv),
    irr_pct: irr_pct ? Math.round(irr_pct * 10) / 10 : null,
    moic: moic ? Math.round(moic * 100) / 100 : null,
    actual_cash_invested: Math.round(actual_cash_invested),
    peak_subscribers,
    peak_ebitda: Math.round(peak_ebitda)
  };
}

// Parse column value based on type
function parseColumnValue(columnValue, columnType) {
  if (!columnValue || !columnValue.value) return null;
  
  const val = columnValue.value;
  
  if (columnType === 'numbers' || columnType === 'number') {
    return parseFloat(val) || null;
  }
  
  if (columnType === 'text' || columnType === 'long_text') {
    return val;
  }
  
  // For complex types, try to parse as JSON
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const boardId = Deno.env.get('MONDAY_BOARD_ID');
    
    if (!mondayApiKey || !boardId) {
      return Response.json({ error: 'Missing MONDAY_API_KEY or MONDAY_BOARD_ID' }, { status: 400 });
    }

    // Fetch all items from Monday board
    const query = `
      query {
        boards(ids: ${boardId}) {
          id
          name
          columns {
            id
            title
            type
          }
          items_page(limit: 100) {
            items {
              id
              name
              column_values {
                id
                type
                value
              }
            }
          }
        }
      }
    `;
    
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query }),
    });
    
    const data = await response.json();
    const board = data?.data?.boards?.[0];
    
    if (!board) {
      return Response.json({ error: 'Board not found', api_error: data.errors }, { status: 400 });
    }

    const items = board.items_page?.items || [];
    const columns = board.columns || [];
    
    // Build column map for lookups
    const columnMap = {};
    columns.forEach(col => {
      columnMap[col.id] = { title: col.title, type: col.type };
    });

    // Track sync results
    const syncResults = {
      total_items: items.length,
      processed: 0,
      calculated: 0,
      written_back: 0,
      errors: [],
      items_detail: []
    };

    // Process each item
    for (const item of items) {
      try {
        // Build column value map
        const columnValues = {};
        item.column_values.forEach(cv => {
          const colInfo = columnMap[cv.id];
          if (colInfo) {
            columnValues[colInfo.title.toLowerCase().replace(/\s+/g, '_')] = parseColumnValue(cv, colInfo.type);
          }
        });

        syncResults.processed++;

        // Check if item has financial inputs
        const hasInputs = columnValues.passings || columnValues.total_capex || columnValues.build_months;
        
        if (!hasInputs) {
          syncResults.items_detail.push({
            item_id: item.id,
            item_name: item.name,
            status: 'skipped',
            reason: 'no_financial_inputs'
          });
          continue;
        }

        // Run calculations
        const calculations = calculateFinancials({
          passings: Number(columnValues.passings) || 0,
          build_months: Number(columnValues.build_months) || 1,
          total_capex: Number(columnValues.total_capex) || 0,
          arpu_start: Number(columnValues.arpu_start) || 63,
          penetration_start_pct: (Number(columnValues.penetration_start_pct) || 10) / 100,
          penetration_target_pct: (Number(columnValues.penetration_target_pct) || 40) / 100,
          ramp_months: Number(columnValues.ramp_months) || 36,
          opex_per_sub: Number(columnValues.opex_per_sub) || 25,
          discount_rate_pct: Number(columnValues.discount_rate_pct) || 10,
          analysis_months: 120
        });

        if (calculations.error) {
          syncResults.items_detail.push({
            item_id: item.id,
            item_name: item.name,
            status: 'error',
            error: calculations.error
          });
          syncResults.errors.push({ item_id: item.id, error: calculations.error });
          continue;
        }

        syncResults.calculated++;

        // Write results back to Monday
        // First, find the NPV, IRR, MOIC column IDs from the board
        const npvCol = columns.find(c => c.title.toLowerCase().includes('npv'));
        const irrCol = columns.find(c => c.title.toLowerCase().includes('irr'));
        const moicCol = columns.find(c => c.title.toLowerCase().includes('moic'));

        if (npvCol && irrCol && moicCol) {
          const updateQuery = `
            mutation {
              change_multiple_column_values(board_id: "${board.id}", item_id: "${item.id}", column_values: "${JSON.stringify([
                { column_id: npvCol.id, value: String(calculations.npv || 0) },
                { column_id: irrCol.id, value: String(calculations.irr_pct || 0) },
                { column_id: moicCol.id, value: String(calculations.moic || 0) }
              ]).replace(/"/g, '\\"')}") {
                id
              }
            }
          `;

          const updateResponse = await fetch('https://api.monday.com/v2', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': mondayApiKey,
            },
            body: JSON.stringify({ query: updateQuery }),
          });

          const updateData = await updateResponse.json();
          if (updateData.errors) {
            throw new Error(`Monday update error: ${JSON.stringify(updateData.errors)}`);
          }

          syncResults.written_back++;
        }

        syncResults.items_detail.push({
          item_id: item.id,
          item_name: item.name,
          status: 'calculated',
          npv: calculations.npv,
          irr_pct: calculations.irr_pct,
          moic: calculations.moic
        });

      } catch (itemError) {
        syncResults.errors.push({
          item_id: item.id,
          error: itemError.message
        });
        syncResults.items_detail.push({
          item_id: item.id,
          item_name: item.name,
          status: 'error',
          error: itemError.message
        });
      }
    }

    return Response.json({
      success: true,
      board_name: board.name,
      board_id: board.id,
      sync_results: syncResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});