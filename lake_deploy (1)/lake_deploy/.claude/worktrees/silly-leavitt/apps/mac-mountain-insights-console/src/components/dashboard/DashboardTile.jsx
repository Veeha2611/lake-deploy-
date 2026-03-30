import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Database, Loader2, AlertCircle, Maximize2, Download, Pin, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { runSSOTQuery } from '@/api/ssotQuery';
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
      const response = await runSSOTQuery({
        queryId: tileId,
        sql,
        label: title
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
  const isUnavailable = data?.evidence_pack?.status === 'unavailable';

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
        <Card className="mac-panel">
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
        <Card className="mac-panel border border-destructive/30">
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

  if (isUnavailable) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="mac-panel border border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="w-5 h-5 text-amber-600" />}
              <CardTitle className="text-base font-semibold text-card-foreground">{title}</CardTitle>
            </div>
            <div className="opacity-0 group-hover:opacity-100">
              <EvidenceDrawer
                evidence={data?.evidence}
                title={`${title} - Evidence`}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="font-semibold text-xs text-amber-700 mb-1">Freshness Check Failed</div>
              <div className="text-xs text-amber-800 whitespace-pre-wrap">
                {String(data?.answer_markdown || '').replace(/\*\*/g, '')}
              </div>
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
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
      >
        <Card className="mac-panel shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden" onClick={() => setIsModalOpen(true)}>
          
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {Icon && (
                  <div className="mac-icon-badge">
                    <Icon className="w-4 h-4" />
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
                className="p-1.5 rounded-lg bg-secondary hover:bg-[var(--mac-forest)] hover:text-white transition-colors opacity-0 group-hover:opacity-100"
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
              <div className="mt-3 p-3 bg-[var(--mac-ice)] rounded-lg border border-[var(--mac-panel-border)] space-y-2 text-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--mac-panel-border)]">
                  <Database className="w-3.5 h-3.5 text-[var(--mac-forest)]" />
                  <span className="font-semibold text-foreground">Evidence (Lane A: Athena)</span>
                </div>
                
                {sql && (
                  <div>
                    <span className="text-muted-foreground font-medium">Generated SQL:</span>
                    <pre className="mt-1 p-2 bg-[var(--mac-ice)] text-[var(--mac-forest)] rounded text-[10px] overflow-x-auto max-h-32 whitespace-pre-wrap border border-[var(--mac-panel-border)]">{sql}</pre>
                  </div>
                )}
                
                {data?.evidence?.athena_query_execution_id && (
                  <div>
                    <span className="text-muted-foreground font-medium">Athena Execution ID:</span>
                    <div className="font-mono text-muted-foreground break-all text-[10px] mt-0.5 bg-white p-1.5 rounded border border-[var(--mac-panel-border)]">
                      {data.evidence.athena_query_execution_id}
                    </div>
                  </div>
                )}
                
                {data?.columns && (
                  <div>
                    <span className="text-muted-foreground font-medium">Columns Returned:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {data.columns.slice(0, 6).map((col, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-[9px] bg-white">
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
                
                <div className="pt-1 border-t border-[var(--mac-panel-border)] text-[10px] text-muted-foreground">
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
