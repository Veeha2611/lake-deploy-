import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, TrendingUp, BarChart3, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function PipelineRunner({ isOpen, onClose }) {
  const [enrichedScenarios, setEnrichedScenarios] = useState([]);
  const [selectedScenarios, setSelectedScenarios] = useState({});
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [pipelineResults, setPipelineResults] = useState(null);
  const [missingData, setMissingData] = useState([]);

  // Fetch and enrich all scenarios
  useEffect(() => {
    if (!isOpen) return;

    const fetchEnrichedScenarios = async () => {
      setLoading(true);
      try {
        // 1. Load all projects from Athena with full metadata
        const projectsResponse = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: {
            sql: `
              SELECT project_id, entity, project_name, state, project_type, stage, priority
              FROM curated_core.projects_enriched
              ORDER BY entity, project_name
            `
          }
        });

        const projectsMap = new Map();
        const projectRows = projectsResponse.data?.data_rows || [];
        projectRows.forEach(row => {
          const values = Array.isArray(row) ? row : Object.values(row);
          projectsMap.set(values[0], {
            project_id: values[0],
            entity: values[1] || '(Unmapped)',
            project_name: values[2] || '(Unmapped)',
            state: values[3] || '(Unmapped)',
            project_type: values[4] || '(Unmapped)',
            stage: values[5] || 'Unknown',
            priority: values[6] || 'Unranked'
          });
        });

        // 2. Load ALL scenarios from all projects (don't skip any)
        const allScenarios = [];
        for (const [project_id, project] of projectsMap) {
          try {
            // Load registry - this is the source of truth for scenarios
            const registryResponse = await base44.functions.invoke('manageScenariosRegistry', {
              action: 'get',
              project_id
            });

            const scenarios = registryResponse.data?.registry?.scenarios || [];
            
            if (scenarios.length === 0) continue; // No scenarios for this project
            
            // Get latest runs for each scenario
            let runs = [];
            try {
              const outputsResponse = await base44.functions.invoke('listProjectModelOutputs', {
                project_id,
                action: 'list'
              });
              runs = outputsResponse.data?.runs || [];
            } catch (err) {
              console.error(`Failed to load runs for ${project_id}:`, err);
            }

            for (const scenario of scenarios) {
              // Include ALL scenarios, even test scenarios (user can filter later)
              const scenarioRuns = runs.filter(r => r.scenario_id === scenario.scenario_id);
              const latestRun = scenarioRuns.length > 0 ? scenarioRuns[0] : null;

              allScenarios.push({
                project_id,
                entity: project.entity,
                project_name: project.project_name,
                state: project.state,
                project_type: project.project_type,
                stage: project.stage,
                priority: project.priority,
                scenario_id: scenario.scenario_id,
                scenario_name: scenario.scenario_name || 'Unnamed',
                start_date: scenario.inputs?.start_date,
                start_month_offset: scenario.inputs?.start_month_offset || 0,
                is_test: scenario.is_test || false,
                latest_run: latestRun,
                metrics: latestRun?.metrics || {},
                has_run: !!latestRun
              });
            }
          } catch (error) {
            console.error(`Failed to load scenarios for ${project_id}:`, error);
          }
        }

        setEnrichedScenarios(allScenarios);
      } catch (error) {
        console.error('Failed to fetch scenarios:', error);
        toast.error('Failed to load scenarios');
      } finally {
        setLoading(false);
      }
    };

    fetchEnrichedScenarios();
  }, [isOpen]);

  const handleRunPipeline = async () => {
    const selectedKeys = Object.keys(selectedScenarios).filter(k => selectedScenarios[k]);
    
    if (selectedKeys.length === 0) {
      toast.error('Select at least one scenario');
      return;
    }

    setRunning(true);
    setPipelineResults(null);
    setMissingData([]);

    try {
      const selectedList = enrichedScenarios.filter(s => 
        selectedScenarios[`${s.project_id}_${s.scenario_id}`]
      );

      // Check for missing runs
      const missing = selectedList.filter(s => !s.has_run);
      if (missing.length > 0) {
        setMissingData(missing);
        toast.error(`${missing.length} scenario(s) have no runs - excluded from analysis`);
      }

      const validScenarios = selectedList.filter(s => s.has_run);
      if (validScenarios.length === 0) {
        toast.error('No valid scenarios to run');
        setRunning(false);
        return;
      }

      // Call portfolio analysis
      const response = await base44.functions.invoke('runPortfolioAnalysisV2', {
        projects: validScenarios.map(s => ({
          project_id: s.project_id,
          scenario_id: s.scenario_id,
          run_id: s.latest_run.run_id,
          start_month_offset: s.start_month_offset
        })),
        discount_rate_pct: 10,
        analysis_months: 120
      });

      if (response.data.success) {
        // Calculate CAPEX by Stage
        const stageBreakdown = {};
        validScenarios.forEach(s => {
          const stage = s.stage || 'Unknown';
          if (!stageBreakdown[stage]) {
            stageBreakdown[stage] = {
              count: 0,
              total_capex_book: 0,
              actual_cash_invested: 0
            };
          }
          stageBreakdown[stage].count += 1;
          stageBreakdown[stage].total_capex_book += Number(s.metrics.total_capex_book || 0);
          stageBreakdown[stage].actual_cash_invested += Number(s.metrics.actual_cash_invested || 0);
        });

        setPipelineResults({
          ...response.data,
          stage_breakdown: stageBreakdown,
          scenario_count: validScenarios.length
        });
        toast.success('Pipeline analysis complete');
      } else {
        toast.error(response.data.message || 'Pipeline analysis failed');
      }
    } catch (error) {
      console.error('Pipeline run error:', error);
      toast.error('Error running pipeline: ' + error.message);
    } finally {
      setRunning(false);
    }
  };

  // Group scenarios by entity, then project
  const groupedScenarios = enrichedScenarios.reduce((acc, scenario) => {
    const entity = scenario.entity;
    if (!acc[entity]) acc[entity] = {};
    const project = scenario.project_name;
    if (!acc[entity][project]) acc[entity][project] = [];
    acc[entity][project].push(scenario);
    return acc;
  }, {});

  const toggleScenario = (projectId, scenarioId) => {
    const key = `${projectId}_${scenarioId}`;
    setSelectedScenarios({ ...selectedScenarios, [key]: !selectedScenarios[key] });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            Pipeline Runner — Model Multiple Scenarios Together
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Select saved scenarios to model the entire pipeline
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Scenario Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Scenarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--mac-forest)]" />
                </div>
              ) : Object.keys(groupedScenarios).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No scenarios found. Create scenarios in the Scenario Modeling drawer.
                </p>
              ) : (
                Object.entries(groupedScenarios).map(([entity, projects]) => (
                  <div key={entity} className="space-y-2">
                    <h3 className="font-semibold text-sm text-[var(--mac-forest)]">{entity}</h3>
                    {Object.entries(projects).map(([projectName, scenarios]) => (
                      <div key={projectName} className="ml-4 space-y-1">
                        <p className="font-medium text-sm text-slate-700 dark:text-slate-300">{projectName}</p>
                        {scenarios.map(scenario => {
                          const key = `${scenario.project_id}_${scenario.scenario_id}`;
                          const isSelected = selectedScenarios[key];
                          
                          return (
                            <div 
                              key={scenario.scenario_id} 
                              className="ml-6 flex items-center gap-3 p-2 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleScenario(scenario.project_id, scenario.scenario_id)}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm">{scenario.scenario_name}</p>
                                  <Badge variant="outline" className="text-xs">{scenario.stage}</Badge>
                                  {scenario.is_test && (
                                    <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                      Test
                                    </Badge>
                                  )}
                                  {!scenario.has_run && (
                                    <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                                      No Latest Run
                                    </Badge>
                                  )}
                                </div>
                                {scenario.has_run && (
                                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                    <span>NPV: ${Number(scenario.metrics.npv || 0).toLocaleString()}</span>
                                    <span>IRR: {scenario.metrics.irr_annual_pct != null ? `${scenario.metrics.irr_annual_pct}%` : 'N/A'}</span>
                                    <span>MOIC: {scenario.metrics.moic != null ? `${scenario.metrics.moic}x` : 'N/A'}</span>
                                    <span>Cash: ${Number(scenario.metrics.actual_cash_invested || 0).toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Run Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleRunPipeline}
              disabled={running || loading}
              className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
            >
              {running ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4 mr-2" />
              )}
              Run Pipeline Analysis
            </Button>
          </div>

          {/* Missing Data Warning */}
          {missingData.length > 0 && (
            <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4" />
                  Missing Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                  The following scenarios have no runs and were excluded:
                </p>
                <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                  {missingData.map(s => (
                    <li key={`${s.project_id}_${s.scenario_id}`}>
                      {s.project_name} — {s.scenario_name}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Results */}
          {pipelineResults && (
            <div className="space-y-4">
              {/* CAPEX by Stage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    CAPEX by Stage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr>
                          <th className="text-left p-2">Stage</th>
                          <th className="text-right p-2">Count</th>
                          <th className="text-right p-2">Total CAPEX (Book)</th>
                          <th className="text-right p-2">Actual Cash Needed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(pipelineResults.stage_breakdown).map(([stage, data]) => (
                          <tr key={stage} className="border-b">
                            <td className="p-2 font-medium">{stage}</td>
                            <td className="text-right p-2">{data.count}</td>
                            <td className="text-right p-2">${data.total_capex_book.toLocaleString()}</td>
                            <td className="text-right p-2 font-semibold text-emerald-600">
                              ${data.actual_cash_invested.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Portfolio Summary */}
              <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950 border-2">
                <CardHeader>
                  <CardTitle className="text-base">Pipeline Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Total CAPEX (Book)</p>
                      <p className="text-2xl font-bold">
                        ${pipelineResults.portfolio_metrics.total_capex_book.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Sum of all scenario book costs</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Actual Cash Invested</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        ${pipelineResults.portfolio_metrics.actual_cash_invested.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Peak external cash (cross-project reinvestment)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Pipeline NPV</p>
                      <p className={`text-xl font-bold ${
                        pipelineResults.portfolio_metrics.npv > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ${pipelineResults.portfolio_metrics.npv.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Paid In</p>
                      <p className="text-xl font-bold">
                        ${pipelineResults.portfolio_metrics.paid_in?.toLocaleString() || pipelineResults.portfolio_metrics.actual_cash_invested.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Distributions</p>
                      <p className="text-xl font-bold">
                        ${pipelineResults.portfolio_metrics.distributions?.toLocaleString() || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Pipeline MOIC</p>
                      <p className="text-xl font-bold text-green-600">
                        {pipelineResults.portfolio_metrics.moic || 'N/A'}x
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Scenarios</p>
                      <p className="text-xl font-bold">
                        {pipelineResults.scenario_count}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cumulative External Cash Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cumulative External Cash Requirement</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={pipelineResults.monthly}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Cumulative External Cash ($)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                      <Line 
                        type="monotone" 
                        dataKey="cumulative_external_cash" 
                        stroke="#059669" 
                        strokeWidth={3}
                        name="External Cash Required"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Portfolio EBITDA */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pipeline EBITDA Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={pipelineResults.monthly}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                      <Line 
                        type="monotone" 
                        dataKey="ebitda" 
                        stroke="#5C7B5F" 
                        strokeWidth={2}
                        name="Pipeline EBITDA"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}