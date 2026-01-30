import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Webhook handler for Monday.com board updates
 * Receives item updates from Monday and triggers financial calculations
 * Called via Monday automation when item is created or updated
 */

// Financial calculation engine
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

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { event, data } = body;

    // Monday sends updates with board/item/column structure
    const { board_id, item_id, column_values = {} } = data || {};

    if (!item_id || !board_id) {
      return Response.json({ status: 'ignored', reason: 'Missing item_id or board_id' });
    }

    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    if (!mondayApiKey) {
      return Response.json({ status: 'error', error: 'MONDAY_API_KEY not configured' }, { status: 500 });
    }

    // Extract financial inputs from the column values
    const passings = Number(column_values.passings) || 0;
    const total_capex = Number(column_values.total_capex) || 0;
    const build_months = Number(column_values.build_months) || 1;

    // Skip if no financial inputs
    if (!passings || !total_capex) {
      return Response.json({ status: 'skipped', reason: 'No financial inputs' });
    }

    // Calculate metrics
    const calculations = calculateFinancials({
      passings,
      build_months,
      total_capex,
      arpu_start: Number(column_values.arpu_start) || 63,
      penetration_start_pct: (Number(column_values.penetration_start_pct) || 10) / 100,
      penetration_target_pct: (Number(column_values.penetration_target_pct) || 40) / 100,
      ramp_months: Number(column_values.ramp_months) || 36,
      opex_per_sub: Number(column_values.opex_per_sub) || 25,
      discount_rate_pct: Number(column_values.discount_rate_pct) || 10,
      analysis_months: 120
    });

    if (calculations.error) {
      return Response.json({ status: 'error', error: calculations.error }, { status: 400 });
    }

    // Write results back to Monday using mutation
    const updateQuery = `
      mutation {
        change_multiple_column_values(board_id: "${board_id}", item_id: "${item_id}", column_values: "${JSON.stringify([
          { column_id: 'numbers1', value: String(calculations.npv || 0) },
          { column_id: 'numbers2', value: String(calculations.irr_pct || 0) },
          { column_id: 'numbers3', value: String(calculations.moic || 0) },
          { column_id: 'numbers4', value: String(calculations.actual_cash_invested || 0) }
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
      console.error('Monday update error:', updateData.errors);
      return Response.json({ status: 'error', errors: updateData.errors }, { status: 500 });
    }

    console.log('Item processed:', {
      item_id,
      npv: calculations.npv,
      irr_pct: calculations.irr_pct,
      moic: calculations.moic
    });

    return Response.json({
      status: 'success',
      item_id,
      calculations: {
        npv: calculations.npv,
        irr_pct: calculations.irr_pct,
        moic: calculations.moic,
        actual_cash_invested: calculations.actual_cash_invested
      }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({
      status: 'error',
      error: error.message
    }, { status: 500 });
  }
});