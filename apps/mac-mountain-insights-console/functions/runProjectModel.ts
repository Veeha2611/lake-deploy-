import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

// Mac Mountain Financial Policy - Configurable Standards
const financePolicy = {
  irrGreenThresholdPct: 15,
  irrYellowThresholdPct: 0,
  moicGreenThreshold: 2.0,
  moicYellowThreshold: 1.0,
  npvGreenFloor: 0,
  npvYellowBandRatio: 0.05
};

function classifyIRR(irrPct) {
  if (irrPct == null || Number.isNaN(irrPct)) return 'unknown';
  if (irrPct <= financePolicy.irrYellowThresholdPct) return 'red';
  if (irrPct < financePolicy.irrGreenThresholdPct) return 'yellow';
  return 'green';
}

function classifyMOIC(moic) {
  if (moic == null || Number.isNaN(moic)) return 'unknown';
  if (moic <= financePolicy.moicYellowThreshold) return 'red';
  if (moic < financePolicy.moicGreenThreshold) return 'yellow';
  return 'green';
}

function classifyNPV(npv, initialInvestment) {
  if (npv == null || Number.isNaN(npv)) return 'unknown';
  const bandWidth = Math.abs(initialInvestment || 0) * financePolicy.npvYellowBandRatio;
  if (npv < -bandWidth) return 'red';
  if (Math.abs(npv) <= bandWidth) return 'yellow';
  return 'green';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ 
        success: false,
        error: 'Unauthorized', 
        message: 'Authentication required' 
      }, { status: 401 });
    }
    
    // Enforce Capital Committee permission server-side
    const CAPITAL_COMMITTEE = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'];
    if (!CAPITAL_COMMITTEE.includes(user.email?.toLowerCase())) {
      return Response.json({ 
        success: false,
        error: 'Permission Denied',
        message: 'Only Capital Committee members can save scenarios',
        user_email: user.email
      }, { status: 403 });
    }

    const body = await req.json();
    const { project_id, scenario, overrides = {}, use_intacct_data = false } = body;

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    if (!scenario || !scenario.inputs) {
      return Response.json({ error: 'scenario with inputs required' }, { status: 400 });
    }

    const { scenario_id, scenario_name: rawScenarioName, inputs, is_test = false } = scenario;

    // Configure S3
    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const bucket = 'gwi-raw-us-east-2-pc';

    // Step 1: Load project metadata from Athena
    console.log('Loading project metadata for:', project_id);
    const projectQuery = `
      SELECT * FROM curated_core.projects_enriched 
      WHERE project_id = '${project_id}' 
      LIMIT 1
    `;
    
    const projectResult = await base44.functions.invoke('aiLayerQuery', {
      sql: projectQuery
    });

    const projectData = projectResult.data?.data?.[0] || {};
    console.log('Project data:', projectData);

    // Step 2: Generate scenario name if not provided
    // CRITICAL: scenario_name must NEVER be empty, null, or "Unnamed Scenario"
    const projectName = projectData.project_name || project_id || 'Project';
    
    // Load existing scenarios to determine sequence number (only count non-test scenarios)
    let existingScenarioCount = 0;
    try {
      const registryResponse = await base44.functions.invoke('manageScenariosRegistry', {
        action: 'get',
        project_id
      });
      existingScenarioCount = registryResponse.data?.registry?.scenarios?.filter(s => !s.is_test)?.length || 0;
    } catch (err) {
      console.log('Could not load scenario count, using 0:', err.message);
    }
    
    // Generate proper scenario name - NEVER use "Unnamed Scenario" or empty string
    let scenario_name;
    if (rawScenarioName && rawScenarioName.trim().length > 0 && rawScenarioName.trim() !== 'Unnamed Scenario') {
      scenario_name = rawScenarioName.trim();
    } else {
      scenario_name = `${projectName} — Scenario ${existingScenarioCount + 1}`;
    }
    
    console.log('Scenario name:', scenario_name);

    // Step 3: Attempt to load existing economics/model data from S3
    const existingData = await loadExistingProjectData(s3Client, bucket, project_id);
    console.log('Existing data found:', existingData);

    // Step 4: Optionally load Intacct revenue data
    let intacctData = null;
    if (use_intacct_data) {
      console.log('Loading Intacct revenue data...');
      try {
        const intacctResponse = await base44.functions.invoke('processIntacctRevenue', {
          project_id,
          scenario_id,
          assumptions: inputs
        });
        
        if (intacctResponse.data?.success) {
          intacctData = intacctResponse.data;
          console.log('Intacct data loaded:', {
            total_revenue: intacctData.summary_metrics?.total_revenue,
            distinct_customers: intacctData.summary_metrics?.distinct_customers,
            month_count: intacctData.summary_metrics?.month_count
          });
        }
      } catch (intacctError) {
        console.error('Failed to load Intacct data:', intacctError);
      }
    }

    // Step 5: Use provided inputs from scenario
    const assumptions = {
      ...inputs,
      project_id,
      project_name: projectName,
      entity: projectData.entity || 'Unknown',
      intacct_data_loaded: !!intacctData
    };
    console.log('Final assumptions:', assumptions);

    // Validate required inputs
    if (!assumptions.passings || !assumptions.build_months) {
      return Response.json({ 
        success: false, 
        message: 'Missing required inputs: passings and build_months' 
      }, { status: 400 });
    }

    // Step 6: Run 120-month model
    const modelResults = runFinancialModel(assumptions);

    // Step 7: Update scenarios registry BEFORE writing outputs
    // This ensures consistency - scenario exists before outputs
    try {
      const registryResponse = await base44.functions.invoke('manageScenariosRegistry', {
        action: 'upsert',
        project_id,
        scenario: {
          scenario_id,
          scenario_name,
          is_test,
          inputs: assumptions
        }
      });
      
      if (!registryResponse.data.success) {
        throw new Error('Failed to update scenarios registry');
      }
      console.log('Registry updated successfully');
    } catch (regError) {
      console.error('Registry update failed:', regError);
      return Response.json({
        success: false,
        error: 'Failed to update scenarios registry',
        message: regError.message,
        attempted_key: `raw/projects_pipeline/model_outputs/${project_id}/scenarios.json`
      }, { status: 500 });
    }
    
    // Step 8: Write outputs to S3 under new structure
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const run_id = `run_${Date.now()}`;
    const outputPrefix = `raw/projects_pipeline/model_outputs/${project_id}/${scenario_id}/${run_id}/`;
    
    const outputs = {
      inputs_key: `${outputPrefix}inputs.json`,
      summary_metrics_key: `${outputPrefix}summary_metrics.csv`,
      economics_monthly_key: `${outputPrefix}economics_monthly.csv`
    };

    // Write inputs JSON with scenario metadata
    const inputsPayload = {
      project_id,
      scenario_id,
      scenario_name,
      run_id,
      created_at: new Date().toISOString(),
      inputs: assumptions,
      defaults_used: inputs,
      // Include all metrics for auditability
      metrics: modelResults.metrics
    };
    
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: outputs.inputs_key,
        Body: JSON.stringify(inputsPayload, null, 2),
        ContentType: 'application/json',
        ContentDisposition: `attachment; filename="inputs.json"`
      }));
    } catch (s3Error) {
      console.error('Failed to write inputs.json:', s3Error);
      return Response.json({
        success: false,
        error: 'Failed to write inputs.json to S3',
        message: s3Error.message,
        attempted_key: outputs.inputs_key,
        aws_request_id: s3Error.$metadata?.requestId
      }, { status: 500 });
    }

    // Write summary metrics CSV
    try {
      const metricsCSV = generateMetricsCSV(modelResults.metrics);
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: outputs.summary_metrics_key,
        Body: metricsCSV,
        ContentType: 'text/csv; charset=utf-8',
        ContentDisposition: `attachment; filename="summary_metrics.csv"`
      }));
    } catch (s3Error) {
      console.error('Failed to write summary_metrics.csv:', s3Error);
      return Response.json({
        success: false,
        error: 'Failed to write summary_metrics.csv to S3',
        message: s3Error.message,
        attempted_key: outputs.summary_metrics_key,
        aws_request_id: s3Error.$metadata?.requestId
      }, { status: 500 });
    }

    // Write economics monthly CSV
    try {
      const monthlyCSV = generateMonthlyCSV(modelResults.monthly);
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: outputs.economics_monthly_key,
        Body: monthlyCSV,
        ContentType: 'text/csv; charset=utf-8',
        ContentDisposition: `attachment; filename="economics_monthly.csv"`
      }));
    } catch (s3Error) {
      console.error('Failed to write economics_monthly.csv:', s3Error);
      return Response.json({
        success: false,
        error: 'Failed to write economics_monthly.csv to S3',
        message: s3Error.message,
        attempted_key: outputs.economics_monthly_key,
        aws_request_id: s3Error.$metadata?.requestId
      }, { status: 500 });
    }

    console.log('Model outputs written to S3:', outputs);

    return Response.json({
      success: true,
      project_id,
      scenario_id,
      scenario_name,  // Always return the scenario_name so frontend can use it
      run_id,
      outputs,
      metrics: modelResults.metrics,
      metric_explanations: modelResults.metric_explanations,
      intacct_data: intacctData ? {
        data_quality: intacctData.data_quality,
        summary_metrics: intacctData.summary_metrics,
        financial_metrics: intacctData.financial_metrics
      } : null,
      is_test: is_test,
      message: 'Financial report generated and saved to S3.'
    });

  } catch (error) {
    console.error('runProjectModel error:', error);
    return Response.json({ 
      success: false,
      message: `Failed to generate model: ${error.message}`
    }, { status: 500 });
  }
});

// Load existing project data from S3
async function loadExistingProjectData(s3Client, bucket, project_id) {
  const data = {};
  
  const prefixes = [
    'raw/projects_pipeline/economics_monthly/',
    'raw/projects_pipeline/acquisition_models/',
    'raw/projects_pipeline/lc_pipeline/'
  ];

  for (const prefix of prefixes) {
    try {
      const listResult = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 100
      }));

      if (listResult.Contents) {
        // Find files matching this project_id
        const matchingFiles = listResult.Contents.filter(obj => {
          const fileName = obj.Key.split('/').pop();
          const filePrefix = fileName.split('__')[0];
          return filePrefix === project_id;
        });

        // Get the most recent matching file
        if (matchingFiles.length > 0) {
          const latestFile = matchingFiles.sort((a, b) => 
            new Date(b.LastModified) - new Date(a.LastModified)
          )[0];

          console.log(`Found existing data for ${project_id} at ${latestFile.Key}`);
          
          // Read the file content (parse if needed for assumptions)
          const getResult = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: latestFile.Key
          }));

          const content = await getResult.Body.transformToString();
          data[prefix] = { key: latestFile.Key, content };
        }
      }
    } catch (err) {
      console.error(`Error reading ${prefix}:`, err.message);
    }
  }

  return data;
}

// Build final assumptions from all sources
function buildAssumptions(projectData, existingData, overrides) {
  // Start with defaults
  const defaults = {
    passings: 0,
    buildmonths: 0,
    subrate: 50,
    capex_per_passing: 1400,
    install_per_subscriber: 800,
    arpu: 75,
    circuit: false,
    circuit_type: '10G',
    month_min: 0,
    month_avg: 15,
    peak_ebitda: 50,
    min_ebitda: -150,
    time_peak: 7,
    term_mult: 6,
    bb_owner: 50
  };

  // Merge in any parsed values from existing data (simplified)
  const merged = { ...defaults };

  // Apply overrides (user input)
  Object.assign(merged, overrides);

  // Add project metadata
  merged.project_id = projectData.project_id;
  merged.project_name = projectData.project_name;
  merged.entity = projectData.entity;

  return merged;
}

// Run the 120-month financial model with EBITDA reinvestment logic
function runFinancialModel(assumptions) {
  const months = assumptions.analysis_months || 120;
  const monthly = [];
  
  const {
    passings,
    build_months,
    total_capex,
    arpu_start = 63,
    penetration_start_pct = 0.10,
    penetration_target_pct = 0.40,
    ramp_months = 36,
    capex_per_passing = 1200,
    opex_per_sub = 25,
    discount_rate_pct = 10
  } = assumptions;

  const total_capex_book = total_capex || (passings * capex_per_passing);
  const monthly_rate = discount_rate_pct / 100 / 12;

  // Edge case: Zero or negative total CAPEX
  if (total_capex_book <= 0) {
    return {
      monthly: [],
      metrics: {
        total_capex_book: 0,
        actual_cash_invested: 0,
        peak_external_cash: 0,
        npv: null,
        irr: null,
        irr_status: 'not_defined_no_investment',
        moic: null,
        moic_status: 'not_defined_no_investment',
        peak_subscribers: 0,
        peak_monthly_ebitda: 0
      },
      metric_explanations: []
    };
  }

  // Track both Total CAPEX (book) and Actual Cash Invested (with reinvestment)
  const monthly_capex_schedule = total_capex_book / build_months;
  let cumulative_external_cash = 0;
  let peak_external_cash = 0;
  
  for (let month = 1; month <= months; month++) {
    // Subscriber growth
    const buildProgress = Math.min(month / build_months, 1);
    const rampProgress = Math.min(Math.max(month - build_months, 0) / ramp_months, 1);
    const penetration = penetration_start_pct + (penetration_target_pct - penetration_start_pct) * rampProgress;
    const subscribers = Math.floor(passings * buildProgress * penetration);
    
    const revenue = subscribers * arpu_start;
    const opex = subscribers * opex_per_sub;
    const ebitda = revenue - opex;
    const capex_book = month <= build_months ? monthly_capex_schedule : 0;
    
    // Reinvestment logic: EBITDA offsets CAPEX
    let external_cash_this_month = 0;
    if (ebitda < 0) {
      // Operating loss - need external cash for both opex shortfall and capex
      external_cash_this_month = capex_book - ebitda;
    } else {
      // EBITDA positive - reinvest into CAPEX first
      external_cash_this_month = Math.max(0, capex_book - ebitda);
    }
    
    cumulative_external_cash += external_cash_this_month;
    peak_external_cash = Math.max(peak_external_cash, cumulative_external_cash);
    
    const fcf = ebitda - capex_book;
    const discountFactor = Math.pow(1 + monthly_rate, -month);
    const pv = fcf * discountFactor;
    
    const date = new Date();
    date.setMonth(date.getMonth() + month);
    
    monthly.push({
      date: date.toISOString().split('T')[0],
      month_number: month,
      subscribers,
      penetration_pct: (penetration * 100).toFixed(2),
      arpu: arpu_start.toFixed(2),
      revenue: revenue.toFixed(2),
      opex: opex.toFixed(2),
      ebitda: ebitda.toFixed(2),
      capex_book: capex_book.toFixed(2),
      external_cash_this_month: external_cash_this_month.toFixed(2),
      cumulative_external_cash: cumulative_external_cash.toFixed(2),
      fcf: fcf.toFixed(2),
      pv: pv.toFixed(2)
    });
  }

  const actual_cash_invested = peak_external_cash;
  
  // Calculate NPV using Actual Cash Invested as CF[0]
  const npv = monthly.reduce((sum, m) => sum + parseFloat(m.pv), -actual_cash_invested);
  
  // Calculate IRR using Actual Cash Invested with robust solver
  let irr_monthly_decimal = null;
  let irrStatus = 'converged';
  let irrReason = null;
  let irrDebug = null;
  
  // Build explicit cashflow array: CF[0] = -investment, CF[1..N] = monthly FCF
  const cashflows = [-actual_cash_invested, ...monthly.map(m => parseFloat(m.fcf))];
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  const hasSignChange = minCF < 0 && maxCF > 0;
  
  // Pre-flight checks
  if (actual_cash_invested <= 0) {
    irrStatus = 'no_investment';
    irrReason = 'Actual cash invested is zero or negative';
  } else if (!hasSignChange) {
    irrStatus = 'no_sign_change';
    irrReason = 'No sign change in cashflow sequence - IRR does not exist';
  } else {
    // IRR exists - attempt to solve
    const testNPV = (rate) => {
      let npv = -actual_cash_invested;
      monthly.forEach((m, idx) => {
        npv += parseFloat(m.fcf) / Math.pow(1 + rate, idx + 1);
      });
      return npv;
    };
    
    // Check for root existence in reasonable range
    const npvAtNeg95 = testNPV(-0.95);
    const npvAtPos300 = testNPV(3.0);
    
    if (npvAtNeg95 * npvAtPos300 > 0) {
      irrStatus = 'no_root_in_range';
      irrReason = 'No IRR solution found in range [-95%, +300%] monthly';
      irrDebug = { npv_at_neg95: npvAtNeg95.toFixed(2), npv_at_pos300: npvAtPos300.toFixed(2) };
    } else {
      // Try Newton-Raphson with safeguards
      let rate = 0.10; // Start at 10% monthly
      let irrConverged = false;
      let iterations = 0;
      let lastNPV = 0;
      let lastDerivative = 0;
      
      for (let i = 0; i < 50; i++) {
        iterations = i + 1;
        let npvAtRate = -actual_cash_invested;
        let derivative = 0;
        
        monthly.forEach((m, idx) => {
          const factor = Math.pow(1 + rate, -(idx + 1));
          npvAtRate += parseFloat(m.fcf) * factor;
          derivative -= (idx + 1) * parseFloat(m.fcf) * factor / (1 + rate);
        });
        
        lastNPV = npvAtRate;
        lastDerivative = derivative;
        
        if (Math.abs(npvAtRate) < 0.001) {
          irr_monthly_decimal = rate;
          irrConverged = true;
          break;
        }
        
        if (Math.abs(derivative) < 1e-10) {
          irrStatus = 'derivative_too_small';
          irrReason = 'Newton-Raphson derivative too small to continue';
          break;
        }
        
        const step = npvAtRate / derivative;
        rate = rate - step;
        
        // Clamp to reasonable bounds
        if (rate < -0.95) rate = -0.95;
        if (rate > 3.0) rate = 3.0;
        
        // Check for oscillation
        if (Math.abs(step) < 1e-8) {
          irr_monthly_decimal = rate;
          irrConverged = true;
          break;
        }
      }
      
      // If Newton didn't converge, try bisection
      if (!irrConverged && irrStatus === 'converged') {
        let low = -0.95;
        let high = 3.0;
        
        for (let i = 0; i < 100; i++) {
          iterations += 1;
          const mid = (low + high) / 2;
          const npvMid = testNPV(mid);
          
          if (Math.abs(npvMid) < 0.001) {
            irr_monthly_decimal = mid;
            irrConverged = true;
            break;
          }
          
          const npvLow = testNPV(low);
          if (npvLow * npvMid < 0) {
            high = mid;
          } else {
            low = mid;
          }
          
          if (Math.abs(high - low) < 1e-7) {
            irr_monthly_decimal = mid;
            irrConverged = true;
            break;
          }
        }
      }
      
      if (!irrConverged && irrStatus === 'converged') {
        irrStatus = 'did_not_converge';
        irrReason = `Solver failed to converge after ${iterations} iterations`;
        irrDebug = {
          iterations,
          last_rate_monthly: rate.toFixed(6),
          npv_at_last_rate: lastNPV.toFixed(2),
          derivative_at_last_rate: lastDerivative.toFixed(2),
          min_cashflow: minCF.toFixed(2),
          max_cashflow: maxCF.toFixed(2),
          has_sign_change: hasSignChange
        };
      }
    }
  }
  
  // Calculate MOIC using same cashflow vector as IRR/NPV
  const distributed_sum_pos_fcf = monthly.reduce((sum, m) => sum + Math.max(0, parseFloat(m.fcf)), 0);
  const paid_in = actual_cash_invested;
  let moic = null;
  let moicStatus = 'defined';
  let moicReason = null;
  
  if (paid_in <= 0) {
    moicStatus = 'not_defined';
    moicReason = 'No external investment required';
  } else if (distributed_sum_pos_fcf <= 0) {
    moicStatus = 'not_defined';
    moicReason = 'No positive cashflows over modeled horizon';
  } else {
    moic = distributed_sum_pos_fcf / paid_in;
  }
  
  // Cashflow summary for diagnostics
  const fcfValues = monthly.map(m => parseFloat(m.fcf));
  const min_fcf = Math.min(...fcfValues);
  const max_fcf = Math.max(...fcfValues);
  const count_pos_fcf_months = fcfValues.filter(f => f > 0).length;
  const count_neg_fcf_months = fcfValues.filter(f => f < 0).length;
  
  const peakSubscribers = Math.max(...monthly.map(m => m.subscribers));
  const peakEbitda = Math.max(...monthly.map(m => parseFloat(m.ebitda)));

  // Calculate annualized IRR using compound formula
  const irr_annual_pct = irr_monthly_decimal !== null 
    ? ((Math.pow(1 + irr_monthly_decimal, 12) - 1) * 100)
    : null;

  const metrics = {
    total_capex_book: Math.round(total_capex_book),
    actual_cash_invested: Math.round(actual_cash_invested),
    peak_external_cash: Math.round(peak_external_cash),
    npv: Math.round(npv),
    npv_color: classifyNPV(npv, actual_cash_invested),
    irr_monthly_decimal: irr_monthly_decimal !== null ? parseFloat(irr_monthly_decimal.toFixed(6)) : null,
    irr_annual_pct: irr_annual_pct !== null ? parseFloat(irr_annual_pct.toFixed(2)) : null,
    irr_status: irrStatus,
    irr_reason: irrReason,
    irr_color: irr_annual_pct !== null ? classifyIRR(irr_annual_pct) : 'unknown',
    ...(irrDebug && { irr_debug: irrDebug }),
    distributed_sum_pos_fcf: Math.round(distributed_sum_pos_fcf),
    paid_in: Math.round(paid_in),
    moic: moic !== null ? parseFloat(moic.toFixed(2)) : null,
    moic_status: moicStatus,
    moic_reason: moicReason,
    moic_color: moic !== null ? classifyMOIC(moic) : 'unknown',
    peak_subscribers: peakSubscribers,
    peak_monthly_ebitda: Math.round(peakEbitda),
    cashflow_summary: {
      min_fcf: Math.round(min_fcf),
      max_fcf: Math.round(max_fcf),
      count_pos_fcf_months,
      count_neg_fcf_months
    }
  };

  // Add calculation explanations
  const metric_explanations = [
    {
      metric_name: "Total CAPEX (Book)",
      formula_human: "Total planned capital expenditure over the project life, without considering EBITDA reinvestment. This is the 'book cost' to build.",
      formula_expression: "total_capex_book = passings × capex_per_passing",
      notes: "Spread evenly over build_months. This is the full project cost if no operating cashflows were available to fund construction."
    },
    {
      metric_name: "Actual Cash Invested",
      formula_human: "External cash required after EBITDA reinvestment. Peak external cash draw represents the maximum capital commitment needed.",
      formula_expression: "actual_cash_invested = peak(cumulative external cash)\nwhere external_cash[t] = CAPEX[t] - max(0, EBITDA[t])",
      notes: "Always ≤ Total CAPEX. Difference shows how much the project 'self-funds' via operating cashflows."
    },
    {
      metric_name: "NPV (Net Present Value)",
      formula_human: "Present value of all future cashflows discounted at specified rate, minus Actual Cash Invested.",
      formula_expression: "NPV = Σ(FCF[t] / (1 + r/12)^t) - Actual_Cash_Invested",
      coloring_logic: "Green when NPV > 0, red when NPV < 0, yellow for borderline.",
      notes: "Uses Actual Cash Invested (not Total CAPEX) as initial outlay."
    },
    {
      metric_name: "IRR (Internal Rate of Return)",
      formula_human: "Annualized return rate where NPV = 0, calculated using Actual Cash Invested as CF[0]. Uses compound annualization: (1 + monthly_rate)^12 - 1.",
      formula_expression: "Solve for r_monthly where: Σ(FCF[t] / (1 + r_monthly)^t) - Actual_Cash_Invested = 0\nThen: IRR_annual = ((1 + r_monthly)^12 - 1) × 100",
      coloring_logic: "Green ≥15%, yellow 0-15%, red <0%.",
      notes: "IRR uses same cashflow vector as NPV/MOIC for consistency. Stored as both monthly decimal and annual percent."
    },
    {
      metric_name: "MOIC (Multiple on Invested Capital)",
      formula_human: "Total positive cash returned divided by Actual Cash Invested. Uses same FCF vector as IRR/NPV.",
      formula_expression: "distributed = Σ(max(0, FCF[t])) for t≥1\npaid_in = actual_cash_invested\nMOIC = distributed / paid_in",
      coloring_logic: "Green ≥2.0x, yellow 1.0-2.0x, red <1.0x.",
      notes: "MOIC ignores timing. High MOIC with low IRR means returns take long time. Stored as distributed_sum_pos_fcf / paid_in."
    },
    {
      metric_name: "Peak Subscribers",
      formula_human: "Maximum number of subscribers reached during the analysis period. Subscribers grow as the network is built (build_months) and as penetration ramps from start to target level (ramp_months). Calculated monthly as: subscribers[t] = passings × buildProgress[t] × penetration[t].",
      formula_expression: "subscribers[t] = passings × min(t/build_months, 1) × penetration[t]\nwhere penetration[t] = penetration_start + (penetration_target - penetration_start) × min(max(t - build_months, 0) / ramp_months, 1)",
      inputs_frontend: ["passings", "build_months", "penetration_start_pct", "penetration_target_pct", "ramp_months"],
      inputs_backend: ["None - calculated in-memory from model run"],
      s3_sources: [`raw/projects_pipeline/model_outputs/${assumptions.project_id}/*/economics_monthly.csv`],
      notes: "Subscribers begin growing once the network starts being built, and continue ramping up for ramp_months after build completes."
    },
    {
      metric_name: "Peak Monthly EBITDA",
      formula_human: "Maximum monthly EBITDA (Earnings Before Interest, Tax, Depreciation, and Amortization) reached during the analysis period. EBITDA = Revenue - OpEx, where Revenue = subscribers × ARPU and OpEx = subscribers × opex_per_sub.",
      formula_expression: "EBITDA[t] = Revenue[t] - OpEx[t]\nRevenue[t] = subscribers[t] × arpu_start\nOpEx[t] = subscribers[t] × opex_per_sub",
      inputs_frontend: ["passings", "build_months", "arpu_start", "opex_per_sub", "penetration_start_pct", "penetration_target_pct", "ramp_months"],
      inputs_backend: ["None - calculated in-memory from model run"],
      s3_sources: [`raw/projects_pipeline/model_outputs/${assumptions.project_id}/*/economics_monthly.csv`],
      coloring_logic: "Green when peak EBITDA > 0 (operating profit), red when peak EBITDA < 0 (operating loss).",
      notes: "Peak EBITDA typically occurs when subscriber count and penetration are at their maximum."
    },
    {
      metric_name: "External Cash This Month",
      formula_human: "Cash needed from outside this month after EBITDA reinvestment into CAPEX.",
      formula_expression: "external_cash[t] = max(0, CAPEX[t] - EBITDA[t]) when EBITDA > 0\n= CAPEX[t] - EBITDA[t] when EBITDA < 0",
      notes: "Negative values mean project is returning cash. Cumulative sum gives peak external cash requirement."
    }
  ];

  return { monthly, metrics, metric_explanations };
}



// Generate CSV from monthly data
function generateMonthlyCSV(monthly) {
  const headers = Object.keys(monthly[0]).join(',');
  const rows = monthly.map(m => Object.values(m).join(','));
  return headers + '\n' + rows.join('\n');
}

// Generate CSV from metrics
function generateMetricsCSV(metrics) {
  const headers = 'metric,value';
  const rows = Object.entries(metrics).map(([key, value]) => `${key},${value}`);
  return headers + '\n' + rows.join('\n');
}