import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Download, PlayCircle, FileJson } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ProofPackRunner({ onComplete }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTest, setCurrentTest] = useState('');
  const [results, setResults] = useState(null);
  const [fullReport, setFullReport] = useState(null);

  const runFullAudit = async () => {
    setRunning(true);
    setProgress(0);
    setCurrentTest('Initializing audit...');

    try {
      const auditLog = {
        audit_id: `full_system_audit_${Date.now()}`,
        started_at: new Date().toISOString(),
        completed_at: null,
        tests: [],
        summary: { total: 0, passed: 0, failed: 0, blocked: 0, warnings: 0 }
      };

      // ==============================================
      // TEST 1: Dashboard Tiles Audit
      // ==============================================
      setCurrentTest('Auditing Dashboard Tiles...');
      setProgress(10);

      try {
        const dashboardAudit = await base44.functions.invoke('auditDashboardTiles', {});
        
        if (dashboardAudit.data.success) {
          auditLog.tests.push({
            test_id: 'AUDIT-001',
            test_name: 'Dashboard Tiles Audit',
            status: 'PASS',
            details: dashboardAudit.data.audit_log,
            evidence: {
              tiles_tested: dashboardAudit.data.audit_log.tiles_tested.length,
              summary: dashboardAudit.data.audit_log.summary,
              assessment: dashboardAudit.data.audit_log.assessment
            }
          });
          auditLog.summary.passed++;
        } else {
          auditLog.tests.push({
            test_id: 'AUDIT-001',
            test_name: 'Dashboard Tiles Audit',
            status: 'FAIL',
            error: 'Dashboard audit returned non-success'
          });
          auditLog.summary.failed++;
        }
      } catch (error) {
        auditLog.tests.push({
          test_id: 'AUDIT-001',
          test_name: 'Dashboard Tiles Audit',
          status: 'FAIL',
          error: error.message
        });
        auditLog.summary.failed++;
      }

      auditLog.summary.total++;
      setProgress(25);

      // ==============================================
      // TEST 2: Projects Page Data Loading
      // ==============================================
      setCurrentTest('Testing Projects Page Data Loading...');

      try {
        const projectsSQL = `SELECT project_id, entity, project_name, project_type, state, COALESCE(stage, 'Unknown') AS stage, COALESCE(priority, 'Unranked') AS priority, owner, partner_share_raw, investor_label, notes FROM curated_core.projects_enriched ORDER BY entity, project_name LIMIT 200`;
        
        const projectsResult = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql: projectsSQL }
        });

        if (projectsResult.data.ok && projectsResult.data.data_rows) {
          auditLog.tests.push({
            test_id: 'AUDIT-002',
            test_name: 'Projects Page - Athena Load',
            status: projectsResult.data.data_rows.length > 0 ? 'PASS' : 'WARN',
            details: {
              rows_loaded: projectsResult.data.data_rows.length,
              execution_id: projectsResult.data.athena_query_execution_id,
              sql: projectsResult.data.generated_sql
            },
            evidence: {
              source: 'curated_core.projects_enriched',
              method: 'aiLayerQuery',
              fallback_available: 'S3 change-files'
            }
          });
          if (projectsResult.data.data_rows.length > 0) {
            auditLog.summary.passed++;
          } else {
            auditLog.summary.warnings++;
          }
        } else {
          auditLog.tests.push({
            test_id: 'AUDIT-002',
            test_name: 'Projects Page - Athena Load',
            status: 'FAIL',
            error: projectsResult.data.error || 'No data returned'
          });
          auditLog.summary.failed++;
        }
      } catch (error) {
        auditLog.tests.push({
          test_id: 'AUDIT-002',
          test_name: 'Projects Page - Athena Load',
          status: 'FAIL',
          error: error.message
        });
        auditLog.summary.failed++;
      }

      auditLog.summary.total++;
      setProgress(40);

      // ==============================================
      // TEST 3: S3 Fallback for Projects
      // ==============================================
      setCurrentTest('Testing Projects S3 Fallback...');

      try {
        const s3Files = await base44.functions.invoke('listProjectUpdates', {
          action: 'list'
        });

        if (s3Files.data.files && Array.isArray(s3Files.data.files)) {
          auditLog.tests.push({
            test_id: 'AUDIT-003',
            test_name: 'Projects Page - S3 Fallback',
            status: 'PASS',
            details: {
              total_files: s3Files.data.files.length,
              real_projects: s3Files.data.files.filter(f => !f.is_test).length,
              test_projects: s3Files.data.files.filter(f => f.is_test).length,
              sample_files: s3Files.data.files.slice(0, 3).map(f => f.file_name)
            },
            evidence: {
              s3_prefix: 'raw/projects_pipeline/input/',
              fallback_logic: 'Implemented - loads when Athena returns 0 rows'
            }
          });
          auditLog.summary.passed++;
        } else {
          auditLog.tests.push({
            test_id: 'AUDIT-003',
            test_name: 'Projects Page - S3 Fallback',
            status: 'WARN',
            details: 'No S3 files found',
            evidence: { note: 'S3 fallback available but no files exist yet' }
          });
          auditLog.summary.warnings++;
        }
      } catch (error) {
        auditLog.tests.push({
          test_id: 'AUDIT-003',
          test_name: 'Projects Page - S3 Fallback',
          status: 'FAIL',
          error: error.message
        });
        auditLog.summary.failed++;
      }

      auditLog.summary.total++;
      setProgress(55);

      // ==============================================
      // TEST 4: Console Natural Language Query
      // ==============================================
      setCurrentTest('Testing Console Natural Language Query...');

      try {
        const consoleQuery = await base44.functions.invoke('answerQuestion', {
          question: 'What is the total MRR?'
        });

        if (consoleQuery.data.answer) {
          auditLog.tests.push({
            test_id: 'AUDIT-004',
            test_name: 'Console - Natural Language Query',
            status: 'PASS',
            details: {
              question: 'What is the total MRR?',
              answer_length: consoleQuery.data.answer.length,
              has_data: !!consoleQuery.data.data_results,
              evidence_included: !!consoleQuery.data.evidence
            },
            evidence: {
              lane: consoleQuery.data.evidence?.lane || 'unknown',
              athena_queries: consoleQuery.data.evidence?.athena_query_execution_ids?.length || 0
            }
          });
          auditLog.summary.passed++;
        } else {
          auditLog.tests.push({
            test_id: 'AUDIT-004',
            test_name: 'Console - Natural Language Query',
            status: 'FAIL',
            error: 'No answer returned'
          });
          auditLog.summary.failed++;
        }
      } catch (error) {
        auditLog.tests.push({
          test_id: 'AUDIT-004',
          test_name: 'Console - Natural Language Query',
          status: 'FAIL',
          error: error.message
        });
        auditLog.summary.failed++;
      }

      auditLog.summary.total++;
      setProgress(70);

      // ==============================================
      // TEST 5: GIS Network Map Data
      // ==============================================
      setCurrentTest('Testing GIS Network Map...');

      try {
        const planIndex = await base44.functions.invoke('getVetroPlanIndex', {});

        if (planIndex.data.success && planIndex.data.plans) {
          auditLog.tests.push({
            test_id: 'AUDIT-005',
            test_name: 'GIS Network Map - Plan Index',
            status: 'PASS',
            details: {
              total_plans: planIndex.data.total_plans,
              plans_with_data: planIndex.data.plans.filter(p => p.service_location_count > 0).length,
              sample_plan: planIndex.data.plans[0]
            },
            evidence: {
              source: 'curated_vetro or vetro_raw_db',
              method: 'getVetroPlanIndex'
            }
          });
          auditLog.summary.passed++;
        } else {
          auditLog.tests.push({
            test_id: 'AUDIT-005',
            test_name: 'GIS Network Map - Plan Index',
            status: 'BLOCKED',
            details: planIndex.data,
            note: 'Vetro data not available or sample data returned'
          });
          auditLog.summary.blocked++;
        }
      } catch (error) {
        auditLog.tests.push({
          test_id: 'AUDIT-005',
          test_name: 'GIS Network Map - Plan Index',
          status: 'FAIL',
          error: error.message
        });
        auditLog.summary.failed++;
      }

      auditLog.summary.total++;
      setProgress(85);

      // ==============================================
      // TEST 6: Knowledge Base Catalog
      // ==============================================
      setCurrentTest('Testing Knowledge Base Catalog...');

      try {
        const kbCatalog = await base44.functions.invoke('s3KnowledgeCatalog', {
          action: 'list'
        });

        if (kbCatalog.data.documents) {
          auditLog.tests.push({
            test_id: 'AUDIT-006',
            test_name: 'Knowledge Base - Lane B Catalog',
            status: kbCatalog.data.documents.length > 0 ? 'PASS' : 'WARN',
            details: {
              total_documents: kbCatalog.data.documents.length,
              sample_docs: kbCatalog.data.documents.slice(0, 3).map(d => d.name)
            },
            evidence: {
              s3_prefix: 'knowledge_base/',
              purpose: 'Lane B unstructured docs for policy/strategy questions'
            }
          });
          if (kbCatalog.data.documents.length > 0) {
            auditLog.summary.passed++;
          } else {
            auditLog.summary.warnings++;
          }
        } else {
          auditLog.tests.push({
            test_id: 'AUDIT-006',
            test_name: 'Knowledge Base - Lane B Catalog',
            status: 'FAIL',
            error: 'No documents array returned'
          });
          auditLog.summary.failed++;
        }
      } catch (error) {
        auditLog.tests.push({
          test_id: 'AUDIT-006',
          test_name: 'Knowledge Base - Lane B Catalog',
          status: 'FAIL',
          error: error.message
        });
        auditLog.summary.failed++;
      }

      auditLog.summary.total++;
      setProgress(100);

      // ==============================================
      // FINALIZE AUDIT
      // ==============================================
      auditLog.completed_at = new Date().toISOString();
      
      const criticalFails = auditLog.tests.filter(t => 
        ['AUDIT-001', 'AUDIT-002', 'AUDIT-004'].includes(t.test_id) && t.status === 'FAIL'
      ).length;

      if (criticalFails > 0) {
        auditLog.assessment = '❌ CRITICAL FAILURES - Core features not working';
      } else if (auditLog.summary.failed > 0) {
        auditLog.assessment = '⚠️ MOSTLY FUNCTIONAL - Some features need attention';
      } else if (auditLog.summary.warnings > 0 || auditLog.summary.blocked > 0) {
        auditLog.assessment = '✅ FUNCTIONAL WITH WARNINGS - All critical features operational';
      } else {
        auditLog.assessment = '✅ ALL TESTS PASSED - System fully functional';
      }

      setResults(auditLog);
      setCurrentTest('Audit complete!');

      // Generate full proof pack
      const proofPackResponse = await base44.functions.invoke('generateFullSystemProofPack', {});
      
      if (proofPackResponse.data.success) {
        const fullPackage = {
          audit_execution: auditLog,
          system_export: proofPackResponse.data.proof_pack,
          generated_at: new Date().toISOString()
        };
        
        setFullReport(fullPackage);
        
        if (onComplete) {
          onComplete(fullPackage);
        }
      }

      toast.success('Full system audit completed!');

    } catch (error) {
      console.error('Audit failed:', error);
      toast.error('Audit failed: ' + error.message);
    } finally {
      setRunning(false);
    }
  };

  const downloadReport = () => {
    if (!fullReport) return;
    
    const blob = new Blob([JSON.stringify(fullReport, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mac_proof_pack_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Proof Pack downloaded');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'FAIL': return <XCircle className="w-4 h-4 text-red-600" />;
      case 'BLOCKED': return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case 'WARN': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default: return null;
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      PASS: 'bg-green-100 text-green-800 border-green-300',
      FAIL: 'bg-red-100 text-red-800 border-red-300',
      BLOCKED: 'bg-orange-100 text-orange-800 border-orange-300',
      WARN: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    };
    return <Badge className={variants[status] || ''}>{status}</Badge>;
  };

  return (
    <Card className="border-2 border-blue-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="w-6 h-6 text-blue-600" />
          Comprehensive System Audit & Proof Pack
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Automated testing of all dashboard tiles, backend functions, and critical user flows
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {!running && !results && (
          <div className="text-center py-8">
            <Button 
              onClick={runFullAudit}
              size="lg"
              className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
            >
              <PlayCircle className="w-5 h-5" />
              Run Full System Audit
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              This will test: Dashboard tiles, Projects loading, Console queries, GIS maps, and Knowledge Base
            </p>
          </div>
        )}

        {running && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-sm font-medium">{currentTest}</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">Progress: {progress}%</p>
          </div>
        )}

        {results && (
          <div className="space-y-4">
            
            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-3">
              <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg border text-center">
                <div className="text-2xl font-bold">{results.summary.total}</div>
                <div className="text-xs text-muted-foreground">Total Tests</div>
              </div>
              <div className="bg-green-100 dark:bg-green-900 p-3 rounded-lg border text-center">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">{results.summary.passed}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </div>
              <div className="bg-red-100 dark:bg-red-900 p-3 rounded-lg border text-center">
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">{results.summary.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900 p-3 rounded-lg border text-center">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{results.summary.blocked}</div>
                <div className="text-xs text-muted-foreground">Blocked</div>
              </div>
              <div className="bg-yellow-100 dark:bg-yellow-900 p-3 rounded-lg border text-center">
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{results.summary.warnings}</div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
            </div>

            {/* Assessment */}
            <div className={`p-4 rounded-lg border-2 ${
              results.assessment.startsWith('✅') ? 'bg-green-50 dark:bg-green-950 border-green-500' :
              results.assessment.startsWith('⚠️') ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-500' :
              'bg-red-50 dark:bg-red-950 border-red-500'
            }`}>
              <h3 className="font-bold mb-1">Overall Assessment</h3>
              <p className="text-sm">{results.assessment}</p>
            </div>

            {/* Test Results */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Test Results:</h3>
              {results.tests.map((test, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(test.status)}
                      <span className="font-mono text-xs">{test.test_id}</span>
                      <span className="text-sm font-medium">{test.test_name}</span>
                    </div>
                    {getStatusBadge(test.status)}
                  </div>
                  
                  {test.error && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-950 p-2 rounded">
                      <strong>Error:</strong> {test.error}
                    </div>
                  )}
                  
                  {test.details && (
                    <div className="text-xs text-muted-foreground mt-2 bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      <pre className="overflow-x-auto">{JSON.stringify(test.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Download Buttons */}
            {fullReport && (
              <div className="flex gap-3">
                <Button 
                  onClick={downloadReport}
                  className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white"
                >
                  <Download className="w-4 h-4" />
                  Download Proof Pack JSON
                </Button>
                <Button
                  onClick={runFullAudit}
                  variant="outline"
                  className="gap-2"
                >
                  <PlayCircle className="w-4 h-4" />
                  Re-run Audit
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}