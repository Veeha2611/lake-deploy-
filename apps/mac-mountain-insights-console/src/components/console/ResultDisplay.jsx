import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, BarChart3, PieChart, LineChart, Download, Database, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { BarChart, Bar, PieChart as RePieChart, Pie, LineChart as ReLineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import TableWithSort from './TableWithSort';
import EvidenceDrawer from '@/components/dashboard/EvidenceDrawer';

const COLORS = ['#5C7B5F', '#7B8B8E', '#B8D8E5', '#2D3E2D', '#8FA88F', '#A6B8B0'];

export default function ResultDisplay({ result }) {
  const [viewType, setViewType] = useState('table');
  const [showEvidence, setShowEvidence] = useState(true); // Default to showing evidence

  // Debug logging
  React.useEffect(() => {
    if (result) {
      console.log('[ResultDisplay] Received result:', result);
    }
  }, [result]);

  if (!result) return null;

  // Fail-closed error display
  if (result.ok === false || result.error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="bg-white border-2 border-red-200 shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <CardTitle className="text-lg font-semibold text-red-800">Query Failed</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm font-semibold text-red-800 mb-2">Error Details:</p>
              <p className="text-sm text-red-700">{result.error || 'Unknown error occurred'}</p>
              {result.http_status && (
                <p className="text-xs text-red-600 mt-1">HTTP Status: {result.http_status}</p>
              )}
            </div>

            {result.last_sql && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Last SQL Attempted:</p>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded text-xs overflow-x-auto">
{result.last_sql}
                </pre>
              </div>
            )}

            {result.discovery_output && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Discovery Output:</p>
                <pre className="p-3 bg-slate-50 rounded text-xs overflow-x-auto max-h-40">
{JSON.stringify(result.discovery_output, null, 2)}
                </pre>
              </div>
            )}

            <div className="p-3 bg-slate-100 rounded-lg">
              <p className="text-xs text-slate-600">
                This query failed after all retry attempts. No fabricated data is shown. Please check the error details above and verify your query.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const handleExport = () => {
    if (!result?.data_results || result.data_results.length === 0) return;
    
    const columns = Object.keys(result.data_results[0]);
    let csv = columns.join(',') + '\n';
    result.data_results.forEach(row => {
      csv += columns.map(col => `"${row[col]}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Data exported to CSV');
  };

  const chartData = result.data_results?.slice(0, 50).map((row, idx) => {
    return { ...row, index: idx };
  }) || [];

  const hasData = result.data_results && result.data_results.length > 0;
  const columns = hasData ? Object.keys(result.data_results[0]) : [];

  // Safety check for malformed data
  try {
    if (result.data_results && !Array.isArray(result.data_results)) {
      console.error('[ResultDisplay] data_results is not an array:', result.data_results);
      return (
        <Card className="bg-white border-2 border-amber-200 shadow-lg">
          <CardContent className="p-6">
            <p className="text-amber-800">Data format error: results are not in expected format</p>
            <pre className="mt-2 p-3 bg-slate-100 rounded text-xs overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      );
    }
  } catch (err) {
    console.error('[ResultDisplay] Error checking data format:', err);
    return (
      <Card className="bg-white border-2 border-red-200 shadow-lg">
        <CardContent className="p-6">
          <p className="text-red-800">Error rendering results: {err.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-gradient-to-br from-white to-slate-50 border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-slate-800">Results</CardTitle>
            {hasData && (
              <div className="flex items-center gap-2">
                <EvidenceDrawer 
                  evidence={result.evidence}
                  title="Query Console - Query Evidence"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="hover:bg-emerald-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant={viewType === 'table' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewType('table')}
                  className={viewType === 'table' ? 'bg-[var(--mac-forest)]' : ''}
                >
                  <Table className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewType === 'bar' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewType('bar')}
                  className={viewType === 'bar' ? 'bg-[var(--mac-forest)]' : ''}
                >
                  <BarChart3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewType === 'line' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewType('line')}
                  className={viewType === 'line' ? 'bg-[var(--mac-forest)]' : ''}
                >
                  <LineChart className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewType === 'pie' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewType('pie')}
                  className={viewType === 'pie' ? 'bg-[var(--mac-forest)]' : ''}
                >
                  <PieChart className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Markdown Answer */}
          {result.answer_markdown && (
            <div className="mb-6 p-6 rounded-xl bg-gradient-to-br from-white via-slate-50 to-white border border-slate-200 shadow-sm">
              <div className="prose prose-slate max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-4">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl font-semibold text-slate-800 mt-6 mb-3 pb-2 border-b border-slate-200">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold text-[var(--mac-forest)] mt-4 mb-2">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-slate-700 mb-3 leading-relaxed text-base">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="space-y-2 my-4">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="space-y-2 my-4">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-slate-700 ml-6 pl-2 relative before:absolute before:left-[-1.25rem] before:content-['→'] before:text-[var(--mac-forest)] before:font-bold">
                        {children}
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-slate-900 bg-slate-100 px-1 py-0.5 rounded">
                        {children}
                      </strong>
                    ),
                    em: ({ children }) => (
                      <em className="text-[var(--mac-forest)] font-medium not-italic">
                        {children}
                      </em>
                    ),
                    code: ({ inline, children }) => 
                      inline ? (
                        <code className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 text-sm font-mono">
                          {children}
                        </code>
                      ) : (
                        <code className="block p-3 rounded-lg bg-slate-800 text-emerald-400 text-sm font-mono overflow-x-auto my-3">
                          {children}
                        </code>
                      ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-[var(--mac-forest)] pl-4 py-2 my-4 bg-slate-50 rounded-r-lg italic text-slate-600">
                        {children}
                      </blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 my-4 shadow-sm">
                        <table className="w-full text-sm">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] text-white">
                        {children}
                      </thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                        {children}
                      </th>
                    ),
                    tbody: ({ children }) => <tbody>{children}</tbody>,
                    tr: ({ children, ...props }) => {
                      const isHeader = props.node?.tagName === 'tr' && props.node?.parentNode?.tagName === 'thead';
                      return (
                        <tr className={isHeader ? '' : 'border-t border-slate-100 hover:bg-[var(--mac-sky)]/20 transition-colors'}>
                          {children}
                        </tr>
                      );
                    },
                    td: ({ children }) => (
                      <td className="px-4 py-3 text-slate-700">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {result.answer_markdown}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Data Visualization */}
          {hasData && (
            <div className="mt-6">
              {viewType === 'table' && (
                <TableWithSort data={result.data_results} columns={columns} />
              )}

              {viewType === 'bar' && chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey={columns[0]} stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                    <Legend />
                    {columns.slice(1, 4).map((col, idx) => (
                      <Bar key={col} dataKey={col} fill={COLORS[idx % COLORS.length]} radius={[8, 8, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}

              {viewType === 'line' && chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={chartData}>
                    <defs>
                      {columns.slice(1, 4).map((col, idx) => (
                        <linearGradient key={col} id={`gradient${idx}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey={columns[0]} stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                    <Legend />
                    {columns.slice(1, 4).map((col, idx) => (
                      <Area key={col} type="monotone" dataKey={col} stroke={COLORS[idx % COLORS.length]} fillOpacity={1} fill={`url(#gradient${idx})`} strokeWidth={2} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {viewType === 'pie' && chartData.length > 0 && chartData.length <= 20 && (
                <ResponsiveContainer width="100%" height={400}>
                  <RePieChart>
                    <Pie
                      data={chartData}
                      dataKey={columns[1] || columns[0]}
                      nameKey={columns[0]}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      label
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                    <Legend />
                  </RePieChart>
                </ResponsiveContainer>
              )}

              <div className="mt-4 flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {result.data_results.length} rows
                </Badge>
                <button
                  onClick={() => setShowEvidence(!showEvidence)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  <Database className="w-3 h-3" />
                  Evidence
                  {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* MANDATORY EVIDENCE PANEL - Always show for successful queries */}
              {showEvidence && (
                <div className="mt-3 p-4 bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200 space-y-3 text-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                    <Database className="w-4 h-4 text-[var(--mac-forest)]" />
                    <span className="font-semibold text-slate-800">Query Evidence & Sources</span>
                  </div>

                  {/* Two-Lane Model Display */}
                  {result.evidence?.intent_category && (
                    <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
                      <span className="text-slate-500 font-medium">Intent Category:</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {result.evidence.intent_category}
                      </Badge>
                    </div>
                  )}

                  {/* Lane B: Knowledge Base Sources */}
                  {result.evidence?.knowledge_base_used && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded border border-emerald-200 dark:border-emerald-800">
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">📄 Knowledge Base (Lane B):</span>
                      <div className="mt-1 text-slate-700 dark:text-slate-300">
                        {result.evidence.document_used ? (
                          <div className="font-mono text-xs">
                            {result.evidence.document_used}
                          </div>
                        ) : (
                          <div>Documents from s3://gwi-raw-us-east-2-pc/knowledge_base/</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Lane A: Athena Data Lake */}
                  {result.evidence?.views_used && result.evidence.views_used.length > 0 && (
                    <div>
                      <span className="text-slate-500 font-medium">📊 Athena Views Used (Lane A):</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {result.evidence.views_used.map((v, i) => (
                          <Badge key={i} variant="outline" className="font-mono text-xs bg-white">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.evidence?.athena_query_execution_ids && result.evidence.athena_query_execution_ids.length > 0 && (
                    <div>
                      <span className="text-slate-500 font-medium">Athena Execution IDs:</span>
                      {result.evidence.athena_query_execution_ids.map((id, i) => (
                        <div key={i} className="font-mono text-slate-600 break-all text-[10px] mt-1 bg-white p-2 rounded border border-slate-100">
                          {id}
                        </div>
                      ))}
                    </div>
                  )}

                  {result.evidence?.generated_sql && (
                    <div>
                      <span className="text-slate-500 font-medium">Generated SQL:</span>
                      {(() => {
                        try {
                          // Handle both array and string formats
                          const sqlArray = Array.isArray(result.evidence.generated_sql) 
                            ? result.evidence.generated_sql 
                            : [{ sql: result.evidence.generated_sql, purpose: 'Query' }];
                          
                          return sqlArray.map((sql, i) => {
                            const sqlText = typeof sql === 'string' ? sql : (sql.sql || sql);
                            const purpose = typeof sql === 'object' ? (sql.purpose || `Step ${i + 1}`) : `Step ${i + 1}`;
                            const retryCount = typeof sql === 'object' ? (sql.retry_count || 0) : 0;
                            
                            return (
                              <div key={i} className="mt-2">
                                <div className="text-[10px] text-slate-400 mb-1">{purpose}</div>
                                <pre className="p-2 bg-slate-900 text-emerald-400 rounded text-[10px] overflow-x-auto">
{sqlText}
                                </pre>
                                {retryCount > 0 && (
                                  <div className="text-[10px] text-amber-600 mt-1">Retries: {retryCount}</div>
                                )}
                              </div>
                            );
                          });
                        } catch (err) {
                          console.error('[ResultDisplay] Error rendering SQL:', err);
                          return <div className="text-xs text-red-600">Error displaying SQL</div>;
                        }
                      })()}
                    </div>
                  )}

                  {result.metadata && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-medium">Query Statistics:</span>
                      <div className="text-slate-600 text-[10px] mt-1 space-y-1">
                        <div>✓ Steps succeeded: {result.metadata.steps_succeeded}/{result.metadata.steps_executed}</div>
                        {result.metadata.steps_failed > 0 && (
                          <div className="text-red-600">✗ Steps failed: {result.metadata.steps_failed}</div>
                        )}
                        {result.metadata.total_retries > 0 && (
                          <div>↻ Total retries: {result.metadata.total_retries}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}