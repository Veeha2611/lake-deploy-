import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, Play, Download, FileText, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { macEngineInvoke } from '@/api/macEngineClient';
import { toast } from 'sonner';

export default function RevenueReproPack({ embedded = false }) {
  const [authorized, setAuthorized] = useState(true);
  const [activeTab, setActiveTab] = useState('revenue_report');
  const [detailsOpen, setDetailsOpen] = useState(!embedded);

  const formatLocalDate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Full-month aligned window (invoice window is inclusive; revenue buckets are month-start dates).
  const getLastFullMonthsRange = (months) => {
    const safeMonths = Math.max(1, Math.min(Number(months) || 3, 36));
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(thisMonthStart);
    start.setMonth(start.getMonth() - safeMonths);
    const endInclusive = new Date(thisMonthStart);
    endInclusive.setDate(endInclusive.getDate() - 1);
    return { start_date: formatLocalDate(start), end_date: formatLocalDate(endInclusive) };
  };
  const defaultRange = getLastFullMonthsRange(3);
  
  // Shared configuration
  const [reportName, setReportName] = useState('');
  const [startDate, setStartDate] = useState(defaultRange.start_date);
  const [endDate, setEndDate] = useState(defaultRange.end_date);
  const [includeIdCountChecks, setIncludeIdCountChecks] = useState(true);
  const [collapseInvoiceDuplicates, setCollapseInvoiceDuplicates] = useState(false);
  const [includeInvoiceDetail, setIncludeInvoiceDetail] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  
  // Results state
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [runLog, setRunLog] = useState(null);

  // Check access control
  React.useEffect(() => {
    setAuthorized(true);
  }, []);

  React.useEffect(() => {
    if (!includeInvoiceDetail && activeTab === 'invoice_detail') {
      setActiveTab('revenue_report');
    }
    if (!includeIdCountChecks && activeTab === 'diagnostics') {
      setActiveTab('revenue_report');
    }
  }, [includeInvoiceDetail, includeIdCountChecks, activeTab]);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const pollRevenueReproStatus = async (runId, runLogKey) => {
    const maxAttempts = 120;
    const delayMs = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await sleep(delayMs);
      const statusResponse = await macEngineInvoke('getRevenueReproStatus', {
        run_id: runId,
        run_log_key: runLogKey,
        report_name: reportName
      });

      if (statusResponse.data.status === 'complete' && statusResponse.data.result) {
        return statusResponse.data.result;
      }

      if (statusResponse.data.status === 'failed') {
        throw new Error('Revenue repro run failed. Check run log for details.');
      }
    }

    throw new Error('Revenue repro is still running. Try again in a few minutes.');
  };

  const handleRunReport = async () => {
    if (!reportName) {
      toast.error('Report name is required');
      return;
    }

    setRunning(true);
    setResults(null);

    try {
      const response = await macEngineInvoke('runRevenueReproPack', {
        report_name: reportName,
        start_date: startDate,
        end_date: endDate,
        include_id_count_checks: includeIdCountChecks,
        include_invoice_detail: includeInvoiceDetail,
        collapse_invoice_duplicates: collapseInvoiceDuplicates,
        debug_mode: debugMode
      });

      if (response.data.status === 'queued') {
        setRunLog({ run_id: response.data.run_id, status: 'queued', run_log_key: response.data.run_log_key });
        toast.message('Report queued. Processing in the background...');
        const finalResult = await pollRevenueReproStatus(response.data.run_id, response.data.run_log_key);
        setResults(finalResult);
        setRunLog(finalResult.run_log || null);
        toast.success('Report pack generated successfully');
      } else if (response.data.success) {
        setResults(response.data);
        setRunLog(response.data.run_log || null);

        if (response.data.window_alignment) {
          const { invoice_window, revenue_window } = response.data.window_alignment;
          console.log('Window alignment:', {
            invoice: `${invoice_window.start} → ${invoice_window.end}`,
            revenue: `${revenue_window.start_month} → ${revenue_window.end_month} (${revenue_window.months.join(', ')})`
          });
        }

        toast.success('Report pack generated successfully');
      } else {
        setResults({ error: response.data.error, run_log: response.data.run_log });
        setRunLog(response.data.run_log || null);
        toast.error(response.data.error || 'Report generation failed');
      }
    } catch (error) {
      console.error('Full error:', error);
      console.log('Error response:', error.response);
      const errorMsg = error.response?.data?.error || error.message;
      const log = error.response?.data?.run_log;
      console.log('Run log from error:', log);
      setResults({ error: errorMsg, run_log: log });
      setRunLog(log || null);
      toast.error('Error: ' + errorMsg);
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = async (key) => {
    try {
      const response = await macEngineInvoke('downloadArtifact', { key });

      if (response.data.download_url) {
        window.location.assign(response.data.download_url);
        toast.success('Download started');
      }
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleDownloadRunLog = () => {
    if (!runLog) return;
    const blob = new Blob([JSON.stringify(runLog, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run_log_${runLog.run_id || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Run log downloaded');
  };

  const handleCopyRunLog = () => {
    if (!runLog) return;
    navigator.clipboard.writeText(JSON.stringify(runLog, null, 2));
    toast.success('Run log copied to clipboard');
  };

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md border-2 border-red-500">
          <CardContent className="pt-6 text-center">
            <h1 className="text-xl font-bold text-red-600 mb-2">Access Restricted</h1>
            <p className="text-muted-foreground">
              This page is restricted to authorized users only.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const containerClass = embedded
    ? 'space-y-6'
    : 'max-w-7xl mx-auto p-6 space-y-6';

  const Details = (
    <div className="text-xs space-y-1 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border">
      <p className="font-semibold mb-1">Tabs produced (no AI inference):</p>
      <ul className="space-y-0.5 ml-4 list-disc">
        <li><strong>Revenue by Customer (Monthly):</strong> Customer metadata from <code>curated_core.platt_customer_current_ssot</code> + monthly revenue from <code>curated_core.v_monthly_revenue_platt_long</code>.</li>
        <li><strong>Revenue by System (Monthly):</strong> Monthly revenue grouped by <code>system_id</code> (same revenue source).</li>
        <li><strong>Customer Counts (Monthly):</strong> Distinct billed customers per month (same revenue source).</li>
        <li><strong>Invoice Detail (optional):</strong> Line items from <code>curated_core.invoice_line_item_repro_v1</code> within the exact <code>invoice_date</code> window.</li>
        <li><strong>Diagnostics (optional):</strong> ID-count sanity checks + distinct invoiced customers in the invoice window.</li>
        <li><strong>Exports & Evidence:</strong> Per-tab CSVs, <code>RevenueReport.xlsx</code>, and a JSON run log (SQL + query execution IDs).</li>
      </ul>
    </div>
  );

  return (
    <div className={containerClass}>
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold text-[var(--mac-forest)] mb-2">
            Revenue Reconciliation Pack
          </h1>
          <p className="text-sm text-muted-foreground mb-3">
            Deterministic: Platt billing monthly revenue + invoice line items. Exports CSV/XLSX + run log (SQL + Athena QIDs).
          </p>
          {Details}
        </div>
      )}

      {embedded && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Deterministic: Platt billing monthly revenue + invoice line items. Exports CSV/XLSX + run log (SQL + Athena QIDs).
          </p>
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="text-xs text-[var(--mac-forest)] hover:underline inline-flex items-center gap-1"
              >
                {detailsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                What this pack outputs
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {Details}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Shared Configuration Strip */}
      <Card className="border-2 border-[var(--mac-forest)]">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Configuration (Applies to All Tabs)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Report Name *</Label>
            <Input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g., Q4 2025 Revenue Reconciliation"
              className="mt-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label>End Date *</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const range = getLastFullMonthsRange(3);
                setStartDate(range.start_date);
                setEndDate(range.end_date);
              }}
            >
              Last 3 full months
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const range = getLastFullMonthsRange(6);
                setStartDate(range.start_date);
                setEndDate(range.end_date);
              }}
            >
              Last 6 full months
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const range = getLastFullMonthsRange(12);
                setStartDate(range.start_date);
                setEndDate(range.end_date);
              }}
            >
              Last 12 full months
            </Button>
            <div className="flex items-center text-[11px] text-muted-foreground">
              Presets are month-aligned (invoice window is inclusive).
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex gap-6 p-4 border rounded-lg bg-slate-50 dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <Switch 
                  checked={includeIdCountChecks}
                  onCheckedChange={setIncludeIdCountChecks}
                />
                <Label className="cursor-pointer">Include ID Count Checks (Diagnostics)</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch 
                  checked={includeInvoiceDetail}
                  onCheckedChange={setIncludeInvoiceDetail}
                />
                <Label className="cursor-pointer">Include Invoice Detail (slower)</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch 
                  checked={collapseInvoiceDuplicates}
                  onCheckedChange={setCollapseInvoiceDuplicates}
                  disabled={!includeInvoiceDetail}
                />
                <Label className={`cursor-pointer ${includeInvoiceDetail ? '' : 'opacity-60'}`}>
                  Collapse duplicates in Invoice Detail
                </Label>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
              <Switch 
                checked={debugMode}
                onCheckedChange={setDebugMode}
              />
              <div>
                <Label className="cursor-pointer font-semibold">Debug Mode</Label>
                <p className="text-xs text-muted-foreground">Generate detailed execution logs for troubleshooting</p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleRunReport}
            disabled={running}
            className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)] h-12 text-base"
          >
            {running ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Play className="w-5 h-5 mr-2" />
            )}
            {includeInvoiceDetail ? 'Run Report (All Tabs)' : 'Run Report (Core Tabs)'}
          </Button>
        </CardContent>
      </Card>

      {/* Results Tabs */}
      {results && !results.error && (
        <Card>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5 mb-6">
                <TabsTrigger value="revenue_report">Revenue by Customer</TabsTrigger>
                <TabsTrigger value="revenue_by_system">Revenue by System</TabsTrigger>
                <TabsTrigger value="count_pivot">Customer Counts</TabsTrigger>
                <TabsTrigger value="invoice_detail" disabled={!includeInvoiceDetail}>Invoice Detail</TabsTrigger>
                <TabsTrigger value="diagnostics" disabled={!includeIdCountChecks}>Diagnostics</TabsTrigger>
              </TabsList>

              {/* Window Alignment Display */}
              {results.window_alignment && (
                <Card className="mb-4 bg-blue-50 dark:bg-blue-950 border-blue-200">
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold mb-2">Window Alignment:</p>
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="font-semibold">Invoice window:</span>{' '}
                        {new Date(results.window_alignment.invoice_window.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} →{' '}
                        {new Date(results.window_alignment.invoice_window.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p>
                        <span className="font-semibold">Revenue window (monthly buckets):</span>{' '}
                        {new Date(results.window_alignment.revenue_window.start_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} →{' '}
                        {new Date(results.window_alignment.revenue_window.end_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        {' '}({results.window_alignment.revenue_window.months.join(', ')})
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Revenue by Customer Tab */}
              <TabsContent value="revenue_report" className="space-y-4">
                <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Revenue by Customer Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Rows (Customers)</p>
                        <p className="text-2xl font-bold">{results.revenue_report?.row_count?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Columns (inc. months)</p>
                        <p className="text-2xl font-bold">{results.revenue_report?.columns?.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Evidence</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold mb-1">Execution ID:</p>
                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block">
                        {results.revenue_report?.evidence?.athena_query_execution_id}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-1">Generated SQL:</p>
                      <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {results.revenue_report?.evidence?.generated_sql}
                      </pre>
                    </div>
                    {results.revenue_report?.s3_artifacts?.csv && (
                      <Button
                        variant="outline"
                        onClick={() => handleDownload(results.revenue_report.s3_artifacts.csv)}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download RevenueReport CSV
                        </Button>
                    )}
                    {results.workbook?.s3_artifacts?.xlsx && (
                      <Button
                        variant="default"
                        onClick={() => handleDownload(results.workbook.s3_artifacts.xlsx)}
                        className="w-full"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Download RevenueReport Workbook (XLSX)
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Revenue by System Tab */}
              <TabsContent value="revenue_by_system" className="space-y-4">
                <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Revenue by System Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Systems</p>
                        <p className="text-2xl font-bold">{results.revenue_by_system?.row_count?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Columns (inc. months)</p>
                        <p className="text-2xl font-bold">{results.revenue_by_system?.columns?.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Evidence</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold mb-1">Execution ID:</p>
                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block">
                        {results.revenue_by_system?.evidence?.athena_query_execution_id}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-1">Generated SQL:</p>
                      <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {results.revenue_by_system?.evidence?.generated_sql}
                      </pre>
                    </div>
                    {results.revenue_by_system?.s3_artifacts?.csv && (
                      <Button
                        variant="outline"
                        onClick={() => handleDownload(results.revenue_by_system.s3_artifacts.csv)}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Revenue by System CSV
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Customer Counts Tab */}
              <TabsContent value="count_pivot" className="space-y-4">
                <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Customer Counts Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Systems</p>
                        <p className="text-2xl font-bold">{results.count_pivot?.row_count?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Columns (inc. months)</p>
                        <p className="text-2xl font-bold">{results.count_pivot?.columns?.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Evidence</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold mb-1">Execution ID:</p>
                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block">
                        {results.count_pivot?.evidence?.athena_query_execution_id}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-1">Generated SQL:</p>
                      <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {results.count_pivot?.evidence?.generated_sql}
                      </pre>
                    </div>
                    {results.count_pivot?.s3_artifacts?.csv && (
                      <Button
                        variant="outline"
                        onClick={() => handleDownload(results.count_pivot.s3_artifacts.csv)}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Customer Counts CSV
                        </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Invoice Detail Tab */}
              <TabsContent value="invoice_detail" className="space-y-4">
                <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Invoice Detail Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Rows</p>
                        <p className="text-2xl font-bold">{results.invoice_detail?.row_count?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Mode</p>
                        <Badge variant="outline" className="text-xs">
                          {collapseInvoiceDuplicates ? 'Collapsed' : 'Default'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Columns</p>
                        <p className="text-2xl font-bold">{results.invoice_detail?.columns?.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Preview (First 10 rows)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="p-2 text-left border">Customer ID</th>
                            <th className="p-2 text-left border">System</th>
                            <th className="p-2 text-left border">Invoice ID</th>
                            <th className="p-2 text-left border">Invoice Date</th>
                            <th className="p-2 text-left border">Product</th>
                            <th className="p-2 text-right border">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.invoice_detail?.preview?.slice(0, 10).map((row, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2 border">{row.customer_id}</td>
                              <td className="p-2 border">{row.system}</td>
                              <td className="p-2 border">{row.invoice_id}</td>
                              <td className="p-2 border">{row.invoice_date}</td>
                              <td className="p-2 border">{row.product}</td>
                              <td className="p-2 text-right border font-medium">
                                ${Number(row.total).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Evidence</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold mb-1">Execution ID:</p>
                      <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block">
                        {results.invoice_detail?.evidence?.athena_query_execution_id}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs font-semibold mb-1">Generated SQL:</p>
                      <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                        {results.invoice_detail?.evidence?.generated_sql}
                      </pre>
                    </div>
                    {results.invoice_detail?.s3_artifacts?.csv && (
                      <Button
                        variant="outline"
                        onClick={() => handleDownload(results.invoice_detail.s3_artifacts.csv)}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Invoice Detail CSV
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Diagnostics Tab */}
              <TabsContent value="diagnostics" className="space-y-4">
                {includeIdCountChecks && results.diagnostics ? (
                  <>
                    <Card className="bg-blue-50 dark:bg-blue-950 border-blue-300">
                      <CardHeader>
                        <CardTitle className="text-base">Plat ID Counts (2 definitions)</CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Customer Spine</p>
                          <div className="space-y-1">
                            <p className="text-sm">Rows: <span className="font-bold">{results.diagnostics?.customer_spine?.rows_total?.toLocaleString()}</span></p>
                            <p className="text-sm">Distinct IDs: <span className="font-bold text-emerald-600">{results.diagnostics?.customer_spine?.distinct_plat_ids?.toLocaleString()}</span></p>
                            <p className="text-xs text-slate-500">Query: {results.diagnostics?.customer_spine?.execution_id?.substring(0, 16)}...</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">SSOT Snapshot</p>
                          <div className="space-y-1">
                            <p className="text-sm">Rows: <span className="font-bold">{results.diagnostics?.ssot_snapshot?.rows_total?.toLocaleString()}</span></p>
                            <p className="text-sm">Distinct IDs: <span className="font-bold text-emerald-600">{results.diagnostics?.ssot_snapshot?.distinct_plat_ids?.toLocaleString()}</span></p>
                            <p className="text-xs text-slate-500">Query: {results.diagnostics?.ssot_snapshot?.execution_id?.substring(0, 16)}...</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-blue-50 dark:bg-blue-950 border-blue-300">
                      <CardHeader>
                        <CardTitle className="text-base">Distinct Invoiced Customers</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold text-emerald-600">
                          {results.diagnostics?.distinct_invoiced_customers?.count?.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Distinct customers with invoices in invoice window
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Query: {results.diagnostics?.distinct_invoiced_customers?.execution_id?.substring(0, 16)}...
                        </p>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">
                        Diagnostics disabled. Enable "Include ID Count Checks" in configuration.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            {/* Run Metadata */}
            <Card className="mt-6 bg-slate-50 dark:bg-slate-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div>
                    <span className="font-semibold">Run ID:</span> {results.run_id}
                  </div>
                  <div>
                    <span className="font-semibold">Executed:</span> {new Date(results.run_at).toLocaleString()}
                  </div>
                  <div>
                    <span className="font-semibold">S3 Location:</span> raw/revenue_repro/{reportName}/{results.run_id}/
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {results && results.error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardHeader>
            <CardTitle className="text-base text-red-800 dark:text-red-200">
              ❌ Report Generation Failed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-red-700 dark:text-red-300 font-semibold mb-2">{results.error}</p>
              <div className="space-y-2 mt-4">
                {runLog ? (
                  <>
                    <div className="text-xs space-y-1">
                      <p><span className="font-semibold">Run ID:</span> {runLog.run_id}</p>
                      <p><span className="font-semibold">User:</span> {runLog.user_email}</p>
                      <p><span className="font-semibold">Time:</span> {runLog.run_at}</p>
                    </div>
                    {runLog.steps && runLog.steps.find(s => s.error) && (
                      <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                        <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Failing Step:</p>
                        {runLog.steps.filter(s => s.error).map((step, idx) => (
                          <div key={idx} className="text-xs space-y-1 mb-2">
                            <p className="font-semibold">{step.step_name}</p>
                            <p className="text-red-600 dark:text-red-400">{step.error}</p>
                            {step.generated_sql && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-blue-600 hover:text-blue-700">View SQL</summary>
                                <pre className="mt-1 bg-slate-100 dark:bg-slate-800 p-2 rounded overflow-x-auto text-xs">
                                  {step.generated_sql}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadRunLog}
                        className="flex-1"
                      >
                        <Download className="w-3 h-3 mr-2" />
                        Download Run Log (JSON)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyRunLog}
                        className="flex-1"
                      >
                        <FileText className="w-3 h-3 mr-2" />
                        Copy Run Log to Clipboard
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 p-3 rounded text-xs">
                    <p className="text-amber-800 dark:text-amber-200">
                      ⚠️ Debug log not available. The error may have occurred before logging was initialized. Check browser console for details.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Run Log Display */}
      {results && !results.error && runLog && debugMode && (
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-300">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              Debug Log Available
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs space-y-1">
              <p><span className="font-semibold">Run ID:</span> {runLog.run_id}</p>
              <p><span className="font-semibold">Total Duration:</span> {runLog.total_duration_ms}ms</p>
              <p><span className="font-semibold">Steps Completed:</span> {runLog.steps?.length || 0}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadRunLog}
                className="flex-1"
              >
                <Download className="w-3 h-3 mr-2" />
                Download Run Log (JSON)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyRunLog}
                className="flex-1"
              >
                <FileText className="w-3 h-3 mr-2" />
                Copy Run Log to Clipboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
