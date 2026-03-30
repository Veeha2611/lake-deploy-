import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { runSSOTQuery } from '@/api/ssotQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Users, Signal, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FinanceKPITiles() {
  const formatCurrencyCompact = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return Number(value).toLocaleString();
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${Number(value).toFixed(1)}%`;
  };

  const parseNumeric = (value) => {
    if (value === null || value === undefined) return null;
    const asString = String(value).trim();
    if (!asString || asString.toLowerCase() === 'null' || asString.toLowerCase() === 'nan') return null;
    const num = Number(asString);
    return Number.isFinite(num) ? num : null;
  };

  const { data: kpiData, isLoading } = useQuery({
    queryKey: ['finance-kpis-snapshot'],
    queryFn: async () => {
      // Avoid heavy billing rollups that can exceed API Gateway timeout.
      // These two metrics are fast and deterministic in AWS-only mode.
      const [mixRes, customersRes] = await Promise.all([
        runSSOTQuery({ queryId: 'passings_subscribers', label: 'Passings & Subscribers (Latest)' }),
        runSSOTQuery({ queryId: 'customer_count', label: 'Customer Count (Active vs Inactive)' })
      ]);

      const mixColumns = mixRes.data?.columns || [];
      const mixRow = mixRes.data?.data_rows?.[0] || [];
      const mixIndex = (name) => mixColumns.findIndex((c) => String(c || '').trim().toLowerCase() === name);

      const periodMonth = mixIndex('period_month') !== -1 ? String(mixRow[mixIndex('period_month')] || '') : '';
      const modeledDt = mixIndex('dt') !== -1 ? String(mixRow[mixIndex('dt')] || '') : '';
      const totalMRR = parseNumeric(mixIndex('total_mrr') !== -1 ? mixRow[mixIndex('total_mrr')] : null);
      const totalPassings = parseNumeric(mixIndex('total_passings') !== -1 ? mixRow[mixIndex('total_passings')] : null);
      const totalSubscriptions = parseNumeric(mixIndex('total_subscriptions') !== -1 ? mixRow[mixIndex('total_subscriptions')] : null);
      const penetrationPct = parseNumeric(mixIndex('penetration_pct') !== -1 ? mixRow[mixIndex('penetration_pct')] : null);
      const avgArpu = parseNumeric(mixIndex('avg_arpu') !== -1 ? mixRow[mixIndex('avg_arpu')] : null);
      const billedCustomers = parseNumeric(
        mixIndex('total_billed_customers') !== -1 ? mixRow[mixIndex('total_billed_customers')] : null
      );

      const customerColumns = customersRes.data?.columns || [];
      const customerRow = customersRes.data?.data_rows?.[0] || [];
      const customerIndex = (name) => customerColumns.findIndex((c) => String(c || '').trim().toLowerCase() === name);
      const activeCustomers = parseNumeric(
        customerIndex('active_customers') !== -1 ? customerRow[customerIndex('active_customers')] : null
      );

      return {
        periodMonth,
        modeledDt,
        totalMRR,
        totalPassings,
        totalSubscriptions,
        billedCustomers,
        activeCustomers,
        penetrationPct,
        avgArpu
      };
    },
    staleTime: 0,
    refetchInterval: 60000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  const kpis = [
    {
      label: 'Total MRR (Latest)',
      value: kpiData ? formatCurrencyCompact(kpiData.totalMRR) : '—',
      icon: DollarSign,
      color: 'emerald',
      description: 'Modeled total MRR (Network Mix, latest snapshot)'
    },
    {
      label: 'Active Subscribers',
      value: formatNumber(kpiData?.totalSubscriptions),
      icon: Users,
      color: 'blue',
      description: 'Total subscriptions (Network Mix)'
    },
    {
      label: 'Active Customers',
      value: formatNumber(kpiData?.activeCustomers),
      icon: Users,
      color: 'blue',
      description: 'Distinct customer IDs w/ active service (dim_customer_platt_v1_1)'
    },
    {
      label: 'Billing Customers',
      value: formatNumber(kpiData?.billedCustomers),
      icon: Users,
      color: 'blue',
      description: 'Investor revenue mix billed customers (latest as_of_date)'
    },
    {
      label: 'Avg MRR / Subscriber',
      value: kpiData?.avgArpu !== null && kpiData?.avgArpu !== undefined ? `$${Number(kpiData.avgArpu).toFixed(0)}` : '—',
      icon: Activity,
      color: 'purple',
      description: 'Modeled MRR / subscriptions'
    },
    {
      label: 'Total Passings',
      value: formatNumber(kpiData?.totalPassings),
      icon: Users,
      color: 'teal',
      description: 'Total passings (Network Mix)'
    },
    {
      label: 'Penetration',
      value: formatPercent(kpiData?.penetrationPct),
      icon: TrendingUp,
      color: 'indigo',
      description: 'Subscriptions / passings'
    },
    {
      label: 'As-of Period',
      value: kpiData?.periodMonth ? String(kpiData.periodMonth).slice(0, 7) : '—',
      icon: Signal,
      color: 'amber',
      description: kpiData?.modeledDt ? `Modeled dt: ${kpiData.modeledDt}` : 'Latest available snapshot'
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
          <div className="mac-icon-badge">
            <TrendingUp className="w-4 h-4" />
          </div>
          Finance KPIs
        </h2>
        <div className="text-xs text-muted-foreground font-mono">
          Live from AWS Athena
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;

          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
            >
              <Card className="mac-panel hover:shadow-md transition-all duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="mac-icon-badge">
                      <Icon className="w-4 h-4" />
                    </div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {kpi.label}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-2xl font-bold text-[var(--mac-forest)]">
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
