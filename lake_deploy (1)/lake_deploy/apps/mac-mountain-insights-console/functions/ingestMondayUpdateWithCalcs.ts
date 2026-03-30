import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.662.0';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  }
});

// Financial calculation engine (same as in ScenarioModelDrawer)
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

function escapeCsvValue(val) {
  const str = String(val || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    const {
      board_id,
      item_id,
      item_name,
      column_values = {},
      updated_at,
      updated_by
    } = body;

    // Stage 1: Save raw Monday payload to S3
    const rawTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '000Z');
    const stagingKey = `raw/projects_pipeline/monday_staging/monday_update_${rawTimestamp}.json`;

    const stagingCommand = new PutObjectCommand({
      Bucket: 'gwi-raw-us-east-2-pc',
      Key: stagingKey,
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json'
    });

    await s3Client.send(stagingCommand);

    // Stage 2: Extract and validate fields
    const project = {
      project_id: column_values.project_id || `monday-${item_id}`,
      entity: column_values.entity || '',
      project_name: column_values.project_name || item_name || '',
      project_type: column_values.project_type || '',
      state: column_values.state || 'Active',
      partner_share_raw: column_values.partner_share_raw || '',
      investor_label: column_values.investor_label || '',
      stage: column_values.stage || '',
      priority: column_values.priority || 'Medium',
      owner: column_values.owner || updated_by || '',
      notes: column_values.notes || '',
      is_test: column_values.is_test || false
    };

    if (!project.entity || !project.project_name) {
      return Response.json({
        success: false,
        error: 'Missing required fields: entity, project_name',
        staging_key: stagingKey
      }, { status: 400 });
    }

    // Stage 3: Run calculations if financial inputs are present
    let calculations = {};
    let calc_status = 'Pending';

    const hasFinancialInputs = column_values.passings || column_values.build_months || column_values.total_capex;

    if (hasFinancialInputs) {
      try {
        calculations = calculateFinancials({
          passings: Number(column_values.passings) || 0,
          build_months: Number(column_values.build_months) || 1,
          total_capex: Number(column_values.total_capex) || 0,
          arpu_start: Number(column_values.arpu_start) || 63,
          penetration_start_pct: (Number(column_values.penetration_start_pct) || 10) / 100,
          penetration_target_pct: (Number(column_values.penetration_target_pct) || 40) / 100,
          ramp_months: Number(column_values.ramp_months) || 36,
          opex_per_sub: Number(column_values.opex_per_sub) || 25,
          discount_rate_pct: Number(column_values.discount_rate_pct) || 10,
          analysis_months: 120
        });

        if (!calculations.error) {
          calc_status = 'Success';
        }
      } catch (err) {
        console.error('Calculation error:', err);
        calculations.error = err.message;
        calc_status = 'Error';
      }
    }

    // Stage 4: Create CSV with all fields (inputs + results)
    const csvRow = [
      project.project_id,
      project.entity,
      project.project_name,
      project.project_type,
      project.state,
      project.partner_share_raw,
      project.investor_label,
      project.stage,
      project.priority,
      project.owner,
      project.notes,
      project.is_test ? 'true' : 'false',
      column_values.passings || '',
      column_values.build_months || '',
      column_values.total_capex || '',
      column_values.start_date || '',
      column_values.arpu_start || '63',
      column_values.penetration_start_pct || '10',
      column_values.penetration_target_pct || '40',
      column_values.ramp_months || '36',
      column_values.capex_per_passing || '1200',
      column_values.opex_per_sub || '25',
      column_values.discount_rate_pct || '10',
      calculations.npv || '',
      calculations.irr_pct || '',
      calculations.moic || '',
      calculations.actual_cash_invested || '',
      calculations.peak_subscribers || '',
      calculations.peak_ebitda || '',
      calc_status
    ].map(escapeCsvValue).join(',');

    const csvHeader = 'project_id,entity,project_name,project_type,state,partner_share_raw,investor_label,stage,priority,owner,notes,is_test,passings,build_months,total_capex,start_date,arpu_start,penetration_start_pct,penetration_target_pct,ramp_months,capex_per_passing,opex_per_sub,discount_rate_pct,npv,irr_pct,moic,actual_cash_invested,peak_subscribers,peak_ebitda,calc_status';
    const csvContent = `${csvHeader}\n${csvRow}\n`;

    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '000Z');
    const inputKey = `raw/projects_pipeline/input/projects_input__${fileTimestamp}.csv`;

    const inputCommand = new PutObjectCommand({
      Bucket: 'gwi-raw-us-east-2-pc',
      Key: inputKey,
      Body: csvContent,
      ContentType: 'text/csv; charset=utf-8'
    });

    await s3Client.send(inputCommand);

    // Stage 5: Write calculations back to Monday (if API key available)
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    if (mondayApiKey && hasFinancialInputs && calculations.npv !== undefined) {
      try {
        const updateQuery = `
          mutation {
            change_column_value(board_id: "${board_id}", item_id: "${item_id}", column_id: "numbers1", value: "${calculations.npv}") {
              id
            }
            change_column_value(board_id: "${board_id}", item_id: "${item_id}", column_id: "numbers2", value: "${calculations.irr_pct || 0}") {
              id
            }
            change_column_value(board_id: "${board_id}", item_id: "${item_id}", column_id: "numbers3", value: "${calculations.moic || 0}") {
              id
            }
            change_column_value(board_id: "${board_id}", item_id: "${item_id}", column_id: "numbers4", value: "${calculations.actual_cash_invested}") {
              id
            }
            change_column_value(board_id: "${board_id}", item_id: "${item_id}", column_id: "numbers5", value: "${calculations.peak_subscribers}") {
              id
            }
            change_column_value(board_id: "${board_id}", item_id: "${item_id}", column_id: "numbers6", value: "${calculations.peak_ebitda}") {
              id
            }
          }
        `;

        await fetch('https://api.monday.com/v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': mondayApiKey
          },
          body: JSON.stringify({ query: updateQuery })
        });
      } catch (err) {
        console.error('Failed to write calculations back to Monday:', err);
      }
    }

    console.log('Monday update processed with calculations:', {
      item_id,
      project_id: project.project_id,
      calc_status,
      npv: calculations.npv,
      irr_pct: calculations.irr_pct
    });

    return Response.json({
      success: true,
      message: 'Monday update processed with calculations',
      project_id: project.project_id,
      staging_key: stagingKey,
      input_key: inputKey,
      calculations,
      calc_status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Monday ingestion error:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});