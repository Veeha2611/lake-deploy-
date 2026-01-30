import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Users, TrendingUp, Activity, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import KPITileModal from './KPITileModal';

export default function KPIStrip() {
  const [selectedKPI, setSelectedKPI] = useState(null);
  
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['kpi-strip'],
    queryFn: async () => {
      const [mrrRes, customersRes, bandsRes] = await Promise.all([
        base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { 
            sql: `SELECT SUM(total_mrr) as total_mrr FROM curated_core.v_customer_fully_loaded_margin_banded WHERE total_mrr > 0 LIMIT 1`
          }
        }),
        base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { 
            sql: `SELECT COUNT(*) as total, SUM(CASE WHEN has_active_service = true AND is_test_internal = false THEN 1 ELSE 0 END) as active FROM curated_core.dim_customer_platt LIMIT 1`
          }
        }),
        base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { 
            sql: `SELECT action_band, COUNT(*) as count FROM curated_core.v_customer_fully_loaded_margin_banded WHERE action_band IN ('D', 'E') GROUP BY action_band LIMIT 10`
          }
        })
      ]);

      const mrr = mrrRes.data?.data_rows?.[0]?.[0] || 0;
      const active = customersRes.data?.data_rows?.[0]?.[1] || 0;
      const atRiskRows = bandsRes.data?.data_rows || [];
      const atRisk = atRiskRows.reduce((sum, row) => {
        const rowValues = Array.isArray(row) ? row : Object.values(row);
        return sum + (Number(rowValues[1]) || 0);
      }, 0);

      return { mrr, active, atRisk };
    },
    refetchInterval: 60000,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const kpis = [
    {
      label: 'Total MRR',
      value: metrics?.mrr ? `$${Math.round(metrics.mrr / 1000)}K` : '—',
      icon: DollarSign,
      trend: '+8.2%',
      trendUp: true,
      color: 'emerald',
      gradientClass: 'from-emerald-500 to-emerald-600',
detailSql: `SELECT total_mrr, action_band 
        FROM curated_core.v_customer_fully_loaded_margin_banded 
        WHERE total_mrr > 0 
        ORDER BY total_mrr DESC 
        LIMIT 100`
    },
    {
      label: 'Active Accounts',
      value: metrics?.active ? metrics.active.toLocaleString() : '—',
      icon: Users,
      trend: '+12',
      trendUp: true,
      color: 'blue',
      gradientClass: 'from-blue-500 to-blue-600',
detailSql: `SELECT is_test_internal, has_active_service 
        FROM curated_core.dim_customer_platt 
        WHERE has_active_service = true AND is_test_internal = false 
        LIMIT 100`
    },
    {
      label: 'At Risk (D/E)',
      value: metrics?.atRisk ? metrics.atRisk.toLocaleString() : '—',
      icon: AlertCircle,
      trend: '-3',
      trendUp: true,
      color: 'amber',
      gradientClass: 'from-amber-500 to-amber-600',
detailSql: `SELECT action_band, total_mrr
        FROM curated_core.v_customer_fully_loaded_margin_banded 
        WHERE action_band IN ('D', 'E') 
        ORDER BY action_band, total_mrr ASC 
        LIMIT 100`
    },
    {
      label: 'Health Score',
      value: '87',
      icon: Activity,
      trend: '+2',
      trendUp: true,
      color: 'emerald',
      gradientClass: 'from-emerald-500 to-emerald-600',
      detailSql: null
    },
    {
      label: 'Churn Rate',
      value: '2.4%',
      icon: TrendingUp,
      trend: '-0.3%',
      trendUp: true,
      color: 'slate',
      gradientClass: 'from-slate-500 to-slate-600',
      detailSql: `SELECT period_month, mrr_churn, ending_mrr, 
        ROUND((mrr_churn / NULLIF(ending_mrr, 0)) * 100, 2) as churn_rate_pct 
        FROM curated_core.v_monthly_mrr_and_churn_summary 
        ORDER BY period_month DESC 
        LIMIT 12`
    }
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          const colorClasses = {
            emerald: 'from-emerald-500 to-emerald-600',
            blue: 'from-blue-500 to-blue-600',
            amber: 'from-amber-500 to-amber-600',
            slate: 'from-slate-500 to-slate-600'
          };

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => kpi.detailSql && setSelectedKPI(kpi)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${colorClasses[kpi.color]} shadow-md`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                {kpi.trend && (
                  <div className={`flex items-center gap-0.5 text-xs font-semibold ${kpi.trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
                    {kpi.trendUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {kpi.trend}
                  </div>
                )}
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1 group-hover:text-[var(--mac-forest)] transition-colors">
                {isLoading ? '...' : kpi.value}
              </div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{kpi.label}</div>
            </motion.div>
          );
        })}
      </div>

      <KPITileModal
        isOpen={!!selectedKPI}
        onClose={() => setSelectedKPI(null)}
        kpi={selectedKPI}
      />
    </>
  );
}