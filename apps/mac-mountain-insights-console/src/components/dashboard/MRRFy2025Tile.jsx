import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign, Download, Users, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const FY2025_KPI_SQL = `SELECT
  SUM(mrr_total_customer_month) AS fy2025_mrr_total
FROM (
  SELECT
    period_month,
    customer_id,
    SUM(mrr_total) AS mrr_total_customer_month
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month >= DATE '2025-01-01'
    AND period_month <= DATE '2025-12-01'
  GROUP BY 1,2
)
LIMIT 1`;

const FY2025_MONTHLY_SQL = `WITH customer_month AS (
  SELECT
    period_month,
    customer_id,
    SUM(mrr_total) AS mrr_total_customer_month
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month >= DATE '2025-01-01'
    AND period_month <= DATE '2025-12-01'
  GROUP BY 1,2
)
SELECT
  date_format(period_month, '%Y-%m') AS period_month,
  SUM(mrr_total_customer_month) AS total_mrr
FROM customer_month
GROUP BY 1
ORDER BY 1
LIMIT 50`;

const FY2025_TOP_CUSTOMERS_SQL = `WITH customer_month AS (
  SELECT
    period_month,
    customer_id,
    customer_name,
    SUM(mrr_total) AS mrr_total_customer_month
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month >= DATE '2025-01-01'
    AND period_month <= DATE '2025-12-01'
  GROUP BY 1,2,3
)
SELECT
  customer_id,
  customer_name,
  SUM(mrr_total_customer_month) AS fy2025_mrr_total
FROM customer_month
GROUP BY 1,2
ORDER BY 3 DESC
LIMIT 25`;

export default function MRRFy2025Tile() {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showDrilldown, setShowDrilldown] = useState(false);

  const { data: kpiData, isLoading: kpiLoading, error: kpiError } = useQuery({
    queryKey: ['mrr-fy2025-kpi'],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: FY2025_KPI_SQL }
      });
      return response.data;
    },
    staleTime: 300000,
  });

  const { data: monthlyData, isLoading: monthlyLoading, error: monthlyError } = useQuery({
    queryKey: ['mrr-fy2025-monthly'],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: FY2025_MONTHLY_SQL }
      });
      return response.data;
    },
    staleTime: 300000,
  });

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['mrr-fy2025-customers'],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: FY2025_TOP_CUSTOMERS_SQL }
      });
      return response.data;
    },
    enabled: showDrilldown,
    staleTime: 300000,
  });

  const handleExportMonthly = () => {
    if (!monthlyData?.data_rows) return;
    const csv = [
      ['period_month', 'total_mrr'],
      ...monthlyData.data_rows.map(row => {
        const vals = Array.isArray(row) ? row : Object.values(row);
        return vals;
      })
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MRR_FY2025_Monthly.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportCustomers = () => {
    if (!customersData?.data_rows) return;
    const csv = [
      ['customer_id', 'customer_name', 'fy2025_mrr_total'],
      ...customersData.data_rows.map(row => {
        const vals = Array.isArray(row) ? row : Object.values(row);
        return vals;
      })
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MRR_FY2025_Top_Customers.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (kpiError || (kpiData && kpiData.ok === false)) {
    return (
      <Card className="border-2 border-red-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            MRR FY2025 - Query Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-red-700">
              {kpiData?.error || kpiError?.message || 'Unknown error'}
            </p>
            <div className="bg-red-50 p-3 rounded-lg">
              <p className="text-xs font-medium text-red-800 mb-1">SQL Used:</p>
              <pre className="text-xs text-red-700 whitespace-pre-wrap">{FY2025_KPI_SQL}</pre>
            </div>
            {kpiData?.evidence && (
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs font-medium text-slate-700 mb-1">Evidence:</p>
                <p className="text-xs text-slate-600">Execution ID: {kpiData.evidence.athena_query_execution_id || 'N/A'}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const kpiValue = kpiData?.data_rows?.[0]?.[0] || 0;
  const chartData = monthlyData?.data_rows?.map(row => {
    const vals = Array.isArray(row) ? row : Object.values(row);
    return {
      month: vals[0],
      mrr: Number(vals[1]) || 0
    };
  }) || [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            MRR Trend (FY2025)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KPI */}
          <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl">
            {kpiLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            ) : (
              <>
                <p className="text-sm text-emerald-700 mb-1">FY2025 Total MRR (Jan-Dec)</p>
                <p className="text-3xl font-bold text-emerald-900">
                  ${(kpiValue / 1000).toFixed(2)}K
                </p>
              </>
            )}
          </div>

          {/* Monthly Chart */}
          {monthlyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                <Tooltip />
                <Line type="monotone" dataKey="mrr" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowDrilldown(true)}>
              <Users className="w-4 h-4 mr-2" />
              View Top Customers
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportMonthly}>
              <Download className="w-4 h-4 mr-2" />
              Download Monthly CSV
            </Button>
          </div>

          {/* Evidence Expander */}
          <div className="border-t pt-3">
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Evidence
            </button>
            {showEvidence && (
              <div className="mt-2 space-y-2 text-xs">
                <div className="bg-slate-50 p-2 rounded">
                  <p className="font-medium text-slate-700">Athena Query ID:</p>
                  <p className="text-slate-600 font-mono">{kpiData?.evidence?.athena_query_execution_id || 'N/A'}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded">
                  <p className="font-medium text-slate-700 mb-1">Generated SQL:</p>
                  <pre className="text-slate-600 whitespace-pre-wrap">{FY2025_KPI_SQL}</pre>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground italic">
            Lake export from curated_core.v_monthly_mrr_platt; rolled up from CRID-level to customer-month using SUM(mrr_total).
          </p>
        </CardContent>
      </Card>

      {/* Drilldown Modal */}
      <Dialog open={showDrilldown} onOpenChange={setShowDrilldown}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Top 25 Customers by FY2025 MRR</DialogTitle>
          </DialogHeader>
          {customersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : customersData?.data_rows ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">Customer ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">Customer Name</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">FY2025 MRR Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersData.data_rows.map((row, i) => {
                      const vals = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{vals[0]}</td>
                          <td className="px-3 py-2 text-slate-700">{vals[1]}</td>
                          <td className="px-3 py-2 text-right text-slate-700 font-medium">
                            ${Number(vals[2]).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button size="sm" onClick={handleExportCustomers}>
                <Download className="w-4 h-4 mr-2" />
                Download Customer CSV
              </Button>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No data available</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}