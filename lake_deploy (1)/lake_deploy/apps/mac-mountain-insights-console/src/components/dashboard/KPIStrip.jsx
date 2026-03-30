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
      const [mrrRes, customersRes, atRiskRes] = await Promise.all([
        base44.functions.invoke('aiLayerQuery', { question_id: 'total_mrr' }),
        base44.functions.invoke('aiLayerQuery', { question_id: 'active_accounts' }),
        base44.functions.invoke('aiLayerQuery', { question_id: 'at_risk_count' })
      ]);

      const mrr = mrrRes.data?.data_rows?.[0]?.[0] || 0;
      const active = customersRes.data?.data_rows?.[0]?.[0] || 0;
      const atRisk = atRiskRes.data?.data_rows?.[0]?.[0] || 0;

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
      detailQuestionId: 'total_mrr'
    },
    {
      label: 'Active Accounts',
      value: metrics?.active ? metrics.active.toLocaleString() : '—',
      icon: Users,
      trend: '+12',
      trendUp: true,
      color: 'blue',
      gradientClass: 'from-blue-500 to-blue-600',
      detailQuestionId: 'active_accounts'
    },
    {
      label: 'At Risk (D/E)',
      value: metrics?.atRisk ? metrics.atRisk.toLocaleString() : '—',
      icon: AlertCircle,
      trend: '-3',
      trendUp: true,
      color: 'amber',
      gradientClass: 'from-amber-500 to-amber-600',
      detailQuestionId: 'at_risk_customers'
    },
    {
      label: 'Health Score',
      value: '—',
      icon: Activity,
      trend: null,
      trendUp: true,
      color: 'emerald',
      gradientClass: 'from-emerald-500 to-emerald-600',
      detailQuestionId: 'health_score_detail'
    },
    {
      label: 'Churn Rate',
      value: '—',
      icon: TrendingUp,
      trend: null,
      trendUp: true,
      color: 'slate',
      gradientClass: 'from-slate-500 to-slate-600',
      detailQuestionId: 'mrr_summary_12m'
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
              onClick={() => kpi.detailQuestionId && setSelectedKPI(kpi)}
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
