import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Loader2, Database, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MAC_AWS_ONLY } from '@/lib/mac-app-flags';
import { runSSOTQuery } from '@/api/ssotQuery';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function GLClosePack() {
  const [showSummaryEvidence, setShowSummaryEvidence] = useState(false);
  const [showDetailEvidence, setShowDetailEvidence] = useState(false);

  const invokeQuery = async ({ sql, queryId, params, label }) => {
    if (MAC_AWS_ONLY) {
      return runSSOTQuery({ queryId, params, label });
    }
    return base44.functions.invoke('aiLayerQuery', {
      template_id: 'freeform_sql_v1',
      params: { sql }
    });
  };

  // Step 1: Discover available months
  const { data: discovery, isLoading: discoveryLoading } = useQuery({
    queryKey: ['gl-close-pack-discovery'],
    queryFn: async () => {
      const response = await invokeQuery({
        queryId: 'glclosepack_discovery',
        label: 'GL Close Pack Discovery',
        sql: `SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'curated_core'
  AND (
    table_name LIKE 'v_platt_gl_revenue_%'
    OR table_name LIKE 'v_platt_gl_revenue_by_customer_%'
    OR table_name = 'v_platt_gl_revenue'
  )
ORDER BY table_name
LIMIT 200`
      });

      if (response.data?.error || response.data?.ok === false) {
        return { error: response.data?.error || 'Discovery failed', months: [], hasGenericView: false };
      }

      const tables = response.data?.data_rows || [];
      const columns = response.data?.columns || [];
      const normalize = (value) => String(value || '').toLowerCase();
      const hasPeriodMonthColumn = columns.some((col) => normalize(col) === 'period_month');
      const source = hasPeriodMonthColumn ? 'intacct' : 'platt';
      const hasGenericView = source === 'platt' && tables.some(row => row[1] === 'v_platt_gl_revenue');
      const hasGenericDetailView = source === 'platt' && tables.some(row => row[1] === 'v_platt_gl_revenue_by_customer');
      
      const months = new Set();
      if (source === 'intacct') {
        tables.forEach(row => {
          const value = Array.isArray(row) ? row[0] : Object.values(row)[0];
          if (value) months.add(String(value));
        });
      } else {
        // Parse YYYY_MM from table names
        tables.forEach(row => {
          const tableName = row[1];
          const match = tableName.match(/v_platt_gl_revenue(?:_by_customer)?_(\\d{4})_(\\d{2})$/);
          if (match) {
            const [_, year, month] = match;
            months.add(`${year}-${month}`);
          }
        });
      }

      const sortedMonths = Array.from(months).sort().reverse();
      
      // Compute previous month (default)
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
      
      // Default to previous month if available, otherwise latest
      const defaultMonth = sortedMonths.includes(previousMonth) ? previousMonth : sortedMonths[0];

      return {
        months: sortedMonths,
        source,
        hasGenericView,
        hasGenericDetailView,
        defaultMonth,
        discoveryData: tables
      };
    },
    refetchInterval: 300000,
  });

  const [selectedMonth, setSelectedMonth] = useState(null);
  
  // Auto-select default month once discovery completes
  React.useEffect(() => {
    if (discovery?.defaultMonth && !selectedMonth) {
      setSelectedMonth(discovery.defaultMonth);
    }
  }, [discovery, selectedMonth]);

  // Step 2: Fetch GL Summary
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['gl-close-summary', selectedMonth],
    queryFn: async () => {
      if (!selectedMonth) return null;

      const monthFormatted = selectedMonth.replace('-', '_');
      
      const buildIntacctSummarySql = (period) => `WITH base AS (\n  SELECT\n    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,\n    accountno,\n    account_title,\n    account_category,\n    TRY_CAST(amount AS double) AS amount\n  FROM curated_core.intacct_gl_entries_current_ssot\n)\nSELECT\n  account_category,\n  accountno,\n  account_title,\n  SUM(amount) AS amount_total\nFROM base\nWHERE entry_dt >= date_parse(concat('${period}', '-01'), '%Y-%m-%d')\n  AND entry_dt < date_add('month', 1, date_parse(concat('${period}', '-01'), '%Y-%m-%d'))\n  AND account_category IS NOT NULL\n  AND (account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts')\nGROUP BY 1,2,3\nORDER BY 1,2\nLIMIT 500`;

      // Try generic view first (Platt) or Intacct rollup
      let sql;
      if (discovery?.source === 'intacct') {
        sql = buildIntacctSummarySql(selectedMonth);
      } else if (discovery?.hasGenericView) {
        sql = `SELECT * FROM curated_core.v_platt_gl_revenue WHERE period_month = '${selectedMonth}' ORDER BY 1 LIMIT 500`;
      } else {
        sql = `SELECT * FROM curated_core.v_platt_gl_revenue_${monthFormatted} LIMIT 500`;
      }

      const response = await invokeQuery({
        queryId: MAC_AWS_ONLY ? 'glclosepack_summary' : undefined,
        params: MAC_AWS_ONLY ? { period_month: selectedMonth, limit: 500 } : undefined,
        label: 'GL Close Pack Summary',
        sql
      });

      return {
        ...response.data,
        sql_used: sql
      };
    },
    enabled: !!selectedMonth && !discoveryLoading,
  });

  // Step 3: Fetch Customer Detail (for export)
  const { data: detailData, refetch: refetchDetail } = useQuery({
    queryKey: ['gl-close-detail', selectedMonth],
    queryFn: async () => {
      if (!selectedMonth) return null;

      const monthFormatted = selectedMonth.replace('-', '_');
      
      const buildIntacctDetailSql = (period, limit) => `WITH base AS (\n  SELECT\n    COALESCE(business_date, TRY(date_parse(entry_date, '%m/%d/%Y'))) AS entry_dt,\n    accountno,\n    account_title,\n    account_category,\n    customerid,\n    customername,\n    document,\n    description,\n    TRY_CAST(amount AS double) AS amount\n  FROM curated_core.intacct_gl_entries_current_ssot\n)\nSELECT\n  entry_dt,\n  account_category,\n  accountno,\n  account_title,\n  customerid,\n  customername,\n  amount,\n  document,\n  description\nFROM base\nWHERE entry_dt >= date_parse(concat('${period}', '-01'), '%Y-%m-%d')\n  AND entry_dt < date_add('month', 1, date_parse(concat('${period}', '-01'), '%Y-%m-%d'))\n  AND account_category IS NOT NULL\n  AND (account_category LIKE 'Revenue%' OR account_category LIKE '%Revenue' OR account_category = 'Sales Returns and Discounts')\nORDER BY entry_dt DESC\nLIMIT ${limit}`;

      let sql;
      if (discovery?.source === 'intacct') {
        sql = buildIntacctDetailSql(selectedMonth, 5000);
      } else if (discovery?.hasGenericView) {
        sql = `SELECT * FROM curated_core.v_platt_gl_revenue WHERE period_month = '${selectedMonth}' LIMIT 5000`;
      } else {
        sql = `SELECT * FROM curated_core.v_platt_gl_revenue_by_customer_${monthFormatted} LIMIT 5000`;
      }

      const response = await invokeQuery({
        queryId: MAC_AWS_ONLY ? 'glclosepack_detail' : undefined,
        params: MAC_AWS_ONLY ? { period_month: selectedMonth, limit: 5000 } : undefined,
        label: 'GL Close Pack Detail',
        sql
      });

      return {
        ...response.data,
        sql_used: sql
      };
    },
    enabled: false, // Manual trigger for export
  });

  const handleExportDetail = async () => {
    if (MAC_AWS_ONLY && discovery?.source === 'platt' && discovery?.hasGenericDetailView === false) {
      toast.error('GL detail view is not available yet.');
      return;
    }
    const result = await refetchDetail();
    const data = result.data;
    
    if (!data?.data_rows || data.data_rows.length === 0) {
      toast.error('No detail data to export');
      return;
    }

    const headers = data.columns || [];
    const rows = data.data_rows.map(row => Array.isArray(row) ? row : Object.values(row));
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(val => `"${val}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GL_Close_Pack_${selectedMonth}_Detail.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Customer detail exported');
  };

  const handleExportSummary = () => {
    if (!summaryData?.data_rows || summaryData.data_rows.length === 0) {
      toast.error('No summary data to export');
      return;
    }

    const headers = summaryData.columns || [];
    const rows = summaryData.data_rows.map(row => Array.isArray(row) ? row : Object.values(row));
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(val => `"${val}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GL_Close_Pack_${selectedMonth}_Summary.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('GL summary exported');
  };

  if (discoveryLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-6 flex items-center justify-center min-h-[200px]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--mac-forest)]" />
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (discovery?.error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-white border-0 shadow-sm border-red-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-red-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              GL Close Pack - Discovery Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="font-semibold text-xs text-red-800 mb-1">Error</div>
              <div className="text-xs text-red-700">{discovery.error}</div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-gradient-to-br from-white to-slate-50 border-0 shadow-lg hover:shadow-xl transition-all">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] shadow-sm">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <CardTitle className="text-sm font-semibold text-slate-800">GL Close Pack</CardTitle>
          </div>
          
          <div className="flex items-center gap-2">
            {discovery?.months && discovery.months.length > 0 && (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {discovery.months.map(month => (
                    <SelectItem key={month} value={month} className="text-xs">
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportDetail}
              className="h-8 text-xs hover:bg-blue-50"
              disabled={!selectedMonth}
            >
              <Download className="w-3 h-3 mr-1" />
              Detail
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSummary}
              className="h-8 text-xs hover:bg-emerald-50"
              disabled={!summaryData?.data_rows}
            >
              <Download className="w-3 h-3 mr-1" />
              Summary
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {summaryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--mac-forest)]" />
            </div>
          ) : summaryError || summaryData?.error || summaryData?.ok === false ? (
            <div className="space-y-3">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="font-semibold text-xs text-red-800 mb-2">Query Failed</div>
                <div className="text-xs text-red-700">{summaryData?.error || summaryError?.message || 'Unknown error'}</div>
              </div>
              
              {summaryData?.sql_used && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs font-semibold text-slate-700 mb-1">Last SQL:</div>
                  <pre className="text-[10px] text-slate-600 overflow-x-auto">{summaryData.sql_used}</pre>
                </div>
              )}
              
              {discovery?.discoveryData && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs font-semibold text-slate-700 mb-1">Discovery Results:</div>
                  <pre className="text-[10px] text-slate-600 overflow-x-auto max-h-32">
                    {JSON.stringify(discovery.discoveryData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : summaryData?.data_rows && summaryData.data_rows.length > 0 ? (
            <div className="space-y-3">
              <div className="overflow-x-auto max-h-80 rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--mac-sky)] text-[var(--mac-forest)] sticky top-0">
                    <tr>
                      {summaryData.columns?.map((col, i) => (
                        <th key={i} className="px-3 py-2 text-left text-[10px] font-semibold uppercase">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.data_rows.map((row, i) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className={`border-t border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                          {values.map((val, j) => (
                            <td key={j} className="px-3 py-2 text-slate-700">
                              {val === null || val === undefined ? '-' : String(val)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">
                  {summaryData.data_rows.length} rows
                </Badge>
                <button
                  onClick={() => setShowSummaryEvidence(!showSummaryEvidence)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  <Database className="w-3 h-3" />
                  Evidence
                  {showSummaryEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {showSummaryEvidence && summaryData.sql_used && (
                <div className="p-3 bg-slate-50 rounded-lg space-y-2 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium">SQL:</span>
                    <pre className="mt-1 p-2 bg-[var(--mac-ice)] text-[var(--mac-ash)] border border-[var(--mac-panel-border)] rounded text-[10px] overflow-x-auto">
                      {summaryData.sql_used}
                    </pre>
                  </div>
                  {summaryData.evidence?.athena_query_execution_id && (
                    <div>
                      <span className="text-slate-500 font-medium">Execution ID:</span>
                      <div className="font-mono text-slate-600 break-all text-[10px] mt-0.5">
                        {summaryData.evidence.athena_query_execution_id}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500 font-medium">Month:</span>
                    <Badge variant="outline" className="ml-2 text-[10px]">{selectedMonth}</Badge>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">View Type:</span>
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {discovery?.hasGenericView ? 'Generic (period_month filter)' : 'Month-specific'}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-slate-500">
              No GL data for {selectedMonth}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
