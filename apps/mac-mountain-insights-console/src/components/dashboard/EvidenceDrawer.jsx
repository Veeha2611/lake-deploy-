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
               evidence.execution_id ||
               evidence.athena_query_execution_ids?.[0] ||
               'N/A';
  
  const sql = evidence.generated_sql || 
              evidence.sql || 
              (Array.isArray(evidence.generated_sql) ? evidence.generated_sql[0]?.sql : null) ||
              'N/A';
  
  const viewsUsed = evidence.views_used || 
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
  const hasErrors = guardFailures.length > 0 || evidence.error;

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
              <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                <code className="text-xs text-slate-700 dark:text-slate-300 break-all">
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
                      <code className="text-slate-700 dark:text-slate-300">{view}</code>
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
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                  <code className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    dt = {partitionDate}
                  </code>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Guard Failures */}
          {guardFailures.length > 0 && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  Guard Failures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {guardFailures.map((failure, idx) => (
                    <div key={idx} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                      <p className="text-xs text-red-800 dark:text-red-200">{failure}</p>
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
              <div className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto relative group">
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
                    <CheckCircle className="w-4 h-4 text-green-400" />
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
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                  <code className="text-xs text-slate-700 dark:text-slate-300 break-all">
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