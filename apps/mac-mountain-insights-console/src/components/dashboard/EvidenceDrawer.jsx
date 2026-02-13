import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Database, Calendar, Code, CheckCircle, AlertTriangle, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';

/**
 * EVIDENCE DRAWER
 * 
 * Shows query execution evidence for any tile or query answer:
 * - Athena QueryExecutionId (QID)
 * - Executed SQL
 * - Referenced views/tables
 * - Partition date (dt) used
 * - Row count returned
 * - Guard failures (if any)
 * - Manifest links (S3 URIs)
 */

export default function EvidenceDrawer({ evidence, title = "Query Evidence" }) {
  const [copied, setCopied] = useState(null);
  
  if (!evidence) {
    return null;
  }

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast.success(`${label} copied`);
  };

  const qid = evidence.athena_query_execution_id || 
               evidence.query_execution_id ||
               evidence.execution_id ||
               evidence.athena_query_execution_ids?.[0] ||
               'N/A';
  
  const sql = evidence.generated_sql || 
              evidence.executed_sql ||
              evidence.sql || 
              (Array.isArray(evidence.generated_sql) ? evidence.generated_sql[0]?.sql : null) ||
              'N/A';
  
  const viewsUsed = evidence.views_used || 
                   evidence.sources ||
                   evidence.tables_used ||
                   [];
  
  const partitionDate = evidence.partition_date || 
                       evidence.dt_used ||
                       evidence.latest_dt ||
                       null;
  
  const rowCount = evidence.rows_returned || 
                  evidence.row_count ||
                  null;
  
  const manifestUrl = evidence.manifest_s3_uri || 
                     evidence.s3_manifest ||
                     null;
  
  const guardFailures = evidence.guard_failures || [];
  const evidenceStatus = evidence.status || null;
  const hasErrors = guardFailures.length > 0 || evidence.error || (evidenceStatus && evidenceStatus !== 'ok');
  const confidence = evidence.confidence || null;
  const freshness = Array.isArray(evidence.freshness) ? evidence.freshness : [];
  const crossChecks = Array.isArray(evidence.cross_checks) ? evidence.cross_checks : [];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          <FileText className="w-3 h-3 mr-1" />
          Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--mac-forest)]" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            {hasErrors ? (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Query Issues Detected
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Query Successful
              </Badge>
            )}
            {evidenceStatus && (
              <Badge variant="outline" className="text-xs">
                {String(evidenceStatus).toUpperCase()}
              </Badge>
            )}
            {confidence && (
              <Badge variant="outline" className="text-xs">
                Confidence: {String(confidence).toUpperCase()}
              </Badge>
            )}
            {rowCount !== null && (
              <Badge variant="outline">
                {rowCount.toLocaleString()} rows returned
              </Badge>
            )}
          </div>

          {/* Query Execution ID */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" />
                Athena Query Execution ID
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2 bg-[var(--mac-ice)] border border-[var(--mac-panel-border)] rounded-lg p-3">
                <code className="text-xs text-[var(--foreground)] break-all">
                  {qid}
                </code>
                {qid !== 'N/A' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(qid, 'QID')}
                  >
                    {copied === 'QID' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>
              {qid !== 'N/A' && (
                <a
                  href={`https://console.aws.amazon.com/athena/home?region=us-east-2#/query-editor/history/${qid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-2"
                >
                  View in AWS Athena Console
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </CardContent>
          </Card>

          {/* Views/Tables Used */}
          {viewsUsed.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  SSOT Views Referenced
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {viewsUsed.map((view, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      <code className="text-[var(--foreground)]">{view}</code>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Partition Date */}
          {partitionDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Data Partition Date
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-[var(--mac-ice)] border border-[var(--mac-panel-border)] rounded-lg p-3">
                  <code className="text-sm font-semibold text-[var(--foreground)]">
                    dt = {partitionDate}
                  </code>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Freshness Checks */}
          {freshness.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Freshness Checks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {freshness.map((f, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 bg-[var(--mac-ice)] border border-[var(--mac-panel-border)] rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-700 break-all">{f.view || 'unknown'}</div>
                        <div className="text-[11px] text-slate-500">
                          latest: {f.latest_partition ? String(f.latest_partition).slice(0, 19) : 'N/A'}
                          {f.row_count !== null && f.row_count !== undefined ? ` • rows: ${String(f.row_count)}` : ''}
                        </div>
                        {f.query_execution_id && (
                          <div className="text-[10px] text-slate-400">QID: {f.query_execution_id}</div>
                        )}
                        {f.error && (
                          <div className="text-[11px] text-red-700">ERROR: {String(f.error)}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {String(f.status || 'unknown').toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cross-Checks */}
          {crossChecks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Cross-Checks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {crossChecks.map((c, idx) => (
                    <div key={c.template_key || idx} className="flex items-start justify-between gap-3 bg-[var(--mac-ice)] border border-[var(--mac-panel-border)] rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-700">{c.label || c.template_key || 'cross-check'}</div>
                        <div className="text-[11px] text-slate-500">
                          value: {c.error ? 'ERROR' : String(c.value ?? 'N/A')}
                          {c.delta_pct !== null && c.delta_pct !== undefined ? ` • delta: ${(Number(c.delta_pct) * 100).toFixed(2)}%` : ''}
                        </div>
                        {c.query_execution_id && (
                          <div className="text-[10px] text-slate-400">QID: {c.query_execution_id}</div>
                        )}
                        {c.error && (
                          <div className="text-[11px] text-red-700">ERROR: {String(c.error)}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {String(c.status || 'unknown').toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Guard Failures */}
          {guardFailures.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  Guard Failures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {guardFailures.map((failure, idx) => (
                    <div key={idx} className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs text-red-800">{failure}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* SQL Statement */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Code className="w-4 h-4" />
                Executed SQL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-[var(--mac-ice)] text-[var(--mac-ash)] border border-[var(--mac-panel-border)] rounded-lg p-4 overflow-x-auto relative group">
                <pre className="text-xs whitespace-pre-wrap break-words">
                  {typeof sql === 'string' ? sql : JSON.stringify(sql, null, 2)}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copyToClipboard(typeof sql === 'string' ? sql : JSON.stringify(sql, null, 2), 'SQL')}
                >
                  {copied === 'SQL' ? (
                      <CheckCircle className="w-4 h-4 text-[var(--mac-forest)]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
              </div>
            </CardContent>
          </Card>

          {/* Manifest Link */}
          {manifestUrl && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Run Manifest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-[var(--mac-ice)] border border-[var(--mac-panel-border)] rounded-lg p-3">
                  <code className="text-xs text-[var(--foreground)] break-all">
                    {manifestUrl}
                  </code>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional Metadata */}
          {evidence.template_id && (
            <div className="text-xs text-muted-foreground">
              Template: <code>{evidence.template_id}</code>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
