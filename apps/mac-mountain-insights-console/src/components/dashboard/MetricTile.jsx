import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';

export default function MetricTile({ title, sql, icon: Icon, onClick, tileId }) {
  const [showEvidence, setShowEvidence] = React.useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['metric-tile', tileId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql }
      });
      return { ...response.data, sql_used: sql };
    },
    refetchInterval: 300000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-6 flex items-center justify-center min-h-[140px]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--mac-forest)]" />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (error || data?.ok === false || data?.error) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="bg-white border-0 shadow-sm border-red-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="w-4 h-4 text-red-600" />}
              <CardTitle className="text-sm font-semibold text-red-800">{title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <div className="font-semibold text-xs text-red-800">Unable to fetch data</div>
              </div>
              <div className="text-xs text-red-700">{data?.error || error?.message || 'Query failed'}</div>
              {data?.sql_used && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-red-600 hover:text-red-700">SQL</summary>
                  <pre className="mt-1 p-2 bg-red-100 rounded text-[10px] overflow-x-auto">{data.sql_used}</pre>
                </details>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const value = data?.data_rows?.[0]?.[0];
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value || 'N/A';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="cursor-pointer"
      onClick={onClick}
    >
      <Card className="bg-gradient-to-br from-white to-slate-50 border-0 shadow-md hover:shadow-xl transition-all group">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] shadow-sm">
                <Icon className="w-4 h-4 text-white" />
              </div>
            )}
            <CardTitle className="text-sm font-semibold text-slate-800 group-hover:text-[var(--mac-forest)] transition-colors">
              {title}
            </CardTitle>
          </div>
          {data?.evidence && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowEvidence(!showEvidence);
              }}
              className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <Database className="w-3 h-3" />
              {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-slate-900 mb-2">{formattedValue}</div>
          
          {showEvidence && data?.evidence && (
            <div className="mt-3 p-2 bg-slate-50 rounded-lg space-y-1 text-xs">
              {data.evidence.athena_query_execution_id && (
                <div>
                  <span className="text-slate-500 font-medium">Execution ID:</span>
                  <div className="font-mono text-slate-600 break-all text-[10px]">
                    {data.evidence.athena_query_execution_id}
                  </div>
                </div>
              )}
              {data.sql_used && (
                <details>
                  <summary className="cursor-pointer text-slate-600 hover:text-slate-800">SQL</summary>
                  <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded text-[10px] overflow-x-auto">
                    {data.sql_used}
                  </pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}