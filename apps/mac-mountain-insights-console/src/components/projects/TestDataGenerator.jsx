import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, TestTube, Copy, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const TEST_PROJECTS = [
  {
    entity: 'Blueprint',
    project_name: 'Denver Fiber Expansion',
    project_type: 'Owned',
    state: 'CO',
    partner_share_raw: '30%',
    investor_label: 'INV-2026-001',
    stage: 'Project Discussion',
    priority: 'High',
    owner: 'Sarah Johnson',
    notes: 'Initial fiber build-out for downtown Denver area. Targeting Q2 2026 completion.',
    is_test: true
  },
  {
    entity: 'GMF',
    project_name: 'Stowe Network Upgrade',
    project_type: 'Developer',
    state: 'VT',
    partner_share_raw: '',
    investor_label: 'INV-2026-002',
    stage: 'Term Sheet',
    priority: 'Must Win',
    owner: 'Mike Chen',
    notes: 'Critical upgrade to support 10Gbps service. Partnership with local municipality.',
    is_test: true
  },
  {
    entity: 'Mac Mtn',
    project_name: 'Austin Data Center Acquisition',
    project_type: 'Acquisition',
    state: 'TX',
    partner_share_raw: '50%',
    investor_label: 'INV-2026-003',
    stage: 'Contract Discussion',
    priority: 'High',
    owner: 'Lisa Martinez',
    notes: '20,000 sq ft facility. Due diligence in progress. Expected close date March 2026.',
    is_test: true
  }
];

export default function TestDataGenerator({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);

  const handleGenerateTestData = async () => {
    setLoading(true);
    let projectsCreated = 0;
    let scenariosCreated = 0;
    let scenariosWithRuns = 0;
    
    try {
      for (const project of TEST_PROJECTS) {
        try {
          // Step 1: Create project
          const projectResponse = await base44.functions.invoke('saveProject', {
            project
          });
          
          if (projectResponse.data.success) {
            const projectId = projectResponse.data.project_id;
            projectsCreated++;
            console.log(`✅ Created test project: ${project.project_name} (${projectId})`);
            
            // Step 2: Generate Base Case scenario with run
            try {
              const scenarioName = `${project.entity} — ${project.project_name} — Base Case`;
              const modelResponse = await base44.functions.invoke('runProjectModel', {
                project_id: projectId,
                scenario: {
                  scenario_id: `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  scenario_name: scenarioName,
                  inputs: {
                    passings: 8000,
                    build_months: 18,
                    start_date: new Date().toISOString().split('T')[0],
                    arpu_start: 63,
                    penetration_start_pct: 0.10,
                    penetration_target_pct: 0.40,
                    ramp_months: 36,
                    capex_per_passing: 1200,
                    opex_per_sub: 25,
                    discount_rate_pct: 10,
                    analysis_months: 120
                  },
                  is_test: true
                }
              });
              
              if (modelResponse.data.success) {
                scenariosCreated++;
                scenariosWithRuns++;
                console.log(`✅ Generated Base Case scenario for: ${project.project_name}`);
                toast.success(`✅ ${project.project_name} + Base Case`);
              } else {
                console.error(`❌ Scenario failed for ${project.project_name}:`, modelResponse.data);
                toast.error(`Scenario failed for ${project.project_name}`);
              }
            } catch (modelError) {
              console.error('Model generation error:', modelError);
              toast.error(`Model error for ${project.project_name}`);
            }
          } else {
            console.error(`❌ Project creation failed for ${project.project_name}:`, projectResponse.data);
            toast.error(`Failed: ${project.project_name}`);
          }
        } catch (error) {
          console.error('Project creation error:', error);
          toast.error(`Error creating ${project.project_name}`);
        }
      }
      
      const summary = `📊 Summary: ${projectsCreated} projects, ${scenariosCreated} scenarios, ${scenariosWithRuns} with runs`;
      console.log(summary);
      
      if (projectsCreated === TEST_PROJECTS.length && scenariosCreated === TEST_PROJECTS.length) {
        setLastGenerated(new Date());
        toast.success(`🎉 Complete! ${summary}`);
        onSuccess?.();
      } else if (projectsCreated > 0) {
        setLastGenerated(new Date());
        toast.warning(`⚠️ Partial: ${summary}`);
        onSuccess?.();
      } else {
        toast.error('Failed to create any test data');
      }
      
    } catch (error) {
      console.error('Test generation error:', error);
      toast.error('Failed to generate test data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (index) => {
    navigator.clipboard.writeText(JSON.stringify(TEST_PROJECTS[index], null, 2));
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Test data copied to clipboard');
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <TestTube className="w-4 h-4 mr-2" />
          Generate Test Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--mac-forest)]">
            Test Data Generator
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Generates demo projects plus demo model outputs so you can test Saved Scenarios and downloads end-to-end.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              This will create {TEST_PROJECTS.length} sample projects AND run a financial model for each one. 
              Each project will be written to S3 with test_ prefix, and model outputs (inputs.json, summary_metrics.csv, economics_monthly.csv) will be generated.
              {lastGenerated && (
                <span className="block mt-2 font-semibold">
                  ✓ Last generated: {lastGenerated.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>

          <Button 
            onClick={handleGenerateTestData} 
            disabled={loading}
            className="w-full bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <TestTube className="w-4 h-4 mr-2" />
            )}
            Generate All Test Projects + Models
          </Button>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Test Projects Preview:</h3>
            {TEST_PROJECTS.map((project, index) => (
              <Card key={index} className="bg-slate-50 dark:bg-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-base">{project.project_name}</h4>
                      <p className="text-xs text-muted-foreground">{project.entity} • {project.state}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(index)}
                    >
                      {copied === index ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><strong>Type:</strong> {project.project_type}</div>
                    <div><strong>Stage:</strong> {project.stage}</div>
                    <div><strong>Priority:</strong> {project.priority}</div>
                    <div><strong>Owner:</strong> {project.owner}</div>
                    <div className="col-span-2"><strong>Notes:</strong> {project.notes}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-sm mb-2">What Gets Created:</h3>
            <ul className="text-sm space-y-1 list-disc pl-5">
              <li>3 test projects written to S3 (test_projects_input__*.csv)</li>
              <li>3 complete financial models with outputs for each project</li>
              <li>All outputs include: inputs.json, summary_metrics.csv, economics_monthly.csv</li>
              <li>Scenarios registry (scenarios.json) created for each project</li>
              <li>Projects appear in Projects list with "Test" badges</li>
              <li>Model outputs visible in Economics tab and Scenario drawer</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}