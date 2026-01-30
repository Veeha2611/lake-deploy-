import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Play, Download, FileText, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function RevenueReproPack() {
  const [authorized, setAuthorized] = useState(null);
  const [activeTab, setActiveTab] = useState('revenue_report');
  
  // Shared configuration
  const [reportName, setReportName] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [includeIdCountChecks, setIncludeIdCountChecks] = useState(true);
  const [collapseInvoiceDuplicates, setCollapseInvoiceDuplicates] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  
  // Results state
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [runLog, setRunLog] = useState(null);

  // Check access control
  React.useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await base44.auth.me();
        const allowedEmails = ['patrick.cochran@icloud.com', 'patch.cochran@macmtn.com'];
        const isAllowed = allowedEmails.includes(user?.email?.toLowerCase());
        setAuthorized(isAllowed);
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuthorized(false);
      }
    };
    checkAccess();
  }, []);

  const handleRunReport = async () => {
    if (!reportName) {
      toast.error('Report name is required');
      return;
    }

    setRunning(true);
    setResults(null);

    try {
      const response = await base44.functions.invoke('runEmilieReportPack', {
        report_name: reportName,
        start_date: startDate,
        end_date: endDate,
        include_id_count_checks: includeIdCountChecks,
        collapse_invoice_duplicates: collapseInvoiceDuplicates,
        debug_mode: debugMode
      });

      if (response.data.success) {
        setResults(response.data);
        setRunLog(response.data.run_log || null);
        
        // Show window alignment if available
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
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        action: 'download',
        key
      });

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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--mac-forest)] mb-2">
          Revenue Reconciliation Pack
        </h1>
        <p className="text-sm text-muted-foreground mb-3">
          Run once → fills each tab, shows evidence, and exports files.
        </p>
        <div className="text-xs space-y-1 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border">
          <p className="font-semibold mb-1">Tabs filled by "Run Report (All Tabs)":</p>
          <ul className="space-y-0.5 ml-4 list-disc">
            <li><strong>Invoice Detail (Line Items):</strong> Invoice line totals by customer + invoice + product for the exact invoice date window.</li>
            <li><strong>Revenue by Customer (Monthly):</strong> Monthly revenue by customer, bucketed by month.</li>
            <li><strong>Revenue by System (Monthly):</strong> Monthly revenue grouped by system_id, bucketed by month.</li>
            <li><strong>Customer Counts (Monthly):</strong> Distinct billed customers per month (diagnostic).</li>
            <li><strong>Diagnostics (optional):</strong> Total Plat IDs (two definitions) + distinct invoiced customers in the invoice window.</li>
            <li><strong>Exports & Evidence:</strong> Download CSVs for each tab and a JSON run log with SQL + query IDs.</li>
          </ul>
        </div>
      </div>

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
                  checked={collapseInvoiceDuplicates}
                  onCheckedChange={setCollapseInvoiceDuplicates}
                />
                <Label className="cursor-pointer">Collapse duplicates in Invoice Detail</Label>
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
            Run Report (All Tabs)
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
                <TabsTrigger value="invoice_detail">Invoice Detail</TabsTrigger>
                <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
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
                        Download Revenue by Customer CSV
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
                          <p className="text-xs text-muted-foreground mb-1">Raw Platt</p>
                          <div className="space-y-1">
                            <p className="text-sm">Rows: <span className="font-bold">{results.diagnostics?.raw_platt?.rows_total?.toLocaleString()}</span></p>
                            <p className="text-sm">Distinct IDs: <span className="font-bold text-emerald-600">{results.diagnostics?.raw_platt?.distinct_plat_ids?.toLocaleString()}</span></p>
                            <p className="text-xs text-slate-500">Query: {results.diagnostics?.raw_platt?.execution_id?.substring(0, 16)}...</p>
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

// Legacy code preserved below (inactive)
const __LEGACY_CODE__ = () => {
  const handleRun_OLD = async () => {
    if (!reportName) {
      toast.error('Report name is required');
      return;
    }

    setRunning(true);
    setResults(null);

    try {
      const response = await base44.functions.invoke('runRevenueReproReport', {
        report_name: reportName,
        report_mode: reportMode,
        plat_id_definition: platIdDefinition,
        date_range: {
          start_month: startMonth,
          end_month: endMonth
        },
        comparison_data: comparisonData || null
      });

      if (response.data.success) {
        setResults(response.data);
        toast.success('Report generated successfully');
      } else {
        toast.error(response.data.error || 'Report generation failed');
        setResults({ error: response.data.error, evidence: response.data.evidence });
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
      setResults({ error: error.message });
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = async (key) => {
    try {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        action: 'download',
        key
      });

      if (response.data.download_url) {
        window.location.assign(response.data.download_url);
        toast.success('Download started');
      }
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleRunTotalPlatIds = async () => {
    setPlatIdRunning(true);

    try {
      const response = await base44.functions.invoke('getTotalPlatIds', {
        definition: platIdDefinitionEgg
      });

      if (response.data.success) {
        setPlatIdResults(prev => [response.data, ...prev].slice(0, 5));
        toast.success('Total Plat IDs query completed');
      } else {
        toast.error(response.data.error || 'Query failed');
        setPlatIdResults(prev => [{ error: response.data.error, evidence: response.data.evidence }, ...prev].slice(0, 5));
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
    } finally {
      setPlatIdRunning(false);
    }
  };

  const handleRunInvoiceLineItem = async () => {
    if (!invoiceReportName) {
      toast.error('Report name is required');
      return;
    }

    setInvoiceRunning(true);
    setInvoiceResults(null);

    try {
      const response = await base44.functions.invoke('runInvoiceLineItemRepro', {
        report_name: invoiceReportName,
        start_date: invoiceStartDate,
        end_date: invoiceEndDate,
        grouping_mode: groupingMode,
        include_id_count_checks: includeIdCountChecks
      });

      if (response.data.success) {
        setInvoiceResults(response.data);
        toast.success('Invoice line item report generated');
      } else {
        toast.error(response.data.error || 'Report generation failed');
        setInvoiceResults({ error: response.data.error, evidence: response.data.evidence });
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
      setInvoiceResults({ error: error.message });
    } finally {
      setInvoiceRunning(false);
    }
  };

  const handleRunRevenueReport = async () => {
    if (!revenueReportName) {
      toast.error('Report name is required');
      return;
    }

    setRevenueReportRunning(true);
    setRevenueReportResults(null);

    try {
      const response = await base44.functions.invoke('runRevenueReport', {
        start_month: revenueReportStartMonth,
        end_month: revenueReportEndMonth,
        export_name: revenueReportName
      });

      if (response.data.success) {
        setRevenueReportResults(response.data);
        toast.success('RevenueReport generated successfully');
      } else {
        toast.error(response.data.error || 'Report generation failed');
        setRevenueReportResults({ error: response.data.error });
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
      setRevenueReportResults({ error: error.message });
    } finally {
      setRevenueReportRunning(false);
    }
  };

  const handleRunRevenueBySystem = async () => {
    if (!revBySystemName) {
      toast.error('Report name is required');
      return;
    }

    setRevBySystemRunning(true);
    setRevBySystemResults(null);

    try {
      const response = await base44.functions.invoke('runRevenueBySystem', {
        start_month: revBySystemStartMonth,
        end_month: revBySystemEndMonth,
        export_name: revBySystemName
      });

      if (response.data.success) {
        setRevBySystemResults(response.data);
        toast.success('Revenue by System generated successfully');
      } else {
        toast.error(response.data.error || 'Report generation failed');
        setRevBySystemResults({ error: response.data.error });
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
      setRevBySystemResults({ error: error.message });
    } finally {
      setRevBySystemRunning(false);
    }
  };

  const handleRunCountPivot = async () => {
    if (!countPivotName) {
      toast.error('Report name is required');
      return;
    }

    setCountPivotRunning(true);
    setCountPivotResults(null);

    try {
      const response = await base44.functions.invoke('runCountPivot', {
        start_month: countPivotStartMonth,
        end_month: countPivotEndMonth,
        export_name: countPivotName
      });

      if (response.data.success) {
        setCountPivotResults(response.data);
        toast.success('Count Pivot generated successfully');
      } else {
        toast.error(response.data.error || 'Report generation failed');
        setCountPivotResults({ error: response.data.error });
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
      setCountPivotResults({ error: error.message });
    } finally {
      setCountPivotRunning(false);
    }
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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--mac-forest)] mb-2">
          Revenue Reconciliation Pack
        </h1>
        <p className="text-sm text-muted-foreground">
          Plat ID validation and invoice line-item reconciliation from the lake (with evidence + exports)
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="plat_ids">Total Plat IDs</TabsTrigger>
          <TabsTrigger value="invoice">Invoice Repro</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Revenue</TabsTrigger>
          <TabsTrigger value="revenue_report">RevenueReport</TabsTrigger>
          <TabsTrigger value="revenue_by_system">Revenue by System</TabsTrigger>
          <TabsTrigger value="count_pivot">Count Pivot</TabsTrigger>
        </TabsList>

        <TabsContent value="plat_ids" className="space-y-6">
          {/* Total Plat IDs Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Total Plat IDs Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Plat ID Definition</Label>
                <Select value={platIdDefinitionEgg} onValueChange={setPlatIdDefinitionEgg}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_spine">A) Customer Spine (dim_customer_platt)</SelectItem>
                    <SelectItem value="raw_platt">B) Raw Platt Customer (raw_platt.customer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleRunTotalPlatIds}
                disabled={platIdRunning}
                className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
              >
                {platIdRunning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run Total Plat IDs Query
              </Button>
            </CardContent>
          </Card>

          {/* Total Plat IDs Results */}
          {platIdResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Query History (Last 5 runs)</h3>
              {platIdResults.map((result, idx) => (
                <Card key={idx} className={result.error ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300'}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      {result.error ? '❌ Query Failed' : `Run ${idx + 1}`}
                      {!result.error && (
                        <Badge variant="outline" className="text-xs">
                          {result.definition_used}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.error ? (
                      <>
                        <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>
                        {result.evidence && (
                          <div className="text-xs bg-white dark:bg-slate-900 p-2 rounded border">
                            <p className="font-semibold mb-1">Evidence:</p>
                            <pre className="overflow-x-auto">{JSON.stringify(result.evidence, null, 2)}</pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Rows Total</p>
                            <p className="text-2xl font-bold">{result.rows_total?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Distinct Plat IDs</p>
                            <p className="text-2xl font-bold text-emerald-600">{result.distinct_plat_ids?.toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-xs bg-white dark:bg-slate-900 p-2 rounded border">
                          <p className="font-semibold mb-1">Evidence:</p>
                          <p>Execution ID: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                            {result.evidence.athena_query_execution_id}
                          </code></p>
                          <p className="mt-1">Run at: {new Date(result.run_at).toLocaleString()}</p>
                          <p className="mt-1">SQL: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded block mt-1 whitespace-pre-wrap">
                            {result.evidence.generated_sql}
                          </code></p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="monthly" className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Report Name *</Label>
            <Input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g., Jan 2025 Revenue Validation"
              className="mt-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Report Mode *</Label>
              <Select value={reportMode} onValueChange={setReportMode}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Platt Monthly Revenue">Platt Monthly Revenue</SelectItem>
                  <SelectItem value="Gaiia Monthly Revenue">Gaiia Monthly Revenue</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Plat ID Definition *</Label>
              <Select value={platIdDefinition} onValueChange={setPlatIdDefinition}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_spine">A) Customer Spine (Recommended)</SelectItem>
                  <SelectItem value="raw_platt">B) Raw Platt Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Month *</Label>
              <Input
                type="date"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label>End Month *</Label>
              <Input
                type="date"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label>Comparison Data (Optional - Paste Emilie's CSV)</Label>
            <Textarea
              value={comparisonData}
              onChange={(e) => setComparisonData(e.target.value)}
              placeholder="period_month,revenue_total&#10;2025-01,1234567&#10;2025-02,1245678"
              className="mt-2 font-mono text-xs"
              rows={5}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format: period_month,revenue_total (with header row)
            </p>
          </div>

          <Button
            onClick={handleRun}
            disabled={running}
            className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
          >
            {running ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Run Report
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <>
          {results.error ? (
            <Card className="border-red-500 bg-red-50 dark:bg-red-950">
              <CardHeader>
                <CardTitle className="text-base text-red-800 dark:text-red-200">
                  ❌ Report Failed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-red-700 dark:text-red-300">{results.error}</p>
                {results.evidence && (
                  <div className="mt-4 p-3 bg-white dark:bg-slate-900 rounded border">
                    <p className="font-semibold mb-2">Evidence:</p>
                    <pre className="text-xs overflow-x-auto">
                      {JSON.stringify(results.evidence, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Plat IDs Result */}
              <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    Total Plat IDs
                    <Badge variant="outline" className="text-xs">
                      {platIdDefinition === 'customer_spine' ? 'Customer Spine' : 'Raw Platt'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {results.plat_ids.rows[0] && (() => {
                      const vals = Array.isArray(results.plat_ids.rows[0]) 
                        ? results.plat_ids.rows[0] 
                        : Object.values(results.plat_ids.rows[0]);
                      return (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground">Rows Total</p>
                            <p className="text-2xl font-bold">{vals[0]?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Distinct Plat IDs</p>
                            <p className="text-2xl font-bold text-emerald-600">{vals[1]?.toLocaleString()}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="text-xs bg-white dark:bg-slate-900 p-2 rounded border">
                    <p className="font-semibold mb-1">Evidence:</p>
                    <p>Execution ID: <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                      {results.plat_ids.execution_id}
                    </code></p>
                    <p className="mt-1">Run at: {results.run_at}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Summary Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Monthly Revenue Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                          <th className="p-2 text-left border">Period</th>
                          <th className="p-2 text-right border">Revenue</th>
                          <th className="p-2 text-right border">Customers</th>
                          <th className="p-2 text-right border">ARPU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.summary.slice(0, 12).map((row, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="p-2 border">{row.period_month}</td>
                            <td className="p-2 text-right border font-medium">
                              ${row.revenue_total.toLocaleString()}
                            </td>
                            <td className="p-2 text-right border">{row.customer_count}</td>
                            <td className="p-2 text-right border">${row.arpu}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Comparison Table */}
              {results.comparison && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Lake vs Emilie Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="p-2 text-left border">Month</th>
                            <th className="p-2 text-right border">Emilie Total</th>
                            <th className="p-2 text-right border">Lake Total</th>
                            <th className="p-2 text-right border">Delta</th>
                            <th className="p-2 text-right border">Delta %</th>
                            <th className="p-2 text-center border">Review</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.comparison.map((row, idx) => (
                            <tr key={idx} className={`border-b ${row.needs_review === 'YES' ? 'bg-amber-50 dark:bg-amber-950' : ''}`}>
                              <td className="p-2 border">{row.period_month}</td>
                              <td className="p-2 text-right border">${row.emilie_total.toLocaleString()}</td>
                              <td className="p-2 text-right border">${row.lake_total.toLocaleString()}</td>
                              <td className="p-2 text-right border font-medium">
                                ${row.delta.toLocaleString()}
                              </td>
                              <td className="p-2 text-right border">{row.delta_pct}%</td>
                              <td className="p-2 text-center border">
                                {row.needs_review === 'YES' && (
                                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                                    Review
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Evidence */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evidence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold mb-2">Athena Query Execution IDs:</p>
                    <div className="space-y-1">
                      {results.evidence.query_executions.map((id, idx) => (
                        <code key={idx} className="block text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          {id}
                        </code>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2">Generated SQL:</p>
                    <div className="space-y-2">
                      {results.evidence.generated_sql.map((item, idx) => (
                        <div key={idx} className="bg-slate-900 text-slate-100 p-3 rounded text-xs">
                          <p className="text-slate-400 mb-1">{item.purpose}:</p>
                          <pre className="whitespace-pre-wrap">{item.sql}</pre>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2">Run Metadata:</p>
                    <div className="text-xs space-y-1">
                      <p>Run ID: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{results.run_id}</code></p>
                      <p>Run At: {new Date(results.run_at).toLocaleString()}</p>
                      <p>Definition: {platIdDefinition === 'customer_spine' ? 'Customer Spine (dim_customer_platt)' : 'Raw Platt (raw_platt.customer)'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Downloads */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Download Artifacts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(results.s3_artifacts).map(([name, key]) => (
                      <Button
                        key={name}
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(key)}
                        className="justify-start"
                      >
                        <Download className="w-3 h-3 mr-2" />
                        {name.replace(/_/g, ' ').replace('.csv', '').replace('.json', '')}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    S3 Location: raw/projects_pipeline/runner_reports/...
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
        </TabsContent>

        <TabsContent value="invoice" className="space-y-6">
          {/* Invoice Line Item Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Line Item Configuration</CardTitle>
              <p className="text-xs text-muted-foreground mt-2">
                Source: curated_core.invoice_line_item_repro_v1
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Report Name *</Label>
                <Input
                  value={invoiceReportName}
                  onChange={(e) => setInvoiceReportName(e.target.value)}
                  placeholder="e.g., Q4 2025 Invoice Line Items"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date *</Label>
                  <Input
                    type="date"
                    value={invoiceStartDate}
                    onChange={(e) => setInvoiceStartDate(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Date *</Label>
                  <Input
                    type="date"
                    value={invoiceEndDate}
                    onChange={(e) => setInvoiceEndDate(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label>Grouping Mode</Label>
                <Select value={groupingMode} onValueChange={setGroupingMode}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_invoice_product">Default (matches view grain)</SelectItem>
                    <SelectItem value="collapsed">Collapse duplicates (SUM by customer/invoice/date/product)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <Label>Include ID Count Checks (Diagnostic)</Label>
                  <p className="text-xs text-muted-foreground">Run customer ID counts for validation</p>
                </div>
                <Switch checked={includeIdCountChecks} onCheckedChange={setIncludeIdCountChecks} />
              </div>

              <Button
                onClick={handleRunInvoiceLineItem}
                disabled={invoiceRunning}
                className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
              >
                {invoiceRunning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run Invoice Line Item Report
              </Button>
            </CardContent>
          </Card>

          {/* Invoice Results */}
          {invoiceResults && (
            <>
              {invoiceResults.error ? (
                <Card className="border-red-500 bg-red-50 dark:bg-red-950">
                  <CardHeader>
                    <CardTitle className="text-base text-red-800 dark:text-red-200">
                      ❌ Report Failed
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-red-700 dark:text-red-300">{invoiceResults.error}</p>
                    
                    {invoiceResults.evidence && (
                      <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded border">
                        <p className="font-semibold mb-2">Evidence:</p>
                        <pre className="text-xs overflow-x-auto">
                          {JSON.stringify(invoiceResults.evidence, null, 2)}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* ID Count Checks */}
                  {invoiceResults.id_count_checks && (
                    <Card className="bg-blue-50 dark:bg-blue-950 border-blue-300">
                      <CardHeader>
                        <CardTitle className="text-base">ID Count Checks (Diagnostic)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Curated Customer Count</p>
                            <p className="text-2xl font-bold">{invoiceResults.id_count_checks.curated_customer_count?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Raw Customer Count</p>
                            <p className="text-2xl font-bold">{invoiceResults.id_count_checks.raw_customer_count?.toLocaleString()}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Detail Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Invoice Line Item Detail (First 10 rows)</CardTitle>
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
                            {invoiceResults.detail.slice(0, 10).map((row, idx) => {
                              const vals = Array.isArray(row) ? row : Object.values(row);
                              return (
                                <tr key={idx} className="border-b">
                                  <td className="p-2 border">{vals[0]}</td>
                                  <td className="p-2 border">{vals[1]}</td>
                                  <td className="p-2 border">{vals[2]}</td>
                                  <td className="p-2 border">{vals[3]}</td>
                                  <td className="p-2 border">{vals[4]}</td>
                                  <td className="p-2 text-right border font-medium">
                                    ${Number(vals[5]).toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Evidence */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Evidence</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold mb-2">Athena Query Execution IDs:</p>
                        <div className="space-y-1">
                          {invoiceResults.evidence.query_executions.map((id, idx) => (
                            <code key={idx} className="block text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                              {id}
                            </code>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold mb-2">Views Used:</p>
                        <div className="space-y-1">
                          {invoiceResults.evidence.views_used.map((view, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs mr-2">
                              {view}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold mb-2">Generated SQL:</p>
                        <div className="space-y-2">
                          {invoiceResults.evidence.generated_sql.map((item, idx) => (
                            <div key={idx} className="bg-slate-900 text-slate-100 p-3 rounded text-xs">
                              <p className="text-slate-400 mb-1">{item.purpose}:</p>
                              <pre className="whitespace-pre-wrap">{item.sql}</pre>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold mb-2">Run Metadata:</p>
                        <div className="text-xs space-y-1">
                          <p>Run ID: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{invoiceResults.run_id}</code></p>
                          <p>Run At: {new Date(invoiceResults.run_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Downloads */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Download Artifacts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(invoiceResults.s3_artifacts).map(([name, key]) => (
                          <Button
                            key={name}
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(key)}
                            className="justify-start"
                          >
                            <Download className="w-3 h-3 mr-2" />
                            {name.replace(/_/g, ' ').replace('.csv', '').replace('.json', '')}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">
                        S3 Location: raw/revenue_repro/...
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="revenue_report" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">RevenueReport (Per-Customer Wide Export)</CardTitle>
              <p className="text-xs text-muted-foreground mt-2">
                Source: curated_core.v_monthly_revenue_platt_long | One row per customer, months as columns
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Export Name *</Label>
                <Input
                  value={revenueReportName}
                  onChange={(e) => setRevenueReportName(e.target.value)}
                  placeholder="e.g., RevenueReport_2025"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Month *</Label>
                  <Input
                    type="date"
                    value={revenueReportStartMonth}
                    onChange={(e) => setRevenueReportStartMonth(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month *</Label>
                  <Input
                    type="date"
                    value={revenueReportEndMonth}
                    onChange={(e) => setRevenueReportEndMonth(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <Button
                onClick={handleRunRevenueReport}
                disabled={revenueReportRunning}
                className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
              >
                {revenueReportRunning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Generate RevenueReport
              </Button>
            </CardContent>
          </Card>

          {revenueReportResults && (
            <>
              {revenueReportResults.error ? (
                <Card className="border-red-500 bg-red-50 dark:bg-red-950">
                  <CardHeader>
                    <CardTitle className="text-base text-red-800 dark:text-red-200">
                      ❌ Report Failed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-red-700 dark:text-red-300">{revenueReportResults.error}</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                    <CardHeader>
                      <CardTitle className="text-base">Report Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Rows Returned</p>
                          <p className="text-2xl font-bold">{revenueReportResults.row_count?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Columns</p>
                          <p className="text-2xl font-bold">{revenueReportResults.columns?.length}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Evidence</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <p className="text-xs font-semibold">Execution ID:</p>
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block mt-1">
                          {revenueReportResults.evidence?.athena_query_execution_id}
                        </code>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Generated SQL:</p>
                        <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded mt-1 whitespace-pre-wrap overflow-x-auto">
                          {revenueReportResults.evidence?.generated_sql}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Download Artifact</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {revenueReportResults.s3_artifacts?.csv && (
                        <Button
                          variant="outline"
                          onClick={() => handleDownload(revenueReportResults.s3_artifacts.csv)}
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download CSV
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="revenue_by_system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue by System (System-Level Pivot)</CardTitle>
              <p className="text-xs text-muted-foreground mt-2">
                Source: curated_core.v_monthly_revenue_platt_long | One row per system, months as columns
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Export Name *</Label>
                <Input
                  value={revBySystemName}
                  onChange={(e) => setRevBySystemName(e.target.value)}
                  placeholder="e.g., RevenueBySystem_2025"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Month *</Label>
                  <Input
                    type="date"
                    value={revBySystemStartMonth}
                    onChange={(e) => setRevBySystemStartMonth(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month *</Label>
                  <Input
                    type="date"
                    value={revBySystemEndMonth}
                    onChange={(e) => setRevBySystemEndMonth(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <Button
                onClick={handleRunRevenueBySystem}
                disabled={revBySystemRunning}
                className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
              >
                {revBySystemRunning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Generate Revenue by System
              </Button>
            </CardContent>
          </Card>

          {revBySystemResults && (
            <>
              {revBySystemResults.error ? (
                <Card className="border-red-500 bg-red-50 dark:bg-red-950">
                  <CardHeader>
                    <CardTitle className="text-base text-red-800 dark:text-red-200">
                      ❌ Report Failed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-red-700 dark:text-red-300">{revBySystemResults.error}</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                    <CardHeader>
                      <CardTitle className="text-base">Report Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Systems</p>
                          <p className="text-2xl font-bold">{revBySystemResults.row_count?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Columns</p>
                          <p className="text-2xl font-bold">{revBySystemResults.columns?.length}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Evidence</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <p className="text-xs font-semibold">Execution ID:</p>
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block mt-1">
                          {revBySystemResults.evidence?.athena_query_execution_id}
                        </code>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Generated SQL:</p>
                        <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded mt-1 whitespace-pre-wrap overflow-x-auto">
                          {revBySystemResults.evidence?.generated_sql}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Download Artifact</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {revBySystemResults.s3_artifacts?.csv && (
                        <Button
                          variant="outline"
                          onClick={() => handleDownload(revBySystemResults.s3_artifacts.csv)}
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download CSV
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="count_pivot" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Count Pivot (Customer Counts by System)</CardTitle>
              <p className="text-xs text-muted-foreground mt-2">
                Source: curated_core.v_monthly_revenue_platt_long | Distinct customer counts per system per month
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Export Name *</Label>
                <Input
                  value={countPivotName}
                  onChange={(e) => setCountPivotName(e.target.value)}
                  placeholder="e.g., CountPivot_2025"
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Month *</Label>
                  <Input
                    type="date"
                    value={countPivotStartMonth}
                    onChange={(e) => setCountPivotStartMonth(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>End Month *</Label>
                  <Input
                    type="date"
                    value={countPivotEndMonth}
                    onChange={(e) => setCountPivotEndMonth(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>

              <Button
                onClick={handleRunCountPivot}
                disabled={countPivotRunning}
                className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
              >
                {countPivotRunning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Generate Count Pivot
              </Button>
            </CardContent>
          </Card>

          {countPivotResults && (
            <>
              {countPivotResults.error ? (
                <Card className="border-red-500 bg-red-50 dark:bg-red-950">
                  <CardHeader>
                    <CardTitle className="text-base text-red-800 dark:text-red-200">
                      ❌ Report Failed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-red-700 dark:text-red-300">{countPivotResults.error}</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
                    <CardHeader>
                      <CardTitle className="text-base">Report Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Systems</p>
                          <p className="text-2xl font-bold">{countPivotResults.row_count?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Columns</p>
                          <p className="text-2xl font-bold">{countPivotResults.columns?.length}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Evidence</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <p className="text-xs font-semibold">Execution ID:</p>
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded block mt-1">
                          {countPivotResults.evidence?.athena_query_execution_id}
                        </code>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Generated SQL:</p>
                        <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded mt-1 whitespace-pre-wrap overflow-x-auto">
                          {countPivotResults.evidence?.generated_sql}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Download Artifact</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {countPivotResults.s3_artifacts?.csv && (
                        <Button
                          variant="outline"
                          onClick={() => handleDownload(countPivotResults.s3_artifacts.csv)}
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download CSV
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}