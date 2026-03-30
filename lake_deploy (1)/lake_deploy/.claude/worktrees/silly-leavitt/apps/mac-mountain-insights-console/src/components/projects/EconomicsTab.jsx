import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, DollarSign, Percent, Download, History, Play, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import ModelInputModal from './ModelInputModal';
import ScenarioModelDrawer from './ScenarioModelDrawer';

// Display formatters for IRR and MOIC that handle null/non-convergent cases
function formatIrrDisplay(irrStr, irrStatus) {
  // Parse IRR from CSV string (e.g., "12.34" → 12.34)
  const irrPct = irrStr ? parseFloat(irrStr) : null;
  
  // NO_INVESTMENT case
  if (irrStatus === 'not_defined_no_investment') {
    return { label: 'Not defined – add Total Capex', color: 'neutral' };
  }
  
  // Non-convergent / null / non-finite → Not defined
  if (irrStatus !== 'converged' || irrPct == null || !isFinite(irrPct)) {
    return { label: 'Not defined', color: 'neutral' };
  }

  // Apply v1.4.1 thresholds: green ≥ 15%, yellow 0–15%, red < 0
  let color = 'green';
  if (irrPct < 0) color = 'red';
  else if (irrPct < 15) color = 'yellow';
  
  return { label: `${irrPct.toFixed(1)}%`, color };
}

function formatMoicDisplay(moicStr, moicStatus) {
  // Parse MOIC from CSV string (e.g., "1.20" → 1.20)
  const moic = moicStr ? parseFloat(moicStr) : null;
  
  // NO_INVESTMENT case
  if (moicStatus === 'not_defined_no_investment') {
    return { label: 'Not defined – add Total Capex', color: 'neutral' };
  }
  
  // Invalid / ≤ 0 / null → Not defined
  if (moic == null || !isFinite(moic) || moic <= 0) {
    return { label: 'Not defined', color: 'neutral' };
  }

  // Apply v1.4.1 thresholds: green ≥ 2.0x, yellow 1.0–2.0x, red < 1.0x
  let color = 'green';
  if (moic < 1.0) color = 'red';
  else if (moic < 2.0) color = 'yellow';
  
  return { label: `${moic.toFixed(2)}x`, color };
}

export default function EconomicsTab({ project, onOpenScenarioDrawer }) {
  const [showInputModal, setShowInputModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modalError, setModalError] = useState(null);
  
  // State for auto-opening scenario drawer after Generate Financial Report
  const [showScenarioDrawer, setShowScenarioDrawer] = useState(false);
  const [autoSelectScenarioId, setAutoSelectScenarioId] = useState(null);

  // Fetch latest model runs for this project
  const { data: outputsData, isLoading: outputsLoading, refetch } = useQuery({
    queryKey: ['project-model-outputs', project.project_id],
    queryFn: async () => {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: project.project_id,
        action: 'list'
      });
      return response.data;
    },
    enabled: !!project.project_id
  });

  // Get latest run and its files
  const latestRun = outputsData?.runs?.[0];
  const latestMetricsFile = latestRun?.files?.find(f => f.file_name === 'summary_metrics.csv');
  
  const { data: metricsData } = useQuery({
    queryKey: ['project-metrics', latestMetricsFile?.key],
    queryFn: async () => {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: project.project_id,
        action: 'content',
        key: latestMetricsFile.key
      });
      
      // Parse CSV
      const lines = response.data.content.split('\n');
      const metrics = {};
      for (let i = 1; i < lines.length; i++) {
        const [metric, value] = lines[i].split(',');
        if (metric && value) {
          metrics[metric] = value;
        }
      }
      return metrics;
    },
    enabled: !!latestMetricsFile?.key
  });

  // Fetch monthly data for charts
  const latestMonthlyFile = latestRun?.files?.find(f => f.file_name === 'economics_monthly.csv');
  
  const { data: monthlyData } = useQuery({
    queryKey: ['project-monthly', latestMonthlyFile?.key],
    queryFn: async () => {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: project.project_id,
        action: 'content',
        key: latestMonthlyFile.key
      });
      
      // Parse CSV
      const lines = response.data.content.split('\n');
      const headers = lines[0].split(',');
      const data = [];
      
      for (let i = 1; i < lines.length && i <= 120; i++) {
        const values = lines[i].split(',');
        if (values.length === headers.length) {
          const row = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx];
          });
          data.push(row);
        }
      }
      
      return data;
    },
    enabled: !!latestMonthlyFile?.key
  });

  const handleGenerateModel = async (inputs = {}) => {
    setGenerating(true);
    setModalError(null);
    
    try {
      console.log('Generating model for project:', project.project_id, 'with inputs:', inputs);
      
      // Create scenario object with a proper name (NEVER "Unnamed Scenario")
      const scenario_id = `scenario_${Date.now()}`;
      
      // First, get existing scenario count to generate proper name
      let existingCount = 0;
      try {
        const registryResponse = await base44.functions.invoke('manageScenariosRegistry', {
          action: 'get',
          project_id: project.project_id
        });
        existingCount = registryResponse.data?.registry?.scenarios?.filter(s => !s.is_test)?.length || 0;
      } catch (err) {
        console.log('Could not load scenario count:', err.message);
      }
      
      // Generate a proper scenario name (NEVER use "Financial Report" or generic names)
      const scenarioName = `${project.project_name || 'Project'} — Scenario ${existingCount + 1}`;
      
      const scenario = {
        scenario_id,
        scenario_name: scenarioName,
        inputs: {
          passings: Number(inputs.passings),
          build_months: Number(inputs.buildmonths),
          arpu_start: 63,
          penetration_start_pct: 0.10,
          penetration_target_pct: 0.40,
          ramp_months: 36,
          capex_per_passing: 1200,
          opex_per_sub: 25,
          discount_rate_pct: 10,
          analysis_months: 120
        },
        is_test: false
      };
      
      // Also upsert to scenarios registry to ensure it's stored
      await base44.functions.invoke('manageScenariosRegistry', {
        action: 'upsert',
        project_id: project.project_id,
        scenario: {
          scenario_id,
          scenario_name: scenarioName,
          is_test: false,
          inputs: scenario.inputs
        }
      });
      
      const response = await base44.functions.invoke('runProjectModel', {
        project_id: project.project_id,
        scenario
      });

      console.log('Model generation response:', response.data);

      if (response.data.success) {
        toast.success('Financial report generated! Opening viewer...');
        setShowInputModal(false);
        refetch();
        
        // Store the scenario_id so we can auto-select it
        const newScenarioId = response.data.scenario_id || scenario_id;
        setAutoSelectScenarioId(newScenarioId);
        
        // Open the scenario drawer with Saved Scenarios tab and auto-select the new scenario
        setTimeout(() => {
          setShowScenarioDrawer(true);
        }, 300);
      } else {
        setModalError(response.data.message || response.data.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Model generation error:', error);
      setModalError('Error generating report: ' + (error.response?.data?.message || error.message));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (file) => {
    try {
      const response = await base44.functions.invoke('listProjectModelOutputs', {
        project_id: project.project_id,
        action: 'download',
        key: file.key
      });

      if (response.data.download_url) {
        // Safari-safe: navigate to presigned URL
        window.location.assign(response.data.download_url);
        toast.success('Download started');
      }
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const hasOutputs = outputsData?.runs?.length > 0;

  return (
    <div className="space-y-6 py-4">
      {/* Generate Model Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Financial Model</h3>
          <p className="text-sm text-muted-foreground">
            Generate economics and view key metrics
          </p>
          <div className="mt-2 text-xs text-muted-foreground space-y-1">
            <p>• <strong>Generate Model:</strong> Open full scenario workbench (via button in header or project drawer)</p>
            <p>• <strong>Generate Financial Report:</strong> Quick-run with minimal inputs, opens Scenario viewer after run</p>
          </div>
        </div>
        <Button
          onClick={() => setShowInputModal(true)}
          disabled={generating}
          className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Generate Financial Report
        </Button>
      </div>

      {/* Key Metrics */}
      {hasOutputs ? (
        metricsData ? (
          <div className="space-y-4">
            {/* Two CAPEX numbers */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-2 border-slate-300">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">Total CAPEX (Book)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">${Number(metricsData.total_capex_book || metricsData.initial_investment || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Full cost to build</p>
                </CardContent>
              </Card>

              <Card className="border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">Actual Cash Invested</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-emerald-600">
                    ${Number(metricsData.actual_cash_invested || metricsData.peak_external_cash || metricsData.initial_investment || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    External cash needed (after reinvestment)
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Returns */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">NPV</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const npvValue = Number(metricsData.npv || 0);
                    const npvColor = metricsData.npv_color || (npvValue >= 0 ? 'green' : 'red');
                    return (
                      <p className={`text-2xl font-bold ${
                        npvColor === 'green' ? 'text-green-600' :
                        npvColor === 'yellow' ? 'text-yellow-600' :
                        npvColor === 'red' ? 'text-red-600' : ''
                      }`}>
                        ${npvValue.toLocaleString()}
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">IRR</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const irrDisplay = formatIrrDisplay(metricsData.irr, metricsData.irr_status);
                    return (
                      <p className={`text-2xl font-bold ${
                        irrDisplay.color === 'green' ? 'text-green-600' :
                        irrDisplay.color === 'yellow' ? 'text-yellow-600' :
                        irrDisplay.color === 'red' ? 'text-red-600' :
                        'text-muted-foreground'
                      }`}>
                        {irrDisplay.label}
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">MOIC</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const moicDisplay = formatMoicDisplay(metricsData.moic, metricsData.moic_status);
                    return (
                      <p className={`text-2xl font-bold ${
                        moicDisplay.color === 'green' ? 'text-green-600' :
                        moicDisplay.color === 'yellow' ? 'text-yellow-600' :
                        moicDisplay.color === 'red' ? 'text-red-600' :
                        'text-muted-foreground'
                      }`}>
                        {moicDisplay.label}
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Operational Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">Peak Subscribers</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{Number(metricsData.peak_subscribers || 0).toLocaleString()}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">Peak EBITDA</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">${Number(metricsData.peak_ebitda || metricsData.peak_monthly_ebitda || 0).toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['Total CAPEX', 'Actual Cash Invested', 'NPV', 'IRR', 'MOIC', 'Peak EBITDA'].map((label) => (
              <Card key={label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Not run yet</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {/* Charts */}
      {monthlyData && monthlyData.length > 0 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscribers Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Check for valid subscriber data - field is "subscribers" not "cum_subscribers" */}
              {monthlyData.some(d => Number(d.subscribers) > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month_number" label={{ value: 'Month', position: 'insideBottom', offset: -5 }} />
                    <YAxis />
                    <Tooltip formatter={(value) => [Number(value).toLocaleString(), 'Subscribers']} />
                    <Line type="monotone" dataKey="subscribers" stroke="#5C7B5F" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No subscriber data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyData.some(d => Number(d.revenue) > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month_number" label={{ value: 'Month', position: 'insideBottom', offset: -5 }} />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="#B8D8E5" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No revenue data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">EBITDA Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyData.some(d => d.ebitda !== undefined) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month_number" label={{ value: 'Month', position: 'insideBottom', offset: -5 }} />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'EBITDA']} />
                    <Line type="monotone" dataKey="ebitda" stroke="#7B8B8E" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No EBITDA data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        // No monthly data at all - show empty state for charts section
        hasOutputs && (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No monthly economics data available for charts</p>
            </CardContent>
          </Card>
        )
      )}

      {/* Downloads */}
      {hasOutputs && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="w-4 h-4" />
              Downloads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {latestMonthlyFile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(latestMonthlyFile)}
                className="w-full justify-start"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Monthly Economics CSV
              </Button>
            )}
            {latestMetricsFile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(latestMetricsFile)}
                className="w-full justify-start"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Key Metrics CSV
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Output History */}
      {hasOutputs && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Model Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {outputsData.runs.map((run) => (
                <div key={run.run_id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">Run {format(new Date(run.created), 'MMM d, yyyy h:mm a')}</p>
                      <p className="text-xs text-muted-foreground">ID: {run.run_id}</p>
                    </div>
                    <Badge variant="outline">{run.files.length} files</Badge>
                  </div>
                  <div className="space-y-1">
                    {run.files.map((file) => (
                      <div key={file.key} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                        <p className="text-xs font-medium">{file.file_name}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(file)}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!hasOutputs && !generating && (
        <>
          {/* Show empty state metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['Total CAPEX', 'Actual Cash Invested', 'NPV', 'IRR', 'MOIC', 'Peak EBITDA'].map((label) => (
              <Card key={label} className="border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Not run yet</p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2 font-semibold">
                No financial model generated yet
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Generate your first financial report to see metrics and charts
              </p>
              <Button
                onClick={() => setShowInputModal(true)}
                variant="outline"
              >
                <Play className="w-4 h-4 mr-2" />
                Generate Financial Report
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Input Modal */}
      <ModelInputModal
        isOpen={showInputModal}
        onClose={() => {
          setShowInputModal(false);
          setModalError(null);
        }}
        onSubmit={handleGenerateModel}
        projectId={project.project_id}
        generating={generating}
        error={modalError}
      />
      
      {/* Scenario Drawer - opened after Generate Financial Report */}
      <ScenarioModelDrawer
        isOpen={showScenarioDrawer}
        onClose={() => {
          setShowScenarioDrawer(false);
          setAutoSelectScenarioId(null);
        }}
        projectId={project?.project_id}
        projectName={project?.project_name}
        defaultTab="scenarios"
        autoSelectScenarioId={autoSelectScenarioId}
      />
    </div>
  );
}