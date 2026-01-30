import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

/**
 * Portfolio Analysis v2.0 - Fungible Reinvestment + Start Date Shifts
 * 
 * Implements Alex's requirements:
 * - Money is fungible across projects
 * - Portfolio-level EBITDA reinvestment
 * - Start date shifts per project
 * - Two CAPEX numbers at portfolio level
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { projects, discount_rate_pct = 10, analysis_months = 120 } = body;

    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return Response.json({ 
        error: 'projects array required with at least one project' 
      }, { status: 400 });
    }

    // Configure S3
    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
    const bucket = 'gwi-raw-us-east-2-pc';

    // Load each project's scenario economics_monthly.csv
    const projectData = [];
    
    for (const proj of projects) {
      const { project_id, scenario_id, run_id, start_month_offset = 0 } = proj;
      
      if (!project_id || !scenario_id || !run_id) {
        return Response.json({ 
          error: 'Each project must have project_id, scenario_id, and run_id' 
        }, { status: 400 });
      }

      const monthlyKey = `raw/projects_pipeline/model_outputs/${project_id}/${scenario_id}/${run_id}/economics_monthly.csv`;
      
      try {
        const getResult = await s3Client.send(new GetObjectCommand({
          Bucket: bucket,
          Key: monthlyKey
        }));
        const csvContent = await getResult.Body.transformToString();
        
        // Parse CSV
        const lines = csvContent.split('\n');
        const headers = lines[0].split(',');
        const monthly = [];
        
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const values = lines[i].split(',');
          const row = {};
          headers.forEach((h, idx) => {
            row[h.trim()] = values[idx];
          });
          monthly.push(row);
        }
        
        projectData.push({
          project_id,
          scenario_id,
          run_id,
          start_month_offset,
          monthly
        });
      } catch (error) {
        return Response.json({
          error: `Failed to load economics data for project ${project_id}`,
          message: error.message,
          attempted_key: monthlyKey
        }, { status: 500 });
      }
    }

    // Build portfolio timeline with fungible reinvestment
    const portfolioMonthly = [];
    const monthly_rate = discount_rate_pct / 100 / 12;
    
    let cumulative_external_cash = 0;
    let peak_external_cash = 0;
    let total_capex_book_sum = 0;
    
    for (let t = 1; t <= analysis_months; t++) {
      let portfolio_capex_book = 0;
      let portfolio_ebitda = 0;
      let portfolio_revenue = 0;
      let portfolio_opex = 0;
      let portfolio_subscribers = 0;
      
      // Aggregate all projects at this month (with offsets)
      for (const proj of projectData) {
        const adjusted_month = t - proj.start_month_offset;
        if (adjusted_month < 1 || adjusted_month > proj.monthly.length) continue;
        
        const projRow = proj.monthly[adjusted_month - 1];
        portfolio_capex_book += Number(projRow.capex_book) || 0;
        portfolio_ebitda += Number(projRow.ebitda) || 0;
        portfolio_revenue += Number(projRow.revenue) || 0;
        portfolio_opex += Number(projRow.opex) || 0;
        portfolio_subscribers += Number(projRow.subscribers) || 0;
      }
      
      // Fungible reinvestment logic
      let external_cash_this_month = 0;
      if (portfolio_ebitda < 0) {
        external_cash_this_month = portfolio_capex_book - portfolio_ebitda;
      } else {
        external_cash_this_month = Math.max(0, portfolio_capex_book - portfolio_ebitda);
      }
      
      cumulative_external_cash += external_cash_this_month;
      peak_external_cash = Math.max(peak_external_cash, cumulative_external_cash);
      total_capex_book_sum += portfolio_capex_book;
      
      const fcf = portfolio_ebitda - portfolio_capex_book;
      const discountFactor = Math.pow(1 + monthly_rate, -t);
      const pv = fcf * discountFactor;
      
      portfolioMonthly.push({
        month: t,
        subscribers: portfolio_subscribers,
        revenue: portfolio_revenue.toFixed(2),
        opex: portfolio_opex.toFixed(2),
        ebitda: portfolio_ebitda.toFixed(2),
        capex_book: portfolio_capex_book.toFixed(2),
        external_cash_this_month: external_cash_this_month.toFixed(2),
        cumulative_external_cash: cumulative_external_cash.toFixed(2),
        fcf: fcf.toFixed(2),
        pv: pv.toFixed(2)
      });
    }

    const actual_cash_invested = peak_external_cash;
    
    // Calculate portfolio NPV
    const npv = portfolioMonthly.reduce((sum, m) => sum + parseFloat(m.pv), -actual_cash_invested);
    
    // Calculate portfolio IRR with robust solver
    let irr = null;
    let irrStatus = 'OK';
    
    const hasPositiveFCF = portfolioMonthly.some(m => parseFloat(m.fcf) > 0);
    
    if (actual_cash_invested <= 0) {
      irrStatus = 'NO_INVESTMENT';
    } else if (!hasPositiveFCF) {
      irrStatus = 'NO_POSITIVE_CASHFLOWS';
    } else {
      const testNPV = (rate) => {
        let npv = -actual_cash_invested;
        portfolioMonthly.forEach((m, idx) => {
          npv += parseFloat(m.fcf) / Math.pow(1 + rate, idx + 1);
        });
        return npv;
      };
      
      const npvAtNeg90 = testNPV(-0.9);
      const npvAtPos200 = testNPV(2.0);
      
      if (npvAtNeg90 * npvAtPos200 > 0) {
        irrStatus = 'NO_SIGN_CHANGE';
      } else {
        // Bisection method for portfolio (more stable)
        let low = -0.9;
        let high = 2.0;
        
        for (let i = 0; i < 50; i++) {
          const mid = (low + high) / 2;
          const npvMid = testNPV(mid);
          
          if (Math.abs(npvMid) < 0.01) {
            irr = mid;
            break;
          }
          
          const npvLow = testNPV(low);
          if (npvLow * npvMid < 0) {
            high = mid;
          } else {
            low = mid;
          }
          
          if (Math.abs(high - low) < 1e-6) {
            irr = mid;
            break;
          }
        }
        
        if (irr === null) {
          irrStatus = 'NON_CONVERGENT';
        }
      }
    }
    
    // Calculate portfolio MOIC
    const totalCashReturned = portfolioMonthly.reduce((sum, m) => sum + Math.max(0, parseFloat(m.fcf)), 0);
    const moic = actual_cash_invested > 0 ? totalCashReturned / actual_cash_invested : null;
    
    const portfolioMetrics = {
      total_capex_book: Math.round(total_capex_book_sum),
      actual_cash_invested: Math.round(actual_cash_invested),
      peak_external_cash: Math.round(peak_external_cash),
      npv: Math.round(npv),
      irr: irr !== null ? (irr * 12 * 100).toFixed(2) : null,
      irr_status: irrStatus,
      moic: moic !== null ? moic.toFixed(2) : null,
      peak_subscribers: Math.max(...portfolioMonthly.map(m => m.subscribers)),
      peak_ebitda: Math.max(...portfolioMonthly.map(m => parseFloat(m.ebitda)))
    };

    return Response.json({
      success: true,
      portfolio_metrics: portfolioMetrics,
      monthly: portfolioMonthly,
      projects_analyzed: projects.length,
      analysis_months
    });

  } catch (error) {
    console.error('Portfolio analysis error:', error);
    return Response.json({
      error: 'Portfolio analysis failed',
      message: error.message
    }, { status: 500 });
  }
});