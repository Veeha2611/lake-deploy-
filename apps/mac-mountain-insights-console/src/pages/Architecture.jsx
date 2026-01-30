import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, FileCode, Database, Cloud, Workflow, TestTube2, AlertTriangle, Loader2, Download, RefreshCw, XCircle, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ProofPackRunner from '@/components/architecture/ProofPackRunner';

export default function Architecture() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cataloging, setCataloging] = useState(false);
  const [generatingProof, setGeneratingProof] = useState(false);
  const [proofPack, setProofPack] = useState(null);
  const [auditResults, setAuditResults] = useState(null);
  const [runningAudit, setRunningAudit] = useState(false);
  const [generatingRebuild, setGeneratingRebuild] = useState(false);
  const [rebuildPackage, setRebuildPackage] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await base44.auth.me();
        // ONLY patrick.cochran@icloud.com can access
        setAuthorized(user?.email === 'patrick.cochran@icloud.com');
      } catch (error) {
        setAuthorized(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleClearS3 = async () => {
    if (!confirm('⚠️ WARNING: This will delete ALL projects and model outputs from S3. This cannot be undone. Continue?')) {
      return;
    }

    setClearing(true);
    try {
      const response = await base44.functions.invoke('clearProjectsS3');
      if (response.data.success) {
        toast.success(`✅ Cleared ${response.data.deleted_count} objects from S3`);
      } else {
        toast.error('Failed to clear S3: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Error clearing S3: ' + error.message);
    } finally {
      setClearing(false);
    }
  };

  const handleExportArchitecture = async () => {
    setExporting(true);
    try {
      const response = await base44.functions.invoke('exportArchitecture', {
        format: 'markdown'
      });

      if (response.data.success) {
        const blob = new Blob([response.data.export], { type: 'text/markdown' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.data.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success('Architecture documentation exported');
      }
    } catch (error) {
      toast.error('Export failed: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const handleCatalogUpdate = async () => {
    const summary = prompt('What changed or was fixed?');
    if (!summary) return;

    setCataloging(true);
    try {
      const response = await base44.functions.invoke('catalogArchitectureChanges', {
        action: 'add',
        entry: {
          version: 'v2.0.x',
          summary,
          surfaces_affected: [],
          files_changed: [],
          aws_surfaces: [],
          verification: []
        }
      });

      if (response.data.success) {
        toast.success(`✅ Catalog updated (${response.data.total_entries} entries)`);
      }
    } catch (error) {
      toast.error('Catalog failed: ' + error.message);
    } finally {
      setCataloging(false);
    }
  };

  const handleGenerateProofPack = async () => {
    setGeneratingProof(true);
    try {
      const response = await base44.functions.invoke('generateFullSystemProofPack', {});
      
      if (response.data.success) {
        setProofPack(response.data.proof_pack);
        toast.success(`✅ Proof Pack generated: ${response.data.proof_pack.summary.total_pages} pages, ${response.data.proof_pack.summary.total_backend_functions} functions`);
      } else {
        toast.error('Failed to generate Proof Pack');
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
    } finally {
      setGeneratingProof(false);
    }
  };

  const handleDownloadProofPack = () => {
    if (!proofPack) return;
    
    const blob = new Blob([JSON.stringify(proofPack, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mac_full_export_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Proof Pack downloaded');
  };

  const handleRunComprehensiveAudit = async () => {
    if (!confirm('Run comprehensive system audit? This will test all dashboard tiles, backend functions, and data sources.')) {
      return;
    }

    setRunningAudit(true);
    try {
      const response = await base44.functions.invoke('executeComprehensiveAudit', {});
      
      if (response.data.success) {
        setAuditResults(response.data.report);
        toast.success(`✅ Audit complete: ${response.data.report.audit_log.summary.passed}/${response.data.report.audit_log.summary.total} tests passed`);
      } else {
        toast.error('Audit failed');
      }
    } catch (error) {
      toast.error('Error running audit: ' + error.message);
    } finally {
      setRunningAudit(false);
    }
  };

  const handleDownloadAuditResults = () => {
    if (!auditResults) return;
    
    const blob = new Blob([JSON.stringify(auditResults, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mac_comprehensive_audit_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Audit report downloaded');
  };

  const handleGenerateRebuildPackage = async () => {
    setGeneratingRebuild(true);
    try {
      const response = await base44.functions.invoke('generateRebuildPackage', {});
      
      if (response.data.success) {
        setRebuildPackage(response.data);
        
        // Download JSON
        const jsonBlob = new Blob([JSON.stringify(response.data.package, null, 2)], { type: 'application/json' });
        const jsonUrl = window.URL.createObjectURL(jsonBlob);
        const jsonLink = document.createElement('a');
        jsonLink.href = jsonUrl;
        jsonLink.download = 'rebuild_package.json';
        document.body.appendChild(jsonLink);
        jsonLink.click();
        window.URL.revokeObjectURL(jsonUrl);
        jsonLink.remove();

        // Download Markdown
        const mdBlob = new Blob([response.data.markdown_doc], { type: 'text/markdown' });
        const mdUrl = window.URL.createObjectURL(mdBlob);
        const mdLink = document.createElement('a');
        mdLink.href = mdUrl;
        mdLink.download = 'REBUILD_GUIDE.md';
        document.body.appendChild(mdLink);
        mdLink.click();
        window.URL.revokeObjectURL(mdUrl);
        mdLink.remove();

        toast.success('Rebuild package exported (JSON + Markdown)');
      } else {
        toast.error('Failed to generate rebuild package');
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
    } finally {
      setGeneratingRebuild(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="max-w-md mx-auto mt-20 bg-card border-2 border-red-500 rounded-xl p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-card-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            This page is restricted to authorized administrators only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2">
          MAC Intelligence Platform — As-Built Architecture Catalog (v2.0-beta)
        </h1>
        <p className="text-muted-foreground">Complete system documentation, release log, AWS contracts, and acceptance tests</p>
        <div className="flex gap-2 mt-2">
          <Badge className="bg-blue-600">IN DEVELOPMENT: v2.0.0</Badge>
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
            🚧 EBITDA Reinvestment + Portfolio
          </Badge>
          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
            ✅ Two CAPEX Numbers
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          <strong>v2.0.0 Rebuild (in progress):</strong> Implementing full pro forma behavior: Total CAPEX vs Actual Cash Invested (with EBITDA reinvestment), portfolio aggregation with cross-project reinvestment, enhanced IRR/NPV/MOIC calculations using Actual Cash Invested as CF[0].
        </p>
        <div className="mt-4 flex gap-3 flex-wrap">
          <Button
            variant="default"
            onClick={handleRunComprehensiveAudit}
            disabled={runningAudit}
            className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-base px-6 py-6"
          >
            {runningAudit ? <Loader2 className="w-5 h-5 animate-spin" /> : <TestTube2 className="w-5 h-5" />}
            {runningAudit ? 'Running Comprehensive Audit...' : 'RUN COMPREHENSIVE AUDIT'}
          </Button>
          {auditResults && (
            <Button
              variant="default"
              onClick={handleDownloadAuditResults}
              className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold px-6 py-6"
            >
              <Download className="w-5 h-5" />
              Download Proof Pack ({auditResults.audit_log.summary.total} tests)
            </Button>
          )}
          <Button
            variant="default"
            onClick={handleGenerateProofPack}
            disabled={generatingProof}
            className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
          >
            {generatingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            Generate System Export
          </Button>
          <Button
            variant="default"
            onClick={handleGenerateRebuildPackage}
            disabled={generatingRebuild}
            className="gap-2 bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold px-6 py-6"
          >
            {generatingRebuild ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            EXPORT REBUILD PACKAGE
          </Button>
          {proofPack && (
            <Button
              variant="default"
              onClick={handleDownloadProofPack}
              className="gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white"
            >
              <Download className="w-4 h-4" />
              Download System Export
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleExportArchitecture}
            disabled={exporting}
            className="gap-2"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Documentation (MD)
          </Button>
          <Button
            variant="outline"
            onClick={handleCatalogUpdate}
            disabled={cataloging}
            className="gap-2"
          >
            {cataloging ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Catalog Change
          </Button>
          <Button
            variant="destructive"
            onClick={handleClearS3}
            disabled={clearing}
            className="gap-2"
          >
            {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : '🗑️'}
            Clear All S3 Projects Data
          </Button>
        </div>
      </header>

      {auditResults && (
        <Card className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-2 border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              Comprehensive System Audit Complete
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Full application audit with {auditResults.audit_log.summary.total} automated tests executed
            </p>
          </CardHeader>
          <CardContent>
            {/* Pass/Fail Summary */}
            <div className="grid grid-cols-5 gap-3 mb-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border text-center">
                <div className="text-3xl font-bold">{auditResults.audit_log.summary.total}</div>
                <div className="text-xs text-muted-foreground">Total Tests</div>
              </div>
              <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg border text-center">
                <div className="text-3xl font-bold text-green-700 dark:text-green-300">{auditResults.audit_log.summary.passed}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </div>
              <div className="bg-red-100 dark:bg-red-900 p-4 rounded-lg border text-center">
                <div className="text-3xl font-bold text-red-700 dark:text-red-300">{auditResults.audit_log.summary.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900 p-4 rounded-lg border text-center">
                <div className="text-3xl font-bold text-orange-700 dark:text-orange-300">{auditResults.audit_log.summary.blocked}</div>
                <div className="text-xs text-muted-foreground">Blocked</div>
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900 p-4 rounded-lg border text-center">
                <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">{auditResults.audit_log.summary.warnings}</div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
            </div>

            {/* Overall Assessment */}
            <div className={`p-4 rounded-lg border-2 mb-4 ${
              auditResults.audit_log.assessment.startsWith('✅ ALL') ? 'bg-green-50 dark:bg-green-950 border-green-500' :
              auditResults.audit_log.assessment.startsWith('✅ FUNCTIONAL') ? 'bg-blue-50 dark:bg-blue-950 border-blue-500' :
              auditResults.audit_log.assessment.startsWith('⚠️') ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-500' :
              'bg-red-50 dark:bg-red-950 border-red-500'
            }`}>
              <h3 className="font-bold text-lg mb-2">Overall Assessment</h3>
              <p className="text-base mb-2">{auditResults.audit_log.assessment}</p>
              <p className="text-sm text-muted-foreground"><strong>Recommendation:</strong> {auditResults.audit_log.recommendation}</p>
            </div>

            {/* Test Coverage Breakdown */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
                <div className="text-xl font-bold text-blue-600">{auditResults.test_coverage.dashboard_tiles}</div>
                <div className="text-xs text-muted-foreground">Dashboard Tiles</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
                <div className="text-xl font-bold text-purple-600">{auditResults.test_coverage.projects_module}</div>
                <div className="text-xs text-muted-foreground">Projects Module</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
                <div className="text-xl font-bold text-indigo-600">{auditResults.test_coverage.console_module}</div>
                <div className="text-xs text-muted-foreground">Console</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border">
                <div className="text-xl font-bold text-cyan-600">{auditResults.test_coverage.data_layer}</div>
                <div className="text-xs text-muted-foreground">Data Layer</div>
              </div>
            </div>

            {/* Pass Rate */}
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Pass Rate</span>
                <span className="text-2xl font-bold text-green-600">{auditResults.pass_fail_summary.pass_rate}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {auditResults.pass_fail_summary.passed} passed, {auditResults.pass_fail_summary.failed} failed, {auditResults.pass_fail_summary.blocked} blocked, {auditResults.pass_fail_summary.warnings} warnings
              </div>
            </div>

            {/* Critical Findings */}
            {auditResults.critical_findings.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-red-800 dark:text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                  Critical Findings ({auditResults.critical_findings.length})
                </h4>
                <div className="space-y-2">
                  {auditResults.critical_findings.map((finding, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-900 p-2 rounded text-xs">
                      <div className="font-mono font-semibold">{finding.test_id}: {finding.feature}</div>
                      <div className="text-red-600 dark:text-red-400">{finding.error}</div>
                      {finding.recommendation && <div className="text-muted-foreground mt-1">{finding.recommendation}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Execution Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div><strong>Audit ID:</strong> {auditResults.audit_log.audit_id}</div>
              <div><strong>Started:</strong> {new Date(auditResults.audit_log.started_at).toLocaleString()}</div>
              <div><strong>Completed:</strong> {new Date(auditResults.audit_log.completed_at).toLocaleString()}</div>
              <div><strong>Execution Time:</strong> {(auditResults.audit_log.execution_time_ms / 1000).toFixed(1)}s</div>
            </div>
          </CardContent>
        </Card>
      )}

      {proofPack && (
        <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="w-6 h-6 text-blue-600" />
              System Export Generated
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Complete system architecture inventory and documentation
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border">
                <div className="text-2xl font-bold text-blue-600">{proofPack.summary.total_pages}</div>
                <div className="text-sm text-muted-foreground">Pages</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border">
                <div className="text-2xl font-bold text-green-600">{proofPack.summary.total_backend_functions}</div>
                <div className="text-sm text-muted-foreground">Backend Functions</div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border">
                <div className="text-2xl font-bold text-purple-600">{proofPack.summary.total_components}</div>
                <div className="text-sm text-muted-foreground">Components</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="ux-flow" className="space-y-6">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="lake-wiring">
            <Database className="w-4 h-4 mr-2" />
            Lake Wiring
          </TabsTrigger>
          <TabsTrigger value="ux-flow">
            <Workflow className="w-4 h-4 mr-2" />
            UX Flow
          </TabsTrigger>
          <TabsTrigger value="frontend">
            <FileCode className="w-4 h-4 mr-2" />
            Frontend
          </TabsTrigger>
          <TabsTrigger value="backend">
            <Cloud className="w-4 h-4 mr-2" />
            Backend
          </TabsTrigger>
          <TabsTrigger value="s3-schema">
            <Database className="w-4 h-4 mr-2" />
            S3 & Schema
          </TabsTrigger>
          <TabsTrigger value="calculations">
            <FileCode className="w-4 h-4 mr-2" />
            Calculations
          </TabsTrigger>
          <TabsTrigger value="release-log">
            <FileCode className="w-4 h-4 mr-2" />
            Release Log
          </TabsTrigger>
          <TabsTrigger value="qa">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            QA Tests
          </TabsTrigger>
          <TabsTrigger value="tech-debt">
            <TestTube2 className="w-4 h-4 mr-2" />
            Tech Debt
          </TabsTrigger>
        </TabsList>

        {/* LAKE WIRING TAB */}
        <TabsContent value="lake-wiring">
          <Card>
            <CardHeader>
              <CardTitle>Lake Wiring — Athena Data Contracts</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Complete audit of every module's connection to AWS Athena. All queries, views, limits, and evidence fields documented.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Module 1: Network Map (GIS) */}
              <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
                <h3 className="text-lg font-bold mb-3 text-blue-900 dark:text-blue-100">1. Network Map (Layered GIS)</h3>
                
                <div className="space-y-3">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Source Table:</p>
                    <code className="text-xs bg-slate-800 text-emerald-400 px-2 py-1 rounded">vetro_raw_db.vetro_raw_json_lines</code>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Layers (3 independent queries):</p>
                    <ul className="text-xs space-y-1 list-disc pl-5">
                      <li><strong>Service Locations (SL-*):</strong> Blue pins, default ON, LIMIT 2000</li>
                      <li><strong>NAPs (NAP-*):</strong> Orange squares, default OFF, LIMIT 2000</li>
                      <li><strong>FAT (FAT-*):</strong> Green triangles, default OFF, LIMIT 2000</li>
                    </ul>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Output Columns (normalized schema):</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>• layer_key (string) - "service_locations" | "naps" | "fat"</div>
                      <div>• entity_id (string) - Vetro feature ID</div>
                      <div>• latitude (double) - required, NOT NULL</div>
                      <div>• longitude (double) - required, NOT NULL</div>
                      <div>• icon_key (string) - "sl" | "nap" | "fat"</div>
                      <div>• color_hex (string) - layer color</div>
                      <div>• city (varchar) - nullable</div>
                      <div>• state (varchar) - nullable</div>
                      <div>• build (varchar) - nullable, NULLIF empty</div>
                      <div>• broadband_status (varchar) - nullable, NULLIF empty</div>
                      <div>• network_status (varchar) - nullable, NULLIF empty</div>
                      <div>• bsl_id (varchar) - nullable, NULLIF empty</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Limit Policy:</p>
                    <div className="text-xs space-y-1">
                      <div>• Default: 2000 per layer</div>
                      <div>• Max: 2000 (Lambda cap lifted)</div>
                      <div>• Pagination: Not yet implemented (shows "first 2000 rows" label)</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Evidence Fields (returned by AWS):</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>✅ athena_query_execution_id (string)</div>
                      <div>✅ generated_sql (string)</div>
                      <div>✅ rows_returned (number)</div>
                      <div>✅ rows_truncated (boolean)</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Example SQL (Service Locations):</p>
                    <pre className="text-[10px] bg-slate-900 text-slate-100 p-2 rounded mt-1 overflow-x-auto">{`WITH features AS (
  SELECT CAST(json_parse(l.raw_line) AS array(json)) AS arr
  FROM vetro_raw_db.vetro_raw_json_lines l
),
points AS (
  SELECT f AS feature
  FROM features
  CROSS JOIN UNNEST(arr) AS t(f)
  WHERE json_extract_scalar(f, '$.geometry.type') = 'Point'
),
rows AS (
  SELECT
    'service_locations' AS layer_key,
    CAST(json_extract_scalar(feature, '$.properties.ID') AS varchar) AS entity_id,
    TRY_CAST(json_extract_scalar(feature, '$.geometry.coordinates[1]') AS double) AS latitude,
    TRY_CAST(json_extract_scalar(feature, '$.geometry.coordinates[0]') AS double) AS longitude,
    'sl' AS icon_key,
    '#2563EB' AS color_hex,
    TRY_CAST(json_extract_scalar(feature, '$.properties.City') AS varchar) AS city,
    TRY_CAST(json_extract_scalar(feature, '$.properties.State') AS varchar) AS state,
    NULLIF(TRY_CAST(json_extract_scalar(feature, '$.properties.Build') AS varchar), '') AS build,
    NULLIF(TRY_CAST(json_extract_scalar(feature, '$.properties["Broadband Status"]') AS varchar), '') AS broadband_status,
    NULLIF(TRY_CAST(json_extract_scalar(feature, '$.properties["Network Status"]') AS varchar), '') AS network_status,
    NULLIF(TRY_CAST(json_extract_scalar(feature, '$.properties.BSL_ID') AS varchar), '') AS bsl_id
  FROM points
)
SELECT *
FROM rows
WHERE entity_id LIKE 'SL-%'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
LIMIT 2000`}</pre>
                  </div>

                  <div className="bg-green-100 dark:bg-green-900 p-3 rounded">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-200">✅ Status: FULLY WIRED (v2.1.1)</p>
                  </div>
                </div>
              </div>

              {/* Module 2: Projects Pipeline */}
              <div className="border-2 border-purple-500 rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/20">
                <h3 className="text-lg font-bold mb-3 text-purple-900 dark:text-purple-100">2. Projects Pipeline</h3>
                
                <div className="space-y-3">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Source View:</p>
                    <code className="text-xs bg-slate-800 text-emerald-400 px-2 py-1 rounded">curated_core.projects_enriched</code>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Output Columns:</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>• project_id (varchar) - UUID</div>
                      <div>• entity (varchar)</div>
                      <div>• project_name (varchar)</div>
                      <div>• project_type (varchar)</div>
                      <div>• state (varchar)</div>
                      <div>• stage (varchar) - COALESCE(..., 'Unknown')</div>
                      <div>• priority (varchar) - COALESCE(..., 'Unranked')</div>
                      <div>• owner (varchar)</div>
                      <div>• partner_share_raw (varchar)</div>
                      <div>• investor_label (varchar)</div>
                      <div>• notes (varchar)</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">SQL:</p>
                    <pre className="text-[10px] bg-slate-900 text-slate-100 p-2 rounded mt-1 overflow-x-auto">{`SELECT
  project_id,
  entity,
  project_name,
  project_type,
  state,
  COALESCE(stage, 'Unknown') AS stage,
  COALESCE(priority, 'Unranked') AS priority,
  owner,
  partner_share_raw,
  investor_label,
  notes
FROM curated_core.projects_enriched
ORDER BY entity, project_name
LIMIT 200`}</pre>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Limit Policy:</p>
                    <div className="text-xs space-y-1">
                      <div>• Default: 200</div>
                      <div>• Max: 2000</div>
                      <div>• Fallback: S3 change-files if Athena returns 0 rows or fails</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Evidence Fields:</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>✅ athena_query_execution_id (from aiLayerQuery)</div>
                      <div>✅ generated_sql (from aiLayerQuery)</div>
                      <div>✅ data_source: "athena" | "s3" (UI tracking)</div>
                    </div>
                  </div>

                  <div className="bg-green-100 dark:bg-green-900 p-3 rounded">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-200">✅ Status: WIRED with S3 fallback (v2.0.0)</p>
                  </div>
                </div>
              </div>

              {/* Module 3: Revenue Repro Pack */}
              <div className="border-2 border-emerald-500 rounded-lg p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
                <h3 className="text-lg font-bold mb-3 text-emerald-900 dark:text-emerald-100">3. Revenue Reconciliation Pack</h3>
                
                <div className="space-y-3">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Source Views (4 queries per run):</p>
                    <ul className="text-xs list-disc pl-5 space-y-1">
                      <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">curated_core.invoice_line_item_repro_v1</code> - Invoice detail</li>
                      <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">curated_core.v_monthly_revenue_platt_long</code> - Revenue by customer (monthly pivot)</li>
                      <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">curated_core.v_monthly_revenue_platt_long</code> - Revenue by system (monthly pivot)</li>
                      <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">curated_core.v_monthly_revenue_platt_long</code> - Customer counts (monthly pivot)</li>
                    </ul>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Output Columns by Tab:</p>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong className="text-blue-600">Invoice Detail:</strong>
                        <div className="font-mono pl-3">customer_id, system, invoice_id, invoice_date, product, total</div>
                      </div>
                      <div>
                        <strong className="text-blue-600">Revenue by Customer:</strong>
                        <div className="font-mono pl-3">customer_id, system_id, customer_name, [month columns...]</div>
                      </div>
                      <div>
                        <strong className="text-blue-600">Revenue by System:</strong>
                        <div className="font-mono pl-3">system_id, [month columns...]</div>
                      </div>
                      <div>
                        <strong className="text-blue-600">Customer Counts:</strong>
                        <div className="font-mono pl-3">system_id, [month count columns...]</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Limit Policy:</p>
                    <div className="text-xs space-y-1">
                      <div>• Invoice Detail: 2000 rows</div>
                      <div>• Revenue by Customer: 2000 customers</div>
                      <div>• Revenue by System: 200 systems</div>
                      <div>• Customer Counts: 200 systems</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Evidence Fields (per tab):</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>✅ athena_query_execution_id</div>
                      <div>✅ generated_sql</div>
                      <div>✅ rows_returned</div>
                      <div>✅ rows_truncated</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Example SQL (Revenue by Customer):</p>
                    <pre className="text-[10px] bg-slate-900 text-slate-100 p-2 rounded mt-1 overflow-x-auto">{`WITH base AS (
  SELECT
    customer_id,
    system_id,
    period_month,
    SUM(revenue_amount) AS revenue
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN :start_month AND :end_month
  GROUP BY 1, 2, 3
)
SELECT
  customer_id,
  system_id,
  MAX(CASE WHEN period_month = '2025-01-01' THEN revenue END) AS "2025-01",
  MAX(CASE WHEN period_month = '2025-02-01' THEN revenue END) AS "2025-02",
  ...
FROM base
GROUP BY 1, 2
LIMIT 2000`}</pre>
                  </div>

                  <div className="bg-green-100 dark:bg-green-900 p-3 rounded">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-200">✅ Status: FULLY WIRED (v2.1.1)</p>
                  </div>
                </div>
              </div>

              {/* Module 4: AI Console */}
              <div className="border-2 border-amber-500 rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20">
                <h3 className="text-lg font-bold mb-3 text-amber-900 dark:text-amber-100">4. AI Intelligence Console</h3>
                
                <div className="space-y-3">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Data Sources (dual-lane):</p>
                    <ul className="text-xs list-disc pl-5 space-y-1">
                      <li><strong>Lane A (Numerical):</strong> curated_core.* views via aiLayerQuery</li>
                      <li><strong>Lane B (Knowledge):</strong> s3://gwi-raw-us-east-2-pc/knowledge_base/ via s3KnowledgeCatalog</li>
                    </ul>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Available Curated Views:</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>• v_monthly_revenue_platt_long</div>
                      <div>• v_customer_spine</div>
                      <div>• v_support_tickets</div>
                      <div>• v_network_health</div>
                      <div>• invoice_line_item_repro_v1</div>
                      <div>• projects_enriched</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Query Flow:</p>
                    <div className="text-xs space-y-1">
                      <div>1. LLM analyzes natural language question</div>
                      <div>2. LLM runs <code className="bg-slate-800 text-emerald-400 px-1 rounded">SHOW COLUMNS FROM curated_core.view_name</code> for schema discovery</div>
                      <div>3. LLM generates SQL (single statement, no semicolons)</div>
                      <div>4. SQL executed via aiLayerQuery</div>
                      <div>5. LLM formats markdown response + evidence</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Limit Policy:</p>
                    <div className="text-xs space-y-1">
                      <div>• Default: 200 rows</div>
                      <div>• Max: 2000 rows</div>
                      <div>• LLM determines appropriate LIMIT based on question</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Evidence Fields:</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>✅ athena_query_execution_ids[] (array, multi-query support)</div>
                      <div>✅ generated_sql (string or array for multi-task)</div>
                      <div>✅ views_used[] (array of view names)</div>
                      <div>✅ kb_sources[] (if Lane B used)</div>
                      <div>✅ rows_returned (per task)</div>
                    </div>
                  </div>

                  <div className="bg-green-100 dark:bg-green-900 p-3 rounded">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-200">✅ Status: FULLY WIRED (v2.1.0 - multi-task support)</p>
                  </div>
                </div>
              </div>

              {/* Module 5: Dashboard Tiles */}
              <div className="border-2 border-indigo-500 rounded-lg p-4 bg-indigo-50/50 dark:bg-indigo-950/20">
                <h3 className="text-lg font-bold mb-3 text-indigo-900 dark:text-indigo-100">5. Dashboard Tiles (KPIs & Charts)</h3>
                
                <div className="space-y-3">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Source Views (per tile):</p>
                    <div className="text-xs space-y-1">
                      <div>• <strong>MRR Tile:</strong> curated_core.v_monthly_revenue_platt_long</div>
                      <div>• <strong>Customer Health:</strong> curated_core.v_customer_spine</div>
                      <div>• <strong>Support Tickets:</strong> curated_core.v_support_tickets</div>
                      <div>• <strong>Network Health:</strong> curated_core.v_network_health</div>
                      <div>• <strong>Bucket Summary:</strong> curated_core.v_customer_spine + v_monthly_revenue_platt_long</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Limit Policy:</p>
                    <div className="text-xs space-y-1">
                      <div>• KPI tiles: 1 row (aggregate)</div>
                      <div>• Chart tiles: 200 rows max</div>
                      <div>• Table tiles: 200 rows default, 2000 max</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded border">
                    <p className="text-xs font-semibold mb-2">Evidence Fields (per tile):</p>
                    <div className="text-xs font-mono space-y-0.5 pl-3">
                      <div>✅ athena_query_execution_id</div>
                      <div>✅ generated_sql</div>
                      <div>✅ rows_returned</div>
                    </div>
                  </div>

                  <div className="bg-green-100 dark:bg-green-900 p-3 rounded">
                    <p className="text-xs font-semibold text-green-800 dark:text-green-200">✅ Status: FULLY WIRED (v1.0.0)</p>
                  </div>
                </div>
              </div>

              {/* Summary Box */}
              <div className="bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-4">
                <h3 className="font-bold mb-3">📋 Lake Wiring Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-white dark:bg-slate-900 p-2 rounded">
                    <p className="font-semibold mb-1">Modules Wired:</p>
                    <p className="text-2xl font-bold text-green-600">5 / 5</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded">
                    <p className="font-semibold mb-1">Evidence Coverage:</p>
                    <p className="text-2xl font-bold text-green-600">100%</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded col-span-2">
                    <p className="font-semibold mb-1">Athena Databases:</p>
                    <ul className="space-y-0.5 pl-3">
                      <li>• curated_core (primary)</li>
                      <li>• vetro_raw_db (GIS only)</li>
                    </ul>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-2 rounded col-span-2">
                    <p className="font-semibold mb-1">Row Limit Standard:</p>
                    <p>Default: 200 | Charts: 200 | Tables: 2000 | GIS: 2000/layer</p>
                  </div>
                </div>
              </div>

              {/* Validation Checklist */}
              <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-300 rounded-lg p-4">
                <h3 className="font-bold mb-3 text-blue-900 dark:text-blue-100">✅ Evidence Field Validation Checklist</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" defaultChecked />
                    <span>All modules return <code className="bg-slate-800 text-emerald-400 px-1 rounded">athena_query_execution_id</code></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" defaultChecked />
                    <span>All modules return <code className="bg-slate-800 text-emerald-400 px-1 rounded">generated_sql</code></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" defaultChecked />
                    <span>Row counts tracked via <code className="bg-slate-800 text-emerald-400 px-1 rounded">rows_returned</code></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" defaultChecked />
                    <span>Truncation flagged via <code className="bg-slate-800 text-emerald-400 px-1 rounded">rows_truncated</code></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" defaultChecked />
                    <span>All SQL queries are single-statement (no semicolons)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" defaultChecked />
                    <span>S3 fallback implemented where applicable (Projects)</span>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        {/* A1: UX FLOW MAP */}
        <TabsContent value="ux-flow">
          <Card>
            <CardHeader>
              <CardTitle>End-to-End User Flow Map</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3 text-lg">1. Creating a New Project</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-sm space-y-2">
                  <div>Projects Page → Click "New Project" Button</div>
                  <div className="pl-4">↓</div>
                  <div>NewProjectForm Modal Opens</div>
                  <div className="pl-4">↓</div>
                  <div>User fills: entity*, project_name*, project_type*, state*, stage*, priority*, owner*</div>
                  <div className="pl-4">↓</div>
                  <div>User clicks "Create Project"</div>
                  <div className="pl-4">↓</div>
                  <div>Frontend calls: <code>base44.functions.invoke('saveProject', {'{'}project: formData{'}'})</code></div>
                  <div className="pl-4">↓</div>
                  <div>Backend writes CSV to S3: <code>raw/projects_pipeline/input/projects_input__[timestamp].csv</code></div>
                  <div className="pl-4">↓</div>
                  <div>Success → Modal prompt: "Generate a model now?"</div>
                  <div className="pl-4">↓</div>
                  <div className="grid grid-cols-2 gap-4 pl-4">
                    <div>
                      <strong>If YES:</strong>
                      <div className="pl-4">→ Store projectId + projectName in localStorage</div>
                      <div className="pl-4">→ Open ScenarioModelDrawer</div>
                      <div className="pl-4">→ Drawer title shows real project name</div>
                    </div>
                    <div>
                      <strong>If NOT NOW:</strong>
                      <div className="pl-4">→ Close modal</div>
                      <div className="pl-4">→ "Scenario Modeling" button appears in header</div>
                      <div className="pl-4">→ User can click it anytime to open drawer</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-lg">2. Running a Model</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-sm space-y-2">
                  <div>ScenarioModelDrawer Opens (from post-save prompt OR "Scenario Modeling" button OR Economics tab)</div>
                  <div className="pl-4">↓</div>
                  <div>Drawer title: "Model Scenarios — {'{'}projectName{'}'}"</div>
                  <div className="pl-4">↓</div>
                  <div>Tab 1: "Scenario Inputs" - User enters:</div>
                  <div className="pl-8">• Required: passings*, build_months*</div>
                  <div className="pl-8">• Optional (collapsed): arpu_start, penetration rates, ramp_months, capex, opex, discount_rate</div>
                  <div className="pl-4">↓</div>
                  <div>Instant Results Card appears showing NPV, IRR, MOIC (client-side calculation)</div>
                  <div className="pl-4">↓</div>
                  <div>User clicks "Save Scenario" or "Save as New Scenario"</div>
                  <div className="pl-4">↓</div>
                  <div>Frontend calls: <code>base44.functions.invoke('runProjectModel', {'{'}project_id, scenario{'}'})</code></div>
                  <div className="pl-4">↓</div>
                  <div>Backend writes to S3: <code>raw/projects_pipeline/model_outputs/[project_id]/[scenario_id]/[run_id]/</code></div>
                  <div className="pl-8">• inputs.json</div>
                  <div className="pl-8">• summary_metrics.csv</div>
                  <div className="pl-8">• economics_monthly.csv</div>
                  <div className="pl-4">↓</div>
                  <div>Updates scenarios.json registry at: <code>raw/projects_pipeline/model_outputs/[project_id]/scenarios.json</code></div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-lg">3. Saving Scenarios</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-sm space-y-2">
                  <div><strong>Save Scenario (Overwrite)</strong></div>
                  <div className="pl-4">→ Uses existing scenario_id</div>
                  <div className="pl-4">→ Updates scenario registry with new inputs + timestamp</div>
                  <div className="pl-4">→ Creates new run_id under same scenario_id</div>
                  <div className="mt-4"><strong>Save as New Scenario</strong></div>
                  <div className="pl-4">→ Generates new scenario_id (scenario_[timestamp])</div>
                  <div className="pl-4">→ Default name: "Scenario N+1" (user can edit)</div>
                  <div className="pl-4">→ Adds to scenarios.json</div>
                  <div className="pl-4">→ Creates first run_id for this scenario</div>
                  <div className="mt-4"><strong>Tab 2: "Saved Scenarios"</strong></div>
                  <div className="pl-4">→ Lists all scenarios from scenarios.json</div>
                  <div className="pl-4">→ Shows scenario name, created date, last run</div>
                  <div className="pl-4">→ "Load" button populates inputs</div>
                  <div className="pl-4">→ Shows all output files per run with View + Download buttons</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-lg">4. Downloading Outputs</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-sm space-y-2">
                  <div><strong>From Project Detail Drawer → Economics Tab:</strong></div>
                  <div className="pl-4">→ Shows latest scenario metrics</div>
                  <div className="pl-4">→ Download links for CSV files</div>
                  <div className="mt-4"><strong>From ScenarioModelDrawer → Saved Scenarios Tab:</strong></div>
                  <div className="pl-4">→ Lists all runs for all scenarios</div>
                  <div className="pl-4">→ Each file has Eye (view) and Download buttons</div>
                  <div className="mt-4"><strong>Download Implementation (Safari-safe):</strong></div>
                  <div className="pl-4">→ Frontend calls: <code>listProjectModelOutputs</code> with action="download"</div>
                  <div className="pl-4">→ Backend returns presigned S3 URL with ResponseContentDisposition</div>
                  <div className="pl-4">→ Frontend uses: <code>window.location.assign(download_url)</code></div>
                  <div className="pl-4">→ Browser handles download with correct filename</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-lg">Flow Diagram (Text)</h3>
                <pre className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg text-xs overflow-x-auto">
{`
User Journey 1: Create → Model → Download
═══════════════════════════════════════════

Projects Page
    ↓ [Click "New Project"]
NewProjectForm
    ↓ [Fill & Submit]
saveProject() → S3 write → CSV created
    ↓ [Success]
Prompt: "Generate model now?"
    ↓ [Yes]
ScenarioModelDrawer (Title shows real project name)
    ↓ [Enter inputs]
Client-side calculation → Instant NPV/IRR preview
    ↓ [Save Scenario]
runProjectModel() → S3 write → outputs + scenarios.json
    ↓ [Success]
"Saved Scenarios" tab → List scenarios/runs
    ↓ [Click Download]
listProjectModelOutputs(action=download) → presigned URL
    ↓
window.location.assign(url) → Browser downloads file

User Journey 2: Load Existing → Edit → Save as New
═══════════════════════════════════════════════════

Projects Page → [Click existing project row]
    ↓
ProjectDetailDrawer → Economics Tab
    ↓ [Click "Generate Model"]
ScenarioModelDrawer
    ↓ [Switch to "Saved Scenarios"]
Load existing scenario → Inputs populate
    ↓ [Edit inputs]
Client-side recalc → Updated NPV/IRR
    ↓ [Save as New Scenario]
New scenario_id created → scenarios.json updated
    ↓
New run outputs written to S3
`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* A2: FRONTEND INVENTORY */}
        <TabsContent value="frontend">
          <Card>
            <CardHeader>
              <CardTitle>Frontend File Inventory & State Model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3 text-lg">Component Files</h3>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">pages/Projects.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Main page displaying projects table with filters and actions</p>
                    <div className="text-xs space-y-1">
                      <div><strong>Backend Calls:</strong> aiLayerQuery (PROJECTS_SQL), listProjectUpdates (S3 fallback)</div>
                      <div><strong>State:</strong></div>
                      <div className="pl-4">• searchTerm, entityFilter, stateFilter, stageFilter, priorityFilter</div>
                      <div className="pl-4">• includeTestData (boolean)</div>
                      <div className="pl-4">• selectedProject, showDetailDrawer</div>
                      <div className="pl-4">• showNewForm</div>
                      <div className="pl-4">• modelProjectId, modelProjectName (for ScenarioModelDrawer)</div>
                      <div className="pl-4">• lastCreatedProjectId (synced with localStorage)</div>
                      <div className="pl-4">• dataSource ('athena' | 's3') - tracks where data loaded from</div>
                      <div><strong>LocalStorage Keys:</strong></div>
                      <div className="pl-4">• lastCreatedProjectId</div>
                      <div><strong>S3 Fallback Logic:</strong></div>
                      <div className="pl-4">1. Try aiLayerQuery with safe SQL (no investment_amount)</div>
                      <div className="pl-4">2. If fails or returns 0 rows → load from S3 change-files</div>
                      <div className="pl-4">3. Parse CSV, dedupe by project_id (keep newest file)</div>
                      <div className="pl-4">4. Show banner: "Showing projects from S3 change-files"</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">components/projects/NewProjectForm.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Modal form for creating new projects</p>
                    <div className="text-xs space-y-1">
                      <div><strong>Backend Calls:</strong> saveProject</div>
                      <div><strong>Props:</strong> isOpen, onClose, onSuccess, onOpenModel</div>
                      <div><strong>State:</strong> formData (entity, project_name, project_type, state, partner_share_raw, investor_label, stage, priority, owner, notes)</div>
                      <div><strong>Post-Save Flow:</strong> Calls onOpenModel(projectId, projectName) after window.confirm prompt</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">components/projects/ProjectDetailDrawer.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Side drawer showing project details with Details + Economics tabs</p>
                    <div className="text-xs space-y-1">
                      <div><strong>Backend Calls:</strong> saveProject (for updates)</div>
                      <div><strong>Props:</strong> isOpen, onClose, project, onSave</div>
                      <div><strong>State:</strong> formData (editable fields only: stage, priority, owner, notes), showScenarioDrawer</div>
                      <div><strong>Child Components:</strong> EconomicsTab, ScenarioModelDrawer</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">components/projects/ScenarioModelDrawer.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Main scenario modeling UI with instant client-side calculations</p>
                    <div className="text-xs space-y-1">
                      <div><strong>Backend Calls:</strong> runProjectModel, listProjectModelOutputs (list/download/content)</div>
                      <div><strong>Props:</strong> isOpen, onClose, projectId, projectName</div>
                      <div><strong>State:</strong></div>
                      <div className="pl-4">• inputs (passings, build_months, arpu_start, penetration_start_pct, penetration_target_pct, ramp_months, capex_per_passing, opex_per_sub, discount_rate_pct, analysis_months)</div>
                      <div className="pl-4">• scenarioName</div>
                      <div className="pl-4">• selectedScenarioId</div>
                      <div className="pl-4">• saving, showAdvanced</div>
                      <div className="pl-4">• viewContent (for viewing file contents in modal)</div>
                      <div><strong>Client-side Calculations:</strong> calculateFinancials() - computes NPV, IRR, MOIC, monthly cashflows in real-time</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">components/projects/EconomicsTab.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Shows latest scenario metrics and outputs within ProjectDetailDrawer</p>
                    <div className="text-xs space-y-1">
                      <div><strong>Backend Calls:</strong> listProjectModelOutputs</div>
                      <div><strong>Props:</strong> project</div>
                      <div><strong>Displays:</strong> NPV, IRR, MOIC cards + time-series charts + download links</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">components/projects/ProjectUpdatesHistory.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Modal showing all project change-files from S3</p>
                    <div className="text-xs space-y-1">
                      <div><strong>Backend Calls:</strong> listProjectUpdates (list/download/content)</div>
                      <div><strong>Displays:</strong> Separate lists for real vs test projects, with View + Download per file</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">components/projects/TestDataGenerator.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Modal for generating 3 sample test projects WITH full model outputs</p>
                    <div className="text-xs space-y-1">
                      <div><strong>Backend Calls:</strong> saveProject (x3, with is_test=true), runProjectModel (x3)</div>
                      <div><strong>Behavior:</strong> For each test project, creates project then immediately runs a model with default inputs</div>
                      <div><strong>Output:</strong> 3 projects + 3 complete model runs with inputs.json, summary_metrics.csv, economics_monthly.csv</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-mono text-sm font-semibold mb-2">components/projects/ProjectsUserGuide.jsx</h4>
                    <p className="text-sm text-muted-foreground mb-2">Modal with help documentation</p>
                    <div className="text-xs">Static content, no backend calls</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-lg">State Variable Reference</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg text-xs space-y-2 font-mono">
                  <div><strong>activeProjectId</strong> → modelProjectId (Projects.jsx) - Which project is being modeled</div>
                  <div><strong>activeProjectName</strong> → modelProjectName (Projects.jsx) - Project name displayed in drawer title</div>
                  <div><strong>showScenarioDrawer</strong> → modelProjectId !== null (Projects.jsx) or showScenarioDrawer (ProjectDetailDrawer.jsx)</div>
                  <div><strong>scenarioInputs</strong> → inputs (ScenarioModelDrawer.jsx) - All model parameters</div>
                  <div><strong>scenarioList</strong> → scenariosData.runs (ScenarioModelDrawer.jsx) - Loaded from listProjectModelOutputs</div>
                  <div><strong>activeScenarioId</strong> → selectedScenarioId (ScenarioModelDrawer.jsx) - Currently selected scenario</div>
                  <div><strong>activeScenarioName</strong> → scenarioName (ScenarioModelDrawer.jsx) - Editable scenario name</div>
                  <div><strong>includeTestData</strong> → includeTestData (Projects.jsx) - Filter toggle for test projects</div>
                  <div className="mt-3"><strong>localStorage.lastCreatedProjectId</strong> - Persists project_id after creation, enables "Scenario Modeling" button</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* A4: BACKEND INVENTORY */}
        <TabsContent value="backend">
          <Card>
            <CardHeader>
              <CardTitle>Backend Function Contracts</CardTitle>
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold mb-2">Two-Lane AWS Source Model</h4>
                <div className="space-y-2 text-sm">
                  <div className="border-l-4 border-green-500 pl-3 py-1">
                    <strong>Lane A: Empirical/Numerical Data (Athena)</strong>
                    <div className="text-xs text-muted-foreground mt-1">
                      All numerical queries via <code className="bg-slate-800 text-emerald-400 px-1 rounded">aiLayerQuery</code> → AWS AI Layer → Athena.
                      Restricted to <code>curated_core</code> views only. Schema discovery with <code>SHOW COLUMNS</code> mandatory before complex queries.
                    </div>
                  </div>
                  <div className="border-l-4 border-blue-500 pl-3 py-1">
                    <strong>Lane B: Knowledge Base (Unstructured Docs in S3)</strong>
                    <div className="text-xs text-muted-foreground mt-1">
                      Policy/strategy/narrative questions via <code className="bg-slate-800 text-emerald-400 px-1 rounded">s3KnowledgeCatalog</code>.
                      Retrieves document snippets from <code>s3://gwi-raw-us-east-2-pc/knowledge_base/</code>.
                      Returns source S3 keys with text chunks for citation.
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    <strong>Fail-Closed Policy:</strong> If AWS returns non-200 or ok:false, show error + SQL + evidence panel. Never fabricate data.
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                {
                  name: 'saveProject',
                  path: 'functions/saveProject.js',
                  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
                  request: { project: { entity: 'string*', project_name: 'string*', project_type: 'string', state: 'string', partner_share_raw: 'string', investor_label: 'string', stage: 'string', priority: 'string', owner: 'string', notes: 'string', is_test: 'boolean (default: false)' } },
                  response: { success: 'boolean', project_id: 'string (uuid)', s3_key: 'string', message: 'string', error: 'string (if failed)' },
                  s3Action: 'PutObject to raw/projects_pipeline/input/[test_]projects_input__YYYYMMDD_HHMMSS.csv',
                  errorBehavior: 'Returns {success: false, error: message}. Does NOT throw.'
                },
                {
                  name: 'listProjectUpdates',
                  path: 'functions/listProjectUpdates.js',
                  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
                  request: { action: '"list" | "download" | "content"', key: 'string (required for download/content)' },
                  response: {
                    list: { files: '[{key, file_name, size_bytes, last_modified, is_test}]' },
                    download: { download_url: 'string (presigned, 5min expiry)', expires_at: 'string (ISO)' },
                    content: { content: 'string (file text)' }
                  },
                  s3Action: 'ListObjectsV2 or GetObject or presigned GetObject',
                  errorBehavior: 'Returns 500 with {error: message}'
                },
                {
                  name: 'runProjectModel',
                  path: 'functions/runProjectModel.js',
                  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
                  request: {
                    project_id: 'string* - UUID of project',
                    scenario: {
                      scenario_id: 'string* - "scenario_<timestamp>" or existing ID',
                      scenario_name: 'string* - User-facing name',
                      inputs: {
                        passings: 'number* - Total homes passed',
                        build_months: 'number* - Construction period (1-120)',
                        arpu_start: 'number - Starting ARPU (default: 63)',
                        penetration_start_pct: 'number - 0.0-1.0 (default: 0.10)',
                        penetration_target_pct: 'number - 0.0-1.0 (default: 0.40)',
                        ramp_months: 'number - Subscriber ramp period (default: 36)',
                        capex_per_passing: 'number - Per-passing capex (default: 1200)',
                        opex_per_sub: 'number - Monthly opex per sub (default: 25)',
                        discount_rate_pct: 'number - Annual discount rate (default: 10)',
                        analysis_months: 'number - Total months to model (default: 120)'
                      },
                      is_test: 'boolean - If true, marks as test data'
                    }
                  },
                  response: {
                    success: 'boolean - true if all writes succeeded',
                    project_id: 'string - Echo back',
                    scenario_id: 'string - The scenario ID used',
                    run_id: 'string - Generated run ID (run_<timestamp>)',
                    outputs: {
                      inputs_key: 'string - S3 key for inputs.json',
                      summary_metrics_key: 'string - S3 key for summary_metrics.csv',
                      economics_monthly_key: 'string - S3 key for economics_monthly.csv'
                    },
                    metrics: { npv: 'number', irr: 'string', moic: 'string', '...': 'other metrics' },
                    is_test: 'boolean',
                    message: 'string - Success message'
                  },
                  s3Action: 'Writes 3 files to raw/projects_pipeline/model_outputs/{project_id}/{scenario_id}/{run_id}/',
                  errorBehavior: 'Returns {success: false, message: error}. Does NOT throw. Logs to console.'
                },
                {
                  name: 'listProjectModelOutputs',
                  path: 'functions/listProjectModelOutputs.js',
                  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
                  request: { project_id: 'string*', action: '"list" | "download" | "content"', key: 'string (for download/content)' },
                  response: {
                    list: { runs: '[{scenario_id, scenario_name, run_id, created, files: [{key, file_name, size_bytes}]}]' },
                    download: { download_url: 'string (presigned)' },
                    content: { content: 'string' }
                  },
                  s3Action: 'List/Get from raw/projects_pipeline/model_outputs/{project_id}/',
                  errorBehavior: 'Returns 500 with {error: message}'
                },
                {
                  name: 'aiLayerQuery',
                  path: 'functions/aiLayerQuery.js',
                  envVars: ['AWS_AI_LAYER_API_KEY', 'AWS_AI_LAYER_INVOKE_URL'],
                  request: { template_id: '"freeform_sql_v1"', params: { sql: 'string*' } },
                  response: { data_rows: 'array of arrays or objects', column_names: 'array of strings' },
                  s3Action: 'None (calls external Athena API)',
                  errorBehavior: 'Returns response.data or throws'
                },
                {
                  name: 'manageScenariosRegistry',
                  path: 'functions/manageScenariosRegistry.js',
                  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
                  request: { action: '"get" | "upsert"', project_id: 'string*', scenario: 'object (for upsert)' },
                  response: {
                    get: { success: 'boolean', registry: '{project_id, scenarios: [...]}' },
                    upsert: { success: 'boolean', registry: 'updated registry', s3_key: 'string' }
                  },
                  s3Action: 'Get/Put scenarios.json at raw/projects_pipeline/model_outputs/{project_id}/scenarios.json',
                  errorBehavior: 'Returns 500 with {error: message}'
                },
                {
                  name: 's3KnowledgeCatalog',
                  path: 'functions/s3KnowledgeCatalog.js',
                  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
                  request: { action: '"list" | "get_signed_url"', key: 'string (for get_signed_url)' },
                  response: {
                    list: { documents: '[{key, name, size, last_modified, summary?, topics?}]' },
                    get_signed_url: { signed_url: 'string (15min expiry)' }
                  },
                  s3Action: 'ListObjectsV2 or presigned GetObject from s3://gwi-raw-us-east-2-pc/knowledge_base/',
                  errorBehavior: 'Returns 500 with {error: message}. Used for Lane B (unstructured docs).'
                },
                {
                  name: 'clearProjectsS3',
                  path: 'functions/clearProjectsS3.js',
                  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
                  request: {},
                  response: { success: 'boolean', deleted_count: 'number', message: 'string' },
                  s3Action: 'DeleteObjects for all keys under raw/projects_pipeline/',
                  errorBehavior: 'Returns 403 if not admin, 500 on failure. ADMIN-ONLY function.'
                },
                {
                  name: 'getVetroPlanIndex',
                  path: 'functions/getVetroPlanIndex.js',
                  envVars: ['AWS_AI_LAYER_API_KEY', 'AWS_AI_LAYER_INVOKE_URL'],
                  request: {},
                  response: { success: 'boolean', plans: '[{plan_id, plan_name, service_location_count, has_broadband_status, has_bsl_id, served_count, served_pct}]', total_plans: 'number', error: 'string (if failed)', data_needed: 'object (if failed)' },
                  s3Action: 'None (queries Athena via aiLayerQuery)',
                  errorBehavior: 'On query failure, returns sample plan data with data_needed object explaining requirements. Never throws.'
                },
                {
                  name: 'getVetroFeaturesForPlan',
                  path: 'functions/getVetroFeaturesForPlan.js',
                  envVars: ['AWS_AI_LAYER_API_KEY', 'AWS_AI_LAYER_INVOKE_URL'],
                  request: { plan_id: 'string*', search_query: 'string (optional, e.g., "underserved", "northport")' },
                  response: { success: 'boolean', plan_id: 'string', features: '[{service_location_id, city, state, class, broadband_status, network_status, drop_status, bsl_id, latitude, longitude, build}]', total_features: 'number', limitations: 'array of strings (data availability notices)', sql_executed: 'string', error: 'string (if failed)' },
                  s3Action: 'None (queries Athena via aiLayerQuery)',
                  errorBehavior: 'On query failure, returns data_needed object with requirements. Limitations array shows missing fields (broadband_status, bsl_id).'
                },
                {
                  name: 'submitDataRequest',
                  path: 'functions/submitDataRequest.js',
                  envVars: [],
                  request: { request_title: 'string*', question_asked: 'string*', desired_output: 'string*', date_range: 'string', source_systems: 'array of strings', notes: 'string', data_requirements: 'object (structured specs)' },
                  response: { success: 'boolean', message: 'string', error: 'string (if failed)' },
                  s3Action: 'None (sends email via Core.SendEmail integration)',
                  errorBehavior: 'Returns 500 with {success: false, error: message} if email fails.'
                }
              ,
              {
                name: 'syncMondayToAWS',
                path: 'functions/syncMondayToAWS.js',
                envVars: ['MONDAY_API_KEY', 'MONDAY_BOARD_ID', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
                request: { 
                  challenge: 'string (query param - Monday webhook verification)',
                  webhook_payload: 'object (POST body - not processed, full sync always runs)'
                },
                response: { 
                  status: '"success" | "error"',
                  board_name: 'string',
                  board_id: 'string',
                  sync_results: {
                    total_items: 'number',
                    calculated: 'number (items with valid NPV/IRR/MOIC)',
                    skipped: 'number (items missing passings or capex)',
                    s3_key: 'string',
                    s3_bucket: 'string',
                    row_count: 'number',
                    calculated_fields: '["npv", "irr_pct", "moic", "actual_cash_invested"]',
                    timestamp: 'string (ISO)'
                  },
                  next_step: 'string',
                  s3_location: 'string (s3://...)',
                  error: 'string (if failed)'
                },
                s3Action: 'PutObject to raw/projects_pipeline/input/[YYYY-MM-DD-HH]-sync-[epoch].csv',
                errorBehavior: 'NO AUTH REQUIRED (public webhook). Returns 200 with plain text challenge for verification. Returns 500 {status: "error", error: message} on sync failures.',
                calculation: `In-Function Financial Calculation Engine:
                
Function calculateFinancials(inputs) implements full pro forma model:

INPUTS:
  passings          - Number of homes passed (required)
  build_months      - Construction period (required)
  total_capex       - Total project cost (required)
  arpu_start        - Starting ARPU (default: 63)
  penetration_start_pct - Start penetration 0.0-1.0 (default: 0.10)
  penetration_target_pct - Target penetration 0.0-1.0 (default: 0.40)
  ramp_months       - Subscriber ramp period (default: 36)
  opex_per_sub      - Monthly opex per sub (default: 25)
  discount_rate_pct - Annual discount rate (default: 10)
  analysis_months   - Projection horizon (default: 120)

CASHFLOW CONSTRUCTION (month-by-month):
  buildProgress[t] = min(t / build_months, 1)
  rampProgress[t] = min(max(t - build_months, 0) / ramp_months, 1)
  penetration[t] = penetration_start + (penetration_target - penetration_start) × rampProgress[t]
  subscribers[t] = floor(passings × buildProgress[t] × penetration[t])
  
  revenue[t] = subscribers[t] × arpu_start
  opex[t] = subscribers[t] × opex_per_sub
  ebitda[t] = revenue[t] - opex[t]
  capex_book[t] = total_capex / build_months (if t <= build_months), else 0
  
  EBITDA REINVESTMENT LOGIC:
    if ebitda[t] < 0:
      external_cash[t] = capex_book[t] - ebitda[t]  // cover both capex and losses
    else:
      external_cash[t] = max(0, capex_book[t] - ebitda[t])  // reinvest EBITDA into capex
    
  cumulative_external_cash[t] = cumulative_external_cash[t-1] + external_cash[t]
  fcf[t] = ebitda[t] - capex_book[t]
  pv[t] = fcf[t] / (1 + monthly_rate)^t

OUTPUTS:
  actual_cash_invested = max(cumulative_external_cash[1..T])  // peak external cash
  npv = sum(pv[1..T]) - actual_cash_invested
  irr_monthly = solve for r where: -actual_cash_invested + sum(fcf[t]/(1+r)^t) = 0
  irr_pct = ((1 + irr_monthly)^12 - 1) × 100
  moic = sum(max(0, fcf[t])) / actual_cash_invested
  
IRR SOLVER:
  Newton-Raphson with 50 iterations, initial guess r=0.10
  Convergence check: |npv| < $0.001
  Edge cases:
    - actual_cash_invested <= 0 → irr_pct = null
    - No sign change in cashflows → irr_pct = null
    - |derivative| < 1e-10 → irr_pct = null
    - Did not converge after 50 iterations → irr_pct = null`,
                columnMapping: `MONDAY COLUMN MAPPING (via normalized field names):

Function builds stable column map from Monday API:
  columnMap[col.id] = {
    title: col.title,
    type: col.type,
    normalized: col.title.toLowerCase().replace(/\\s+/g, '_')
  }

Then reverse lookup for extraction:
  fieldToColId[normalized_name] = column_id
  
extractValue(item, 'passings') → finds column with normalized name 'passings' → extracts value

Expected Monday columns (via normalized names):
  - entity
  - project_type
  - state
  - stage
  - priority
  - owner
  - passings
  - build_months
  - total_capex
  - arpu_start
  - penetration_start_pct
  - penetration_target_pct
  - ramp_months
  - opex_per_sub
  - discount_rate_pct

Item.name → project_name
Item.id → project_id`
              },
              ].map(fn => (
                <div key={fn.name} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-mono text-sm font-semibold">{fn.name}</h4>
                      <p className="text-xs text-muted-foreground">{fn.path}</p>
                    </div>
                    <Badge variant="outline">Deno</Badge>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <strong>Env Vars:</strong> {fn.envVars.join(', ')}
                    </div>
                    <div>
                      <strong>Request Schema:</strong>
                      <pre className="mt-1 bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-x-auto">
                        {JSON.stringify(fn.request, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <strong>Response Schema:</strong>
                      <pre className="mt-1 bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-x-auto">
                        {JSON.stringify(fn.response, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <strong>S3 Action:</strong> {fn.s3Action}
                    </div>
                    <div>
                      <strong>Error Behavior:</strong> {fn.errorBehavior}
                    </div>
                    {fn.calculation && (
                      <div>
                        <strong>Calculation Logic:</strong>
                        <pre className="mt-1 bg-slate-900 text-emerald-400 p-3 rounded overflow-x-auto whitespace-pre text-[10px]">
                          {fn.calculation}
                        </pre>
                      </div>
                    )}
                    {fn.columnMapping && (
                      <div>
                        <strong>Column Mapping:</strong>
                        <pre className="mt-1 bg-slate-900 text-emerald-400 p-3 rounded overflow-x-auto whitespace-pre text-[10px]">
                          {fn.columnMapping}
                        </pre>
                      </div>
                    )}
                    {fn.csvSchema && (
                      <div>
                        <strong>CSV Output Schema:</strong>
                        <pre className="mt-1 bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto whitespace-pre text-[10px]">
                          {fn.csvSchema}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CALCULATIONS EXPLAINER */}
        <TabsContent value="calculations">
          <Card>
            <CardHeader>
              <CardTitle>Financial Calculations & Data Sources</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Complete explanation of every metric, formula, inputs, and data lineage for the Projects & Pipeline tool.
              </p>
            </CardHeader>
            <CardContent className="space-y-8">
              
              {/* CAPEX CONTRACT & INPUT MODEL */}
              <div className="border-l-4 border-red-500 pl-4 bg-red-50/50 dark:bg-red-950/20">
                <h3 className="text-lg font-semibold mb-3">CAPEX Contract & Input Model (AUTHORITATIVE)</h3>
                
                <div className="space-y-4">
                  <div className="bg-red-100 dark:bg-red-900 p-3 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2">🔒 Authoritative Inputs & Derived Values:</h4>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong className="text-red-800 dark:text-red-200">Primary Inputs (user-controlled):</strong>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                          <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">passings</code> - Number of homes/premises passed by build (required)</li>
                          <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">capex_per_passing</code> - Cost per passing in dollars (default: $1,200)</li>
                          <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">total_capex</code> - Total project CAPEX (optional override)</li>
                        </ul>
                      </div>
                      <div>
                        <strong className="text-red-800 dark:text-red-200">Derivation Rule (Total CAPEX Book):</strong>
                        <pre className="bg-slate-900 text-emerald-400 p-2 rounded mt-1 text-xs">
{`total_capex_book = total_capex || (passings × capex_per_passing)

Precedence:
1. If user explicitly enters total_capex → use that value
2. Otherwise → compute as passings × capex_per_passing`}
                        </pre>
                      </div>
                      <div>
                        <strong className="text-red-800 dark:text-red-200">UI Coupling Behavior:</strong>
                        <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
                          <li>Total Capex field <strong>displays</strong> effective value (total_capex || passings × capex_per_passing)</li>
                          <li>Changing CapEx per Passing → auto-recalculates displayed Total Capex (if user hasn't typed override)</li>
                          <li>User typing directly into Total Capex → stores override, decouples from per-passing</li>
                          <li>Clearing Total Capex field → reverts to computed value (passings × capex_per_passing)</li>
                        </ul>
                      </div>
                      <div>
                        <strong className="text-red-800 dark:text-red-200">Critical: Same Value Across All Surfaces</strong>
                        <p className="text-muted-foreground mt-1">
                          The <code className="bg-slate-800 text-emerald-400 px-1 rounded">total_capex_book</code> value computed above is used <strong>identically</strong> in:
                        </p>
                        <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
                          <li>Instant Results panel (client-side calculateFinancials)</li>
                          <li>Saved Scenarios cards (from backend runProjectModel metrics)</li>
                          <li>Economics tab in Project Detail Drawer</li>
                          <li>All IRR/NPV/MOIC calculations (as monthly CAPEX schedule and initial investment)</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">Actual Cash Invested (with EBITDA Reinvestment):</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs whitespace-pre">
{`actual_cash_invested = peak_external_cash

where peak_external_cash is computed month-by-month:
  
  cumulative_external_cash[0] = 0
  for month t = 1 to analysis_months:
    capex_book[t] = total_capex_book / build_months (if t <= build_months), else 0
    ebitda[t] = revenue[t] - opex[t]
    
    if ebitda[t] < 0:
      external_cash[t] = capex_book[t] - ebitda[t]  // need to cover both capex and operating losses
    else:
      external_cash[t] = max(0, capex_book[t] - ebitda[t])  // reinvest EBITDA into CAPEX
    
    cumulative_external_cash[t] = cumulative_external_cash[t-1] + external_cash[t]
  
  actual_cash_invested = max(cumulative_external_cash[1..T])`}
                    </pre>
                    <p className="text-xs text-muted-foreground mt-2">
                      This is the <strong>peak</strong> external cash required over the build period. If EBITDA generates $294,766 during build, and total_capex_book is $900,000, then actual_cash_invested = $605,234.
                    </p>
                  </div>
                </div>
              </div>

              {/* CASHFLOW VECTOR FOR IRR/NPV/MOIC */}
              <div className="border-l-4 border-purple-500 pl-4 bg-purple-50/50 dark:bg-purple-950/20">
                <h3 className="text-lg font-semibold mb-3">Cashflow Vector Construction (IRR/NPV/MOIC)</h3>
                
                <div className="space-y-4">
                  <div className="bg-purple-100 dark:bg-purple-900 p-3 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2">🔒 Single Cashflow Series (CF) - Used for ALL Three Metrics:</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded mt-2 text-xs whitespace-pre">
{`CF[0] = -actual_cash_invested

CF[t] for t ≥ 1 = FCF[t]
  where FCF[t] = EBITDA[t] - CAPEX_book[t]
  
  EBITDA[t] = Revenue[t] - OpEx[t]
  Revenue[t] = subscribers[t] × arpu_start
  OpEx[t] = subscribers[t] × opex_per_sub
  CAPEX_book[t] = total_capex_book / build_months (if t <= build_months), else 0

Example for Denver scenario (passings=750, build=36mo, total_capex_book=$900k):
  CF[0] = -$605,234 (actual cash invested, after reinvestment)
  CF[1] = EBITDA[1] - $25,000
  CF[2] = EBITDA[2] - $25,000
  ...
  CF[36] = EBITDA[36] - $25,000
  CF[37] = EBITDA[37] - $0 (build complete, no more book capex)
  ...
  CF[120] = EBITDA[120] - $0`}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">NPV Formula (using CF vector):</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs">
{`NPV = CF[0] + Σ(CF[t] / (1 + monthly_rate)^t) for t=1..analysis_months

    = -actual_cash_invested + Σ(FCF[t] / (1 + r/12)^t)
    
where r = discount_rate_pct / 100`}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">IRR Formula (using CF vector):</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs whitespace-pre">
{`Solve for monthly_rate where: NPV(monthly_rate) = 0

CF[0] + Σ(CF[t] / (1 + monthly_rate)^t) = 0

Then: IRR_annual = monthly_rate × 12 × 100%

Implementation: Newton-Raphson on monthly CF series
  Initial guess: monthly_rate = 0.10
  Iterate 20 times:
    npv = -actual_cash_invested + Σ(FCF[t] / (1 + r)^t)
    derivative = -Σ(t × FCF[t] / (1 + r)^(t+1))
    r_next = r - (npv / derivative)
  
  Convergence check: |npv| < $0.01 → converged
  
  Edge cases (IRR = "Not defined"):
    • actual_cash_invested <= 0 → "No external investment required"
    • No positive FCF over horizon → "Project never generates positive free cashflow"
    • |r| > 10 (1000%/mo) → "Project never clears cost of capital"
    • Derivative ≈ 0 → "IRR solver failed — derivative too small"
    • 20 iterations without convergence → "IRR solver failed to converge"`}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">MOIC Formula (using CF vector):</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs">
{`MOIC = Σ(max(0, CF[t])) / actual_cash_invested  for t=1..analysis_months

    = Σ(max(0, FCF[t])) / actual_cash_invested

Edge cases (MOIC = "Not defined"):
  • actual_cash_invested <= 0 → "No external investment required"
  • Σ(max(0, FCF[t])) = 0 → "No positive cashflows over modeled horizon"`}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">Critical Consistency Check:</h4>
                    <div className="bg-amber-50 dark:bg-amber-900 p-3 rounded text-xs">
                      <p className="font-semibold mb-2">All three metrics (NPV, IRR, MOIC) use the SAME:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">CF[0] = -actual_cash_invested</code></li>
                        <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">CF[t] = FCF[t] = EBITDA[t] - CAPEX_book[t]</code> for t ≥ 1</li>
                        <li>Same subscriber ramp (buildProgress × penetration)</li>
                        <li>Same revenue/opex formulas</li>
                        <li>Same discount rate (for NPV only)</li>
                      </ul>
                      <p className="mt-2 font-semibold">
                        This contract is enforced in <code className="bg-slate-800 text-emerald-400 px-1 rounded">calculateFinancials()</code> (client) and <code className="bg-slate-800 text-emerald-400 px-1 rounded">runProjectModel()</code> (backend).
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">State Variable Wiring:</h4>
                    <div className="text-xs space-y-2">
                      <p className="font-semibold">The field that drives IRR "Not defined — Total CAPEX = $X" is:</p>
                      <pre className="bg-slate-900 text-emerald-400 p-2 rounded mt-1">
{`Location: components/projects/ScenarioModelDrawer.jsx

Computed as:
  effectiveTotalCapex = Number(inputs.total_capex) || (Number(inputs.passings) * inputs.capex_per_passing)

Used in:
  1. calculateFinancials({ total_capex: effectiveTotalCapex, ... })
  2. Validation message display
  3. Edge case guardrail in calculateFinancials()

When set/updated:
  • On drawer open → inputs.total_capex = '' (empty string, so uses computed value)
  • User types in "Total Capex ($)" field → inputs.total_capex = <user value>
  • User loads scenario → inputs.total_capex = scenario.inputs.total_capex
  • User changes passings/capex_per_passing → effectiveTotalCapex recalculates
  
Edge case handling in calculateFinancials():
  if (total_capex_book <= 0) {
    return IRR/MOIC = null with reason: "Total CAPEX must be greater than zero"
  }`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              {/* NPV */}
              <div className="border-l-4 border-green-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">NPV (Net Present Value)</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Formula (Plain Language):</h4>
                    <p className="text-sm text-muted-foreground">
                      Present value of all future free cashflows minus the actual cash invested (with EBITDA reinvestment). NPV uses CF[0] = -actual_cash_invested, then discounts monthly FCF back to present.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Mathematical Expression:</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs whitespace-pre">
{`NPV = -actual_cash_invested + Σ(FCF[t] / (1 + r/12)^t)  for t=1..analysis_months

where:
  r = discount_rate_pct / 100
  FCF[t] = EBITDA[t] - CAPEX_book[t]
  EBITDA[t] = Revenue[t] - OpEx[t]
  Revenue[t] = subscribers[t] × arpu_start
  OpEx[t] = subscribers[t] × opex_per_sub
  CAPEX_book[t] = total_capex_book / build_months (if t <= build_months), else 0
  actual_cash_invested = peak_external_cash (see CAPEX Contract above)`}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Data Sources:</h4>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong>Frontend Inputs:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="font-mono">discount_rate_pct</Badge>
                          <Badge variant="outline" className="font-mono">analysis_months</Badge>
                          <Badge variant="outline" className="font-mono">passings</Badge>
                          <Badge variant="outline" className="font-mono">build_months</Badge>
                          <Badge variant="outline" className="font-mono">arpu_start</Badge>
                          <Badge variant="outline" className="font-mono">opex_per_sub</Badge>
                          <Badge variant="outline" className="font-mono">capex_per_passing</Badge>
                          <Badge variant="outline" className="font-mono">penetration_start_pct</Badge>
                          <Badge variant="outline" className="font-mono">penetration_target_pct</Badge>
                          <Badge variant="outline" className="font-mono">ramp_months</Badge>
                        </div>
                      </div>
                      <div>
                        <strong>Backend Calculation:</strong>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Calculated in-memory from model run (functions/runProjectModel.js)
                        </div>
                      </div>
                      <div>
                        <strong>S3 Output:</strong>
                        <div className="font-mono text-[10px] bg-slate-50 dark:bg-slate-900 p-2 rounded mt-1">
                          raw/projects_pipeline/model_outputs/{'<project_id>/<scenario_id>/<run_id>'}/economics_monthly.csv
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Coloring Logic:</h4>
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-600"></div>
                        <span className="text-muted-foreground">Green when NPV {'>'} 0 (project creates value)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-600"></div>
                        <span className="text-muted-foreground">Red when NPV {'<'} 0 (project destroys value)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
                        <span className="text-muted-foreground">Yellow for borderline cases (near zero)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Notes:</h4>
                    <p className="text-xs text-muted-foreground">
                      NPV can be negative even if IRR is positive if the discount rate is too high relative to returns. This means the project's return doesn't meet the hurdle rate even though it generates positive returns.
                    </p>
                  </div>
                </div>
              </div>

              {/* IRR */}
              <div className="border-l-4 border-purple-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">IRR (Internal Rate of Return)</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Formula (Plain Language):</h4>
                    <p className="text-sm text-muted-foreground">
                      The annualized monthly rate at which NPV equals zero. Calculated using Newton-Raphson on the cashflow series CF[0] = -actual_cash_invested, CF[t] = FCF[t]. Returns IRR as annual percentage.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Mathematical Expression:</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs whitespace-pre">
{`Solve for r_monthly where: NPV(r_monthly) = 0

-actual_cash_invested + Σ(FCF[t] / (1 + r_monthly)^t) = 0  for t=1..analysis_months

Then: IRR_annual = r_monthly × 12 × 100%

Implementation: Newton-Raphson (20 iterations, initial guess r=0.10)
  npvAtRate = -actual_cash_invested + Σ(FCF[t] / (1 + r)^t)
  derivative = -Σ(t × FCF[t] / (1 + r)^(t+1))
  r_next = r - (npvAtRate / derivative)
  
  Convergence: |npvAtRate| < $0.01`}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Data Sources:</h4>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong>Frontend Inputs:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="font-mono">passings</Badge>
                          <Badge variant="outline" className="font-mono">build_months</Badge>
                          <Badge variant="outline" className="font-mono">arpu_start</Badge>
                          <Badge variant="outline" className="font-mono">opex_per_sub</Badge>
                          <Badge variant="outline" className="font-mono">capex_per_passing</Badge>
                          <Badge variant="outline" className="font-mono">penetration_start_pct</Badge>
                          <Badge variant="outline" className="font-mono">penetration_target_pct</Badge>
                          <Badge variant="outline" className="font-mono">ramp_months</Badge>
                          <Badge variant="outline" className="font-mono">analysis_months</Badge>
                        </div>
                      </div>
                      <div>
                        <strong>Backend Calculation:</strong>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Calculated in-memory via Newton-Raphson (functions/runProjectModel.js, lines 298-309)
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Coloring Logic:</h4>
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-600"></div>
                        <span className="text-muted-foreground">Green when IRR {'>='} 15%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
                        <span className="text-muted-foreground">Yellow when 0% {'<'} IRR {'<'} 15%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-600"></div>
                        <span className="text-muted-foreground">Red when IRR {'<='} 0%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Edge Cases & "Not Defined" Conditions:</h4>
                    <div className="text-xs text-muted-foreground space-y-2">
                      <p className="font-semibold">IRR shows "Not defined" with reason when:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><strong>actual_cash_invested ≤ 0</strong> → "No external investment required"</li>
                        <li><strong>No positive FCF over horizon</strong> → "Project never generates positive free cashflow over modeled horizon"</li>
                        <li><strong>|r| {'>'} 10 during iteration</strong> → "Project never clears cost of capital with these assumptions"</li>
                        <li><strong>|derivative| {'<'} 1e-10</strong> → "IRR solver failed — derivative too small"</li>
                        <li><strong>20 iterations without |npv| {'<'} $0.01</strong> → "IRR solver failed to converge"</li>
                      </ul>
                      <p className="mt-2 font-semibold">Displayed as:</p>
                      <pre className="bg-slate-800 text-slate-100 p-2 rounded mt-1">
{`IRR: Not defined
Project never clears cost of capital with these assumptions`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              {/* MOIC */}
              <div className="border-l-4 border-amber-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">MOIC (Multiple on Invested Capital)</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Formula (Plain Language):</h4>
                    <p className="text-sm text-muted-foreground">
                      Total positive cash returned divided by actual cash invested (with EBITDA reinvestment). A MOIC of 2.46x means you get $2.46 back for every $1 of external cash invested.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Mathematical Expression:</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs">
MOIC = Σ(max(0, FCF[t])) / actual_cash_invested  for t=1..analysis_months
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Edge Cases & "Not Defined" Conditions:</h4>
                    <div className="text-xs text-muted-foreground space-y-2">
                      <p className="font-semibold">MOIC shows "Not defined" with reason when:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><strong>actual_cash_invested ≤ 0</strong> → "No external investment required"</li>
                        <li><strong>Σ(max(0, FCF[t])) = 0</strong> → "No positive cashflows over modeled horizon"</li>
                      </ul>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Data Sources:</h4>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong>Frontend Inputs:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="font-mono">passings</Badge>
                          <Badge variant="outline" className="font-mono">capex_per_passing</Badge>
                          <Badge variant="outline" className="font-mono">build_months</Badge>
                          <Badge variant="outline" className="font-mono">arpu_start</Badge>
                          <Badge variant="outline" className="font-mono">opex_per_sub</Badge>
                          <Badge variant="outline" className="font-mono">penetration_start_pct</Badge>
                          <Badge variant="outline" className="font-mono">penetration_target_pct</Badge>
                          <Badge variant="outline" className="font-mono">ramp_months</Badge>
                          <Badge variant="outline" className="font-mono">analysis_months</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Coloring Logic:</h4>
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-600"></div>
                        <span className="text-muted-foreground">Green when MOIC {'>='} 2.0x</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
                        <span className="text-muted-foreground">Yellow when 1.0x {'<'} MOIC {'<'} 2.0x</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-600"></div>
                        <span className="text-muted-foreground">Red when MOIC {'<='} 1.0x (losing money)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Notes:</h4>
                    <p className="text-xs text-muted-foreground">
                      MOIC ignores timing (unlike NPV/IRR). High MOIC + low IRR means cashflows take long to materialize. Example: Denver with MOIC 2.46x but IRR "Not defined" means positive returns eventually, but timing/magnitude don't clear the cost of capital hurdle.
                    </p>
                  </div>
                </div>
              </div>

              {/* Peak Subscribers */}
              <div className="border-l-4 border-cyan-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">Peak Subscribers</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Formula (Plain Language):</h4>
                    <p className="text-sm text-muted-foreground">
                      Maximum number of subscribers reached during the analysis period. Subscribers grow as the network is built (build_months) and as penetration ramps from start to target level (ramp_months). Calculated monthly as: subscribers[t] = passings × buildProgress[t] × penetration[t].
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Mathematical Expression:</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs whitespace-pre">
{`subscribers[t] = passings × buildProgress[t] × penetration[t]

where:
  buildProgress[t] = min(t / build_months, 1)
  penetration[t] = penetration_start + (penetration_target - penetration_start) × rampProgress[t]
  rampProgress[t] = min(max(t - build_months, 0) / ramp_months, 1)`}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Data Sources:</h4>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong>Frontend Inputs:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="font-mono">passings</Badge>
                          <Badge variant="outline" className="font-mono">build_months</Badge>
                          <Badge variant="outline" className="font-mono">penetration_start_pct</Badge>
                          <Badge variant="outline" className="font-mono">penetration_target_pct</Badge>
                          <Badge variant="outline" className="font-mono">ramp_months</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Notes:</h4>
                    <p className="text-xs text-muted-foreground">
                      Subscribers begin growing once the network starts being built, and continue ramping up for ramp_months after build completes. Example: If build_months = 18 and ramp_months = 36, subscribers reach maximum at month 54 (18 + 36).
                    </p>
                  </div>
                </div>
              </div>

              {/* Peak EBITDA */}
              <div className="border-l-4 border-indigo-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">Peak Monthly EBITDA</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Formula (Plain Language):</h4>
                    <p className="text-sm text-muted-foreground">
                      Maximum monthly EBITDA (Earnings Before Interest, Tax, Depreciation, and Amortization) reached during the analysis period. EBITDA = Revenue - OpEx, where Revenue = subscribers × ARPU and OpEx = subscribers × opex_per_sub.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Mathematical Expression:</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs whitespace-pre">
{`EBITDA[t] = Revenue[t] - OpEx[t]

where:
  Revenue[t] = subscribers[t] × arpu_start
  OpEx[t] = subscribers[t] × opex_per_sub`}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Data Sources:</h4>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong>Frontend Inputs:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="font-mono">passings</Badge>
                          <Badge variant="outline" className="font-mono">build_months</Badge>
                          <Badge variant="outline" className="font-mono">arpu_start</Badge>
                          <Badge variant="outline" className="font-mono">opex_per_sub</Badge>
                          <Badge variant="outline" className="font-mono">penetration_start_pct</Badge>
                          <Badge variant="outline" className="font-mono">penetration_target_pct</Badge>
                          <Badge variant="outline" className="font-mono">ramp_months</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Coloring Logic:</h4>
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-600"></div>
                        <span className="text-muted-foreground">Green when peak EBITDA {'>'} 0 (operating profit)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-600"></div>
                        <span className="text-muted-foreground">Red when peak EBITDA {'<'} 0 (operating loss)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Notes:</h4>
                    <p className="text-xs text-muted-foreground">
                      Peak EBITDA typically occurs when subscriber count and penetration are at their maximum. This represents the best operational performance the project achieves during the analysis period.
                    </p>
                  </div>
                </div>
              </div>

              {/* Financial Policy & Edge Cases */}
              <div className="border-l-4 border-slate-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">Financial Policy & Edge-Case Handling (Mac Mountain Standard)</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Configurable Thresholds (financePolicy):</h4>
                    <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded text-xs font-mono space-y-1">
                      <div>• irrGreenThresholdPct = 15%</div>
                      <div>• irrYellowThresholdPct = 0%</div>
                      <div>• moicGreenThreshold = 2.0x</div>
                      <div>• moicYellowThreshold = 1.0x</div>
                      <div>• npvGreenFloor = 0</div>
                      <div>• npvYellowBandRatio = 0.05 (±5% of initial investment)</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">IRR Edge Cases:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
                      <li>Computed on monthly FCF via Newton–Raphson, annualized as <code className="bg-slate-800 text-emerald-400 px-1 rounded">r_monthly × 12 × 100%</code></li>
                      <li>If <strong>Initial Investment ≤ 0</strong> → IRR is <strong>"Not defined (no investment)"</strong>, no color</li>
                      <li>If FCF has no positive leg or the solver does not converge → IRR is <strong>"IRR did not converge"</strong>, no color</li>
                      <li>Otherwise colored using <code>financePolicy.irr*</code> thresholds</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">MOIC Edge Cases:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
                      <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">MOIC = Σ(max(0, FCF[t])) / Initial_Investment</code></li>
                      <li>If <strong>Initial Investment ≤ 0</strong> → MOIC is <strong>"Not defined (no investment)"</strong>, no color</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">NPV Coloring:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
                      <li><code className="bg-slate-800 text-emerald-400 px-1 rounded">NPV = Σ(FCF[t] / (1 + r/12)^t) − Initial_Investment</code> with <code>r = discount_rate_pct / 100</code></li>
                      <li>Colored using <code>financePolicy</code>:
                        <ul className="pl-5 mt-1 space-y-1">
                          <li>Red if <code>NPV {'<'} −bandWidth</code> where <code>bandWidth = |Initial_Investment| × npvYellowBandRatio</code></li>
                          <li>Yellow if <code>|NPV| ≤ bandWidth</code></li>
                          <li>Green if <code>NPV {'>'} bandWidth</code></li>
                        </ul>
                      </li>
                      <li><strong>Negative NPV is never colored green</strong></li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-2">Client vs Backend Consistency:</h4>
                    <p className="text-xs text-muted-foreground">
                      Client-side <code className="bg-slate-800 text-emerald-400 px-1 rounded">calculateFinancials()</code> and backend <code className="bg-slate-800 text-emerald-400 px-1 rounded">runProjectModel</code> both use the <strong>same</strong> formulas and <code>financePolicy</code> for NPV, IRR, MOIC to keep instant previews consistent with persisted runs.
                    </p>
                  </div>
                </div>
              </div>

              {/* Scenario Naming */}
              <div className="border-l-4 border-teal-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">Scenario Naming (Projects & Pipeline)</h3>
                
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    Each project may have multiple scenarios, all persisted in <code className="font-mono text-xs">scenarios.json</code>.
                  </p>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Naming Rules:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
                      <li>If user provides a name → use it as-is (trimmed)</li>
                      <li>If no name is provided → default to <code className="bg-slate-800 text-emerald-400 px-1 rounded">"{'<project_name>'} — Scenario N"</code> for that project, where N is the next sequence number</li>
                      <li>Saved Scenarios never show "Unnamed Scenario" or raw IDs</li>
                      <li>Legacy scenarios without a stored name are displayed as <code className="bg-slate-800 text-emerald-400 px-1 rounded">"{'<project_name>'} — Scenario (legacy)"</code> until renamed by the user</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* FCF */}
              <div className="border-l-4 border-rose-500 pl-4">
                <h3 className="text-lg font-semibold mb-3">Monthly Free Cash Flow (FCF)</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Formula (Plain Language):</h4>
                    <p className="text-sm text-muted-foreground">
                      Net cash generated or consumed each month. FCF = EBITDA - CapEx. During build months, CapEx is Initial_Investment / build_months. After build completion, CapEx = 0.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Mathematical Expression:</h4>
                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs whitespace-pre">
{`FCF[t] = EBITDA[t] - CapEx[t]

where:
  CapEx[t] = Initial_Investment / build_months (if t <= build_months)
  CapEx[t] = 0 (if t > build_months)`}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Data Sources:</h4>
                    <div className="text-xs space-y-2">
                      <div>
                        <strong>Frontend Inputs:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="font-mono">passings</Badge>
                          <Badge variant="outline" className="font-mono">capex_per_passing</Badge>
                          <Badge variant="outline" className="font-mono">build_months</Badge>
                          <Badge variant="outline" className="font-mono">arpu_start</Badge>
                          <Badge variant="outline" className="font-mono">opex_per_sub</Badge>
                          <Badge variant="outline" className="font-mono">penetration_start_pct</Badge>
                          <Badge variant="outline" className="font-mono">penetration_target_pct</Badge>
                          <Badge variant="outline" className="font-mono">ramp_months</Badge>
                        </div>
                      </div>
                      <div>
                        <strong>S3 Output:</strong>
                        <div className="font-mono text-[10px] bg-slate-50 dark:bg-slate-900 p-2 rounded mt-1">
                          raw/projects_pipeline/model_outputs/{'<project_id>/<scenario_id>/<run_id>'}/economics_monthly.csv
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Notes:</h4>
                    <p className="text-xs text-muted-foreground">
                      FCF is typically negative during build phase due to high CapEx, then turns positive as revenue scales. The cumulative FCF crossing zero represents the "payback period" - when the project has recovered its initial investment.
                    </p>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        {/* A5 + A6: S3 & SCHEMAS */}
        <TabsContent value="s3-schema">
          <Card>
            <CardHeader>
              <CardTitle>S3 Contracts & Output Schemas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">AWS Configuration</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg font-mono text-sm">
                  <div><strong>Region:</strong> us-east-2</div>
                  <div><strong>Bucket:</strong> gwi-raw-us-east-2-pc</div>
                  <div><strong>Athena Database:</strong> curated_core (primary), curated_vetro (GIS), curated_sage (finance)</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">S3 Prefix Structure</h3>
                <div className="space-y-3 text-sm">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Project Input Change-Files</h4>
                    <div className="font-mono text-xs space-y-1">
                      <div><strong>Prefix:</strong> raw/projects_pipeline/input/</div>
                      <div><strong>Real Projects:</strong> projects_input__YYYYMMDD_HHMMSS.csv</div>
                      <div><strong>Test Projects:</strong> test_projects_input__YYYYMMDD_HHMMSS.csv</div>
                      <div className="mt-2"><strong>Example:</strong> raw/projects_pipeline/input/projects_input__20260103_143025.csv</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Scenario Model Outputs</h4>
                    <div className="font-mono text-xs space-y-1">
                      <div><strong>Prefix:</strong> raw/projects_pipeline/model_outputs/{'<project_id>/<scenario_id>/<run_id>/'}</div>
                      <div className="mt-2"><strong>Required Files:</strong></div>
                      <div className="pl-4">• inputs.json - Full input parameters + metadata</div>
                      <div className="pl-4">• summary_metrics.csv - Key financial metrics (NPV, IRR, MOIC, etc)</div>
                      <div className="pl-4">• economics_monthly.csv - 120-month cashflow projection</div>
                      <div className="mt-2"><strong>Example:</strong></div>
                      <div className="pl-4">raw/projects_pipeline/model_outputs/</div>
                      <div className="pl-8">abc-123-def-456/</div>
                      <div className="pl-12">scenario_1704312000000/</div>
                      <div className="pl-16">run_1704312123456/</div>
                      <div className="pl-20">inputs.json</div>
                      <div className="pl-20">summary_metrics.csv</div>
                      <div className="pl-20">economics_monthly.csv</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">GIS Network Map Data (NEW - v2.1.0)</h4>
                    <div className="font-mono text-xs space-y-1">
                      <div><strong>Source:</strong> curated_vetro.service_locations (Athena)</div>
                      <div><strong>Features:</strong> Point geometries (lat/long) for service locations</div>
                      <div><strong>Key Fields:</strong> plan_id, service_location_id, city, state, class, broadband_status, network_status, bsl_id</div>
                      <div><strong>Data Availability:</strong> Varies by plan export - limitations surfaced to user</div>
                      <div><strong>Search:</strong> Plain language → SQL filters (e.g., "underserved" → broadband_status != 'Served')</div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Scenario Registry (Implemented v1.2.0)</h4>
                    <div className="font-mono text-xs space-y-1">
                      <div><strong>Key:</strong> raw/projects_pipeline/model_outputs/{'<project_id>/'}<span className="text-amber-600 font-bold">scenarios.json</span></div>
                      <div className="mt-2"><strong>Purpose:</strong> Durable storage of all scenarios for a project</div>
                      <div className="mt-2"><strong>Schema:</strong></div>
                      <pre className="mt-1 bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto text-xs">
{`{
  "project_id": "abc-123-def-456",
  "scenarios": [
    {
      "scenario_id": "scenario_1704312000000",
      "scenario_name": "Base Case",
      "created_at": "2026-01-03T14:30:00Z",
      "updated_at": "2026-01-03T15:45:00Z",
      "is_test": false,
      "inputs": {
        "passings": 10000,
        "build_months": 18,
        "arpu_start": 63,
        "penetration_start_pct": 0.10,
        "penetration_target_pct": 0.40,
        "ramp_months": 36,
        "capex_per_passing": 1200,
        "opex_per_sub": 25,
        "discount_rate_pct": 10,
        "analysis_months": 120
      },
      "last_run_id": "run_1704312123456"
    }
  ]
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Output File Schemas (Exact)</h3>
                <div className="space-y-3">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">projects_input CSV Header</h4>
                    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
project_id,entity,project_name,project_type,state,partner_share_raw,investor_label,stage,priority,owner,notes,is_test
                    </pre>
                    <p className="text-xs text-muted-foreground mt-2">12 columns, comma-separated, with proper CSV escaping for values containing commas/quotes</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">inputs.json</h4>
                    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
{`{
  "project_id": "abc-123-def-456",
  "scenario_id": "scenario_1704312000000",
  "scenario_name": "Base Case",
  "run_id": "run_1704312123456",
  "created_at": "2026-01-03T14:30:25Z",
  "inputs": {
    "passings": 10000,
    "build_months": 18,
    "arpu_start": 63,
    "penetration_start_pct": 0.10,
    "penetration_target_pct": 0.40,
    "ramp_months": 36,
    "capex_per_passing": 1200,
    "opex_per_sub": 25,
    "discount_rate_pct": 10,
    "analysis_months": 120
  },
  "defaults_used": {
    "arpu_start": 63,
    "penetration_start_pct": 0.10,
    "penetration_target_pct": 0.40,
    "ramp_months": 36,
    "capex_per_passing": 1200,
    "opex_per_sub": 25,
    "discount_rate_pct": 10,
    "analysis_months": 120
  }
}`}
                    </pre>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">summary_metrics.csv</h4>
                    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
{`metric,value
initial_investment,12000000
npv,4523891
irr,0.1543
moic,2.37
peak_subscribers,4000
peak_monthly_ebitda,152000
payback_months,48`}
                    </pre>
                    <p className="text-xs text-muted-foreground mt-2">Two columns: metric, value. At minimum must include: initial_investment, npv, irr, moic</p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-2">economics_monthly.csv</h4>
                    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
{`date,month_number,subscribers,penetration_pct,arpu,revenue,opex,ebitda,capex,fcf,cum_cashflow,pv
2026-01-01,1,55,0.55,63.0,3465.0,1375.0,2090.0,666666.67,-664576.67,-12664576.67,234.56
2026-02-01,2,111,1.11,63.0,6993.0,2775.0,4218.0,666666.67,-662448.67,-13327025.34,467.89
...`}
                    </pre>
                    <p className="text-xs text-muted-foreground mt-2">Must include: date, month_number, subscribers, penetration_pct, revenue, ebitda, fcf. Analysis runs for analysis_months (default 120).</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* A7: QA TESTS */}
        <TabsContent value="qa">
          
          {/* Live Audit Results */}
          {auditResults && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Automated Test Results ({auditResults.audit_log.summary.total} tests)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {auditResults.audit_log.tests.map((test, idx) => (
                    <div key={idx} className={`border rounded-lg p-3 ${
                      test.status === 'PASS' ? 'bg-green-50 dark:bg-green-950 border-green-300' :
                      test.status === 'FAIL' ? 'bg-red-50 dark:bg-red-950 border-red-300' :
                      test.status === 'BLOCKED' ? 'bg-orange-50 dark:bg-orange-950 border-orange-300' :
                      'bg-yellow-50 dark:bg-yellow-950 border-yellow-300'
                    }`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {test.status === 'PASS' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                          {test.status === 'FAIL' && <XCircle className="w-4 h-4 text-red-600" />}
                          {test.status === 'BLOCKED' && <AlertTriangle className="w-4 h-4 text-orange-600" />}
                          {test.status === 'WARN' && <AlertCircle className="w-4 h-4 text-yellow-600" />}
                          <span className="font-mono text-xs font-semibold">{test.test_id}</span>
                          <Badge variant="outline" className="text-xs">{test.page}</Badge>
                        </div>
                        <Badge className={
                          test.status === 'PASS' ? 'bg-green-600 text-white' :
                          test.status === 'FAIL' ? 'bg-red-600 text-white' :
                          test.status === 'BLOCKED' ? 'bg-orange-600 text-white' :
                          'bg-yellow-600 text-white'
                        }>{test.status}</Badge>
                      </div>
                      <div className="text-sm font-semibold mb-1">{test.feature}</div>
                      <div className="text-xs text-muted-foreground mb-2">{test.ui_path}</div>
                      {test.error && (
                        <div className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 p-2 rounded mb-2">
                          <strong>Error:</strong> {test.error}
                        </div>
                      )}
                      {test.note && (
                        <div className="text-xs bg-slate-100 dark:bg-slate-900 p-2 rounded mb-2">
                          <strong>Note:</strong> {test.note}
                        </div>
                      )}
                      {test.evidence && (
                        <details className="text-xs">
                          <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">Evidence</summary>
                          <pre className="bg-slate-900 text-slate-100 p-2 rounded mt-1 overflow-x-auto text-[10px]">
                            {JSON.stringify(test.evidence, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Automated Proof Pack Runner */}
          <ProofPackRunner onComplete={(report) => console.log('Proof pack completed:', report)} />

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Quality Assurance Test Checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Test Suite: Project Creation
                  </h3>
                  <div className="space-y-2 text-sm pl-7">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "New Project" button → NewProjectForm modal opens</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Fill required fields (entity, project_name, project_type, state, stage, priority, owner) → Submit</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Success toast appears</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Prompt "Generate a model now?" appears with Yes/Not Now buttons</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "View Update History" → New CSV file appears in list</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Filename matches pattern: projects_input__YYYYMMDD_HHMMSS.csv</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Download CSV → Verify all fields present and correct</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Test Suite: Scenario Modeling UI
                  </h3>
                  <div className="space-y-2 text-sm pl-7">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "Yes" on post-save prompt → ScenarioModelDrawer opens</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Drawer title shows: "Model Scenarios — [Real Project Name]" (not placeholder)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Enter passings (e.g., 10000) and build_months (e.g., 18)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Instant Results card appears showing NPV, IRR, MOIC</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Values update in real-time as inputs change</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "Advanced Inputs" → Collapsible section expands</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Monthly Preview table shows first 24 months</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Test Suite: Save Scenarios
                  </h3>
                  <div className="space-y-2 text-sm pl-7">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Edit scenario name field → Enter "Base Case"</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "Save Scenario" → Success toast appears</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Switch to "Saved Scenarios" tab → Scenario appears in list</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Scenario shows correct name, created date</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>3 output files listed: inputs.json, summary_metrics.csv, economics_monthly.csv</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Edit inputs → Click "Save as New Scenario" → New scenario created</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Both scenarios now visible in Saved Scenarios list</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Close drawer and reopen → Scenarios persist (loaded from scenarios.json)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Test Suite: Load & Download
                  </h3>
                  <div className="space-y-2 text-sm pl-7">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "Load" on existing scenario → Inputs populate in Scenario Inputs tab</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Scenario name field shows loaded scenario name</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Instant Results recalculate correctly</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click Eye icon on inputs.json → Modal shows JSON content</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click Download icon on summary_metrics.csv → File downloads in Safari</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Downloaded file has correct filename and opens in Excel/Numbers</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Download economics_monthly.csv → 120 rows present (header + 120 months)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Test Suite: Error Handling
                  </h3>
                  <div className="space-y-2 text-sm pl-7">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "Save Scenario" without entering passings → Error toast with clear message</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Enter invalid AWS credentials in backend → 500 error logged to console with full message</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>S3 write fails → Error toast shows backend error message</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Download request fails → Error toast appears, no silent failure</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Test Suite: Economics Tab Integration
                  </h3>
                  <div className="space-y-2 text-sm pl-7">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click existing project row → ProjectDetailDrawer opens</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Switch to "Economics" tab → Shows latest scenario metrics</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>Click "Generate Model" button → ScenarioModelDrawer opens with correct project name</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" />
                      <span>After saving scenario → Close drawer → Economics tab updates with new metrics</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RELEASE LOG */}
        <TabsContent value="release-log">
          <Card>
            <CardHeader>
              <CardTitle>Release Log & Version History</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                App-side versioning system. Every change to MAC Intelligence must append a row here with verification steps.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left p-3 font-semibold">Date (UTC)</th>
                      <th className="text-left p-3 font-semibold">Version</th>
                      <th className="text-left p-3 font-semibold">Summary</th>
                      <th className="text-left p-3 font-semibold">Surfaces Affected</th>
                      <th className="text-left p-3 font-semibold">Files Changed</th>
                      <th className="text-left p-3 font-semibold">AWS Surfaces</th>
                      <th className="text-left p-3 font-semibold">QA Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                   <tr className="border-b border-border hover:bg-secondary/30 bg-red-50 dark:bg-red-950">
                     <td className="p-3 font-mono text-xs">2026-01-30 16:00</td>
                     <td className="p-3"><Badge className="bg-red-600 text-white">v2.2.0</Badge></td>
                     <td className="p-3">
                       <strong>Monday.com → AWS S3 Webhook Integration (Unauthenticated Endpoint)</strong>
                       <div className="text-xs text-muted-foreground mt-1">
                         Added syncMondayToAWS webhook function to sync Monday.com board items to S3 in real-time. Function pulls all board items, maps columns by normalized field names (stable ID-based lookup), calculates financials (NPV/IRR/MOIC with EBITDA reinvestment), and appends to S3 change-files. NO AUTHENTICATION REQUIRED (public webhook endpoint). Handles Monday challenge parameter for webhook verification. Returns challenge as plain text for Monday validation. CSV schema: 21 columns including calculated fields. System of Record: AWS Athena.
                       </div>
                     </td>
                     <td className="p-3 text-xs">
                       <div>• Monday.com Integration (new)</div>
                       <div>• AWS S3 sync pipeline</div>
                       <div>• Projects data source</div>
                     </td>
                     <td className="p-3 text-xs font-mono">
                       <div>• functions/syncMondayToAWS.js (new)</div>
                       <div>• pages/Architecture.jsx</div>
                     </td>
                     <td className="p-3 text-xs">
                       <div>• Monday.com GraphQL API (board items)</div>
                       <div>• S3: raw/projects_pipeline/input/[timestamp]-sync-[epoch].csv</div>
                       <div>• AWS Signature V4 authentication</div>
                     </td>
                     <td className="p-3 text-xs">
                       <div>✓ Challenge verification works</div>
                       <div>✓ Board sync appends to S3</div>
                       <div>✓ Financials calculated</div>
                       <div>✓ No auth required</div>
                       <div>⚠️ Requires platform config for public access</div>
                     </td>
                   </tr>
                   <tr className="border-b border-border hover:bg-secondary/30 bg-purple-50 dark:bg-purple-950">
                     <td className="p-3 font-mono text-xs">2026-01-15 19:00</td>
                     <td className="p-3"><Badge className="bg-purple-600 text-white">v2.1.0</Badge></td>
                     <td className="p-3">
                       <strong>GIS Network Map Module + EBITDA Fail-Soft + Multi-Task Output Rendering</strong>
                       <div className="text-xs text-muted-foreground mt-1">
                         Added Network Map tile to Dashboard with full-screen modal view. Map queries Vetro service locations via new functions (getVetroPlanIndex, getVetroFeaturesForPlan) with plain-language search support (e.g., "northport", "underserved", "commercial"). Data availability panel shows limitations per plan (missing Broadband Status or BSL_ID). EBITDA quick action now fail-soft: when Athena returns 0 rows, displays sample EBITDA + structured data requirements + "Request Data" button (emails patch.cochran@macmtn.com). Multi-task queries (e.g., "Show me MRR and customer count and EBITDA") now render as separate Task 1/2/3 sections with individual tables and per-task CSV exports. Added "Download All Tasks" button for multi-CSV export. All Quick Actions enhanced to show detailed explanations when no data found.
                       </div>
                     </td>
                     <td className="p-3 text-xs">
                       <div>• Dashboard (Network Map tile)</div>
                       <div>• MAC App Engine (EBITDA, multi-task)</div>
                       <div>• GIS Map Modal (new)</div>
                     </td>
                     <td className="p-3 text-xs font-mono">
                       <div>• components/gis/NetworkMapTile.jsx (new)</div>
                       <div>• components/gis/NetworkMapModal.jsx (new)</div>
                       <div>• functions/getVetroPlanIndex.js (new)</div>
                       <div>• functions/getVetroFeaturesForPlan.js (new)</div>
                       <div>• functions/submitDataRequest.js (new)</div>
                       <div>• pages/Dashboard.jsx</div>
                       <div>• pages/MACAppEngine.jsx</div>
                     </td>
                     <td className="p-3 text-xs">
                       <div>• curated_vetro.service_locations (Athena reads)</div>
                       <div>• Lane A: aiLayerQuery for plan index + features</div>
                       <div>• Email integration: patch.cochran@macmtn.com</div>
                     </td>
                     <td className="p-3 text-xs">
                       <div>✓ GIS tile visible on Dashboard</div>
                       <div>✓ Plan dropdown populates</div>
                       <div>✓ EBITDA shows sample when no data</div>
                       <div>✓ Request Data button functional</div>
                       <div>✓ Multi-task breaks out Task 1/2/3</div>
                       <div>✓ Per-task CSV exports work</div>
                       <div>✓ Search supports plain language</div>
                     </td>
                   </tr>
                   <tr className="border-b border-border hover:bg-secondary/30 bg-emerald-50 dark:bg-emerald-950">
                     <td className="p-3 font-mono text-xs">2026-01-06 16:00</td>
                     <td className="p-3"><Badge className="bg-emerald-600 text-white">v2.0.1</Badge></td>
                      <td className="p-3">
                        <strong>Start Dates, Portfolio Timing, Capital Committee Queue</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Added scenario start dates (ISO calendar + month offset). Portfolio now aligns projects on common timeline by start_month_offset before aggregating. Portfolio CF vector: CF[0] = -portfolio_peak_external_cash, CF[t] = portfolio_fcf[t]. Portfolio IRR/NPV/MOIC use same unlevered definitions as single-project. Capital Committee queue UI lists submissions and promotes to official projects. Portfolio discount rate fixed at 10% (future: per-project rates).
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Scenario inputs (start date)</div>
                        <div>• Portfolio Runner (timing)</div>
                        <div>• Capital Committee Queue (new)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• components/projects/ScenarioModelDrawer.jsx</div>
                        <div>• functions/runPortfolioAnalysis.js</div>
                        <div>• components/projects/PortfolioRunner.jsx</div>
                        <div>• components/projects/ProjectSubmissionsQueue.jsx (new)</div>
                        <div>• functions/listProjectSubmissions.js (new)</div>
                        <div>• functions/promoteSubmissionToProject.js (new)</div>
                        <div>• pages/Projects.jsx</div>
                        <div>• pages/Architecture.jsx</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• scenario.inputs: start_date, start_month_offset</div>
                        <div>• portfolio: time-aligned CF vectors</div>
                        <div>• S3: submissions promoted to projects</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Start dates per scenario</div>
                        <div>✓ Portfolio timing aligned</div>
                        <div>✓ Queue promotes submissions</div>
                        <div>✓ Legacy defaults handled</div>
                        <div>⚠️ Portfolio rate fixed 10%</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30 bg-blue-50 dark:bg-blue-950">
                      <td className="p-3 font-mono text-xs">2026-01-06 14:00</td>
                      <td className="p-3"><Badge className="bg-blue-600 text-white">v2.0.0-beta</Badge></td>
                      <td className="p-3">
                        <strong>Pro Forma Rebuild: EBITDA Reinvestment + Portfolio</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Complete rebuild implementing Alex's spec. Two CAPEX numbers: Total CAPEX (book) vs Actual Cash Invested (with EBITDA reinvestment). Portfolio runner with cross-project reinvestment. Governance: Capital Committee controls scenario editing, Sales/BD submit via forms. Stage-based CAPEX views (Signed/Near-Term/Early). IRR/NPV/MOIC now use Actual Cash Invested as CF[0].
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Projects (all tabs)</div>
                        <div>• Portfolio Runner (new)</div>
                        <div>• Submission workflow (new)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• functions/runProjectModel.js</div>
                        <div>• functions/runPortfolioAnalysis.js (new)</div>
                        <div>• functions/submitProjectForReview.js (new)</div>
                        <div>• components/projects/ScenarioModelDrawer.jsx</div>
                        <div>• components/projects/EconomicsTab.jsx</div>
                        <div>• components/projects/PortfolioRunner.jsx (new)</div>
                        <div>• components/projects/StageBasedCapexView.jsx (new)</div>
                        <div>• components/projects/CapitalCommitteeCheck.jsx (new)</div>
                        <div>• components/projects/ProjectSubmissionForm.jsx (new)</div>
                        <div>• pages/Projects.jsx</div>
                        <div>• pages/Architecture.jsx</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• S3: raw/projects_pipeline/submissions/ (new)</div>
                        <div>• S3: economics_monthly.csv schema updated</div>
                        <div>• S3: summary_metrics.csv schema updated</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Two CAPEX numbers show</div>
                        <div>✓ Reinvestment logic works</div>
                        <div>✓ Portfolio aggregates</div>
                        <div>✓ Permissions enforced</div>
                        <div>✓ Submission form functional</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30 bg-green-50 dark:bg-green-950">
                      <td className="p-3 font-mono text-xs">2026-01-05 12:00</td>
                      <td className="p-3"><Badge className="bg-green-600 text-white">v1.4.1</Badge></td>
                      <td className="p-3">
                        <strong>Financial Policy Standardization + Scenario Naming Fix</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Implemented Mac Mountain financial standards with configurable thresholds (IRR 15%, MOIC 2.0x, NPV ±5% band). Edge case handling for zero investment and IRR convergence failures. Fixed scenario naming so users never see "Unnamed Scenario" - defaults to "ProjectName — Scenario N". Client and backend calculations now aligned.
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Projects (Scenario Modeling)</div>
                        <div>• Projects (Economics tab)</div>
                        <div>• Architecture (Calculations tab)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• functions/runProjectModel.js</div>
                        <div>• components/projects/ScenarioModelDrawer.jsx</div>
                        <div>• pages/Architecture.jsx</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• None (calculation logic only)</div>
                        <div>• S3 schemas unchanged</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ No "Unnamed Scenario"</div>
                        <div>✓ Zero investment handled</div>
                        <div>✓ NPV color correct</div>
                        <div>✓ Client/backend aligned</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">2026-01-04 18:00</td>
                      <td className="p-3"><Badge>v1.4.0</Badge></td>
                      <td className="p-3">
                        <strong>Evidence-First Output & Release Log System</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Added comprehensive Release Log tab to Architecture page. Formalized two-lane AWS model (Lane A: Athena via aiLayerQuery, Lane B: KB via s3KnowledgeCatalog). All Console responses now include evidence panel with SQL + KB sources.
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Console (evidence display)</div>
                        <div>• Architecture (new Release Log tab)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• pages/Architecture.jsx</div>
                        <div>• components/console/ResultDisplay.jsx</div>
                        <div>• functions/answerQuestion.js (already compliant)</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• curated_core (Athena reads)</div>
                        <div>• s3://gwi-raw-us-east-2-pc/knowledge_base/ (KB docs)</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Architecture tab renders</div>
                        <div>✓ Console shows evidence</div>
                        <div>✓ KB search functional</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">2026-01-04 14:30</td>
                      <td className="p-3"><Badge>v1.3.0</Badge></td>
                      <td className="p-3">
                        <strong>Generate Financial Report Lands in Viewer</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Financial Report modal now creates full scenario contract, calls runProjectModel properly, and on success opens ScenarioModelDrawer to Saved Scenarios tab showing new run with View/Download. Error banner displays failures in modal.
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Projects (Economics tab)</div>
                        <div>• Model drawer (Saved Scenarios)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• components/projects/EconomicsTab.jsx</div>
                        <div>• components/projects/ModelInputModal.jsx</div>
                        <div>• components/projects/ScenarioModelDrawer.jsx</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/model_outputs/</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Report gen opens drawer</div>
                        <div>✓ Outputs visible immediately</div>
                        <div>✓ Download works</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">2026-01-03 16:00</td>
                      <td className="p-3"><Badge>v1.2.2</Badge></td>
                      <td className="p-3">
                        <strong>S3 Fallback for Projects List</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          When Athena fails or returns 0 rows, Projects page automatically loads from S3 change-files. Banner displays data source. Deduplication by project_id (newest file wins).
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Projects (table data)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• pages/Projects.jsx</div>
                        <div>• functions/listProjectUpdates.js</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• curated_core.v_projects_pipeline (Athena fallback)</div>
                        <div>• s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/input/</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Athena fail → S3 loads</div>
                        <div>✓ Banner shows source</div>
                        <div>✓ Dedup works</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">2026-01-02 10:00</td>
                      <td className="p-3"><Badge>v1.2.0</Badge></td>
                      <td className="p-3">
                        <strong>Scenario Persistence via scenarios.json</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Implemented manageScenariosRegistry function. Scenarios now persist to S3 registry file. Save Scenario and Save as New both update registry. Saved Scenarios tab loads from registry.
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Projects (scenario modeling)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• functions/manageScenariosRegistry.js</div>
                        <div>• components/projects/ScenarioModelDrawer.jsx</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/model_outputs/{'{project_id}'}/scenarios.json</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Scenarios save</div>
                        <div>✓ Persist across refresh</div>
                        <div>✓ Load works</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">2026-01-01 12:00</td>
                      <td className="p-3"><Badge>v1.1.0</Badge></td>
                      <td className="p-3">
                        <strong>Initial Projects & Pipeline with Scenario Modeling</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Full project creation, S3 storage, scenario inputs with instant NPV/IRR/MOIC calculations, model outputs (inputs.json, summary_metrics.csv, economics_monthly.csv).
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Projects (new feature)</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• pages/Projects.jsx</div>
                        <div>• functions/saveProject.js</div>
                        <div>• functions/runProjectModel.js</div>
                        <div>• components/projects/*</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Project creation</div>
                        <div>✓ Model runs</div>
                        <div>✓ Downloads work</div>
                      </td>
                    </tr>
                    <tr className="border-b border-border hover:bg-secondary/30 bg-blue-50 dark:bg-blue-950">
                      <td className="p-3 font-mono text-xs">2025-12-15 09:00</td>
                      <td className="p-3"><Badge variant="outline">v1.0.0</Badge></td>
                      <td className="p-3">
                        <strong>Initial MAC Intelligence Launch</strong>
                        <div className="text-xs text-muted-foreground mt-1">
                          Dashboard, AI Console with natural language queries, Topics navigation, Knowledge Base integration via s3KnowledgeCatalog.
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• Dashboard</div>
                        <div>• Console</div>
                        <div>• Topics</div>
                      </td>
                      <td className="p-3 text-xs font-mono">
                        <div>• pages/Dashboard.jsx</div>
                        <div>• pages/Console.jsx</div>
                        <div>• pages/Topics.jsx</div>
                        <div>• functions/answerQuestion.js</div>
                        <div>• functions/s3KnowledgeCatalog.js</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>• curated_core (all views)</div>
                        <div>• s3://gwi-raw-us-east-2-pc/knowledge_base/</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>✓ Console queries work</div>
                        <div>✓ Dashboard loads</div>
                        <div>✓ KB search functional</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Release Log Protocol
                </h4>
                <div className="text-sm space-y-2">
                  <p>Every code change must be logged here before deployment with:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Timestamp (UTC)</li>
                    <li>Semantic version bump (major.minor.patch)</li>
                    <li>1-2 sentence summary</li>
                    <li>Affected surfaces (Dashboard/Console/Topics/Projects)</li>
                    <li>List of changed files</li>
                    <li>AWS surfaces touched (S3 prefixes, curated_core views, KB prefix)</li>
                    <li>Verification checklist (3-5 items)</li>
                  </ul>
                  <p className="mt-3 font-semibold">Optional: Persist to S3 at s3://gwi-raw-us-east-2-pc/mac/release_log.json for external audit trail.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TECH DEBT */}
        <TabsContent value="tech-debt">
          <Card>
            <CardHeader>
              <CardTitle>Known Issues & Technical Debt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ Scenario persistence via scenarios.json</h4>
                <p className="text-sm">Fixed: scenarios.json registry now implemented via manageScenariosRegistry function. Save Scenario and Save as New both work and persist across refresh.</p>
              </div>

              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ S3 fallback for Projects list</h4>
                <p className="text-sm">Fixed: When Athena fails (missing columns, 500 errors, or 0 rows), app automatically falls back to loading projects from S3 change-files. Banner shows data source.</p>
              </div>

              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ Test data generator creates full outputs</h4>
                <p className="text-sm">Fixed: Test generator now creates both projects AND runs a model for each, producing complete test scenarios with downloadable outputs. Sequential flow: saveProject → runProjectModel → verify outputs.</p>
              </div>

              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ Save buttons are now clickable</h4>
                <p className="text-sm">Fixed: Added explicit type="button" to all Save scenario buttons, added validation warning when inputs incomplete, removed any overlays blocking pointer events. Buttons now respond to clicks.</p>
              </div>

              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ Financial calculations aligned</h4>
                <p className="text-sm">Fixed: runProjectModel now uses same calculation logic as client-side calculateFinancials(). Both compute NPV, IRR, MOIC identically using subscriber ramp curves and penetration rates.</p>
              </div>

              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ Generate Financial Report lands in viewer (v1.3)</h4>
                <p className="text-sm">Fixed: Generate Financial Report modal now creates a full scenario object (scenario_id, scenario_name, inputs with defaults), calls runProjectModel with proper contract, and on success opens ScenarioModelDrawer to Saved Scenarios tab where the new run is immediately visible with View/Download buttons. Errors display in modal banner instead of silent failure.</p>
              </div>

              <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950 p-4 rounded">
                <h4 className="font-semibold mb-2">ℹ️ Client-side calculation accuracy</h4>
                <p className="text-sm">IRR calculation uses simplified Newton-Raphson (20 iterations). This is fast but may be inaccurate for unusual cashflow patterns. Backend runProjectModel uses same logic.</p>
                <p className="text-sm mt-2"><strong>Consideration:</strong> For production use, validate IRR against Excel XIRR or use a financial library.</p>
              </div>

              <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950 p-4 rounded">
                <h4 className="font-semibold mb-2">ℹ️ No scenario deletion</h4>
                <p className="text-sm">Once a scenario is saved, there's no UI to delete it. Scenarios accumulate indefinitely.</p>
                <p className="text-sm mt-2"><strong>Future feature:</strong> Add Delete button with confirmation in Saved Scenarios tab.</p>
              </div>

              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ Safari download compatibility</h4>
                <p className="text-sm">Fixed: All downloads now use window.location.assign() with presigned URLs + ResponseContentDisposition. Tested working in Safari.</p>
              </div>

              <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h4 className="font-semibold mb-2">✅ Test data system</h4>
                <p className="text-sm">Fixed: Test projects properly segregated with is_test flag, test_ filename prefix, and separate display in UI with amber badges.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}