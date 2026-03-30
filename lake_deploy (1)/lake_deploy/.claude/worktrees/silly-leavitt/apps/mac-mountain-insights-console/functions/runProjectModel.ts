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

function buildEomonthDates(startDate: Date, months: number) {
  const dates: Date[] = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i + 1, 0);
    dates.push(d);
  }
  return dates;
}

function computeXirr(cashflows: number[], dates: Date[]) {
  if (!cashflows.length || cashflows.length !== dates.length) {
    return { rate: null, status: 'invalid_input', reason: 'Cashflows and dates length mismatch' };
  }
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  if (!(minCF < 0 && maxCF > 0)) {
    return { rate: null, status: 'no_sign_change', reason: 'No sign change in cashflows' };
  }

  const day0 = dates[0].getTime();
  const yearFrac = dates.map((d) => (d.getTime() - day0) / (365 * 24 * 60 * 60 * 1000));
  const xnpv = (rate: number) => {
    let total = 0;
    for (let i = 0; i < cashflows.length; i += 1) {
      total += cashflows[i] / Math.pow(1 + rate, yearFrac[i]);
    }
    return total;
  };

  let low = -0.95;
  let high = 3.0;
  let fLow = xnpv(low);
  let fHigh = xnpv(high);
  if (fLow * fHigh > 0) {
    return { rate: null, status: 'no_root_in_range', reason: 'No XIRR root in range [-95%, +300%]' };
  }

  let rate: number | null = null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const fMid = xnpv(mid);
    if (Math.abs(fMid) < 1e-6) {
      rate = mid;
      break;
    }
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
    rate = mid;
  }

  return { rate, status: 'converged', reason: null };
}

function runDeveloperTemplateModel(assumptions: any) {
  const {
    passings,
    build_months,
    subscription_months,
    subscription_rate,
    capex_per_passing,
    install_cost_per_subscriber,
    arpu_start,
    circuit,
    circuit_type,
    min_non_circuit_cogs,
    cogs_pct_revenue,
    opex_per_sub,
    opex_per_passing,
    min_monthly_opex,
    ebitda_multiple,
    discount_rate_pct,
    analysis_months,
    model_profile,
    start_date
  } = assumptions;

  const months = analysis_months || 120;
  const subscriptionDelay = assumptions.subscription_start_delay_months != null
    ? assumptions.subscription_start_delay_months
    : 5;
  const passingsStartDelay = assumptions.passings_start_delay_months != null
    ? assumptions.passings_start_delay_months
    : 1;
  const blueprintShare = assumptions.blueprint_share ?? 0.5;
  const contributionShare = assumptions.contribution_share ?? 0.5;
  const distributionStartMonth = assumptions.distribution_start_month ?? 27;

  const normalizedProfile = String(model_profile || '').trim().toLowerCase() || 'developer_template_2_9_26';
  const circuitDefaults = {
    1: { nrc: 0, mrc: 1300, threshold: 100 },
    2: { nrc: 0, mrc: 2400, threshold: 200 },
    5: { nrc: 0, mrc: 3500, threshold: 500 },
    10: { nrc: 0, mrc: 5000, threshold: 1000 }
  };
  const circuitConfig = circuitDefaults[circuit_type] || circuitDefaults[1];
  const effectiveCircuitNrc = assumptions.circuit_nrc ?? circuitConfig.nrc;
  const effectiveCircuitMrc = assumptions.circuit_mrc ?? circuitConfig.mrc;
  const effectiveCircuitThreshold = assumptions.circuit_sub_threshold ?? circuitConfig.threshold;

  const totalPassings = passings || 0;
  const totalSubscribersTarget = totalPassings * (subscription_rate ?? 0);
  const subscriptionMonths = subscription_months || build_months || 36;
  const passingsPerMonth = build_months ? (totalPassings / build_months) : 0;
  const subsPerMonth = subscriptionMonths ? (totalSubscribersTarget / subscriptionMonths) : 0;
  const distributionThreshold = totalSubscribersTarget * (arpu_start || 0);

  const epsilon = 1e-6;
  let passingsEnd = 0;
  let subscribersEnd = 0;
  let totalCircuitsPrev = 0;
  let ebCashPrev = 0;
  let cumulativeContribution = 0;

  const monthly: any[] = [];
  const cashOutflows: number[] = [];
  const cashInflows: number[] = [];

  for (let i = 0; i < months; i += 1) {
    const monthNumber = i + 1;
    const remainingPassings = totalPassings - passingsEnd;
    const passingsAdded = (i < passingsStartDelay || remainingPassings <= epsilon)
      ? 0
      : Math.min(passingsPerMonth, remainingPassings);
    passingsEnd = Math.min(totalPassings, passingsEnd + passingsAdded);

    let subscribersAdded = 0;
    const remainingSubscribers = totalSubscribersTarget - subscribersEnd;
    if (i >= subscriptionDelay && remainingSubscribers > epsilon) {
      subscribersAdded = Math.min(subsPerMonth, remainingSubscribers);
    }
    subscribersEnd = Math.min(totalSubscribersTarget, subscribersEnd + subscribersAdded);

    const revenue = subscribersEnd * (arpu_start || 0);

    let totalCircuits = 0;
    let circuitCostNrc = 0;
    let circuitCostMrc = 0;
    if (circuit) {
      const firstCircuit = passingsEnd > 0 ? 1 : 0;
      const additionalCircuits = subscribersEnd >= effectiveCircuitThreshold
        ? Math.floor(subscribersEnd / effectiveCircuitThreshold)
        : 0;
      totalCircuits = firstCircuit + additionalCircuits;
      const circuitAdditions = totalCircuits - totalCircuitsPrev;
      circuitCostNrc = circuitAdditions * effectiveCircuitNrc;
      circuitCostMrc = totalCircuits * effectiveCircuitMrc;
    }

    const otherCogs = revenue === 0
      ? 0
      : Math.max(min_non_circuit_cogs || 0, revenue * (cogs_pct_revenue || 0));
    const grossProfit = revenue - circuitCostNrc - circuitCostMrc - otherCogs;

    let opex = 0;
    if (i === 0) {
      opex = passingsAdded > 1 ? 5000 : 0;
    } else {
      const opexVariable = (passingsEnd * (opex_per_passing || 0)) + (subscribersEnd * (opex_per_sub || 0));
      opex = Math.max(opexVariable, min_monthly_opex || 0);
    }

    const ebitda = grossProfit - opex;

    const capexPerPassing = passingsAdded * (capex_per_passing || 0);
    const capexPerSubscriber = subscribersAdded * (install_cost_per_subscriber || 0);
    const capexBook = capexPerPassing + capexPerSubscriber;
    const projectCapex = -capexBook;
    const projectFcf = projectCapex + ebitda;

    const bbCash = i === 0 ? 0 : ebCashPrev;
    const contribution = (bbCash + projectFcf) < 0 ? -(bbCash + projectFcf) : 0;
    let distribution = 0;
    if (monthNumber >= distributionStartMonth && projectFcf > 0) {
      const tentative = bbCash + projectFcf + contribution;
      if (tentative > distributionThreshold) {
        distribution = tentative - distributionThreshold;
      }
    }
    const ebCash = bbCash + projectFcf + contribution - distribution;

    const tier1 = -contribution;
    if (tier1 < 0) {
      cumulativeContribution += tier1 * contributionShare;
    }
    const cashOut = monthNumber === 1 ? cumulativeContribution : (cumulativeContribution - (monthly[i - 1]?.cumulative_contribution ?? 0));
    const cashIn = projectFcf > 0 ? projectFcf * blueprintShare : 0;

    monthly.push({
      month_number: monthNumber,
      passings_added: passingsAdded,
      passings: passingsEnd,
      subscribers_added: subscribersAdded,
      subscribers: subscribersEnd,
      revenue,
      circuit_count: totalCircuits,
      circuit_cost_nrc: circuitCostNrc,
      circuit_cost_mrc: circuitCostMrc,
      other_cogs: otherCogs,
      gross_profit: grossProfit,
      opex,
      ebitda,
      capex_book: capexBook,
      project_fcf: projectFcf,
      bb_cash: bbCash,
      contribution,
      distribution,
      eb_cash: ebCash,
      cumulative_contribution: cumulativeContribution,
      cash_out: cashOut,
      cash_in: cashIn,
      fcf: cashIn
    });

    cashOutflows.push(cashOut);
    cashInflows.push(cashIn);
    ebCashPrev = ebCash;
    totalCircuitsPrev = totalCircuits;
  }

  const terminalEbitda = monthly.slice(-12).reduce((sum, m) => sum + (m.ebitda || 0), 0);
  const terminalValueEbitda = terminalEbitda > 0 ? terminalEbitda * (ebitda_multiple || 0) : 0;
  const saleProceeds = terminalValueEbitda * blueprintShare;
  const endingCashShare = (monthly[monthly.length - 1]?.eb_cash || 0) * blueprintShare;
  if (monthly.length) {
    monthly[monthly.length - 1].fcf = (monthly[monthly.length - 1].fcf || 0) + saleProceeds;
  }

  const cashflows = monthly.map((m, idx) => {
    if (idx === 0) return (m.cash_out + m.cash_in - 0.01);
    if (idx === monthly.length - 1) return m.cash_out + saleProceeds + endingCashShare;
    return m.cash_out + m.cash_in;
  });

  const startDate = start_date ? new Date(start_date) : new Date('2025-01-31');
  const dates = buildEomonthDates(startDate, months);
  const irrResult = computeXirr(cashflows, dates);
  const irrAnnualPct = irrResult.rate != null ? Number((irrResult.rate * 100).toFixed(2)) : null;

  const cashInvested = -cashOutflows.reduce((sum, v) => sum + v, 0);
  const cashReturned = cashInflows.reduce((sum, v) => sum + v, 0) + saleProceeds;
  const moic = cashInvested > 0 ? Number((cashReturned / cashInvested).toFixed(2)) : null;

  const discountRate = (discount_rate_pct || 10) / 100;
  const npv = cashflows.reduce((sum, cf, idx) => {
    const t = (dates[idx].getTime() - dates[0].getTime()) / (365 * 24 * 60 * 60 * 1000);
    return sum + cf / Math.pow(1 + discountRate, t);
  }, 0);

  const peakSubscribers = Math.max(...monthly.map((m) => m.subscribers || 0));
  const peakEbitda = Math.max(...monthly.map((m) => m.ebitda || 0));
  const totalCapexBook = monthly.reduce((sum, m) => sum + (m.capex_book || 0), 0);
  const peakExternalCash = Math.max(...monthly.map((m) => -(m.cumulative_contribution || 0)));

  return {
    monthly,
    metrics: {
      total_capex_book: Math.round(totalCapexBook),
      actual_cash_invested: Math.round(cashInvested),
      peak_external_cash: Math.round(peakExternalCash),
      npv: Math.round(npv),
      irr_monthly_decimal: null,
      irr_annual_pct: irrAnnualPct,
      irr_status: irrResult.status,
      irr_reason: irrResult.reason,
      moic,
      moic_status: moic != null ? 'defined' : 'not_defined',
      peak_subscribers: Math.round(peakSubscribers),
      peak_monthly_ebitda: Math.round(peakEbitda),
      terminal_value: Math.round(terminalValueEbitda),
      terminal_value_ebitda: Math.round(terminalValueEbitda),
      terminal_value_method: 'ebitda',
      model_profile: normalizedProfile,
      cash_returned: Math.round(cashReturned)
    },
    metric_explanations: []
  };
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
    discount_rate_pct = 10,
    subscription_months,
    subscription_rate,
    subscription_start_delay_months,
    install_cost_per_subscriber = 0,
    opex_per_passing = 0,
    min_monthly_opex = 0,
    cogs_pct_revenue = 0,
    min_non_circuit_cogs = 0,
    circuit = false,
    circuit_type = 1,
    circuit_nrc,
    circuit_mrc,
    circuit_sub_threshold,
    ebitda_multiple = 15,
    startup_opex = 0,
    model_profile,
    terminal_value_method,
    terminal_value_weight,
    per_subscriber_terminal_value
  } = assumptions;

  const normalizeRate = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return num > 1 ? num / 100 : num;
  };

  const normalizedProfile = String(model_profile || '').trim().toLowerCase();
  const profileKey = normalizedProfile || 'standard';
  const isDeveloperTemplate = ['developer_template_2_9_26', 'developer_template', 'exec_dashboard'].includes(profileKey);
  if (isDeveloperTemplate) {
    return runDeveloperTemplateModel({ ...assumptions, model_profile: profileKey });
  }
  const effectiveSubscriptionDelay = subscription_start_delay_months != null
    ? subscription_start_delay_months
    : (isDeveloperTemplate ? 0 : 6);

  const effectiveSubscriptionRate = normalizeRate(subscription_rate, penetration_target_pct ?? 0.4);
  const effectiveSubscriptionMonths = subscription_months || ramp_months || 36;

  const circuitDefaults = {
    1: { nrc: 0, mrc: 1300, threshold: 100 },
    2: { nrc: 0, mrc: 2400, threshold: 200 },
    5: { nrc: 0, mrc: 3500, threshold: 500 },
    10: { nrc: 0, mrc: 5000, threshold: 1000 }
  };
  const circuitConfig = circuitDefaults[circuit_type] || circuitDefaults[1];
  const effectiveCircuitNrc = circuit_nrc ?? circuitConfig.nrc;
  const effectiveCircuitMrc = circuit_mrc ?? circuitConfig.mrc;
  const effectiveCircuitThreshold = circuit_sub_threshold ?? circuitConfig.threshold;

  const total_capex_book = total_capex || (
    (passings || 0) * (capex_per_passing || 0) +
    (passings || 0) * effectiveSubscriptionRate * (install_cost_per_subscriber || 0)
  );
  const monthly_rate = discount_rate_pct / 100 / 12;

  if (total_capex_book <= 0 || !passings) {
    return {
      monthly: [],
      metrics: {
        total_capex_book: 0,
        actual_cash_invested: 0,
        peak_external_cash: 0,
        npv: null,
        irr_monthly_decimal: null,
        irr_annual_pct: null,
        irr_status: 'not_defined_no_investment',
        moic: null,
        moic_status: 'not_defined_no_investment',
        peak_subscribers: 0,
        peak_monthly_ebitda: 0,
        terminal_value: 0
      },
      metric_explanations: []
    };
  }

  const monthly_capex_schedule = total_capex_book / (build_months || 1);
  let cumulative_external_cash = 0;
  let peak_external_cash = 0;
  let passings_end = 0;
  let subscribers_end = 0;
  let totalCircuitsPrev = 0;

  const passings_add_per_month = build_months ? (passings / build_months) : 0;
  const totalSubscribersTarget = passings * effectiveSubscriptionRate;
  const subscribers_add_per_month = effectiveSubscriptionMonths ? (totalSubscribersTarget / effectiveSubscriptionMonths) : 0;

  for (let month = 1; month <= months; month += 1) {
    const passings_added = month <= build_months ? passings_add_per_month : 0;
    passings_end = Math.min(passings, passings_end + passings_added);

    let subscribers_added = 0;
    if (month > effectiveSubscriptionDelay && subscribers_end < totalSubscribersTarget) {
      subscribers_added = Math.min(subscribers_add_per_month, totalSubscribersTarget - subscribers_end);
    }
    subscribers_end = Math.min(totalSubscribersTarget, subscribers_end + subscribers_added);

    const penetration = passings_end > 0 ? subscribers_end / passings_end : 0;
    const revenue = subscribers_end * arpu_start;

    let totalCircuits = 0;
    let circuit_cost_nrc = 0;
    let circuit_cost_mrc = 0;

    if (circuit) {
      const firstCircuit = subscribers_end > 0 ? 1 : 0;
      const additionalCircuits = subscribers_end >= effectiveCircuitThreshold
        ? Math.floor(subscribers_end / effectiveCircuitThreshold)
        : 0;
      totalCircuits = firstCircuit + additionalCircuits;
      const circuitAdditions = totalCircuits - totalCircuitsPrev;
      circuit_cost_nrc = circuitAdditions * effectiveCircuitNrc;
      circuit_cost_mrc = totalCircuits * effectiveCircuitMrc;
    }

    const other_cogs = revenue > 0
      ? Math.max(min_non_circuit_cogs || 0, revenue * (cogs_pct_revenue || 0))
      : 0;

    const gross_profit = revenue - circuit_cost_nrc - circuit_cost_mrc - other_cogs;
    const opex_variable = (passings_end * (opex_per_passing || 0)) + (subscribers_end * (opex_per_sub || 0));
    const opex_base = Math.max(min_monthly_opex || 0, opex_variable);
    const opex = (month === 1 ? startup_opex : 0) + opex_base;
    const ebitda = gross_profit - opex;

    const useDetailCapex = (capex_per_passing || install_cost_per_subscriber) && passings;
    const capex_book = useDetailCapex
      ? (passings_added * (capex_per_passing || 0)) + (subscribers_added * (install_cost_per_subscriber || 0))
      : (month <= build_months ? monthly_capex_schedule : 0);

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

    const date = new Date();
    date.setMonth(date.getMonth() + month);

    monthly.push({
      date: date.toISOString().split('T')[0],
      month_number: month,
      passings_added: passings_added.toFixed(2),
      passings: passings_end.toFixed(2),
      subscribers_added: subscribers_added.toFixed(2),
      subscribers: subscribers_end.toFixed(2),
      penetration_pct: (penetration * 100).toFixed(2),
      arpu: arpu_start.toFixed(2),
      revenue: revenue.toFixed(2),
      circuit_count: totalCircuits,
      circuit_cost_nrc: circuit_cost_nrc.toFixed(2),
      circuit_cost_mrc: circuit_cost_mrc.toFixed(2),
      other_cogs: other_cogs.toFixed(2),
      gross_profit: gross_profit.toFixed(2),
      opex: opex.toFixed(2),
      ebitda: ebitda.toFixed(2),
      capex_book: capex_book.toFixed(2),
      external_cash_this_month: external_cash_this_month.toFixed(2),
      cumulative_external_cash: cumulative_external_cash.toFixed(2),
      fcf: fcf.toFixed(2),
      pv: pv.toFixed(2)
    });

    totalCircuitsPrev = totalCircuits;
  }

  const actual_cash_invested = peak_external_cash;

  const terminalEbitda = monthly.slice(-12).reduce((sum, m) => sum + parseFloat(m.ebitda), 0);
  const terminalValueEbitda = terminalEbitda > 0 ? terminalEbitda * (ebitda_multiple || 0) : 0;
  const terminalSubscriberValue = per_subscriber_terminal_value != null
    ? per_subscriber_terminal_value
    : (isDeveloperTemplate ? 10000 : 0);
  const terminalValueSubscribers = terminalSubscriberValue && subscribers_end
    ? subscribers_end * terminalSubscriberValue
    : 0;
  const terminalMethod = String(terminal_value_method || (isDeveloperTemplate ? 'blended' : 'ebitda')).toLowerCase();
  const terminalWeight = terminal_value_weight != null ? terminal_value_weight : 0.5;
  let terminal_value = terminalValueEbitda;
  if (terminalMethod === 'subscriber') {
    terminal_value = terminalValueSubscribers;
  } else if (terminalMethod === 'blended') {
    terminal_value = (terminalValueEbitda * terminalWeight) + (terminalValueSubscribers * (1 - terminalWeight));
  }
  if (monthly.length) {
    const last = monthly[monthly.length - 1];
    last.terminal_value = terminal_value.toFixed(2);
    last.terminal_value_ebitda = terminalValueEbitda.toFixed(2);
    last.terminal_value_subscriber = terminalValueSubscribers.toFixed(2);
    const fcfWithTerminal = parseFloat(last.fcf) + terminal_value;
    last.fcf_with_terminal = fcfWithTerminal.toFixed(2);
    const pvWithTerminal = fcfWithTerminal * Math.pow(1 + monthly_rate, -months);
    last.pv_with_terminal = pvWithTerminal.toFixed(2);
  }

  const npv = monthly.reduce((sum, m) => sum + parseFloat(m.pv), -actual_cash_invested) +
    (terminal_value * Math.pow(1 + monthly_rate, -months));

  let irr_monthly_decimal = null;
  let irrStatus = 'converged';
  let irrReason = null;
  let irrDebug = null;
  const cashflows = [-actual_cash_invested, ...monthly.map((m, idx) => {
    const base = parseFloat(m.fcf);
    if (idx === monthly.length - 1) return base + terminal_value;
    return base;
  })];
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  const hasSignChange = minCF < 0 && maxCF > 0;

  if (actual_cash_invested <= 0) {
    irrStatus = 'no_investment';
    irrReason = 'Actual cash invested is zero or negative';
  } else if (!hasSignChange) {
    irrStatus = 'no_sign_change';
    irrReason = 'No sign change in cashflow sequence - IRR does not exist';
  } else {
    const testNPV = (rate) => {
      let npvVal = -actual_cash_invested;
      monthly.forEach((m, idx) => {
        const fcfVal = parseFloat(m.fcf) + (idx === monthly.length - 1 ? terminal_value : 0);
        npvVal += fcfVal / Math.pow(1 + rate, idx + 1);
      });
      return npvVal;
    };

    const npvAtNeg95 = testNPV(-0.95);
    const npvAtPos300 = testNPV(3.0);

    if (npvAtNeg95 * npvAtPos300 > 0) {
      irrStatus = 'no_root_in_range';
      irrReason = 'No IRR solution found in range [-95%, +300%] monthly';
      irrDebug = { npv_at_neg95: npvAtNeg95.toFixed(2), npv_at_pos300: npvAtPos300.toFixed(2) };
    } else {
      let rate = 0.10;
      let irrConverged = false;
      let iterations = 0;
      let lastNPV = 0;
      let lastDerivative = 0;

      for (let i = 0; i < 50; i += 1) {
        iterations = i + 1;
        let npvAtRate = -actual_cash_invested;
        let derivative = 0;

        monthly.forEach((m, idx) => {
          const factor = Math.pow(1 + rate, -(idx + 1));
          const fcfVal = parseFloat(m.fcf) + (idx === monthly.length - 1 ? terminal_value : 0);
          npvAtRate += fcfVal * factor;
          derivative -= (idx + 1) * fcfVal * factor / (1 + rate);
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
        if (rate < -0.95) rate = -0.95;
        if (rate > 3.0) rate = 3.0;

        if (Math.abs(step) < 1e-8) {
          irr_monthly_decimal = rate;
          irrConverged = true;
          break;
        }
      }

      if (!irrConverged && irrStatus === 'converged') {
        let low = -0.95;
        let high = 3.0;

        for (let i = 0; i < 100; i += 1) {
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

  const distributed_sum_pos_fcf = monthly.reduce((sum, m, idx) => {
    const fcfVal = parseFloat(m.fcf) + (idx === monthly.length - 1 ? terminal_value : 0);
    return sum + Math.max(0, fcfVal);
  }, 0);
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

  const fcfValues = monthly.map((m) => parseFloat(m.fcf));
  const min_fcf = Math.min(...fcfValues);
  const max_fcf = Math.max(...fcfValues);
  const count_pos_fcf_months = fcfValues.filter((f) => f > 0).length;
  const count_neg_fcf_months = fcfValues.filter((f) => f < 0).length;

  const peakSubscribers = Math.max(...monthly.map((m) => parseFloat(m.subscribers)));
  const peakEbitda = Math.max(...monthly.map((m) => parseFloat(m.ebitda)));

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
    ...(irrDebug && { irr_debug: irrDebug }),
    irr_color: irr_annual_pct !== null ? classifyIRR(irr_annual_pct) : 'unknown',
    moic: moic !== null ? parseFloat(moic.toFixed(2)) : null,
    moic_status: moicStatus,
    moic_reason: moicReason,
    moic_color: moic !== null ? classifyMOIC(moic) : 'unknown',
    peak_subscribers: Math.round(peakSubscribers),
    peak_monthly_ebitda: Math.round(peakEbitda),
    min_fcf: Math.round(min_fcf),
    max_fcf: Math.round(max_fcf),
    count_pos_fcf_months,
    count_neg_fcf_months,
    terminal_value: Math.round(terminal_value),
    terminal_ebitda: Math.round(terminalEbitda),
    terminal_value_ebitda: Math.round(terminalValueEbitda),
    terminal_value_subscriber: Math.round(terminalValueSubscribers),
    terminal_value_method: terminalMethod,
    terminal_value_weight: terminalMethod === 'blended' ? terminalWeight : null,
    model_profile: profileKey,
    subscription_start_delay_months: effectiveSubscriptionDelay
  };

  const metric_explanations = [];
  if (irrStatus !== 'converged') {
    metric_explanations.push(`IRR not computed: ${irrReason || irrStatus}`);
  }
  if (moicStatus !== 'defined') {
    metric_explanations.push(`MOIC not computed: ${moicReason || moicStatus}`);
  }

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
