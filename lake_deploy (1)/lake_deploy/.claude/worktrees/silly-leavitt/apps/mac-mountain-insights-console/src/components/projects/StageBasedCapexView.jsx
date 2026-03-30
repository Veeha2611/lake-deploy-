import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp } from 'lucide-react';

const STAGE_GROUPS = {
  committed: ['Signed'],
  near_term: ['Contract Discussion', 'Final Docs'],
  early: ['NDA', 'Term Sheet', 'Project Discussion']
};

export default function StageBasedCapexView({ projects, scenarioData }) {
  // Calculate CAPEX by stage group
  const calculateCapexByStage = () => {
    const groups = {
      committed: { total_capex: 0, actual_cash: 0, count: 0 },
      near_term: { total_capex: 0, actual_cash: 0, count: 0 },
      early: { total_capex: 0, actual_cash: 0, count: 0 }
    };

    projects.forEach(project => {
      const scenario = scenarioData[project.project_id];
      if (!scenario?.metrics) return;

      const stage = project.stage;
      let group = null;

      if (STAGE_GROUPS.committed.includes(stage)) group = 'committed';
      else if (STAGE_GROUPS.near_term.includes(stage)) group = 'near_term';
      else if (STAGE_GROUPS.early.includes(stage)) group = 'early';

      if (group) {
        groups[group].total_capex += Number(scenario.metrics.total_capex_book || 0);
        groups[group].actual_cash += Number(scenario.metrics.actual_cash_invested || 0);
        groups[group].count++;
      }
    });

    return groups;
  };

  const stageGroups = calculateCapexByStage();

  return (
    <div className="space-y-4">
      <Card className="border-2 border-green-300 bg-green-50 dark:bg-green-950/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Signed / Committed Pipeline
          </CardTitle>
          <p className="text-xs text-muted-foreground">Money effectively committed ("going out the door")</p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Projects</p>
            <p className="text-2xl font-bold">{stageGroups.committed.count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total CAPEX</p>
            <p className="text-2xl font-bold">${stageGroups.committed.total_capex.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Actual Cash Needed</p>
            <p className="text-2xl font-bold text-emerald-600">
              ${stageGroups.committed.actual_cash.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Near-Term Pipeline
          </CardTitle>
          <p className="text-xs text-muted-foreground">Contract Discussion + Final Docs</p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Projects</p>
            <p className="text-2xl font-bold">{stageGroups.near_term.count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total CAPEX</p>
            <p className="text-2xl font-bold">${stageGroups.near_term.total_capex.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Actual Cash Needed</p>
            <p className="text-2xl font-bold text-blue-600">
              ${stageGroups.near_term.actual_cash.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-slate-300">
        <CardHeader>
          <CardTitle className="text-base">Early Stage / Exploration</CardTitle>
          <p className="text-xs text-muted-foreground">NDA, Term Sheet, Project Discussion</p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Projects</p>
            <p className="text-2xl font-bold">{stageGroups.early.count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total CAPEX</p>
            <p className="text-2xl font-bold">${stageGroups.early.total_capex.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Actual Cash Needed</p>
            <p className="text-2xl font-bold text-slate-600">
              ${stageGroups.early.actual_cash.toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}