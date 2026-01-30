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
      if (!kpi?.detailSql) return null;
      
      // Always discover columns for At Risk tile to ensure robust querying
      let finalSql = kpi.detailSql;
      
      const viewMatch = kpi.detailSql.match(/FROM\s+([\w.]+)/i);
      if (viewMatch) {
        const viewName = viewMatch[1];
        const parts = viewName.split('.');
        const schema = parts[0];
        const table = parts[1];
        
        try {
          const discoverResponse = await base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: { 
              sql: `SELECT column_name FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' ORDER BY ordinal_position LIMIT 100`
            }
          });
          
          if (discoverResponse.data?.data_rows) {
            const availableColumns = discoverResponse.data.data_rows.map(row => {
              return Array.isArray(row) ? row[0] : Object.values(row)[0];
            });
            
            // Rewrite SQL to use only available columns
            if (kpi.label === 'At Risk (D/E)') {
              const cols = [];
              if (availableColumns.includes('action_band')) cols.push('action_band');
              if (availableColumns.includes('total_mrr')) cols.push('total_mrr');
              if (availableColumns.includes('total_cost')) cols.push('total_cost');
              if (availableColumns.includes('net_margin')) cols.push('net_margin');
              if (availableColumns.includes('customer_name')) cols.push('customer_name');
              if (availableColumns.includes('account_number')) cols.push('account_number');
              
              // Add calculated margin if we have the components but not the column
              if (!cols.includes('net_margin') && cols.includes('total_mrr') && cols.includes('total_cost')) {
                cols.push('(total_mrr - total_cost) as net_margin');
              }
              
              finalSql = `SELECT ${cols.length > 0 ? cols.join(', ') : '*'} 
                FROM ${viewName} 
                WHERE action_band IN ('D', 'E') 
                ORDER BY action_band, total_mrr ASC 
                LIMIT 100`;
            } else if (kpi.label === 'Total MRR') {
              const cols = [];
              if (availableColumns.includes('total_mrr')) cols.push('total_mrr');
              if (availableColumns.includes('action_band')) cols.push('action_band');
              if (availableColumns.includes('customer_name')) cols.push('customer_name');
              
              finalSql = `SELECT ${cols.length > 0 ? cols.join(', ') : '*'} 
                FROM ${viewName} 
                WHERE total_mrr > 0 
                ORDER BY total_mrr DESC 
                LIMIT 100`;
            } else if (kpi.label === 'Active Accounts') {
              const cols = [];
              if (availableColumns.includes('is_test_internal')) cols.push('is_test_internal');
              if (availableColumns.includes('has_active_service')) cols.push('has_active_service');
              if (availableColumns.includes('customer_name')) cols.push('customer_name');
              
              finalSql = `SELECT ${cols.length > 0 ? cols.join(', ') : '*'} 
                FROM ${viewName} 
                WHERE has_active_service = true AND is_test_internal = false 
                LIMIT 100`;
            }
          }
        } catch (err) {
          console.error('Column discovery failed, using original SQL:', err);
        }
      }
      
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: finalSql }
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
      
      return { ...responseData, sql_used: finalSql };
    },
    enabled: isOpen && !!kpi?.detailSql,
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
            {data?.sql_used && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-xs font-semibold text-slate-700 mb-1">SQL Used:</div>
                <pre className="text-[10px] text-slate-600 overflow-x-auto">{data.sql_used}</pre>
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