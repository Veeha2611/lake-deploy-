import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign, Download, Users, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { runSSOTQuery } from '@/api/ssotQuery';
import { MAC_AWS_ONLY } from '@/lib/mac-app-flags';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const FY2025_KPI_SQL = `SELECT
  SUM(total_mrr) AS fy2025_mrr_total
FROM curated_core.v_platt_billing_mrr_monthly
WHERE substr(CAST(period_month AS varchar), 1, 7) >= '2025-01'
  AND substr(CAST(period_month AS varchar), 1, 7) <= '2025-12'
LIMIT 1`;

const FY2025_MONTHLY_SQL = `SELECT
  substr(CAST(period_month AS varchar), 1, 7) AS period_month,
  SUM(total_mrr) AS total_mrr
FROM curated_core.v_platt_billing_mrr_monthly
WHERE substr(CAST(period_month AS varchar), 1, 7) >= '2025-01'
  AND substr(CAST(period_month AS varchar), 1, 7) <= '2025-12'
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
  WHERE substr(CAST(period_month AS varchar), 1, 7) >= '2025-01'
    AND substr(CAST(period_month AS varchar), 1, 7) <= '2025-12'
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
  const useAwsSummary = MAC_AWS_ONLY;

  const FY2025_KPI_SQL_AWS = `SELECT
  SUM(total_mrr) AS fy2025_mrr_total
FROM curated_core.v_platt_billing_mrr_monthly
WHERE substr(CAST(period_month AS varchar), 1, 7) >= '2025-01'
  AND substr(CAST(period_month AS varchar), 1, 7) <= '2025-12'
LIMIT 1`;

  const FY2025_MONTHLY_SQL_AWS = `SELECT
  substr(CAST(period_month AS varchar), 1, 7) AS period_month,
  SUM(total_mrr) AS total_mrr
FROM curated_core.v_platt_billing_mrr_monthly
WHERE substr(CAST(period_month AS varchar), 1, 7) >= '2025-01'
  AND substr(CAST(period_month AS varchar), 1, 7) <= '2025-12'
GROUP BY 1
ORDER BY 1
LIMIT 50`;

  const { data: kpiData, isLoading: kpiLoading, error: kpiError } = useQuery({
    queryKey: ['mrr-fy2025-kpi'],
    queryFn: async () => {
      const response = await runSSOTQuery({
        queryId: useAwsSummary ? 'mrr_fy2025_kpi' : undefined,
        sql: useAwsSummary ? FY2025_KPI_SQL_AWS : FY2025_KPI_SQL,
        label: 'FY2025 MRR Total'
      });
      return response.data;
    },
    staleTime: 300000,
  });

  const { data: monthlyData, isLoading: monthlyLoading, error: monthlyError } = useQuery({
    queryKey: ['mrr-fy2025-monthly'],
    queryFn: async () => {
      const response = await runSSOTQuery({
        queryId: useAwsSummary ? 'mrr_fy2025_monthly' : undefined,
        sql: useAwsSummary ? FY2025_MONTHLY_SQL_AWS : FY2025_MONTHLY_SQL,
        label: 'FY2025 MRR Monthly'
      });
      return response.data;
    },
    staleTime: 300000,
  });

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['mrr-fy2025-customers'],
    queryFn: async () => {
      if (useAwsSummary) {
        return { ok: true, columns: [], data_rows: [] };
      }
      const response = await runSSOTQuery({
        queryId: 'mrr_fy2025_top_customers',
        sql: FY2025_TOP_CUSTOMERS_SQL,
        label: 'FY2025 Top Customers'
      });
      return response.data;
    },
    enabled: showDrilldown && !useAwsSummary,
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
      <Card className="mac-panel border border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            MRR FY2025 - Query Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              {kpiData?.error || kpiError?.message || 'Unknown error'}
            </p>
            <div className="bg-destructive/10 p-3 rounded-lg">
              <p className="text-xs font-medium text-destructive mb-1">SQL Used:</p>
              <pre className="text-xs text-destructive whitespace-pre-wrap">{FY2025_KPI_SQL}</pre>
            </div>
            {kpiData?.evidence && (
              <div className="bg-[var(--mac-ice)] p-3 rounded-lg">
                <p className="text-xs font-medium text-foreground mb-1">Evidence:</p>
                <p className="text-xs text-muted-foreground">Execution ID: {kpiData.evidence.athena_query_execution_id || 'N/A'}</p>
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
      <Card className="mac-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="mac-icon-badge">
              <DollarSign className="w-4 h-4" />
            </span>
            MRR Trend (FY2025)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KPI */}
          <div className="p-4 bg-[var(--mac-ice)] rounded-xl border border-[var(--mac-panel-border)]">
            {kpiLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-1">FY2025 Total MRR (Jan-Dec)</p>
                <p className="text-3xl font-bold text-[var(--mac-forest)]">
                  ${(kpiValue / 1000).toFixed(2)}K
                </p>
              </>
            )}
          </div>

          {/* Monthly Chart */}
          {monthlyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Line type="monotone" dataKey="mrr" stroke="var(--mac-forest)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {!useAwsSummary && (
              <Button size="sm" variant="outline" className="mac-button-outline" onClick={() => setShowDrilldown(true)}>
                <Users className="w-4 h-4 mr-2" />
                View Top Customers
              </Button>
            )}
            <Button size="sm" variant="outline" className="mac-button-outline" onClick={handleExportMonthly}>
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
                <div className="bg-[var(--mac-ice)] p-2 rounded">
                  <p className="font-medium text-foreground">Athena Query ID:</p>
                  <p className="text-muted-foreground font-mono">{kpiData?.evidence?.athena_query_execution_id || 'N/A'}</p>
                </div>
                <div className="bg-[var(--mac-ice)] p-2 rounded">
                  <p className="font-medium text-foreground mb-1">Generated SQL:</p>
                  <pre className="text-muted-foreground whitespace-pre-wrap">{useAwsSummary ? FY2025_KPI_SQL_AWS : FY2025_KPI_SQL}</pre>
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
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : customersData?.data_rows ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="mac-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase">Customer ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase">Customer Name</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase">FY2025 MRR Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersData.data_rows.map((row, i) => {
                      const vals = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2">{vals[0]}</td>
                          <td className="px-3 py-2">{vals[1]}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            ${Number(vals[2]).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button size="sm" className="mac-button-primary" onClick={handleExportCustomers}>
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
