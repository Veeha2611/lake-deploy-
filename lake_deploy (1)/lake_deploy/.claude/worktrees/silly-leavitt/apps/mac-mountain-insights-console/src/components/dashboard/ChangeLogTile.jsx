import React from 'react';
import { Clock } from 'lucide-react';
import DashboardTile from '@/components/dashboard/DashboardTile';

export default function ChangeLogTile() {
  return (
    <DashboardTile
      title="Change Log (Latest vs Prior Snapshot)"
      icon={Clock}
      tileId="change_log_customer_mix"
      supportedPeriods={['current']}
      sql={null}
      renderContent={(data) => {
        if (!data?.data_rows || data.data_rows.length === 0) {
          return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
        }

        const columns = data.columns || [];
        const index = (name) => columns.findIndex((c) => String(c || '').trim().toLowerCase() === name);
        const idxMetric = index('metric');
        const idxCurrentDt = index('current_dt');
        const idxCurrent = index('current_value');
        const idxPrevDt = index('prev_dt');
        const idxPrev = index('prev_value');
        const idxDelta = index('delta');
        const idxDeltaPct = index('delta_pct');

        const rows = data.data_rows.map((row) => {
          const values = Array.isArray(row) ? row : Object.values(row);
          const deltaPctRaw = idxDeltaPct !== -1 ? values[idxDeltaPct] : null;
          const deltaPct = deltaPctRaw === null || deltaPctRaw === undefined ? null : Number(deltaPctRaw);
          return {
            metric: idxMetric !== -1 ? values[idxMetric] : values[0],
            currentDt: idxCurrentDt !== -1 ? values[idxCurrentDt] : null,
            currentValue: idxCurrent !== -1 ? Number(values[idxCurrent]) : null,
            prevDt: idxPrevDt !== -1 ? values[idxPrevDt] : null,
            prevValue: idxPrev !== -1 ? Number(values[idxPrev]) : null,
            delta: idxDelta !== -1 ? Number(values[idxDelta]) : null,
            deltaPct: Number.isFinite(deltaPct) ? deltaPct : null,
          };
        });

        return (
          <div className="overflow-x-auto">
            <table className="mac-table w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/60">
                  <th className="py-2 pr-4 text-left">Metric</th>
                  <th className="py-2 pr-4 text-right">Current</th>
                  <th className="py-2 pr-4 text-right">Previous</th>
                  <th className="py-2 pr-4 text-right">Delta</th>
                  <th className="py-2 pr-2 text-right">Delta %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.metric)} className="border-b border-border/40">
                    <td className="py-2 pr-4 text-foreground">
                      <div className="font-medium">{String(r.metric || '').replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.prevDt ? String(r.prevDt).slice(0, 10) : '—'} → {r.currentDt ? String(r.currentDt).slice(0, 10) : '—'}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-foreground">
                      {Number.isFinite(r.currentValue) ? r.currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-muted-foreground">
                      {Number.isFinite(r.prevValue) ? r.prevValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-foreground">
                      {Number.isFinite(r.delta) ? r.delta.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">
                      {r.deltaPct === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={r.deltaPct >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {(r.deltaPct * 100).toFixed(2)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    />
  );
}

