import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Pin, 
  BarChart3, 
  LineChart, 
  PieChart, 
  Table2, 
  ChevronRight,
  Copy,
  Share2,
  Lightbulb,
  Download,
  Database,
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import ResultVisualization from './ResultVisualization';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const vizOptions = [
  { type: 'table', icon: Table2, label: 'Table' },
  { type: 'bar_chart', icon: BarChart3, label: 'Bar Chart' },
  { type: 'line_chart', icon: LineChart, label: 'Line Chart' },
  { type: 'pie_chart', icon: PieChart, label: 'Pie Chart' },
];

export default function QueryResult({ query, onPin, onFollowUp }) {
  const [selectedViz, setSelectedViz] = useState(query.visualization_type || 'table');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Question Card */}
      <Card className="p-6 bg-[#C5E4ED]/20 border-[#C5E4ED]">
        <div className="flex items-start justify-between">
          <div>
            <Badge className="bg-[#5C7B5F] text-white mb-2">Your Question</Badge>
            <p className="text-lg font-medium text-slate-800">{query.question}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigator.clipboard.writeText(query.question)}
            >
              <Copy className="w-4 h-4 text-slate-500" />
            </Button>
            <Button variant="ghost" size="icon">
              <Share2 className="w-4 h-4 text-slate-500" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => onPin(query)}
              className={cn(query.is_pinned && "text-amber-500")}
            >
              <Pin className={cn("w-4 h-4", query.is_pinned ? "fill-current" : "")} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Response Card */}
      <Card className="p-6 bg-white border-0 shadow-sm">
        <div className="prose prose-slate max-w-none">
          <p className="text-slate-700 leading-relaxed">{query.response}</p>
        </div>

        {/* Visualization Options */}
        {query.data_results && query.data_results.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600">View as:</span>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {vizOptions.map(({ type, icon: Icon, label }) => (
                    <Button
                      key={type}
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedViz(type)}
                      className={cn(
                        "rounded-md transition-all",
                        selectedViz === type 
                          ? "bg-white shadow-sm text-[#3D5A3D]" 
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      <Icon className="w-4 h-4 mr-1" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              
              {query.result_csv_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(query.result_csv_url, '_blank')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                </Button>
              )}
            </div>
            
            <ResultVisualization 
              data={query.data_results} 
              type={selectedViz}
            />
          </div>
        )}
      </Card>

      {/* Evidence Panel */}
      {query.evidence && (
        <Card className="p-6 bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-slate-600" />
            <span className="font-semibold text-slate-800">Query Evidence</span>
          </div>

          <div className="space-y-3 text-sm">
            {query.evidence.views_used && query.evidence.views_used.length > 0 && (
              <div>
                <span className="text-slate-500 font-medium">Curated Views:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {query.evidence.views_used.map((view, idx) => (
                    <Badge key={idx} variant="outline" className="bg-white font-mono text-xs">
                      {view}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {query.evidence.athena_query_execution_ids && query.evidence.athena_query_execution_ids.length > 0 && (
              <div>
                <span className="text-slate-500 font-medium">Athena Execution IDs:</span>
                <div className="flex flex-col gap-1 mt-1">
                  {query.evidence.athena_query_execution_ids.map((id, idx) => (
                    <span key={idx} className="text-slate-700 font-mono text-xs">{id}</span>
                  ))}
                </div>
              </div>
            )}

            {query.evidence.athena_query_execution_id && !query.evidence.athena_query_execution_ids && (
              <div>
                <span className="text-slate-500 font-medium">Athena Execution ID:</span>
                <span className="text-slate-700 ml-2 font-mono text-xs">{query.evidence.athena_query_execution_id}</span>
              </div>
            )}

            {query.evidence.query_plan && (
              <div>
                <span className="text-slate-500 font-medium">Query Plan:</span>
                <div className="mt-1 space-y-1">
                  {query.evidence.query_plan.map((step, idx) => (
                    <div key={idx} className="text-xs text-slate-600">
                      {step.id}: {step.purpose}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {query.evidence.sql_template_id && (
              <div>
                <span className="text-slate-500 font-medium">SQL Template:</span>
                <span className="text-slate-700 ml-2 font-mono text-xs">{query.evidence.sql_template_id}</span>
              </div>
            )}

            {query.evidence.generated_sql && Array.isArray(query.evidence.generated_sql) && (
              <div>
                <span className="text-slate-500 font-medium">Generated SQL Queries:</span>
                <div className="mt-2 space-y-2">
                  {query.evidence.generated_sql.map((item, idx) => (
                    <div key={idx} className="bg-slate-900 rounded p-3 overflow-x-auto">
                      <div className="text-xs text-slate-400 mb-1">{item.step}: {item.purpose}</div>
                      <pre className="text-xs text-slate-100 whitespace-pre-wrap font-mono">
                        {item.sql}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {query.evidence.generated_sql && typeof query.evidence.generated_sql === 'string' && (
              <div>
                <span className="text-slate-500 font-medium">Generated SQL:</span>
                <div className="mt-1 bg-slate-900 rounded p-3 overflow-x-auto">
                  <pre className="text-xs text-slate-100 whitespace-pre-wrap font-mono">
                    {query.evidence.generated_sql}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Suggestions */}
      {query.suggested_follow_ups && query.suggested_follow_ups.length > 0 && (
        <Card className="p-6 bg-gradient-to-r from-[#5C7B5F]/5 to-[#C5E4ED]/20 border-[#5C7B5F]/20">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <span className="font-semibold text-slate-800">Deeper Dive Suggestions</span>
          </div>
          <div className="space-y-2">
            {query.suggested_follow_ups.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => onFollowUp(suggestion)}
                className="w-full flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-md transition-all group border border-transparent hover:border-[#5C7B5F]/20"
              >
                <span className="text-slate-700">{suggestion}</span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#5C7B5F] group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>
        </Card>
      )}
    </motion.div>
  );
}