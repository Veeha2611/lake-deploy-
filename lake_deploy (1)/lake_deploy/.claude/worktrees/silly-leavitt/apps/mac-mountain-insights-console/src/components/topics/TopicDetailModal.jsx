import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function TopicDetailModal({ topic, isOpen, onClose }) {
  const [showEvidence, setShowEvidence] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['topic-detail', topic?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('answerQuestion', {
        question: topic.question
      });
      return response.data;
    },
    enabled: isOpen && !!topic,
  });

  const handleExport = () => {
    if (!data?.data_results || data.data_results.length === 0) return;
    
    const columns = Object.keys(data.data_results[0]);
    let csv = columns.join(',') + '\n';
    data.data_results.forEach(row => {
      csv += columns.map(col => `"${row[col]}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topic?.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Data exported');
  };

  if (!topic) return null;

  const Icon = topic.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-white to-slate-50">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${topic.color} shadow-lg`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-slate-900">{topic.name}</DialogTitle>
                <p className="text-sm text-slate-600 mt-1">{topic.description}</p>
              </div>
            </div>
            {data?.data_results && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="hover:bg-emerald-50 hover:border-emerald-500"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <div className="w-16 h-16 mb-4 bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <p className="text-slate-600 font-medium">Querying MAC data lake...</p>
              <p className="text-sm text-slate-400 mt-1">Analyzing curated views</p>
            </motion.div>
          ) : data?.error || data?.ok === false ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 bg-red-50 border-2 border-red-200 rounded-xl"
            >
              <div className="font-semibold text-red-800 mb-2">Query Failed</div>
              <div className="text-sm text-red-700">{data?.error || 'Unknown error'}</div>
            </motion.div>
          ) : data ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Answer */}
              {data.answer_markdown && (
                <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-100">
                  <div className="prose prose-slate max-w-none">
                    <div className="text-slate-700 whitespace-pre-wrap">{data.answer_markdown}</div>
                  </div>
                </div>
              )}

              {/* Data Table */}
              {data.data_results && data.data_results.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-4 bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] flex items-center justify-between">
                    <div className="text-white font-semibold">Data Results</div>
                    <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                      {data.data_results.length} rows
                    </Badge>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          {Object.keys(data.data_results[0]).map((col, i) => (
                            <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.data_results.map((row, i) => (
                          <tr key={i} className={`border-t border-slate-100 hover:bg-[var(--mac-sky)]/20 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="px-4 py-3 text-slate-700">
                                {val === null || val === undefined ? '-' : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Evidence */}
              {data.evidence && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <button
                    onClick={() => setShowEvidence(!showEvidence)}
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Database className="w-4 h-4" />
                      Query Evidence
                    </div>
                    {showEvidence ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  
                  {showEvidence && (
                    <div className="p-4 border-t border-slate-100 space-y-3 text-xs">
                      {data.evidence.views_used && data.evidence.views_used.length > 0 && (
                        <div>
                          <span className="text-slate-500 font-medium">Views Used:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {data.evidence.views_used.map((v, i) => (
                              <Badge key={i} variant="outline" className="font-mono text-xs">
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {data.metadata && (
                        <div>
                          <span className="text-slate-500 font-medium">Query Stats:</span>
                          <div className="text-slate-600 text-xs mt-1">
                            {data.metadata.steps_succeeded}/{data.metadata.steps_executed} steps succeeded
                            {data.metadata.total_retries > 0 && ` (${data.metadata.total_retries} retries)`}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}