import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, TrendingUp, DollarSign, Briefcase, BarChart3 } from 'lucide-react';
import StageBasedCapexView from './StageBasedCapexView';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function PortfolioRunner({ isOpen, onClose, projects }) {
  const [selectedProjects, setSelectedProjects] = useState({});
  const [scenarioChoices, setScenarioChoices] = useState({});
  const [portfolioResults, setPortfolioResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [projectScenarios, setProjectScenarios] = useState({});

  // Fetch scenarios for all projects
  useEffect(() => {
    if (!isOpen || projects.length === 0) return;
    
    const fetchAllScenarios = async () => {
      const scenarios = {};
      for (const project of projects) {
        try {
          const response = await base44.functions.invoke('manageScenariosRegistry', {
            action: 'get',
            project_id: project.project_id
          });
          scenarios[project.project_id] = response.data?.registry?.scenarios || [];
        } catch (error) {
          console.error(`Failed to load scenarios for ${project.project_id}:`, error);
          scenarios[project.project_id] = [];
        }
      }
      setProjectScenarios(scenarios);
    };
    
    fetchAllScenarios();
  }, [isOpen, projects]);

  const handleRunPortfolio = async () => {
    const selectedProjectIds = Object.keys(selectedProjects).filter(id => selectedProjects[id]);
    
    if (selectedProjectIds.length === 0) {
      toast.error('Select at least one project');
      return;
    }

    setRunning(true);
    try {
      // Need to get run_id for each selected scenario
      const projectsWithRuns = [];
      for (const project_id of selectedProjectIds) {
        const scenario_id = scenarioChoices[project_id];
        if (!scenario_id) {
          toast.error(`No scenario selected for ${projects.find(p => p.project_id === project_id)?.project_name}`);
          setRunning(false);
          return;
        }
        
        // Get outputs to find latest run_id for this scenario
        const outputsResponse = await base44.functions.invoke('listProjectModelOutputs', {
          project_id,
          action: 'list'
        });
        
        const runsForScenario = outputsResponse.data.runs?.filter(r => r.scenario_id === scenario_id) || [];
        if (runsForScenario.length === 0) {
          toast.error(`No runs found for selected scenario in ${projects.find(p => p.project_id === project_id)?.project_name}`);
          setRunning(false);
          return;
        }
        
        const latestRun = runsForScenario[0]; // Already sorted by date desc
        projectsWithRuns.push({
          project_id,
          scenario_id,
          run_id: latestRun.run_id,
          start_month_offset: 0 // Can be made configurable later
        });
      }
      
      const response = await base44.functions.invoke('runPortfolioAnalysisV2', {
        projects: projectsWithRuns,
        discount_rate_pct: 10,
        analysis_months: 120
      });

      if (response.data.success) {
        setPortfolioResults(response.data);
        toast.success('Portfolio analysis complete');
      } else {
        toast.error(response.data.message || 'Portfolio analysis failed');
      }
    } catch (error) {
      toast.error('Error running portfolio: ' + error.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            Portfolio Runner — Run All Projects Together
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Select projects and scenarios to model the entire pipeline as a portfolio
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Project Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Projects & Scenarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.map((project) => {
                const scenarios = projectScenarios[project.project_id] || [];
                const isSelected = selectedProjects[project.project_id];
                
                return (
                  <div key={project.project_id} className="flex items-center gap-4 p-3 border rounded-lg">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => 
                        setSelectedProjects({...selectedProjects, [project.project_id]: checked})
                      }
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{project.project_name}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{project.stage}</Badge>
                        <Badge variant="outline" className="text-xs">{project.entity}</Badge>
                      </div>
                    </div>
                    {isSelected && scenarios.length > 0 && (
                      <Select
                        value={scenarioChoices[project.project_id]}
                        onValueChange={(value) => 
                          setScenarioChoices({...scenarioChoices, [project.project_id]: value})
                        }
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select scenario..." />
                        </SelectTrigger>
                        <SelectContent>
                          {scenarios.map(scenario => (
                            <SelectItem key={scenario.scenario_id} value={scenario.scenario_id}>
                              {scenario.scenario_name || 'Unnamed'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {isSelected && scenarios.length === 0 && (
                      <p className="text-xs text-muted-foreground">No scenarios saved</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Run Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleRunPortfolio}
              disabled={running}
              className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
            >
              {running ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4 mr-2" />
              )}
              Run Portfolio Analysis
            </Button>
          </div>

          {/* Stage-Based CAPEX View */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                CAPEX by Stage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StageBasedCapexView projects={projects} scenarioData={{}} />
            </CardContent>
          </Card>

          {/* Portfolio Results */}
          {portfolioResults && (
            <div className="space-y-4">
              <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950 border-2">
                <CardHeader>
                  <CardTitle className="text-base">Portfolio Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Two CAPEX numbers for portfolio */}
                  <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Total CAPEX (Book)</p>
                      <p className="text-2xl font-bold">
                        ${portfolioResults.portfolio_metrics.total_capex_book.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Sum of all project book costs</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Actual Cash Invested</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        ${portfolioResults.portfolio_metrics.actual_cash_invested.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Peak external cash (cross-project reinvestment)
                      </p>
                    </div>
                  </div>

                  {/* Returns */}
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Portfolio NPV</p>
                      <p className={`text-xl font-bold ${
                        portfolioResults.portfolio_metrics.npv > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ${portfolioResults.portfolio_metrics.npv.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Portfolio IRR</p>
                      <p className="text-xl font-bold text-green-600">
                        {portfolioResults.portfolio_metrics.irr}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Portfolio MOIC</p>
                      <p className="text-xl font-bold text-green-600">
                        {portfolioResults.portfolio_metrics.moic}x
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Projects</p>
                      <p className="text-xl font-bold">
                        {portfolioResults.portfolio_metrics.project_count}
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
                    <LineChart data={portfolioResults.monthly}>
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
                  <CardTitle className="text-base">Portfolio EBITDA Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={portfolioResults.monthly}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                      <Line 
                        type="monotone" 
                        dataKey="ebitda" 
                        stroke="#5C7B5F" 
                        strokeWidth={2}
                        name="Portfolio EBITDA"
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