import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Database, Loader2, AlertCircle, Maximize2, Download, Pin, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import TileModal from './TileModal';
import EvidenceDrawer from './EvidenceDrawer';
import { useDashboardRefresh } from './DashboardRefreshProvider';

export default function DashboardTile({ title, sql, icon: Icon, renderValue, renderContent, tileId, supportedPeriods = ['current'] }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const { refreshTrigger, isPaused } = useDashboardRefresh();

  const handleExport = () => {
    if (!data?.data_rows || data.data_rows.length === 0) return;
    
    const headers = data.columns || [];
    const rows = data.data_rows.map(row => 
      Array.isArray(row) ? row : Object.values(row)
    );
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(val => `"${val}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Data exported to CSV');
  };

  const handlePin = (e) => {
    e.stopPropagation();
    setIsPinned(!isPinned);
    toast.success(isPinned ? 'Tile unpinned' : 'Tile pinned to dashboard');
  };
  
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['tile', title],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql }
      });
      return response.data;
    },
    retry: 3,
    retryDelay: 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: !isPaused && !isModalOpen ? 60000 : false,
    staleTime: 0,
    enabled: !isPaused || !isModalOpen
  });

  // Auto-refresh based on global trigger
  useEffect(() => {
    if (!isPaused && !isModalOpen) {
      refetch();
    }
  }, [refreshTrigger, isPaused, isModalOpen, refetch]);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="p-6 flex items-center justify-center min-h-[200px]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--mac-forest)]" />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (error || data?.ok === false || data?.error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="bg-card border-destructive shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="w-5 h-5 text-destructive" />}
              <CardTitle className="text-base font-semibold text-card-foreground">{title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="font-semibold text-xs text-destructive mb-1">Query Failed</div>
              <div className="text-xs text-destructive/90">{data?.error || error?.message || 'Unknown error'}</div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        whileHover={{ y: -4, transition: { duration: 0.2 } }}
      >
        <Card className="bg-gradient-to-br from-card to-card/80 border-border shadow-lg hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden" onClick={() => setIsModalOpen(true)}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--mac-sky)]/20 to-transparent rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform" />
          
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {Icon && (
                  <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] shadow-sm">
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                )}
                <CardTitle className="text-sm font-semibold text-card-foreground group-hover:text-[var(--mac-forest)] transition-colors">{title}</CardTitle>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-10">
                <Clock className="w-2.5 h-2.5" />
                <span>{formatTimestamp(dataUpdatedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePin}
                className={`p-1.5 rounded-lg transition-all ${isPinned ? 'bg-[var(--mac-forest)] text-white' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground opacity-0 group-hover:opacity-100'}`}
                title={isPinned ? 'Unpin' : 'Pin to dashboard'}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport();
                }}
                className="p-1.5 rounded-lg bg-secondary hover:bg-emerald-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModalOpen(true);
                }}
                className="p-1.5 rounded-lg bg-secondary hover:bg-[var(--mac-forest)] hover:text-white transition-colors opacity-0 group-hover:opacity-100"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <div onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100">
                <EvidenceDrawer 
                  evidence={data?.evidence} 
                  title={`${title} - Evidence`}
                />
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="relative z-10">
            {renderValue && data?.data_rows?.[0] && !renderContent && (
              <div className="mb-4">
                {renderValue(data)}
              </div>
            )}
            
            {renderContent && data?.data_rows && (
              <div>
                {renderContent(data)}
              </div>
            )}

            {showEvidence && (data?.evidence || sql) && (
              <div className="mt-3 p-3 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                  <Database className="w-3.5 h-3.5 text-[var(--mac-forest)]" />
                  <span className="font-semibold text-foreground">Evidence (Lane A: Athena)</span>
                </div>
                
                {sql && (
                  <div>
                    <span className="text-muted-foreground font-medium">Generated SQL:</span>
                    <pre className="mt-1 p-2 bg-slate-900 text-emerald-400 rounded text-[10px] overflow-x-auto max-h-32 whitespace-pre-wrap">{sql}</pre>
                  </div>
                )}
                
                {data?.evidence?.athena_query_execution_id && (
                  <div>
                    <span className="text-muted-foreground font-medium">Athena Execution ID:</span>
                    <div className="font-mono text-muted-foreground break-all text-[10px] mt-0.5 bg-white dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                      {data.evidence.athena_query_execution_id}
                    </div>
                  </div>
                )}
                
                {data?.columns && (
                  <div>
                    <span className="text-muted-foreground font-medium">Columns Returned:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {data.columns.slice(0, 6).map((col, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-[9px] bg-white dark:bg-slate-950">
                          {col}
                        </Badge>
                      ))}
                      {data.columns.length > 6 && (
                        <Badge variant="outline" className="text-[9px]">
                          +{data.columns.length - 6} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="pt-1 border-t border-slate-200 dark:border-slate-700 text-[10px] text-muted-foreground">
                  {data?.data_rows?.length || 0} rows • Last updated {formatTimestamp(dataUpdatedAt)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <TileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title}
        data={data}
        sql={sql}
        icon={Icon}
        tileId={tileId}
        supportedPeriods={supportedPeriods}
      />
    </>
  );
}