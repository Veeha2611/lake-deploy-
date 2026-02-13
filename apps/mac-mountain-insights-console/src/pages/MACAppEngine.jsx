import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Play, Brain, AlertTriangle, HelpCircle, Lightbulb, TrendingUp, FileSpreadsheet } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { runSSOTQuery } from '@/api/ssotQuery';
import * as XLSX from 'xlsx';
import RevenueReproPack from '@/pages/RevenueReproPack';
import { toast } from 'sonner';

// ============================================
// INTERNAL LOGIC (HIDDEN FROM NORMAL USERS)
// ============================================

// Forecast scenarios (SSOT-backed source queries + deterministic trailing-average projection).
const FORECAST_SCENARIOS = {
  ap_spend: {
    label: 'AP Spend Forecast',
    description: 'Accounts payable spend over time (Intacct GL)',
    amountColumn: 'amount_total',
    queryId: 'forecast_ap_spend',
    columns: ['period_month', 'amount_total'],
    methodology: 'Summed GL entries tagged as Accounts Payable for the selected window.'
  },
  revenue: {
    label: 'Revenue Forecast',
    description: 'Monthly revenue trend from SSOT billing',
    amountColumn: 'total_revenue',
    queryId: 'forecast_revenue',
    columns: ['period_month', 'total_revenue'],
    methodology: 'Monthly revenue totals from curated_core.v_monthly_revenue_platt_long.'
  },
  vendor_spend: {
    label: 'Vendor Spend Forecast',
    description: 'Top vendor spend trend (Intacct GL)',
    amountColumn: 'amount_total',
    queryId: 'forecast_vendor_spend',
    columns: ['period_month', 'vendor', 'amount_total'],
    methodology: 'Monthly spend for the top vendors by absolute GL activity.'
  },
  gl_account: {
    label: 'GL Account Forecast',
    description: 'Top GL account activity over time (Intacct GL)',
    amountColumn: 'amount_total',
    queryId: 'forecast_gl_account',
    columns: ['period_month', 'accountno', 'account_title', 'amount_total'],
    methodology: 'Monthly totals for the most active GL accounts by absolute activity.'
  },
  cash_flow: {
    label: 'Cash Flow Forecast',
    description: 'Operating cash flow trend from GL revenue vs expense',
    amountColumn: 'cash_flow',
    queryId: 'forecast_cash_flow',
    columns: ['period_month', 'revenue', 'expenses', 'cash_flow'],
    methodology: 'Operating cash flow proxy = revenue minus expense categories.'
  },
  expense_category: {
    label: 'Expense Category Forecast',
    description: 'Expense categories over time (Intacct GL)',
    amountColumn: 'amount_total',
    queryId: 'forecast_expense_category',
    columns: ['period_month', 'account_category', 'amount_total'],
    methodology: 'Monthly totals for expense-related account categories.'
  }
};

const buildForecastSummary = (rows, columns, amountColumn, lookback = 6, horizon = 12) => {
  if (!rows.length) return null;
  const amountIndex = columns.indexOf(amountColumn);
  const periodIndex = columns.indexOf('period_month');
  if (amountIndex === -1 || periodIndex === -1) return null;
  const sorted = rows.slice().sort((a, b) => String(a[periodIndex]).localeCompare(String(b[periodIndex])));
  const recent = sorted.slice(-lookback);
  const recentValues = recent.map(r => Number(r[amountIndex])).filter(v => Number.isFinite(v));
  if (!recentValues.length) return null;
  const avg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
  const projectedTotal = avg * horizon;
  return {
    last_period: sorted[sorted.length - 1]?.[periodIndex],
    last_value: sorted[sorted.length - 1]?.[amountIndex],
    lookback_months: lookback,
    forecast_horizon_months: horizon,
    avg_recent_value: avg,
    projected_total: projectedTotal
  };
};

function getLastNMonthsRange(months = 12) {
  const safeMonths = Math.max(1, Math.min(Number(months) || 12, 60));
  const end = new Date();
  end.setDate(1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - (safeMonths - 1));
  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
    months: safeMonths
  };
}

function formatLocalISODate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Full-month aligned window (end_date is last day of the previous month).
function getLastFullMonthsRange(months = 12) {
  const safeMonths = Math.max(1, Math.min(Number(months) || 12, 60));
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(thisMonthStart);
  start.setMonth(start.getMonth() - safeMonths);
  const endInclusive = new Date(thisMonthStart);
  endInclusive.setDate(endInclusive.getDate() - 1);
  return {
    start_date: formatLocalISODate(start),
    end_date: formatLocalISODate(endInclusive),
    months: safeMonths
  };
}

function toYearMonth(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousQuarterMonths(baseDate = new Date()) {
  const d = new Date(baseDate);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  const quarter = Math.floor(month / 3); // 0-3
  let q = quarter - 1;
  let y = year;
  if (q < 0) {
    q = 3;
    y -= 1;
  }
  const startMonth = q * 3; // 0,3,6,9
  return [0, 1, 2].map((offset) => `${y}-${String(startMonth + offset + 1).padStart(2, '0')}`);
}

function generateExecutiveReport(output) {
  const timestamp = new Date().toLocaleString();
  const summary = output.summary || 'SSOT query results.';
  const insights = output.insights || [];

  const tableFor = (columns = [], rows = []) => {
    if (!columns.length || !rows.length) return '';
    return `
      <table>
        <thead>
          <tr>${columns.map(col => `<th>${col.replace(/_/g, ' ')}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  let tableHTML = '';
  if (output.data?.financial_data && output.data?.columns) {
    tableHTML = tableFor(output.data.columns, output.data.financial_data);
  }

  let multiPartHTML = '';
  if (output.data?.multi_part_results?.length) {
    multiPartHTML = output.data.multi_part_results.map((result, idx) => `
      <div class="section">
        <div class="section-title">Task ${idx + 1}: ${result.description}</div>
        ${result.methodology ? `<div class="summary-box">Methodology: ${result.methodology}</div>` : ''}
        ${tableFor(result.columns || [], result.data || [])}
      </div>
    `).join('');
  }

  let forecastSummaryHTML = '';
  if (output.data?.forecast_summary) {
    const fs = output.data.forecast_summary;
    const summaryRows = [
      ['Forecast Horizon (months)', fs.forecast_horizon_months ?? ''],
      ['Lookback Months', fs.lookback_months ?? ''],
      ['Last Period', fs.last_period ?? ''],
      ['Last Value', fs.last_value ?? ''],
      ['Avg Recent Value', fs.avg_recent_value ?? ''],
      ['Projected Total', fs.projected_total ?? '']
    ];
    forecastSummaryHTML = `
      <div class="section">
        <div class="section-title">Forecast Summary</div>
        ${tableFor(['metric', 'value'], summaryRows)}
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Query Report - MAC App Engine</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      padding: 40px 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #5C7B5F 0%, #2D3E2D 100%);
      color: white;
      padding: 60px 40px;
      position: relative;
    }
    .header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: #B8D8E5;
    }
    .header h1 {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .content {
      padding: 60px 40px;
    }
    .section {
      margin-bottom: 60px;
    }
    .section-title {
      font-size: 24px;
      font-weight: 700;
      color: #5C7B5F;
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 3px solid #B8D8E5;
    }
    .query-box {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-left: 4px solid #0284c7;
      padding: 24px;
      border-radius: 8px;
      font-size: 18px;
      font-style: italic;
      margin-bottom: 32px;
    }
    .summary-box {
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-left: 4px solid #22c55e;
      padding: 24px;
      border-radius: 8px;
      font-size: 18px;
      line-height: 1.8;
      margin-bottom: 32px;
    }
    .insights-list {
      list-style: none;
      counter-reset: insight-counter;
    }
    .insights-list li {
      counter-increment: insight-counter;
      padding: 20px;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-radius: 8px;
      border-left: 4px solid #f59e0b;
      position: relative;
    }
    .insights-list li::before {
      content: counter(insight-counter);
      position: absolute;
      left: -12px;
      top: 12px;
      background: #f59e0b;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    thead {
      background: linear-gradient(135deg, #5C7B5F 0%, #2D3E2D 100%);
      color: white;
    }
    th, td {
      padding: 16px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    tbody tr:hover {
      background: #f8fafc;
    }
    .confidence-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .confidence-high { background: #dcfce7; color: #16a34a; }
    .confidence-medium { background: #fef3c7; color: #ca8a04; }
    .confidence-low { background: #fee2e2; color: #dc2626; }
    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
    }
    .footer {
      background: #f8fafc;
      padding: 32px 40px;
      text-align: center;
      font-size: 14px;
      color: #64748b;
      border-top: 2px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧠 MAC App Engine</h1>
      <h2>SSOT Query Report</h2>
      <div style="margin-top: 20px; font-size: 14px; opacity: 0.9;">
        <strong>Generated:</strong> ${timestamp}
      </div>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="section-title">Question</div>
        <div class="query-box">"${output.query}"</div>
      </div>
      
      <div class="section">
        <div class="section-title">Executive Summary</div>
        <div class="summary-box">${summary}</div>
      </div>
      
      <div class="section">
        <div class="section-title">Key Insights</div>
        <ul class="insights-list">
          ${insights.map(insight => `<li>${insight}</li>`).join('')}
        </ul>
      </div>
      
      ${tableHTML ? `
        <div class="section">
          <div class="section-title">Detailed Findings</div>
          ${tableHTML}
        </div>
      ` : ''}

      ${forecastSummaryHTML}
      ${multiPartHTML}
    </div>
    
    <div class="footer">
      <strong>MAC App Engine</strong> — Query Report<br>
      Generated ${timestamp} • Confidential
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateCSV(output) {
  if (output.data?.financial_data) {
    // Real financial data
    const headers = output.data.columns;
    const rows = output.data.financial_data;
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  } else if (output.data?.multi_part_results?.length) {
    const first = output.data.multi_part_results[0];
    if (!first?.columns?.length) return 'No data available for CSV export';
    return [first.columns, ...first.data].map(row => row.join(',')).join('\n');
  }
  return 'No data available for CSV export';
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function MACAppEngine() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [output, setOutput] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [reproOpen, setReproOpen] = useState(true);
  const [queryHistory, setQueryHistory] = useState([]);
  const defaultRange = getLastNMonthsRange(12);
  const [forecastType, setForecastType] = useState('ap_spend');
  const [forecastStartDate, setForecastStartDate] = useState(defaultRange.start_date);
  const [forecastEndDate, setForecastEndDate] = useState(defaultRange.end_date);
  const [forecastLookback, setForecastLookback] = useState(6);
  const [forecastHorizon, setForecastHorizon] = useState(12);

  useEffect(() => {
    setAuthorized(true);
    setLoading(false);
  }, []);

  const runForecastScenario = async (overrides = {}) => {
    const nextForecastType = overrides.forecastType ?? forecastType;
    const nextStartDate = overrides.startDate ?? forecastStartDate;
    const nextEndDate = overrides.endDate ?? forecastEndDate;
    const nextLookback = overrides.lookback ?? forecastLookback;
    const nextHorizon = overrides.horizon ?? forecastHorizon;

    if (overrides.forecastType) setForecastType(overrides.forecastType);
    if (overrides.startDate) setForecastStartDate(overrides.startDate);
    if (overrides.endDate) setForecastEndDate(overrides.endDate);
    if (overrides.lookback != null) setForecastLookback(overrides.lookback);
    if (overrides.horizon != null) setForecastHorizon(overrides.horizon);

    const scenario = FORECAST_SCENARIOS[nextForecastType];
    const debugLog = {
      mode: 'forecast_scenario',
      timestamp: new Date().toISOString(),
      debug_enabled: debugMode,
      subsystem: 'Forecast Scenario',
      query: scenario?.label || nextForecastType,
      steps: []
    };

    if (!scenario) {
      setOutput({
        success: false,
        error: 'Unknown forecast scenario type.',
        debug_log: debugMode ? debugLog : null
      });
      toast.error('Unknown forecast scenario');
      return;
    }

    if (!nextStartDate || !nextEndDate) {
      setOutput({
        success: false,
        error: 'Please select a valid date range for the forecast.',
        debug_log: debugMode ? debugLog : null
      });
      toast.error('Date range required');
      return;
    }

    setExecuting(true);
    setOutput(null);

    debugLog.steps.push({ step: 'Forecast Scenario', result: scenario.label });
    debugLog.steps.push({ step: 'Date Range', result: `${nextStartDate} → ${nextEndDate}` });
    debugLog.steps.push({
      step: 'Projection',
      result: `Trailing ${Number(nextLookback) || 6}m avg → ${Number(nextHorizon) || 12}m horizon`
    });

    try {
      const response = await runSSOTQuery({
        queryId: scenario.queryId,
        params: { start_date: nextStartDate, end_date: nextEndDate },
        label: scenario.label
      });
      const rows = response.data?.data_rows || [];
      const columns = response.data?.columns || scenario.columns || [];
      const forecastSummary = buildForecastSummary(
        rows,
        columns,
        scenario.amountColumn,
        Number(nextLookback) || 6,
        Number(nextHorizon) || 12
      );

      if (!rows.length) {
        setOutput({
          success: false,
          error: 'No SSOT data returned for this forecast scenario.',
          debug_log: debugMode ? debugLog : null
        });
        toast.error('No data returned');
        return;
      }

      const summaryParts = [
        `${scenario.label} for ${nextStartDate} to ${nextEndDate}.`,
        forecastSummary?.projected_total != null
          ? `Projection uses a trailing ${forecastSummary.lookback_months}-month average for the next ${forecastSummary.forecast_horizon_months} months.`
          : null
      ].filter(Boolean);

      const insights = [
        scenario.description,
        forecastSummary?.last_period ? `Latest period: ${forecastSummary.last_period}` : null,
        forecastSummary?.avg_recent_value != null
          ? `Avg last ${forecastSummary.lookback_months} months: ${Number(forecastSummary.avg_recent_value).toLocaleString()}`
          : null,
        forecastSummary?.projected_total != null
          ? `Projected ${forecastSummary.forecast_horizon_months}-month total: ${Number(forecastSummary.projected_total).toLocaleString()}`
          : null
      ].filter(Boolean);

      setOutput({
        success: true,
        mode: 'forecast_scenario',
        query: scenario.label,
        result_type: 'forecast_scenario',
        summary: summaryParts.join(' '),
        insights,
        data: {
          financial_data: rows,
          columns,
          methodology: scenario.methodology,
          forecast_summary: forecastSummary,
          scenario_label: scenario.label,
          forecast_range: { start_date: nextStartDate, end_date: nextEndDate }
        },
        debug_log: debugMode ? debugLog : null
      });

      toast.success('Forecast generated');
      setQueryHistory(prev => [{
        query: scenario.label,
        timestamp: new Date().toISOString(),
        type: 'Forecast'
      }, ...prev].slice(0, 10));
    } catch (error) {
      debugLog.error = error.message;
      setOutput({
        success: false,
        error: `Forecast scenario failed: ${error.message}`,
        debug_log: debugMode ? debugLog : null
      });
      toast.error('Forecast scenario failed');
    } finally {
      setExecuting(false);
    }
  };

  const runMultiMetricReport = async () => {
    setExecuting(true);
    setOutput(null);

    const range = getLastFullMonthsRange(12);
    const startDate = range.start_date;
    const endDate = range.end_date;

    const debugLog = {
      mode: 'multi_metric_report',
      timestamp: new Date().toISOString(),
      debug_enabled: debugMode,
      subsystem: 'Multi-Metric Report',
      query: 'Multi-Metric Report',
      steps: []
    };

    debugLog.steps.push({ step: 'Window', result: `${startDate} → ${endDate} (full months)` });

    try {
      const kpi = await runSSOTQuery({ queryId: 'finance_kpis_latest', label: 'Finance KPIs (Latest)' });
      const revenue = await runSSOTQuery({
        queryId: 'forecast_revenue',
        params: { start_date: startDate, end_date: endDate },
        label: 'Revenue Trend (12 full months)'
      });
      const ap = await runSSOTQuery({
        queryId: 'forecast_ap_spend',
        params: { start_date: startDate, end_date: endDate },
        label: 'AP Spend Trend (12 full months)'
      });
      const cash = await runSSOTQuery({
        queryId: 'forecast_cash_flow',
        params: { start_date: startDate, end_date: endDate },
        label: 'Cash Flow Proxy (12 full months)'
      });

      const tasks = [
        {
          description: 'Finance KPIs (Latest Snapshot)',
          methodology: 'Latest SSOT finance KPI snapshot (MRR, churn, active accounts).',
          columns: kpi.data?.columns || [],
          data: kpi.data?.data_rows || [],
          type: 'finance_kpis_latest',
          evidence: kpi.data?.evidence || null
        },
        {
          description: `Revenue Trend (Monthly) — ${startDate} → ${endDate}`,
          methodology: 'Monthly revenue totals from curated_core.v_monthly_revenue_platt_long.',
          columns: revenue.data?.columns || [],
          data: revenue.data?.data_rows || [],
          type: 'forecast_revenue',
          evidence: revenue.data?.evidence || null
        },
        {
          description: `AP Spend Trend (Monthly) — ${startDate} → ${endDate}`,
          methodology: 'Monthly Accounts Payable totals from Intacct GL account categories.',
          columns: ap.data?.columns || [],
          data: ap.data?.data_rows || [],
          type: 'forecast_ap_spend',
          evidence: ap.data?.evidence || null
        },
        {
          description: `Cash Flow Proxy (Monthly) — ${startDate} → ${endDate}`,
          methodology: 'Operating cash flow proxy = revenue minus expense categories (Intacct GL).',
          columns: cash.data?.columns || [],
          data: cash.data?.data_rows || [],
          type: 'forecast_cash_flow',
          evidence: cash.data?.evidence || null
        }
      ];

      setOutput({
        success: true,
        mode: 'multi_metric_report',
        query: 'Multi-Metric Report',
        result_type: 'multi_metric_report',
        summary: `Deterministic multi-metric report for ${startDate} to ${endDate} (month-aligned).`,
        insights: [
          'All outputs are SSOT-backed queries with Athena execution IDs and generated SQL.',
          'Use this for quick investor-ready reference tables (then export workbook).'
        ],
        data: { multi_part_results: tasks },
        debug_log: debugMode ? debugLog : null
      });

      toast.success('Multi-metric report generated');
      setQueryHistory(prev => [{
        query: 'Multi-Metric Report',
        timestamp: new Date().toISOString(),
        type: 'Report'
      }, ...prev].slice(0, 10));
    } catch (error) {
      debugLog.error = error.message;
      setOutput({
        success: false,
        error: `Multi-metric report failed: ${error.message}`,
        debug_log: debugMode ? debugLog : null
      });
      toast.error('Multi-metric report failed');
    } finally {
      setExecuting(false);
    }
  };

  const runEBITDAAnalysis = async () => {
    setExecuting(true);
    setOutput(null);

    const range = getLastFullMonthsRange(12);
    const startDate = range.start_date;
    const endDate = range.end_date;

    const debugLog = {
      mode: 'ebitda_analysis',
      timestamp: new Date().toISOString(),
      debug_enabled: debugMode,
      subsystem: 'EBITDA Analysis',
      query: 'EBITDA Analysis',
      steps: []
    };

    debugLog.steps.push({ step: 'Window', result: `${startDate} → ${endDate} (full months)` });

    try {
      const cash = await runSSOTQuery({
        queryId: 'forecast_cash_flow',
        params: { start_date: startDate, end_date: endDate },
        label: 'EBITDA Proxy (Revenue - Expenses)'
      });

      const rows = cash.data?.data_rows || [];
      const cols = cash.data?.columns || [];

      setOutput({
        success: true,
        mode: 'ebitda_analysis',
        query: 'EBITDA Analysis (Proxy)',
        result_type: 'ebitda_analysis',
        summary: `EBITDA proxy (revenue - expenses) for ${startDate} to ${endDate}, sourced from Intacct GL account categories.`,
        insights: [
          'This is a deterministic proxy: revenue categories minus all non-revenue categories (absolute).',
          'Use the evidence (SQL + QID) to reproduce in Athena.'
        ],
        data: {
          multi_part_results: [{
            description: `EBITDA Proxy by Month — ${startDate} → ${endDate}`,
            methodology: 'EBITDA proxy = revenue minus expenses (Intacct GL account categories).',
            columns: cols,
            data: rows,
            type: 'ebitda_proxy',
            evidence: cash.data?.evidence || null
          }]
        },
        debug_log: debugMode ? debugLog : null
      });

      toast.success('EBITDA analysis generated');
      setQueryHistory(prev => [{
        query: 'EBITDA Analysis (Proxy)',
        timestamp: new Date().toISOString(),
        type: 'Report'
      }, ...prev].slice(0, 10));
    } catch (error) {
      debugLog.error = error.message;
      setOutput({
        success: false,
        error: `EBITDA analysis failed: ${error.message}`,
        debug_log: debugMode ? debugLog : null
      });
      toast.error('EBITDA analysis failed');
    } finally {
      setExecuting(false);
    }
  };

  const runGLCloseMonthly = async () => {
    setExecuting(true);
    setOutput(null);

    const debugLog = {
      mode: 'gl_close_monthly',
      timestamp: new Date().toISOString(),
      debug_enabled: debugMode,
      subsystem: 'GL Close Pack',
      query: 'GL Close - Monthly',
      steps: []
    };

    try {
      const discovery = await runSSOTQuery({ queryId: 'glclosepack_discovery', label: 'GL Close Pack Discovery' });
      const months = (discovery.data?.data_rows || [])
        .map((row) => (Array.isArray(row) ? row[0] : row?.period_month))
        .filter(Boolean)
        .map((m) => String(m));

      if (!months.length) {
        throw new Error('No GL close months available');
      }

      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = toYearMonth(prev);
      const selected = months.includes(previousMonth) ? previousMonth : months[0];

      debugLog.steps.push({ step: 'Selected Month', result: selected });

      const summary = await runSSOTQuery({
        queryId: 'glclosepack_summary',
        params: { period_month: selected, limit: 500 },
        label: `GL Close Pack Summary (${selected})`
      });

      setOutput({
        success: true,
        mode: 'gl_close_monthly',
        query: `GL Close - Monthly (${selected})`,
        result_type: 'gl_close_monthly',
        summary: `GL Close pack summary for ${selected}.`,
        insights: [
          `Month selected: ${selected}`,
          'Deterministic Intacct GL revenue categories (with evidence QID + SQL).'
        ],
        data: {
          multi_part_results: [{
            description: `GL Close Summary — ${selected}`,
            methodology: 'Sum of Intacct GL entries for revenue categories for the month (grouped by account category/account).',
            columns: summary.data?.columns || [],
            data: summary.data?.data_rows || [],
            type: 'glclose_summary',
            evidence: summary.data?.evidence || null
          }]
        },
        debug_log: debugMode ? debugLog : null
      });

      toast.success('GL Close (monthly) generated');
      setQueryHistory(prev => [{
        query: `GL Close - Monthly (${selected})`,
        timestamp: new Date().toISOString(),
        type: 'Report'
      }, ...prev].slice(0, 10));
    } catch (error) {
      debugLog.error = error.message;
      setOutput({
        success: false,
        error: `GL Close (monthly) failed: ${error.message}`,
        debug_log: debugMode ? debugLog : null
      });
      toast.error('GL Close (monthly) failed');
    } finally {
      setExecuting(false);
    }
  };

  const runGLCloseQuarterly = async () => {
    setExecuting(true);
    setOutput(null);

    const debugLog = {
      mode: 'gl_close_quarterly',
      timestamp: new Date().toISOString(),
      debug_enabled: debugMode,
      subsystem: 'GL Close Pack',
      query: 'GL Close - Quarterly',
      steps: []
    };

    try {
      const discovery = await runSSOTQuery({ queryId: 'glclosepack_discovery', label: 'GL Close Pack Discovery' });
      const available = (discovery.data?.data_rows || [])
        .map((row) => (Array.isArray(row) ? row[0] : row?.period_month))
        .filter(Boolean)
        .map((m) => String(m));

      const months = getPreviousQuarterMonths(new Date());
      const missing = months.filter((m) => !available.includes(m));
      if (missing.length) {
        throw new Error(`Quarter not available in GL: missing months ${missing.join(', ')}`);
      }

      debugLog.steps.push({ step: 'Quarter Months', result: months.join(', ') });

      const monthResults = await Promise.all(months.map((m) => runSSOTQuery({
        queryId: 'glclosepack_summary',
        params: { period_month: m, limit: 500 },
        label: `GL Close Pack Summary (${m})`
      })));

      // Build a quarter pivot table locally from the three monthly summaries.
      const keyFor = (row, cols) => {
        const cIdx = (name) => cols.findIndex(c => String(c).toLowerCase() === name);
        const cat = row[cIdx('account_category')] ?? '';
        const no = row[cIdx('accountno')] ?? '';
        const title = row[cIdx('account_title')] ?? '';
        return `${cat}||${no}||${title}`;
      };

      const pivot = new Map();
      monthResults.forEach((res, idx) => {
        const cols = res.data?.columns || [];
        const rows = res.data?.data_rows || [];
        const amountIdx = cols.findIndex(c => String(c).toLowerCase() === 'amount_total');
        rows.forEach((row) => {
          const k = keyFor(row, cols);
          const entry = pivot.get(k) || { account_category: null, accountno: null, account_title: null, byMonth: {} };
          if (entry.account_category == null) {
            const catIdx = cols.findIndex(c => String(c).toLowerCase() === 'account_category');
            const noIdx = cols.findIndex(c => String(c).toLowerCase() === 'accountno');
            const titleIdx = cols.findIndex(c => String(c).toLowerCase() === 'account_title');
            entry.account_category = row[catIdx] ?? null;
            entry.accountno = row[noIdx] ?? null;
            entry.account_title = row[titleIdx] ?? null;
          }
          const raw = amountIdx >= 0 ? row[amountIdx] : 0;
          const val = Number(raw);
          entry.byMonth[months[idx]] = (entry.byMonth[months[idx]] || 0) + (Number.isFinite(val) ? val : 0);
          pivot.set(k, entry);
        });
      });

      const pivotColumns = ['account_category', 'accountno', 'account_title', ...months, 'quarter_total'];
      const pivotRows = Array.from(pivot.values()).map((e) => {
        const monthVals = months.map((m) => Number(e.byMonth[m] || 0));
        const total = monthVals.reduce((sum, v) => sum + v, 0);
        return [e.account_category, e.accountno, e.account_title, ...monthVals, total];
      }).sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')) || String(a[1] || '').localeCompare(String(b[1] || '')));

      const tasks = [
        {
          description: `GL Close Quarterly Rollup — ${months[0]} to ${months[2]}`,
          methodology: 'Local rollup: sum of the three monthly GL Close summaries (each backed by Athena QIDs).',
          columns: pivotColumns,
          data: pivotRows,
          type: 'glclose_quarter_rollup',
          evidence: null
        },
        ...months.map((m, idx) => ({
          description: `GL Close Summary — ${m}`,
          methodology: 'Sum of Intacct GL entries for revenue categories for the month (grouped by account category/account).',
          columns: monthResults[idx].data?.columns || [],
          data: monthResults[idx].data?.data_rows || [],
          type: `glclose_${m}`,
          evidence: monthResults[idx].data?.evidence || null
        }))
      ];

      setOutput({
        success: true,
        mode: 'gl_close_quarterly',
        query: `GL Close - Quarterly (${months[0]} → ${months[2]})`,
        result_type: 'gl_close_quarterly',
        summary: `Quarterly rollup built from monthly GL Close summaries for ${months.join(', ')}.`,
        insights: [
          'Quarter rollup is computed locally (sum of monthly summaries).',
          'Each month includes evidence (QID + SQL) for auditability.'
        ],
        data: { multi_part_results: tasks },
        debug_log: debugMode ? debugLog : null
      });

      toast.success('GL Close (quarterly) generated');
      setQueryHistory(prev => [{
        query: `GL Close - Quarterly (${months[0]} → ${months[2]})`,
        timestamp: new Date().toISOString(),
        type: 'Report'
      }, ...prev].slice(0, 10));
    } catch (error) {
      debugLog.error = error.message;
      setOutput({
        success: false,
        error: `GL Close (quarterly) failed: ${error.message}`,
        debug_log: debugMode ? debugLog : null
      });
      toast.error('GL Close (quarterly) failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleRun = async () => {
    await runForecastScenario();
  };

  const handleDownloadExecutiveReport = () => {
    if (!output || !output.success) return;

    const timestamp = new Date().toISOString().split('T')[0];
    const reportContent = generateExecutiveReport(output);

    const blob = new Blob([reportContent], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `executive_report_${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    toast.success('Executive report downloaded (HTML - open in browser or print to PDF)');
  };

  const handleDownloadCSV = () => {
    if (!output || !output.success) return;

    const timestamp = new Date().toISOString().split('T')[0];
    const csvContent = generateCSV(output);

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_export_${timestamp}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    toast.success('CSV data downloaded');
  };

  const handleDownloadWorkbook = () => {
    if (!output || !output.success) return;
    const wb = XLSX.utils.book_new();

    if (output.data?.financial_data && output.data?.columns) {
      const sheet = XLSX.utils.aoa_to_sheet([output.data.columns, ...output.data.financial_data]);
      XLSX.utils.book_append_sheet(wb, sheet, 'Results');
    }

    if (output.data?.multi_part_results?.length) {
      output.data.multi_part_results.forEach((result, idx) => {
        const cols = result.columns || [];
        const rows = result.data || [];
        const sheet = XLSX.utils.aoa_to_sheet([cols, ...rows]);
        XLSX.utils.book_append_sheet(wb, sheet, `Task_${idx + 1}`);
      });
    }

    if (output.data?.forecast_summary) {
      const fs = output.data.forecast_summary;
      const summaryRows = [
        ['Forecast Horizon (months)', fs.forecast_horizon_months],
        ['Lookback Months', fs.lookback_months],
        ['Last Period', fs.last_period],
        ['Last Value', fs.last_value],
        ['Avg Recent Value', fs.avg_recent_value],
        ['Projected Total', fs.projected_total]
      ];
      const sheet = XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...summaryRows]);
      XLSX.utils.book_append_sheet(wb, sheet, 'Forecast_Summary');
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `mac_app_engine_${timestamp}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success('Workbook downloaded');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md border-2 border-red-500">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-red-600 mb-2">Access Restricted</h1>
            <p className="text-muted-foreground">
              This tool is restricted to authorized users only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2 flex items-center gap-3">
                <Brain className="w-10 h-10 text-[var(--mac-forest)]" />
                MAC App Engine
              </h1>
              <p className="text-muted-foreground text-lg">
                Forecast SSOT trends and generate evidence-backed revenue reconciliation packs.
              </p>
            </div>
          </div>
        </header>

        {/* Quick Actions & Recent Queries */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Quick Start Guide */}
          <Card className="border-2 border-[var(--mac-forest)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                Quick Start Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>• Select a forecast scenario + date range</p>
              <p>• Click <strong>Run</strong> to generate a deterministic trend + projection</p>
              <p>• Use <strong>Revenue Reconciliation Pack</strong> for investor-ready exports + evidence</p>
              <p className="text-muted-foreground text-xs mt-3">
                💡 Hover over any control for helpful tooltips
              </p>
            </CardContent>
          </Card>
          
          {/* Quick Action Buttons */}
          <Card className="border-2 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Play className="w-5 h-5 text-blue-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={runGLCloseMonthly}
                className="text-xs"
              >
                📅 GL Close - Monthly
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={runGLCloseQuarterly}
                className="text-xs"
              >
                📊 GL Close - Quarterly
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={runEBITDAAnalysis}
                className="text-xs"
              >
                💰 EBITDA Analysis
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={runMultiMetricReport}
                className="text-xs"
              >
                📈 Multi-Metric Report
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={() => {
                  const range = getLastNMonthsRange(12);
                  runForecastScenario({
                    forecastType: 'revenue',
                    startDate: range.start_date,
                    endDate: range.end_date
                  });
                }}
                className="text-xs"
              >
                📈 Revenue Forecast (12m)
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={() => {
                  const range = getLastNMonthsRange(12);
                  runForecastScenario({
                    forecastType: 'ap_spend',
                    startDate: range.start_date,
                    endDate: range.end_date
                  });
                }}
                className="text-xs"
              >
                💳 AP Spend Forecast (12m)
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={() => {
                  const range = getLastNMonthsRange(12);
                  runForecastScenario({
                    forecastType: 'cash_flow',
                    startDate: range.start_date,
                    endDate: range.end_date
                  });
                }}
                className="text-xs"
              >
                💸 Cash Flow Forecast (12m)
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                disabled={executing}
                onClick={() => {
                  setReproOpen(true);
                  toast.message('Revenue Reconciliation Pack opened');
                }}
                className="text-xs"
              >
                🧾 Open Reconciliation Pack
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Input Panel */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Forecast Modeling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Deterministic: runs an SSOT trend query and applies a trailing-average projection. Use the Reconciliation Pack for investor reporting + evidence.
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Forecast Scenario</Label>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select the forecast report to generate from SSOT data.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select value={forecastType} onValueChange={setForecastType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ap_spend">AP Spend Forecast</SelectItem>
                    <SelectItem value="revenue">Revenue Forecast</SelectItem>
                    <SelectItem value="vendor_spend">Vendor Spend Forecast</SelectItem>
                    <SelectItem value="gl_account">GL Account Forecast</SelectItem>
                    <SelectItem value="cash_flow">Cash Flow Forecast</SelectItem>
                    <SelectItem value="expense_category">Expense Category Forecast</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-muted-foreground">
                  <strong>{FORECAST_SCENARIOS[forecastType]?.description || '—'}</strong>
                  {FORECAST_SCENARIOS[forecastType]?.queryId ? ` • source: ${FORECAST_SCENARIOS[forecastType].queryId}` : ''}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const r = getLastNMonthsRange(3);
                    setForecastStartDate(r.start_date);
                    setForecastEndDate(r.end_date);
                  }}
                >
                  Last 3 months
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const r = getLastNMonthsRange(6);
                    setForecastStartDate(r.start_date);
                    setForecastEndDate(r.end_date);
                  }}
                >
                  Last 6 months
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const r = getLastNMonthsRange(12);
                    setForecastStartDate(r.start_date);
                    setForecastEndDate(r.end_date);
                  }}
                >
                  Last 12 months
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={forecastStartDate}
                    onChange={(e) => setForecastStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={forecastEndDate}
                    onChange={(e) => setForecastEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Lookback Months (avg)</Label>
                  <Input
                    type="number"
                    value={forecastLookback}
                    onChange={(e) => setForecastLookback(e.target.value)}
                    placeholder="6"
                  />
                </div>
                <div>
                  <Label>Forecast Horizon (months)</Label>
                  <Input
                    type="number"
                    value={forecastHorizon}
                    onChange={(e) => setForecastHorizon(e.target.value)}
                    placeholder="12"
                  />
                </div>
              </div>
            </div>

            {/* Run Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleRun}
                  disabled={
                    executing ||
                    (!forecastStartDate || !forecastEndDate)
                  }
                  className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)] h-12"
                >
                  {executing ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 mr-2" />
                  )}
                  Run
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Execute your request</p>
              </TooltipContent>
            </Tooltip>

            {/* Developer Debug Mode */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 dark:bg-amber-900/20 border-amber-200">
              <div className="flex items-center gap-2">
                <Label htmlFor="debug-mode" className="text-sm cursor-pointer">Developer Debug Mode</Label>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Developer-only: shows internal reasoning</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch 
                id="debug-mode"
                checked={debugMode}
                onCheckedChange={setDebugMode}
              />
            </div>
          </CardContent>
        </Card>

        {/* Results Display */}
        {output && output.success && (
          <Card className="mb-6 border-green-500 bg-green-50 dark:bg-green-950">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  ✅ Results
                </CardTitle>
                <div className="flex gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadExecutiveReport}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Executive Report
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download a polished, presentation-ready report</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadCSV}
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Download Data (CSV)
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download the detailed data table</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadWorkbook}
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Download Workbook (XLSX)
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download the report as an Excel workbook</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Executive Summary */}
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  Executive Summary
                </h4>
                <p className="text-sm bg-white dark:bg-slate-900 p-4 rounded border leading-relaxed">
                  {output.summary}
                </p>
              </div>

              {output.result_type === 'forecast_scenario' && output.data?.forecast_summary && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-900 p-4 rounded border">
                    <h4 className="font-semibold mb-2 text-sm">Forecast Summary</h4>
                    <div className="text-sm space-y-1">
                      <div><strong>Lookback Months:</strong> {output.data.forecast_summary.lookback_months}</div>
                      <div><strong>Forecast Horizon:</strong> {output.data.forecast_summary.forecast_horizon_months} months</div>
                      <div><strong>Latest Period:</strong> {output.data.forecast_summary.last_period || 'n/a'}</div>
                      <div><strong>Avg Recent Value:</strong> {output.data.forecast_summary.avg_recent_value != null ? Number(output.data.forecast_summary.avg_recent_value).toLocaleString() : 'n/a'}</div>
                      <div><strong>Projected Total:</strong> {output.data.forecast_summary.projected_total != null ? Number(output.data.forecast_summary.projected_total).toLocaleString() : 'n/a'}</div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded border">
                    <h4 className="font-semibold mb-2 text-sm">Scenario Details</h4>
                    <div className="text-sm space-y-1">
                      <div><strong>Scenario:</strong> {output.data?.scenario_label || 'n/a'}</div>
                      <div><strong>Date Range:</strong> {output.data?.forecast_range?.start_date} → {output.data?.forecast_range?.end_date}</div>
                      <div><strong>Method:</strong> Trailing average projection</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Key Insights */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  Key Insights
                </h4>
                <ul className="space-y-2">
                  {(output.insights || []).map((insight, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm bg-white dark:bg-slate-900 p-3 rounded border">
                      <span className="text-green-600 font-bold mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>

              

              {/* Calculation Methodology */}
              {output.data?.methodology && (
                <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-200 dark:border-blue-800 p-4 rounded-xl mb-6">
                  <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                    🔬 Calculation Methodology
                  </h4>
                  <p className="text-sm text-blue-900 dark:text-blue-100">{output.data.methodology}</p>
                </div>
              )}

              {/* Multi-Part Results */}
              {output.data?.multi_part_results && (
                <div className="space-y-8">
                  {output.data.multi_part_results.map((result, idx) => (
                    <div key={idx} className="border-2 border-slate-200 dark:border-slate-700 rounded-xl p-6 bg-slate-50 dark:bg-slate-900">
                      <h3 className="font-bold text-xl mb-2 text-[var(--mac-forest)]">
                        Task {idx + 1}: {result.description}
                      </h3>
                      
                      {result.methodology && (
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 p-3 rounded-lg mb-4">
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                            🔬 {result.methodology}
                          </p>
                        </div>
                      )}
                      
                      <h4 className="font-semibold mb-4 text-base">Data Results</h4>
                      <div className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-slate-700 mb-4">
                        <table className="w-full text-sm">
                          <thead className="bg-gradient-to-r from-[#5C7B5F] to-[#2D3E2D] text-white">
                            <tr>
                              {result.columns.map((col, cidx) => (
                                <th key={cidx} className="p-4 text-left capitalize">
                                  {col.replace(/_/g, ' ')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-slate-900">
                            {result.data.map((row, ridx) => (
                              <tr key={ridx} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                {row.map((cell, cidx) => (
                                  <td key={cidx} className="p-4 font-medium">
                                    {typeof cell === 'number' && (
                                      result.columns[cidx].includes('revenue')
                                      || result.columns[cidx].includes('mrr')
                                      || result.columns[cidx].includes('ebitda')
                                      || result.columns[cidx].includes('arpu')
                                      || result.columns[cidx].includes('cogs')
                                      || result.columns[cidx].includes('opex')
                                      || result.columns[cidx].includes('amount')
                                      || /^\d{4}-\d{2}/.test(result.columns[cidx])
                                    )
                                      ? `$${cell.toLocaleString()}`
                                      : result.columns[cidx].includes('pct') || result.columns[cidx].includes('margin')
                                      ? `${parseFloat(cell).toFixed(1)}%`
                                      : cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {result.evidence && (result.evidence.athena_query_execution_id || result.evidence.generated_sql) && (
                        <details className="mt-4 bg-white dark:bg-slate-900 border rounded p-3">
                          <summary className="cursor-pointer text-sm font-semibold">
                            Evidence (QID + SQL)
                          </summary>
                          {result.evidence.athena_query_execution_id && (
                            <div className="mt-3">
                              <div className="text-xs font-semibold mb-1">Athena Query Execution ID</div>
                              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block">
                                {result.evidence.athena_query_execution_id}
                              </code>
                            </div>
                          )}
                          {result.evidence.generated_sql && (
                            <div className="mt-3">
                              <div className="text-xs font-semibold mb-1">Generated SQL</div>
                              <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                {result.evidence.generated_sql}
                              </pre>
                            </div>
                          )}
                        </details>
                      )}
                      
                      <div className="flex gap-2 mt-4">
                        <Button
                          onClick={() => {
                            const csv = [result.columns, ...result.data].map(row => row.join(',')).join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `task_${idx + 1}_${result.type}.csv`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            a.remove();
                            toast.success(`Task ${idx + 1} exported`);
                          }}
                          variant="outline"
                          size="sm"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export Task {idx + 1} CSV
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  <Button
                    onClick={() => {
                      // Export all tasks as separate CSVs in a zip-like manner
                      output.data.multi_part_results.forEach((result, idx) => {
                        setTimeout(() => {
                          const csv = [result.columns, ...result.data].map(row => row.join(',')).join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `multi_task_${idx + 1}_${result.type}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          a.remove();
                        }, idx * 500);
                      });
                      toast.success('All tasks exported');
                    }}
                    className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All Tasks (Multiple CSVs)
                  </Button>
                </div>
              )}

              {/* Financial Data Results */}
              {output.data?.financial_data && !output.data?.multi_part_results && (
                <div>
                  <h4 className="font-semibold mb-4 text-lg">Detailed Data Results</h4>
                  <div className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-r from-[#5C7B5F] to-[#2D3E2D] text-white">
                        <tr>
                          {output.data.columns.map((col, idx) => (
                            <th key={idx} className="p-4 text-left capitalize">
                              {col.replace(/_/g, ' ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-900">
                        {output.data.financial_data.map((row, ridx) => (
                          <tr key={ridx} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        {row.map((cell, cidx) => (
                          <td key={cidx} className="p-4 font-medium">
                                {typeof cell === 'number' && (
                                  output.data.columns[cidx].includes('revenue')
                                  || output.data.columns[cidx].includes('mrr')
                                  || output.data.columns[cidx].includes('ebitda')
                                  || output.data.columns[cidx].includes('arpu')
                                  || output.data.columns[cidx].includes('cogs')
                                  || output.data.columns[cidx].includes('opex')
                                  || output.data.columns[cidx].includes('amount')
                                  || /^\d{4}-\d{2}/.test(output.data.columns[cidx])
                                )
                                  ? `$${cell.toLocaleString()}`
                                  : output.data.columns[cidx].includes('pct') || output.data.columns[cidx].includes('margin')
                                  ? `${parseFloat(cell).toFixed(1)}%`
                                  : cell}
                          </td>
                        ))}
                      </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Visual Layout - Vendors */}
              {output.data?.vendors && (
                <div>
                  <h4 className="font-semibold mb-3">Vendor Analysis</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                          <th className="p-3 text-left border">Vendor Name</th>
                          <th className="p-3 text-left border">Status</th>
                          <th className="p-3 text-right border">YTD Spend</th>
                          <th className="p-3 text-left border">Trend</th>
                          <th className="p-3 text-left border">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {output.data.vendors.map((vendor, idx) => (
                          <tr key={idx} className="border-b hover:bg-secondary/30">
                            <td className="p-3 border font-medium">{vendor.vendor_name}</td>
                            <td className="p-3 border">
                              <Badge variant="outline" className={vendor.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>
                                {vendor.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-right border font-bold">
                              ${vendor.total_spend_ytd.toLocaleString()}
                            </td>
                            <td className="p-3 border">
                              <Badge variant="outline" className={
                                vendor.trend === 'Growing' ? 'bg-green-100 text-green-800' :
                                vendor.trend === 'Stable' ? 'bg-blue-100 text-blue-800' :
                                'bg-red-100 text-red-800'
                              }>
                                {vendor.trend}
                              </Badge>
                            </td>
                            <td className="p-3 border text-sm text-muted-foreground">{vendor.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Visual Layout - Bills */}
              {output.data?.bills && (
                <div>
                  <h4 className="font-semibold mb-3">Bills Overview</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                          <th className="p-3 text-left border">Bill ID</th>
                          <th className="p-3 text-left border">Vendor</th>
                          <th className="p-3 text-right border">Amount</th>
                          <th className="p-3 text-left border">Status</th>
                          <th className="p-3 text-left border">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {output.data.bills.map((bill, idx) => (
                          <tr key={idx} className="border-b hover:bg-secondary/30">
                            <td className="p-3 border font-mono text-xs">{bill.bill_id}</td>
                            <td className="p-3 border">{bill.vendor}</td>
                            <td className="p-3 text-right border font-bold">
                              ${bill.amount.toLocaleString()}
                            </td>
                            <td className="p-3 border">
                              <Badge variant="outline" className={
                                bill.status === 'Paid' ? 'bg-green-100 text-green-800' :
                                bill.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }>
                                {bill.status}
                              </Badge>
                            </td>
                            <td className="p-3 border">{bill.due_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Visual Layout - GL Accounts */}
              {output.data?.gl_accounts && (
                <div>
                  <h4 className="font-semibold mb-3">GL Account Performance</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                          <th className="p-3 text-left border">Account</th>
                          <th className="p-3 text-left border">Name</th>
                          <th className="p-3 text-right border">YTD Actual</th>
                          <th className="p-3 text-left border">Type</th>
                          <th className="p-3 text-left border">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {output.data.gl_accounts.map((account, idx) => (
                          <tr key={idx} className="border-b hover:bg-secondary/30">
                            <td className="p-3 border font-mono text-xs">{account.account_number}</td>
                            <td className="p-3 border font-medium">{account.account_name}</td>
                            <td className="p-3 text-right border font-bold">
                              ${Math.abs(account.ytd_actual).toLocaleString()}
                            </td>
                            <td className="p-3 border">
                              <Badge variant="outline" className={
                                account.type === 'Revenue' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }>
                                {account.type}
                              </Badge>
                            </td>
                            <td className="p-3 border">
                              <Badge variant="outline" className="bg-green-100 text-green-800">
                                {account.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Workflow Steps */}
              {output.data?.workflow && (
                <div>
                  <h4 className="font-semibold mb-3">Workflow Steps</h4>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded border mb-3">
                    <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Duration</p>
                        <p className="font-bold">{output.data.workflow.total_duration}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Frequency</p>
                        <p className="font-bold">{output.data.workflow.frequency}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Success Rate</p>
                        <p className="font-bold text-green-600">{output.data.workflow.success_rate}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {output.data.workflow.steps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border rounded">
                        <Badge className="bg-[var(--mac-forest)]">Step {step.step}</Badge>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{step.name}</p>
                          <p className="text-xs text-muted-foreground">System: {step.system} • Duration: {step.duration}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* How to Interpret This */}
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 p-4 rounded-lg">
                <h4 className="font-semibold mb-3 text-sm">How to Interpret This</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong className="text-blue-900 dark:text-blue-100">What this means:</strong>
                    <p className="text-muted-foreground mt-1">
                      Rows are the SSOT trend output for the selected date range. The projection is a deterministic trailing-average calculation (not a full forecasting model).
                    </p>
                  </div>
                  <div>
                    <strong className="text-blue-900 dark:text-blue-100">Why this matters:</strong>
                    <p className="text-muted-foreground mt-1">
                      It provides a fast, reproducible sizing view (spend/revenue/cash flow) that can be validated via query execution IDs and rerun as new data lands.
                    </p>
                  </div>
                  <div>
                    <strong className="text-blue-900 dark:text-blue-100">What to do next:</strong>
                    <p className="text-muted-foreground mt-1">
                      If you need a full audit pack, run the Revenue Reconciliation Pack and export the workbook + run log (SQL + QIDs).
                    </p>
                  </div>
                </div>
              </div>

              {/* Debug Log */}
              {output.debug_log && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
                    🔧 Developer Debug Log
                  </h4>
                  <div className="space-y-2">
                    <div className="text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                      <strong>Mode:</strong> {output.debug_log.mode} | <strong>Subsystem:</strong> {output.debug_log.subsystem || 'N/A'}
                    </div>
                    {output.debug_log.steps.map((step, idx) => (
                      <div key={idx} className="bg-slate-100 dark:bg-slate-800 p-3 rounded text-xs">
                        <p className="font-semibold">{step.step}</p>
                        {step.input && <p className="text-muted-foreground mt-1">Input: {step.input}</p>}
                        <p className="mt-1">→ {step.result}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {output && !output.success && (
          <Card className="mb-6 border-red-500 bg-red-50 dark:bg-red-950">
            <CardHeader>
              <CardTitle className="text-red-700 dark:text-red-300">❌ Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{output.error}</p>
              {output.debug_log && (
                <div className="mt-4 border-t pt-4">
                  <h4 className="font-semibold mb-2 text-sm">Debug Log</h4>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(output.debug_log, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Collapsible open={reproOpen} onOpenChange={setReproOpen}>
          <Card className="mb-6">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-secondary/50">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5" />
                    Revenue Reconciliation Pack (Platt Billing)
                  </span>
                  <Badge variant="outline">{reproOpen ? 'Hide' : 'Show'}</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Deterministic export pack (CSV/XLSX + run log with generated SQL + Athena execution IDs).
                </p>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <RevenueReproPack embedded />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Complete User Guide (Collapsible) */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-secondary/50">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5" />
                    Forecasting + Reconciliation Guide
                  </span>
                  <Badge variant="outline">{guideOpen ? 'Hide' : 'Show'}</Badge>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-6 text-sm">
                <div>
                  <h4 className="font-semibold mb-2">Forecasting (Deterministic)</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>Select a forecast scenario (Revenue, AP Spend, Cash Flow, etc.).</li>
                    <li>Pick a date range (best results are full-month windows).</li>
                    <li>Projection = trailing <strong>Lookback Months</strong> average × <strong>Forecast Horizon</strong>.</li>
                    <li>Outputs are SSOT-backed rows + evidence fields (query IDs + generated SQL).</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Revenue Reconciliation Pack (Evidence)</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>Use this for investor-grade revenue packs: CSVs + <code>RevenueReport.xlsx</code> + run log.</li>
                    <li>Invoice window uses <strong>invoice_date</strong>; revenue is bucketed by <strong>period_month</strong> (monthly).</li>
                    <li>Enable <strong>Invoice Detail</strong> only when needed (slower; can collapse duplicates).</li>
                    <li>Diagnostics add deterministic ID-count sanity checks.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Downloads</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li><strong>Forecast exports:</strong> Executive report (HTML), CSV, XLSX workbook.</li>
                    <li><strong>Reconciliation exports:</strong> per-tab CSVs + workbook from the pack.</li>
                    <li>Use query execution IDs to reproduce results directly in Athena.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Troubleshooting</h4>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>If a query fails (e.g., timeout), shorten the date range and retry.</li>
                    <li>If results look off, confirm SSOT freshness on the Dashboard and rerun.</li>
                    <li>Enable Developer Debug Mode to capture evidence and reproduce in Athena.</li>
                  </ul>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-sm">💡 Pro Tips</h4>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>• Use the Reconciliation Pack when you need an audit trail (SQL + query IDs).</li>
                    <li>• Keep forecast windows aligned to months to avoid confusing partial-month effects.</li>
                  </ul>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </TooltipProvider>
  );
}
