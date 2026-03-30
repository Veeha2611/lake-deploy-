import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import TableWithSort from '../console/TableWithSort';

export default function KPITileModal({ isOpen, onClose, kpi }) {
  const { data, isLoading } = useQuery({
    queryKey: ['kpi-detail', kpi?.label],
    queryFn: async () => {
      if (!kpi?.detailQuestionId) return null;

      const response = await base44.functions.invoke('aiLayerQuery', {
        question_id: kpi.detailQuestionId,
        params: kpi.detailParams || {}
      });
      
      const responseData = response.data;
      if (responseData.ok !== false && responseData.data_rows) {
        responseData.data_results = responseData.data_rows.map(row => {
          if (Array.isArray(row)) {
            const obj = {};
            responseData.columns.forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          }
          return row;
        });
      }
      
      return { ...responseData };
    },
    enabled: isOpen && !!kpi?.detailQuestionId,
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
    a.download = `${kpi?.label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Data exported');
  };

  if (!kpi) return null;

  const Icon = kpi.icon;
  const columns = data?.data_results?.[0] ? Object.keys(data.data_results[0]) : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg bg-gradient-to-br ${kpi.gradientClass} shadow-md`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <DialogTitle className="text-2xl font-bold text-slate-900">{kpi.label}</DialogTitle>
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

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
          </div>
        ) : data?.error || data?.ok === false ? (
          <div className="space-y-3">
            <div className="p-6 bg-red-50 border-2 border-red-200 rounded-xl">
              <div className="font-semibold text-red-800 mb-2">Query Failed</div>
              <div className="text-sm text-red-700">{data?.error || 'Unknown error'}</div>
            </div>
            {data?.generated_sql && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700 mb-1">SQL Used:</div>
                <pre className="text-[10px] text-slate-600 overflow-x-auto">{data.generated_sql}</pre>
              </div>
            )}
          </div>
        ) : data?.data_results ? (
          <div>
            <TableWithSort data={data.data_results} columns={columns} />
            
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                {data.data_results.length} rows
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">No detailed data available</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
