import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TileModal from './TileModal';

export default function QuickMetrics() {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['quick-metrics'],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { 
          sql: `SELECT 
            SUM(total_mrr) as total_mrr,
            COUNT(*) as total_accounts
          FROM curated_core.v_customer_fully_loaded_margin_banded
          WHERE total_mrr > 0
          LIMIT 1`
        }
      });
      return response.data;
    },
    refetchInterval: 300000,
  });

  const sql = `SELECT 
    SUM(total_mrr) as total_mrr,
    COUNT(*) as total_accounts
  FROM curated_core.v_customer_fully_loaded_margin_banded
  WHERE total_mrr > 0
  LIMIT 1`;

  const extendedSqlFn = (period) => {
    if (period === 'ytd') {
      return `SELECT 
        DATE_TRUNC('month', CAST(created_date AS DATE)) as month,
        SUM(total_mrr) as total_mrr,
        COUNT(*) as account_count
      FROM curated_core.v_customer_fully_loaded_margin_banded
      WHERE total_mrr > 0 
        AND YEAR(CAST(created_date AS DATE)) = YEAR(CURRENT_DATE)
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 100`;
    } else if (period === 'monthly') {
      return `SELECT 
        period_month,
        ending_mrr as total_mrr,
        ending_customer_count as account_count
      FROM curated_core.v_monthly_mrr_and_churn_summary
      ORDER BY period_month DESC
      LIMIT 24`;
    }
    return sql;
  };

  const metrics = [
    {
      label: 'Total MRR',
      value: data?.data_rows?.[0]?.[0] ? `$${Math.round(data.data_rows[0][0]).toLocaleString()}` : '...',
      icon: DollarSign,
      color: 'from-emerald-500 to-teal-600',
      change: '+12.5%'
    },
    {
      label: 'Active Accounts',
      value: data?.data_rows?.[0]?.[1] ? data.data_rows[0][1].toLocaleString() : '...',
      icon: Users,
      color: 'from-blue-500 to-indigo-600',
      change: '+3.2%'
    }
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {metrics.map((metric, idx) => {
          const Icon = metric.icon;
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white to-slate-50 border border-slate-200 shadow-lg hover:shadow-xl transition-all group cursor-pointer"
              onClick={() => setSelectedMetric(metric)}
            >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--mac-sky)]/20 to-transparent rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform" />
            
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${metric.color} shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <TrendingUp className="w-3 h-3" />
                  {metric.change}
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 mb-1">{metric.value}</div>
              <div className="text-sm text-slate-600">{metric.label}</div>
            </div>
          </motion.div>
        );
      })}
      </div>

      {selectedMetric && (
        <TileModal
          isOpen={!!selectedMetric}
          onClose={() => setSelectedMetric(null)}
          title={selectedMetric.label}
          data={data}
          sql={sql}
          icon={selectedMetric.icon}
          extendedSql={extendedSqlFn}
        />
      )}
    </>
  );
}