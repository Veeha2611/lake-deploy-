import React from 'react';
import { TrendingUp } from 'lucide-react';
import DashboardTile from '@/components/dashboard/DashboardTile';

function formatCurrencyCompact(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function metricCard({ label, value, hint, tone = 'neutral' }) {
  const toneClass = tone === 'positive'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'negative'
      ? 'text-red-600 dark:text-red-400'
      : 'text-[var(--mac-forest)]';

  return (
    <div className="rounded-lg border border-border p-3 bg-[var(--mac-panel)]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${toneClass}`}>{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

export default function MRRMovementBreakdownTile() {
  return (
    <DashboardTile
      title="MRR Movement (Latest Month)"
      icon={TrendingUp}
      tileId="mrr_movement_breakdown_latest"
      supportedPeriods={['current']}
      sql={null}
      renderContent={(data) => {
        if (!data?.data_rows || data.data_rows.length === 0) {
          return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
        }

        const columns = data.columns || [];
        const row = data.data_rows[0];
        const values = Array.isArray(row) ? row : Object.values(row);
        const idx = (name) => columns.findIndex((c) => String(c || '').trim().toLowerCase() === name);

        const periodMonth = idx('period_month') !== -1 ? values[idx('period_month')] : null;
        const newMrr = idx('new_mrr') !== -1 ? values[idx('new_mrr')] : null;
        const reactivationMrr = idx('reactivation_mrr') !== -1 ? values[idx('reactivation_mrr')] : null;
        const churnedMrr = idx('churned_mrr') !== -1 ? values[idx('churned_mrr')] : null;
        const expansionMrr = idx('expansion_mrr') !== -1 ? values[idx('expansion_mrr')] : null;
        const contractionMrr = idx('contraction_mrr') !== -1 ? values[idx('contraction_mrr')] : null;
        const netDeltaMrr = idx('net_delta_mrr') !== -1 ? values[idx('net_delta_mrr')] : null;

        const newAccounts = idx('new_accounts') !== -1 ? values[idx('new_accounts')] : null;
        const reactivatedAccounts = idx('reactivated_accounts') !== -1 ? values[idx('reactivated_accounts')] : null;
        const churnedAccounts = idx('churned_accounts') !== -1 ? values[idx('churned_accounts')] : null;

        const netNum = Number(netDeltaMrr);

        return (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Period: <span className="font-mono">{periodMonth ? String(periodMonth).slice(0, 7) : '—'}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {metricCard({
                label: 'New MRR',
                value: formatCurrencyCompact(newMrr),
                hint: newAccounts ? `${Number(newAccounts).toLocaleString()} accounts` : null,
                tone: 'positive'
              })}
              {metricCard({
                label: 'Reactivation MRR',
                value: formatCurrencyCompact(reactivationMrr),
                hint: reactivatedAccounts ? `${Number(reactivatedAccounts).toLocaleString()} accounts` : null,
                tone: 'positive'
              })}
              {metricCard({
                label: 'Churned MRR',
                value: formatCurrencyCompact(churnedMrr),
                hint: churnedAccounts ? `${Number(churnedAccounts).toLocaleString()} accounts` : null,
                tone: 'negative'
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {metricCard({
                label: 'Expansion MRR',
                value: formatCurrencyCompact(expansionMrr),
                tone: 'positive'
              })}
              {metricCard({
                label: 'Contraction MRR',
                value: formatCurrencyCompact(contractionMrr),
                tone: 'negative'
              })}
              {metricCard({
                label: 'Net Delta MRR',
                value: formatCurrencyCompact(netDeltaMrr),
                tone: Number.isFinite(netNum) && netNum >= 0 ? 'positive' : 'negative'
              })}
            </div>
          </div>
        );
      }}
    />
  );
}

