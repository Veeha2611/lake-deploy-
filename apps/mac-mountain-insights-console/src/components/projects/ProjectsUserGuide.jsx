import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, FileText, Edit, Plus, Search, TrendingUp, Database, Download, Briefcase, SlidersHorizontal } from 'lucide-react';

export default function ProjectsUserGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HelpCircle className="w-4 h-4 mr-2" />
          User Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[var(--mac-forest)]">
            Projects & Pipeline - Complete User Guide
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* What This Tool Does */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                What This Tool Does
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                This tool tracks projects and pipeline stages, and lets you run scenario-based financial models. You can:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>View all projects in a single table</li>
                <li>Filter by entity, state, stage, or priority</li>
                <li>Update project stages, priorities, owners, and notes</li>
                <li>Create new projects and immediately generate financial models</li>
                <li>Run multiple scenarios and compare financial outcomes</li>
                <li>Download model outputs (NPV, IRR, MOIC, monthly cashflows)</li>
              </ul>
              <p className="text-muted-foreground italic">
                No technical knowledge needed - everything is point-and-click!
              </p>
            </CardContent>
          </Card>

          {/* Where Your Data Goes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4" />
                Where Your Data Goes (Two-Layer System)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>AWS-only mode note:</strong> reads are SSOT-safe; some write actions may be disabled depending on environment.
                  Your modeling outputs and evidence artifacts remain available.
                </p>
              </div>
              <p className="font-semibold">Your projects are saved in two places:</p>
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <p className="font-semibold">1. Update History (S3 Change-Files) - Immediate</p>
                  <p className="text-muted-foreground">
                    When you create or update a project, it's immediately written as a CSV file to S3. 
                    Click "View Update History" to see the latest change-files with timestamps.
                  </p>
                </div>
                <div className="border-l-4 border-green-500 pl-4 py-2">
                  <p className="font-semibold">2. Projects Table (Athena or S3 Fallback)</p>
                  <p className="text-muted-foreground">
                    The Projects table loads from Athena (data warehouse) when available. If ETL is pending or Athena is unavailable, 
                    the table automatically falls back to loading directly from S3 change-files.
                  </p>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs font-semibold mb-1">What the Banner Means:</p>
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>"Showing projects from S3 change-files (ETL/Athena pending or unavailable)"</strong> means 
                  the table is showing your latest saved updates even if the data warehouse hasn't caught up yet. This is normal and ensures you always see current data.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* How to Create a Project */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4" />
                How to Create a Project (Step-by-Step)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="list-decimal pl-5 space-y-2">
                <li>Click the <strong>"New Project"</strong> button at the top right</li>
                <li>Fill in the required fields (marked with *):
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li><strong>Entity:</strong> Business unit (e.g., Mountain Analytics, Blueprint, GMF)</li>
                    <li><strong>Project Name:</strong> Clear name (e.g., "Denver Fiber Expansion")</li>
                    <li><strong>Project Type:</strong> What kind of project (Infrastructure, Acquisition, etc.)</li>
                    <li><strong>State:</strong> Geographic location</li>
                    <li><strong>Stage:</strong> Pipeline stage (Term Sheet → Project Discussion → Contract Discussion → Final Docs → Signed)</li>
                    <li><strong>Priority:</strong> Low, Medium, High, or Must Win</li>
                    <li><strong>Owner:</strong> Person responsible for moving this forward</li>
                  </ul>
                </li>
                <li>Optional fields: Partner Share, Investor Label, Notes</li>
                <li>Click <strong>"Create Project"</strong></li>
                <li>You'll be asked: <strong>"Generate a model now?"</strong>
                  <ul className="list-disc pl-5 mt-1">
                    <li><strong>Yes</strong> → Opens the modeling drawer immediately</li>
                    <li><strong>Not Now</strong> → You can click "Scenario Modeling" button later</li>
                  </ul>
                </li>
              </ol>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mt-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> After saving, your project is written to S3 immediately. If the Projects table is waiting on ETL, 
                  you'll still see your saved file in "Update History."
                </p>
              </div>
            </CardContent>
          </Card>

          {/* How Modeling Works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                How Financial Modeling Works (Two Paths)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-semibold">There are two ways to generate financial models:</p>
              <div className="space-y-3">
                <div className="border-l-4 border-emerald-500 pl-4 py-2">
                  <p className="font-semibold">1. Generate Model (Full Scenario Workbench)</p>
                  <p className="text-muted-foreground">
                    Opens the scenario modeling drawer where you can:
                  </p>
                  <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                    <li>Tune all inputs (passings, build months, ARPU, penetration rates, capex, opex, etc.)</li>
                    <li>See instant NPV, IRR, MOIC calculations as you type</li>
                    <li>Save multiple scenarios and compare them side-by-side</li>
                    <li>Load and edit existing scenarios</li>
                  </ul>
                </div>
                <div className="border-l-4 border-blue-500 pl-4 py-2">
                  <p className="font-semibold">2. Generate Financial Report (Quick-Run)</p>
                  <p className="text-muted-foreground">
                    Requests minimal inputs (just passings and build months), runs the model with defaults, 
                    and lands you directly into the Scenario viewer where outputs are immediately visible.
                  </p>
                </div>
              </div>
              <p className="font-semibold mt-3">Both paths create the same outputs:</p>
              <ul className="list-disc pl-5">
                <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">inputs.json</code> - All model parameters</li>
                <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">summary_metrics.csv</code> - NPV, IRR, MOIC, peak subscribers, etc.</li>
                <li><code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">economics_monthly.csv</code> - 120-month cashflow projection</li>
              </ul>
            </CardContent>
          </Card>

          {/* Pipeline Runner */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Pipeline Runner (Run The Whole Pipeline)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Pipeline Runner is the “batch mode” portfolio tool. It loads the current project pipeline, attaches a baseline
                scenario per project, and can run outputs across many projects in one pass.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Defaults:</strong> uses median defaults from the pipeline when available; otherwise uses safe fallbacks.</li>
                <li><strong>Baseline scenarios:</strong> ensures each project has a baseline run even if no scenarios exist yet.</li>
                <li><strong>Saved runs:</strong> can save/export portfolio results (summary + monthly time series + artifacts).</li>
                <li><strong>Model profiles:</strong> supports profile selection/filtering so the same tool can run different assumption templates.</li>
              </ul>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  If a project is missing required inputs, use <strong>Apply Defaults</strong> (in Pipeline Runner) to generate a valid baseline automatically.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Portfolio Runner */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Portfolio Runner (Hand-Pick Projects + Scenarios)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Portfolio Runner is the “precision mode” tool: select specific projects, choose a scenario for each, and run them as a combined portfolio.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Best for board/investor packages where you want explicit scenario choices.</li>
                <li>Outputs include portfolio NPV/IRR/MOIC and monthly curves.</li>
                <li>Requires at least one saved scenario run per selected project.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Model Profiles & Defaults */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Model Profiles & Defaults
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                The modeling tools support baseline defaults and profiles so results are consistent and reproducible.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Model profile:</strong> a named assumption template used by Pipeline Runner/Portfolio Runner.</li>
                <li><strong>Defaults:</strong> when a project is missing required inputs, the runner can populate a baseline using the pipeline medians.</li>
                <li><strong>Determinism:</strong> the same inputs + same profile should yield the same outputs (NPV/IRR/MOIC + monthly curves).</li>
              </ul>
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <p className="text-xs font-semibold mb-2">Profiles (what to pick)</p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                  <li><strong>Standard Pipeline Model:</strong> general-purpose baseline for most projects.</li>
                  <li><strong>Blueprint Example Model 2026-02-15:</strong> matches the Blueprint example assumptions (ARPU/COGS/OPEX/CAPEX) used in the 2/15 model workbook.</li>
                  <li><strong>Developer Template 2-9-26 (Exec Dashboard):</strong> uses the developer-template engine to match Exec Dashboard / Prospect modeling assumptions.</li>
                  <li><strong>Horton / Acme Developer Profile:</strong> developer-specific profile. Uses the developer-template engine; defaults may be tuned for that developer if configured.</li>
                </ul>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  If you need to explain “why a number changed,” compare the two runs’ <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">inputs.json</code> files first.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Submissions / Capital Committee */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Edit className="w-4 h-4" />
                Submissions & Committee Queue (If Enabled)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Some environments enable a submission workflow (e.g., Capital Committee).
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Submit Project:</strong> sends a project package for review.</li>
                <li><strong>Committee Queue:</strong> a work queue of submitted projects awaiting review.</li>
                <li><strong>Auditability:</strong> submissions should reference the project ID and link to the latest model artifacts.</li>
              </ul>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  If you do not see these buttons, the workflow is not enabled for the current environment/user role.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Scenarios & Runs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Understanding Scenarios & Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-semibold">Scenario:</p>
                <p className="text-muted-foreground">
                  A named set of assumptions (e.g., "Base Case", "Aggressive Growth"). Each scenario can have multiple runs if you update inputs over time.
                </p>
              </div>
              <div>
                <p className="font-semibold">Run:</p>
                <p className="text-muted-foreground">
                  Each time you save a scenario, it creates a new run with a timestamp. This lets you see how your assumptions evolved.
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                <p className="font-semibold mb-2">In the "Saved Scenarios" tab, you'll see:</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  <li>All your scenarios grouped by name</li>
                  <li>Latest run for each scenario</li>
                  <li>View and Download buttons for every output file</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* How to Download Outputs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="w-4 h-4" />
                How to Download Outputs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-semibold">You can access outputs in two places:</p>
              <div className="space-y-2">
                <div>
                  <p className="font-semibold">1. From Project Detail Drawer → Economics Tab:</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    <li>Shows latest scenario metrics (NPV, IRR, MOIC cards)</li>
                    <li>Charts showing subscriber, revenue, and EBITDA trends over time</li>
                    <li>Download links for CSV files</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold">2. From Scenario Modeling Drawer → Saved Scenarios Tab:</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    <li>Lists all runs for all scenarios</li>
                    <li>Each file has an Eye icon (view in-app) and Download icon</li>
                    <li>Downloads are Safari-compatible and open in Excel/Numbers</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Test Data */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test Data System</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Test data is safe demo data that helps you explore the tool without affecting real projects.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>"Generate Test Data"</strong> button creates 3 sample projects AND runs a model for each</li>
                <li>Test projects are labeled with amber "Test" badges</li>
                <li>Use the <strong>"Include Test Data"</strong> toggle to show/hide test projects</li>
                <li>Test projects are stored separately with <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">test_</code> prefix in S3</li>
              </ul>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <p className="text-xs text-emerald-800 dark:text-emerald-200">
                  <strong>Tip:</strong> Generate test data to see complete end-to-end examples with outputs you can View and Download.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Finding & Updating Projects */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4" />
                Finding & Updating Projects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-semibold">Search & Filters:</p>
                <ul className="list-disc pl-5">
                  <li>Type in the search bar to find projects by name</li>
                  <li>Use dropdowns to filter by Entity, State, Stage, or Priority</li>
                  <li>Toggle "Include Test Data" to show/hide test projects</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold">Update a Project:</p>
                <ol className="list-decimal pl-5">
                  <li>Click any project row</li>
                  <li>Detail drawer opens showing all fields</li>
                  <li>Edit Stage, Priority, Owner, or Notes</li>
                  <li>Click "Save Changes" - update is written to S3 immediately</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-700">
            <CardHeader>
              <CardTitle className="text-base">Tips & Best Practices</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span>Use clear, descriptive project names (e.g., "Denver Fiber Expansion" not "Project X")</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span>Update stages regularly to keep the pipeline current</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span>Save multiple scenarios (Base Case, Optimistic, Conservative) to compare options</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span>Use "Generate Financial Report" for quick NPV checks</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span>Download monthly economics CSVs to build your own charts in Excel</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-600">✓</span>
                  <span>Check "Update History" if you need proof a save happened (shows timestamp and filename)</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
