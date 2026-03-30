import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { projects } = body;

    if (!projects || projects.length === 0) {
      return Response.json({ error: 'projects array required' }, { status: 400 });
    }

    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const bucket = 'gwi-raw-us-east-2-pc';

    // Load each project's scenario outputs
    const projectData = [];
    for (const { project_id, scenario_id } of projects) {
      try {
        // Get scenario registry to find latest run
        const registryResponse = await base44.functions.invoke('manageScenariosRegistry', {
          action: 'get',
          project_id
        });

        const scenario = registryResponse.data?.registry?.scenarios?.find(s => s.scenario_id === scenario_id);
        if (!scenario) continue;

        // Load latest economics_monthly.csv for this scenario
        const runsResponse = await base44.functions.invoke('listProjectModelOutputs', {
          project_id,
          action: 'list'
        });

        const run = runsResponse.data?.runs?.find(r => r.scenario_id === scenario_id);
        if (!run) continue;

        const monthlyFile = run.files?.find(f => f.file_name === 'economics_monthly.csv');
        if (!monthlyFile) continue;

        const contentResponse = await base44.functions.invoke('listProjectModelOutputs', {
          project_id,
          action: 'content',
          key: monthlyFile.key
        });

        // Parse CSV
        const lines = contentResponse.data.content.split('\n');
        const headers = lines[0].split(',');
        const monthly = [];
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx];
            });
            monthly.push(row);
          }
        }

        projectData.push({
          project_id,
          scenario_id,
          scenario_name: scenario.scenario_name,
          start_date: scenario.inputs?.start_date || new Date().toISOString().split('T')[0],
          start_month_offset: scenario.inputs?.start_month_offset || 0,
          monthly
        });

      } catch (error) {
        console.error(`Error loading data for ${project_id}:`, error);
      }
    }

    // Determine global timeline with start offsets
    let maxGlobalMonth = 0;
    let total_capex_book = 0;
    
    projectData.forEach(project => {
      const offset = project.start_month_offset || 0;
      const projectEndMonth = offset + project.monthly.length - 1;
      maxGlobalMonth = Math.max(maxGlobalMonth, projectEndMonth);
    });

    // Build time-aligned portfolio arrays
    const portfolioFcf = new Array(maxGlobalMonth + 1).fill(0);
    const portfolioEbitda = new Array(maxGlobalMonth + 1).fill(0);
    const portfolioCapex = new Array(maxGlobalMonth + 1).fill(0);
    const portfolioRevenue = new Array(maxGlobalMonth + 1).fill(0);
    const portfolioOpex = new Array(maxGlobalMonth + 1).fill(0);
    const portfolioSubscribers = new Array(maxGlobalMonth + 1).fill(0);

    // Aggregate each project into global timeline
    projectData.forEach(project => {
      const offset = project.start_month_offset || 0;
      project.monthly.forEach((row, index) => {
        const globalMonth = offset + index;
        portfolioFcf[globalMonth] += parseFloat(row.fcf || 0);
        portfolioEbitda[globalMonth] += parseFloat(row.ebitda || 0);
        portfolioCapex[globalMonth] += parseFloat(row.capex_book || row.capex || 0);
        portfolioRevenue[globalMonth] += parseFloat(row.revenue || 0);
        portfolioOpex[globalMonth] += parseFloat(row.opex || 0);
        portfolioSubscribers[globalMonth] += parseInt(row.subscribers || 0);
        total_capex_book += parseFloat(row.capex_book || row.capex || 0);
      });
    });

    // Compute portfolio external cash with cross-project reinvestment
    const portfolioExternalCashThisMonth = new Array(maxGlobalMonth + 1).fill(0);
    const portfolioCumulativeExternalCash = new Array(maxGlobalMonth + 1).fill(0);
    
    let runningExternal = 0;
    for (let t = 0; t <= maxGlobalMonth; t++) {
      // Cross-project reinvestment: EBITDA from all active projects offsets CAPEX
      if (portfolioEbitda[t] < 0) {
        portfolioExternalCashThisMonth[t] = portfolioCapex[t] - portfolioEbitda[t];
      } else {
        portfolioExternalCashThisMonth[t] = Math.max(0, portfolioCapex[t] - portfolioEbitda[t]);
      }
      runningExternal += portfolioExternalCashThisMonth[t];
      portfolioCumulativeExternalCash[t] = runningExternal;
    }

    const peak_external_cash = Math.max(...portfolioCumulativeExternalCash);

    // Build monthly output
    const portfolio_monthly = [];
    for (let month = 0; month <= maxGlobalMonth; month++) {
      portfolio_monthly.push({
        month,
        subscribers: portfolioSubscribers[month],
        revenue: portfolioRevenue[month],
        opex: portfolioOpex[month],
        ebitda: portfolioEbitda[month],
        capex_book: portfolioCapex[month],
        external_cash_this_month: portfolioExternalCashThisMonth[month],
        cumulative_external_cash: portfolioCumulativeExternalCash[month]
      });
    }

    // Calculate portfolio IRR/NPV/MOIC using CF vector
    const discount_rate = 0.10; // Fixed 10% for now
    const monthly_rate = discount_rate / 12;
    
    // CF[0] = -peak_external_cash, CF[1..T] = portfolioFcf[t]
    let portfolio_npv = -peak_external_cash;
    for (let t = 1; t <= maxGlobalMonth; t++) {
      const pv = portfolioFcf[t] / Math.pow(1 + monthly_rate, t);
      portfolio_npv += pv;
    }

    // Portfolio IRR using Newton-Raphson
    let portfolio_irr = 0.10;
    let irr_status = 'converged';
    const hasPositiveFCF = portfolioFcf.some(f => f > 0);
    
    if (!hasPositiveFCF || peak_external_cash <= 0) {
      portfolio_irr = null;
      irr_status = 'did_not_converge';
    } else {
      for (let i = 0; i < 20; i++) {
        let npvAtRate = -peak_external_cash;
        let derivative = 0;
        for (let t = 1; t <= maxGlobalMonth; t++) {
          const factor = Math.pow(1 + portfolio_irr, -t);
          npvAtRate += portfolioFcf[t] * factor;
          derivative -= t * portfolioFcf[t] * factor / (1 + portfolio_irr);
        }
        if (Math.abs(npvAtRate) < 0.01) break;
        if (Math.abs(derivative) < 1e-10) {
          portfolio_irr = null;
          irr_status = 'did_not_converge';
          break;
        }
        portfolio_irr = portfolio_irr - npvAtRate / derivative;
        if (Math.abs(portfolio_irr) > 10) {
          portfolio_irr = null;
          irr_status = 'did_not_converge';
          break;
        }
      }
    }

    // Portfolio MOIC
    const totalCashReturned = portfolioFcf.reduce((sum, fcf) => sum + Math.max(0, fcf), 0);
    const portfolio_moic = peak_external_cash > 0 ? totalCashReturned / peak_external_cash : 0;

    return Response.json({
      success: true,
      portfolio_metrics: {
        project_count: projectData.length,
        total_capex_book: Math.round(total_capex_book),
        actual_cash_invested: Math.round(peak_external_cash),
        peak_external_cash: Math.round(peak_external_cash),
        npv: Math.round(portfolio_npv),
        irr: portfolio_irr !== null ? (portfolio_irr * 12 * 100).toFixed(2) : null,
        irr_status: irr_status,
        moic: portfolio_moic.toFixed(2)
      },
      monthly_portfolio: portfolio_monthly.map(row => ({
        month: row.month,
        subscribers: row.subscribers,
        ebitda: Math.round(row.ebitda),
        cumulative_external_cash: Math.round(row.cumulative_external_cash)
      })),
      projects_included: projectData.map(p => ({
        project_id: p.project_id,
        scenario_name: p.scenario_name,
        start_date: p.start_date,
        start_month_offset: p.start_month_offset
      }))
    });

  } catch (error) {
    console.error('Portfolio analysis error:', error);
    return Response.json({ 
      success: false,
      message: `Failed to run portfolio: ${error.message}`
    }, { status: 500 });
  }
});