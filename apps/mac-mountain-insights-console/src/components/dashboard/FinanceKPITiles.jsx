import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Users, AlertCircle, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FinanceKPITiles() {
  const { data: kpiData, isLoading } = useQuery({
    queryKey: ['finance-kpis-aws'],
    queryFn: async () => {
      const [mrrRes, customersRes, churnRes] = await Promise.all([
        base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { 
            sql: `WITH customer_month AS (
              SELECT customer_id, SUM(mrr_total) AS mrr
              FROM curated_core.v_monthly_mrr_platt
              WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
              GROUP BY 1
            )
            SELECT 
              SUM(mrr) as total_mrr,
              COUNT(*) as customers_with_mrr
            FROM customer_month WHERE mrr > 0 LIMIT 1`
          }
        }),
        base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { 
            sql: `SELECT COUNT(*) as active_customers
            FROM curated_core.dim_customer_platt
            WHERE has_active_service = true AND is_test_internal = false LIMIT 1`
          }
        }),
        base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { 
            sql: `SELECT 
              ending_mrr,
              mrr_churn
            FROM curated_core.v_monthly_mrr_and_churn_summary
            ORDER BY period_month DESC LIMIT 1`
          }
        })
      ]);

      const mrrRow = mrrRes.data?.data_rows?.[0] || [];
      const custRow = customersRes.data?.data_rows?.[0] || [];
      const churnRow = churnRes.data?.data_rows?.[0] || [];

      const totalMRR = parseFloat(mrrRow[0] || 0);
      const mrrCustomers = parseInt(mrrRow[1] || 0);
      const activeCustomers = parseInt(custRow[0] || 0);
      const endingMRR = parseFloat(churnRow[0] || 0);
      const churn = parseFloat(churnRow[1] || 0);
      const churnRate = endingMRR > 0 ? (Math.abs(churn) / endingMRR) * 100 : 0;

      return {
        totalMRR,
        mrrCustomers,
        activeCustomers,
        churnRate,
        avgMRRPerCustomer: mrrCustomers > 0 ? totalMRR / mrrCustomers : 0
      };
    },
    staleTime: 0,
    refetchInterval: 60000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const kpis = [
    {
      label: 'Total MRR',
      value: kpiData ? `$${(kpiData.totalMRR / 1000).toFixed(1)}K` : '—',
      icon: DollarSign,
      color: 'emerald',
      description: 'Monthly Recurring Revenue'
    },
    {
      label: 'MRR Customers',
      value: kpiData?.mrrCustomers?.toLocaleString() || '—',
      icon: Users,
      color: 'blue',
      description: 'Customers with active MRR'
    },
    {
      label: 'Active Accounts',
      value: kpiData?.activeCustomers?.toLocaleString() || '—',
      icon: Activity,
      color: 'purple',
      description: 'All active service accounts'
    },
    {
      label: 'Avg MRR/Customer',
      value: kpiData ? `$${kpiData.avgMRRPerCustomer.toFixed(0)}` : '—',
      icon: TrendingUp,
      color: 'indigo',
      description: 'Average revenue per customer'
    },
    {
      label: 'Churn Rate',
      value: kpiData ? `${kpiData.churnRate.toFixed(1)}%` : '—',
      icon: AlertCircle,
      color: 'amber',
      description: 'Monthly churn percentage'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.4 }}
      className="mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[var(--mac-forest)]" />
          Finance & Operations KPIs
        </h2>
        <div className="text-xs text-muted-foreground font-mono">
          Live from AWS Athena
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          const colorClasses = {
            emerald: 'from-emerald-500 to-emerald-600',
            blue: 'from-blue-500 to-blue-600',
            purple: 'from-purple-500 to-purple-600',
            indigo: 'from-indigo-500 to-indigo-600',
            amber: 'from-amber-500 to-amber-600'
          };

          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
            >
              <Card className="relative overflow-hidden hover:shadow-lg transition-all duration-300">
                <div className={`absolute inset-0 bg-gradient-to-br ${colorClasses[kpi.color]}/10`} />
                <CardHeader className="pb-3 relative">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${colorClasses[kpi.color]} shadow-sm w-fit mb-2`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {kpi.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 relative">
                  <div className="text-2xl font-bold text-foreground">
                    {isLoading ? '...' : kpi.value}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {kpi.description}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}