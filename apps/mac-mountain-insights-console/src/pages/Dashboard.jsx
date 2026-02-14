import React from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  ChevronDown,
  Download,
  LineChart as LineChartIcon,
  Map
} from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import DashboardTile from '@/components/dashboard/DashboardTile';
import DataFreshnessWidget from '@/components/dashboard/DataFreshnessWidget';
import RefreshControls from '@/components/dashboard/RefreshControls';
import QuickActionBanner from '@/components/dashboard/QuickActionBanner';
import FinanceKPITiles from '@/components/dashboard/FinanceKPITiles';
import MainChartCard from '@/components/dashboard/MainChartCard';
import MRRFy2025Tile from '@/components/dashboard/MRRFy2025Tile';
import GLClosePack from '@/components/dashboard/GLClosePack';
import BucketSummaryTile from '@/components/dashboard/BucketSummaryTile';
import ChangeLogTile from '@/components/dashboard/ChangeLogTile';
import MRRMovementBreakdownTile from '@/components/dashboard/MRRMovementBreakdownTile';
import NetworkMapTile from '@/components/gis/NetworkMapTile';
import { DashboardRefreshProvider } from '@/components/dashboard/DashboardRefreshProvider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MAC_AWS_ONLY } from '@/lib/mac-app-flags';
import { runSSOTQuery } from '@/api/ssotQuery';

const COLORS = ['#5C7B5F', '#3D5A3D', '#B8D8E5', '#7B8B8E', '#8FA88F', '#A6B8B0'];

function CustomerAnalyticsPanel() {
  const [networkType, setNetworkType] = React.useState('');
  const [customerType, setCustomerType] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [sortConfig, setSortConfig] = React.useState({ key: 'network', direction: 'asc' });
  const [collapsed, setCollapsed] = React.useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-analytics-network-health'],
    queryFn: async () => {
      const response = await runSSOTQuery({
        sql: `SELECT * FROM curated_recon.v_network_mix_billing_aligned_latest WHERE network <> 'Unmapped' LIMIT 2000`,
        queryId: 'network_health',
        label: 'Network Mix (Billing-Aligned)',
        params: { schema_version: '2026-02-11' }
      });
      return response.data;
    },
    retry: 2,
    staleTime: 60000,
    refetchInterval: 60000
  });

  const unavailableMessage = React.useMemo(() => {
    if (data?.evidence_pack?.status === 'unavailable') return data.answer_markdown || 'UNAVAILABLE';
    return null;
  }, [data]);

  const resolved = React.useMemo(() => {
    if (!data?.data_rows || !data?.columns) {
      return { rows: [], columns: {}, missing: [] };
    }
    const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const columnIndex = (candidates) => {
      for (const candidate of candidates) {
        const idx = data.columns.findIndex((col) => normalize(col) === normalize(candidate));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const columnMap = {
      network: columnIndex(['network', 'network_name', 'system_name', 'system', 'plan_name']),
      networkType: columnIndex(['network_type', 'networktype', 'bucket', 'system_bucket', 'type']),
      customerType: columnIndex(['customer_type', 'customertype', 'segment', 'customer_segment']),
      passings: columnIndex(['passings', 'passing', 'bsl', 'serviceable', 'serviceable_locations']),
      subscriptions: columnIndex(['subscriptions', 'subscribers', 'active_subs', 'customers', 'active_customers']),
      arpu: columnIndex(['arpu', 'avg_arpu', 'average_revenue', 'avg_revenue']),
      arpuLabel: columnIndex(['arpu_label', 'arpu_text', 'arpu_raw', 'arpu_note']),
      mrr: columnIndex(['mrr', 'monthly_revenue', 'total_mrr'])
    };

    const missing = Object.entries(columnMap)
      .filter(([key, idx]) => idx === -1 && key !== 'arpuLabel')
      .map(([key]) => key);

    const isArtifactRow = (row) => {
      const network = String(row.network || '').trim().toLowerCase();
      const networkType = String(row.networkType || '').trim().toLowerCase();
      const customerType = String(row.customerType || '').trim().toLowerCase();
      const arpuLabel = String(row.arpuLabel || '').trim().toLowerCase();
      const metricsZero = (Number(row.passings) || 0) === 0
        && (Number(row.subscriptions) || 0) === 0
        && (!Number.isFinite(row.mrr) || Number(row.mrr) === 0);
      const isHeaderNetwork = network === 'network';
      const isHeaderNetworkType = networkType === 'network_type'
        || networkType === 'networktype'
        || networkType === 'network type';
      const isHeaderCustomerType = customerType === 'customer_type'
        || customerType === 'customertype'
        || customerType === 'customer type';
      const headerLike = isHeaderNetwork && isHeaderNetworkType && (isHeaderCustomerType || customerType === '');
      const arpuHeaderLike = arpuLabel === 'arpu'
        || arpuLabel === 'arpu_label'
        || arpuLabel === 'arpu label'
        || arpuLabel === 'n/a'
        || arpuLabel === 'na';
      const artifactLike = isHeaderNetwork && isHeaderNetworkType && metricsZero;
      return headerLike || artifactLike || (metricsZero && arpuHeaderLike && isHeaderNetwork);
    };

    const rows = data.data_rows.map((row) => {
      const values = Array.isArray(row) ? row : Object.values(row);
      const passings = Number(values[columnMap.passings]) || 0;
      const subscriptions = Number(values[columnMap.subscriptions]) || 0;
      const arpuRaw = columnMap.arpu !== -1 ? values[columnMap.arpu] : null;
      const arpuValue = Number(arpuRaw);
      const arpuLabel = columnMap.arpuLabel !== -1 ? values[columnMap.arpuLabel] : null;
      const mrrRaw = Number(values[columnMap.mrr]);
      const mrr = Number.isFinite(mrrRaw)
        ? mrrRaw
        : (Number.isFinite(arpuValue) ? subscriptions * arpuValue : null);
      const mapped = {
        network: values[columnMap.network] ?? 'Unknown',
        networkType: values[columnMap.networkType] ?? 'Unknown',
        customerType: values[columnMap.customerType] ?? 'Unknown',
        passings,
        subscriptions,
        arpu: Number.isFinite(arpuValue) ? arpuValue : null,
        arpuLabel: !Number.isFinite(arpuValue) ? (arpuLabel || arpuRaw) : null,
        mrr
      };
      return isArtifactRow(mapped) ? null : mapped;
    }).filter(Boolean).filter((row) => String(row.network).trim().toLowerCase() !== 'unmapped');

    return { rows, columns: columnMap, missing };
  }, [data]);

  const networkTypeOptions = React.useMemo(() => {
    const values = resolved.rows
      .map((row) => row.networkType)
      .filter((value) => value && String(value).trim().length > 0);
    return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)));
  }, [resolved.rows]);

  const customerTypeOptions = React.useMemo(() => {
    const values = resolved.rows
      .map((row) => row.customerType)
      .filter((value) => value && String(value).trim().length > 0);
    return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)));
  }, [resolved.rows]);

  const filteredRows = React.useMemo(() => {
    let rows = resolved.rows;
    if (networkType) {
      rows = rows.filter((row) => row.networkType === networkType);
    }
    if (customerType) {
      rows = rows.filter((row) => row.customerType === customerType);
    }
    if (search) {
      const needle = search.toLowerCase();
      rows = rows.filter((row) => String(row.network).toLowerCase().includes(needle));
    }
    const sorted = [...rows].sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      if (typeof valA === 'string') {
        return direction * valA.localeCompare(valB);
      }
      return direction * ((Number(valA) || 0) - (Number(valB) || 0));
    });
    return sorted;
  }, [resolved.rows, networkType, customerType, search, sortConfig]);

  const displayRows = React.useMemo(() => {
    return collapsed ? [] : filteredRows;
  }, [filteredRows, collapsed]);

  const metrics = React.useMemo(() => {
    const totalPassings = filteredRows.reduce((sum, row) => sum + row.passings, 0);
    const totalSubs = filteredRows.reduce((sum, row) => sum + row.subscriptions, 0);
    const totalMrr = filteredRows.reduce((sum, row) => sum + (Number.isFinite(row.mrr) ? row.mrr : 0), 0);
    const subsWithArpu = filteredRows.reduce((sum, row) => sum + (Number.isFinite(row.mrr) ? row.subscriptions : 0), 0);
    const avgArpu = subsWithArpu > 0 ? totalMrr / subsWithArpu : 0;
    const penetration = totalPassings > 0 ? (totalSubs / totalPassings) * 100 : 0;
    const mixedArpuCount = filteredRows.filter((row) => row.arpuLabel).length;
    return { totalPassings, totalSubs, totalMrr, avgArpu, penetration, mixedArpuCount };
  }, [filteredRows]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const resolveTagClass = (value) => {
    const key = String(value || '').toLowerCase();
    if (key.includes('owned')) return 'mac-tag-owned';
    if (key.includes('contract')) return 'mac-tag-contracted';
    if (key.includes('clec')) return 'mac-tag-clec';
    return 'mac-tag-unknown';
  };

  const handleExport = () => {
    const headers = ['Network', 'Network Type', 'Customer Type', 'Passings', 'Subscriptions', 'Penetration %', 'ARPU', 'MRR'];
    const rows = filteredRows.map((row) => {
      const penetration = row.passings > 0 ? (row.subscriptions / row.passings * 100).toFixed(1) : '0.0';
      const arpuValue = Number.isFinite(row.arpu) ? row.arpu.toFixed(0) : '';
      const arpuLabel = row.arpuLabel ? String(row.arpuLabel).replace(/\n/g, ' ') : '';
      const arpuExport = arpuValue ? `$${arpuValue}` : (arpuLabel || '');
      return [
        row.network,
        row.networkType,
        row.customerType,
        row.passings,
        row.subscriptions,
        penetration,
        arpuExport,
        row.mrr?.toFixed(2) ?? ''
      ];
    });
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer_analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <section className="mac-panel rounded-3xl p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="mac-section-header">
          <div className="mac-icon-badge">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="mac-section-meta">Customer Mix Analytics</div>
            <h2 className="font-display text-2xl text-foreground mt-2">Network Mix Dashboard</h2>
          </div>
        </div>
      <div className="text-xs text-muted-foreground">Lake source: curated_recon.v_network_mix_billing_aligned_latest</div>
      </div>

      {unavailableMessage && (
        <div className="mt-6 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 text-sm whitespace-pre-wrap">
          {String(unavailableMessage).replace(/\*\*/g, '')}
        </div>
      )}

      {resolved.missing.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-[var(--mac-badge-bg)] border border-[var(--mac-badge-border)] text-xs text-[var(--mac-badge-text)]">
          Missing expected columns in v_network_mix_billing_aligned_latest: {resolved.missing.join(', ')}. Update the view or provide a mapping.
        </div>
      )}

      {!unavailableMessage && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mt-6">
          <div className="mac-kpi-card">
            <div className="mac-kpi-label">Total Subscriptions</div>
            <div className="mac-kpi-value">{metrics.totalSubs.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Active services</div>
          </div>
          <div className="mac-kpi-card">
            <div className="mac-kpi-label">Total Passings</div>
            <div className="mac-kpi-value">{metrics.totalPassings.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Homes / businesses</div>
          </div>
          <div className="mac-kpi-card">
            <div className="mac-kpi-label">Penetration</div>
            <div className="mac-kpi-value">{metrics.penetration.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Subs / passings</div>
          </div>
          <div className="mac-kpi-card">
            <div className="mac-kpi-label">Avg ARPU</div>
            <div className="mac-kpi-value">${metrics.avgArpu.toFixed(0)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Per customer / month{metrics.mixedArpuCount > 0 ? ' (excludes mixed ARPU)' : ''}
            </div>
          </div>
          <div className="mac-kpi-card">
            <div className="mac-kpi-label">Total MRR</div>
            <div className="mac-kpi-value">${(metrics.totalMrr / 1000).toFixed(1)}K</div>
            <div className="text-xs text-muted-foreground mt-1">Recurring revenue</div>
          </div>
        </div>
      )}

      {!unavailableMessage && (
        <div className="mac-panel-strong rounded-2xl p-4 mt-6 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground">Network Type</label>
            <select
              value={networkType}
              onChange={(event) => setNetworkType(event.target.value)}
              className="mac-input text-sm rounded-lg px-3 py-2"
            >
              <option value="">All Types</option>
              {networkTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground">Customer Type</label>
          <select
            value={customerType}
            onChange={(event) => setCustomerType(event.target.value)}
            className="mac-input text-sm rounded-lg px-3 py-2"
          >
            <option value="">All Customers</option>
            {customerTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground">Search Network</label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type to search..."
            className="mac-input text-sm rounded-lg px-3 py-2"
          />
        </div>
        <button
          onClick={handleExport}
          className="ml-auto mac-button-primary px-4 py-2 rounded-lg text-xs uppercase tracking-widest"
        >
          Export CSV
        </button>
        </div>
      )}

      <div className="mac-panel-strong rounded-2xl mt-6 overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading network mix…</div>
        )}
        {error && (
          <div className="p-8 text-center text-sm text-destructive">Failed to load network mix: {error.message}</div>
        )}
        {unavailableMessage && !isLoading && !error && (
          <div className="p-8 text-center text-sm text-amber-800 whitespace-pre-wrap">
            {String(unavailableMessage).replace(/\*\*/g, '')}
          </div>
        )}
        {!isLoading && !error && !unavailableMessage && (
          <div className="overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground border-b border-white/10">
              <div>
                {collapsed
                  ? 'Table collapsed. Expand to view network rows.'
                  : `Showing ${displayRows.length.toLocaleString()} of ${filteredRows.length.toLocaleString()} networks`}
              </div>
              <button
                type="button"
                className="mac-button-tertiary px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-widest"
                onClick={() => setCollapsed((prev) => !prev)}
                title={collapsed ? 'Show network rows' : 'Hide network rows'}
              >
                {collapsed ? 'Show Table' : 'Hide Table'}
              </button>
            </div>
            <table className="mac-table min-w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th onClick={() => handleSort('network')} className="px-4 py-3 text-left uppercase tracking-widest cursor-pointer">Network</th>
                  <th onClick={() => handleSort('networkType')} className="px-4 py-3 text-left uppercase tracking-widest cursor-pointer">Type</th>
                  <th onClick={() => handleSort('customerType')} className="px-4 py-3 text-left uppercase tracking-widest cursor-pointer">Customer Type</th>
                  <th onClick={() => handleSort('passings')} className="px-4 py-3 text-left uppercase tracking-widest cursor-pointer">Passings</th>
                  <th onClick={() => handleSort('subscriptions')} className="px-4 py-3 text-left uppercase tracking-widest cursor-pointer">Subscriptions</th>
                  <th className="px-4 py-3 text-left uppercase tracking-widest">Penetration</th>
                  <th onClick={() => handleSort('arpu')} className="px-4 py-3 text-left uppercase tracking-widest cursor-pointer">ARPU</th>
                  <th onClick={() => handleSort('mrr')} className="px-4 py-3 text-left uppercase tracking-widest cursor-pointer">MRR</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, idx) => {
                  const penetration = row.passings > 0 ? (row.subscriptions / row.passings) * 100 : 0;
                  return (
                    <tr key={`${row.network}-${idx}`} className="mac-table-row">
                      <td className="px-4 py-2 font-semibold">{row.network}</td>
                      <td className="px-4 py-2">
                        <span className={`mac-tag ${resolveTagClass(row.networkType)}`}>
                          {row.networkType}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`mac-tag ${resolveTagClass(row.customerType)}`}>
                          {row.customerType}
                        </span>
                      </td>
                      <td className="px-4 py-2">{row.passings.toLocaleString()}</td>
                      <td className="px-4 py-2">{row.subscriptions.toLocaleString()}</td>
                      <td className="px-4 py-2">{penetration.toFixed(1)}%</td>
                      <td className="px-4 py-2">
                        {Number.isFinite(row.arpu)
                          ? `$${row.arpu.toFixed(0)}`
                          : (row.arpuLabel ? String(row.arpuLabel) : 'N/A')}
                      </td>
                      <td className="px-4 py-2">
                        {Number.isFinite(row.mrr) ? `$${row.mrr.toFixed(0)}` : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
                {collapsed && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      Network rows are hidden. Click “Show Table” to expand.
                    </td>
                  </tr>
                )}
                {!collapsed && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No matching networks found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function UnmappedNetworkPanel() {
  const [exporting, setExporting] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['unmapped-network-services'],
    queryFn: async () => {
      const response = await runSSOTQuery({
        sql: `SELECT * FROM curated_recon.v_unmapped_network_services_latest ORDER BY active_services DESC`,
        queryId: 'unmapped_network_services',
        label: 'Unmapped Network Services (Reconciliation)',
        params: { schema_version: '2026-02-11' }
      });
      return response.data;
    },
    retry: 1,
    staleTime: 60000,
    refetchInterval: 60000
  });

  const unavailableMessage = React.useMemo(() => {
    if (data?.evidence_pack?.status === 'unavailable') return data.answer_markdown || 'UNAVAILABLE';
    return null;
  }, [data]);

  const resolved = React.useMemo(() => {
    if (!data?.data_rows || !data?.columns) {
      return { rows: [], columns: {} };
    }
    const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const columnIndex = (candidates) => {
      for (const candidate of candidates) {
        const idx = data.columns.findIndex((col) => normalize(col) === normalize(candidate));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const columnMap = {
      gwiSystem: columnIndex(['gwi_system', 'system', 'gwiSystem']),
      activeServices: columnIndex(['active_services', 'active', 'subscriptions']),
      billedCustomers: columnIndex(['billed_customers', 'billed', 'billing_customers']),
      billedMrr: columnIndex(['billed_mrr', 'mrr', 'total_mrr']),
      periodMonth: columnIndex(['period_month', 'period'])
    };

    const rows = data.data_rows.map((row) => {
      const values = Array.isArray(row) ? row : Object.values(row);
      return {
        gwiSystem: values[columnMap.gwiSystem] ?? '(blank)',
        activeServices: Number(values[columnMap.activeServices]) || 0,
        billedCustomers: Number(values[columnMap.billedCustomers]) || 0,
        billedMrr: Number(values[columnMap.billedMrr]) || 0,
        periodMonth: values[columnMap.periodMonth] ?? null
      };
    });

    return { rows, columns: columnMap };
  }, [data]);

  const totalServices = resolved.rows.reduce((sum, row) => sum + row.activeServices, 0);
  const totalBilled = resolved.rows.reduce((sum, row) => sum + row.billedCustomers, 0);
  const totalMrr = resolved.rows.reduce((sum, row) => sum + row.billedMrr, 0);

  const escapeCsv = (value) => {
    const text = String(value ?? '');
    if (/[\",\n]/.test(text)) {
      return `"${text.replace(/\"/g, '""')}"`;
    }
    return text;
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await runSSOTQuery({
        sql: `SELECT * FROM curated_recon.v_unmapped_network_customers_latest`,
        queryId: 'unmapped_network_customers',
        label: 'Unmapped Network Customers (Detail)',
        params: { schema_version: '2026-02-11' }
      });
      const payload = response.data;
      if (!payload?.data_rows || !payload?.columns) return;
      const rows = payload.data_rows.map((row) => {
        const values = Array.isArray(row) ? row : Object.values(row);
        return values.map(escapeCsv).join(',');
      });
      const header = payload.columns.map(escapeCsv).join(',');
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unmapped_customers_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="mac-panel rounded-3xl p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="mac-section-header">
          <div className="mac-icon-badge">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="mac-section-meta">Reconciliation</div>
            <h2 className="font-display text-2xl text-foreground mt-2">Unmapped Systems</h2>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Lake source: curated_recon.v_unmapped_network_services_latest</span>
          <button
            type="button"
            className="mac-button-outline inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[0.65rem] uppercase tracking-[0.18em]"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export Details'}
          </button>
          <button
            type="button"
            className="mac-button-outline inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[0.65rem] uppercase tracking-[0.18em]"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? 'Show Table' : 'Hide Table'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="mt-4 text-sm text-muted-foreground">Loading unmapped systems…</div>
      )}

      {error && !isLoading && (
        <div className="mt-4 text-sm text-muted-foreground">
          Unmapped systems are temporarily unavailable. Evidence is logged in the query broker.
        </div>
      )}

      {unavailableMessage && !isLoading && !error && (
        <div className="mt-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 text-sm whitespace-pre-wrap">
          {String(unavailableMessage).replace(/\*\*/g, '')}
        </div>
      )}

      {!isLoading && !error && !unavailableMessage && totalServices === 0 && (
        <div className="mt-4 text-sm text-muted-foreground">All active services are mapped to a network.</div>
      )}

      {!isLoading && !error && !unavailableMessage && totalServices > 0 && (
        <>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="mac-kpi-card">
              <div className="mac-kpi-label">Unmapped Services</div>
              <div className="mac-kpi-value">{totalServices.toLocaleString()}</div>
            </div>
            <div className="mac-kpi-card">
              <div className="mac-kpi-label">Billed Customers</div>
              <div className="mac-kpi-value">{totalBilled.toLocaleString()}</div>
            </div>
            <div className="mac-kpi-card">
              <div className="mac-kpi-label">Billed MRR</div>
              <div className="mac-kpi-value">${totalMrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
          {collapsed ? (
            <div className="mt-4 text-sm text-muted-foreground">
              Unmapped rows are hidden. Click “Show Table” to expand.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">GWI System</th>
                    <th className="py-2 pr-4">Active Services</th>
                    <th className="py-2 pr-4">Billed Customers</th>
                    <th className="py-2 pr-4">Billed MRR</th>
                    <th className="py-2 pr-4">Period</th>
                  </tr>
                </thead>
                <tbody>
                  {resolved.rows.map((row) => (
                    <tr key={`${row.gwiSystem}`} className="border-t border-border/40">
                      <td className="py-2 pr-4 text-foreground">{row.gwiSystem}</td>
                      <td className="py-2 pr-4">{row.activeServices.toLocaleString()}</td>
                      <td className="py-2 pr-4">{row.billedCustomers.toLocaleString()}</td>
                      <td className="py-2 pr-4">${row.billedMrr.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {row.periodMonth ? String(row.periodMonth).split(' ')[0] : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function InsightsPanel() {
  const [open, setOpen] = React.useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="mac-panel rounded-3xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="mac-section-header">
            <div className="mac-icon-badge">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="mac-section-meta">Insights</div>
              <h2 className="font-display text-2xl text-foreground mt-2">Operational Breakdown</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Uniform view of finance, unit economics, operations, and ownership.
              </p>
            </div>
          </div>
          <CollapsibleTrigger asChild>
            <button className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-foreground bg-[var(--mac-panel)] border border-[color:var(--mac-panel-border)] px-4 py-2 rounded-lg">
              {open ? 'Hide' : 'Show'} Insights
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="mt-6">
            <Tabs defaultValue="finance" className="w-full">
              <TabsList className="bg-[var(--mac-panel)] text-foreground border border-[color:var(--mac-panel-border)]">
                <TabsTrigger value="finance">Finance</TabsTrigger>
                <TabsTrigger value="unit">Unit Economics</TabsTrigger>
                <TabsTrigger value="ops">Operations</TabsTrigger>
                <TabsTrigger value="ownership">Ownership</TabsTrigger>
              </TabsList>

              <TabsContent value="finance">
                <div className="space-y-6">
                  <FinanceKPITiles />
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div className="mac-panel-strong rounded-2xl p-4">
                      <div className="mac-eyebrow">Change Log</div>
                      <h3 className="font-display text-lg text-foreground mt-2">Latest vs Prior Snapshot</h3>
                      <div className="mt-4">
                        <ChangeLogTile />
                      </div>
                    </div>
                    <div className="mac-panel-strong rounded-2xl p-4">
                      <div className="mac-eyebrow">MRR Movement</div>
                      <h3 className="font-display text-lg text-foreground mt-2">New / Churn / Reactivation</h3>
                      <div className="mt-4">
                        <MRRMovementBreakdownTile />
                      </div>
                    </div>
                  </div>
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div className="mac-panel-strong rounded-2xl p-4">
                      <div className="mac-eyebrow">Fiscal 2025</div>
                      <h3 className="font-display text-lg text-foreground mt-2">MRR Rollup</h3>
                      <div className="mt-4">
                        <MRRFy2025Tile />
                      </div>
                    </div>
                    <div className="mac-panel-strong rounded-2xl p-4">
                      <div className="mac-eyebrow">Close Pack</div>
                      <h3 className="font-display text-lg text-foreground mt-2">GL Revenue (Close Pack)</h3>
                      <div className="mt-4">
                        <GLClosePack />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="unit">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <DashboardTile
                    title="A–E Band Distribution"
                    icon={BarChart3}
                    tileId="band_distribution"
                    supportedPeriods={['current']}
                    sql={`WITH customer_month AS (
                  SELECT
                    customer_id,
                    SUM(mrr_total) AS mrr_total_customer_month
                  FROM curated_core.v_monthly_mrr_platt
                  WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
                  GROUP BY 1
                ),
                customer_bands AS (
                  SELECT
                    cm.customer_id,
                    cm.mrr_total_customer_month,
                    b.action_band
                  FROM customer_month cm
                  LEFT JOIN curated_core.v_customer_fully_loaded_margin_banded b
                    ON b.customer_id = cm.customer_id
                  WHERE cm.mrr_total_customer_month > 0
                )
                SELECT
                  action_band,
                  COUNT(*) AS customer_count,
                  SUM(mrr_total_customer_month) AS total_mrr
                FROM customer_bands
                WHERE action_band IS NOT NULL
                GROUP BY 1
                ORDER BY 1
                LIMIT 50`}
                    renderContent={(data) => {
                      if (!data?.data_rows || data.data_rows.length === 0) {
                        return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
                      }

                      const chartData = data.data_rows.slice(0, 5).map(row => {
                        const values = Array.isArray(row) ? row : Object.values(row);
                        return {
                          name: `Band ${values[0]}`,
                          value: Number(values[1]) || 0
                        };
                      }).filter(d => d.value > 0);

                      if (chartData.length === 0) {
                        return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
                      }

                      return (
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={chartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              outerRadius={70}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      );
                    }}
                  />

                  <DashboardTile
                    title="Worst E-Band Accounts (Top 20)"
                    icon={AlertCircle}
                    tileId="worst_e_band"
                    supportedPeriods={['current']}
                    sql={`SELECT *
                FROM curated_core.v_cci_e_band_exit_accounts
                LIMIT 20`}
                    renderContent={(data) => (
                      <div className="overflow-x-auto max-h-48">
                        <table className="mac-table w-full text-xs">
                          <thead className="sticky top-0">
                            <tr>
                              {data.columns?.slice(0, 3).map((col, i) => (
                                <th key={i} className="px-2 py-1.5 text-left text-xs font-medium uppercase">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {data.data_rows?.slice(0, 10).map((row, i) => {
                              const values = Array.isArray(row) ? row : Object.values(row);
                              return (
                                <tr key={i}>
                                  {values.slice(0, 3).map((val, j) => (
                                    <td key={j} className="px-2 py-1.5">
                                      {val === null || val === undefined ? '-' : String(val)}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  />

                  <DashboardTile
                    title="At Risk (D/E)"
                    icon={AlertCircle}
                    tileId="at_risk_detail"
                    supportedPeriods={['current']}
                    sql={`SELECT
                b.customer_id,
                c.customer_name,
                b.action_band,
                b.fully_loaded_margin_pct
              FROM curated_core.v_customer_fully_loaded_margin_banded b
              LEFT JOIN curated_core.dim_customer_platt_v1_1 c
                ON c.customer_id = b.customer_id
              WHERE b.action_band IN ('D_PRICE_PLUS_SIMPLIFY', 'E_EXIT_OR_RESCOPE')
              ORDER BY b.fully_loaded_margin_pct ASC
              LIMIT 500`}
                    renderValue={(data) => {
                      const atRisk = data.data_rows?.length || 0;
                      return (
                        <div>
                          <div className="text-3xl font-bold text-amber-700">
                            {atRisk.toLocaleString()}
                          </div>
                          <div className="text-xs text-amber-700/70 mt-1">Customers flagged for action</div>
                        </div>
                      );
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="ops">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <DashboardTile
                    title="Ticket Burden Banded"
                    icon={BarChart3}
                    tileId="ticket_burden_banded"
                    supportedPeriods={['current', 'ytd', 'monthly']}
                    sql={`SELECT 
                    ticket_burden_band,
                    COUNT(*) as customer_count,
                    SUM(ticket_count_lake) as total_tickets
                  FROM curated_core.v_ticket_burden_banded
                  GROUP BY ticket_burden_band
                  ORDER BY
                    CASE ticket_burden_band
                      WHEN '0' THEN 0
                      WHEN '1-5' THEN 1
                      WHEN '6-20' THEN 2
                      WHEN '20+' THEN 3
                      ELSE 4
                    END`}
                    renderContent={(data) => {
                      if (!data?.data_rows || data.data_rows.length === 0) {
                        return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
                      }
                      const chartData = data.data_rows.map(row => {
                        const values = Array.isArray(row) ? row : Object.values(row);
                        return {
                          band: values[0],
                          customers: values[1] || 0,
                          tickets: values[2] || 0
                        };
                      });
                      return (
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--mac-grid-line)" />
                            <XAxis dataKey="band" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} stroke="var(--muted-foreground)" />
                            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} stroke="var(--muted-foreground)" />
                            <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--mac-panel)', border: '1px solid var(--mac-panel-border)', color: 'var(--foreground)' }} />
                            <Bar dataKey="customers" fill="var(--mac-sky)" radius={[4, 4, 0, 0]} name="Customers" />
                          </BarChart>
                        </ResponsiveContainer>
                      );
                    }}
                  />

                  <DashboardTile
                    title="Ticket Volume Trend"
                    icon={Activity}
                    tileId="ticket_trend"
                    supportedPeriods={['current', 'ytd', 'monthly']}
                    sql={`SELECT 
                CAST(DATE_TRUNC('day', TRY(from_iso8601_timestamp(created_time))) AS DATE) as ticket_date,
                COUNT(*) as ticket_count
                FROM curated_core.v_cci_tickets_clean
                WHERE created_time IS NOT NULL
                AND created_time <> ''
                AND TRY(from_iso8601_timestamp(created_time)) IS NOT NULL
                GROUP BY CAST(DATE_TRUNC('day', TRY(from_iso8601_timestamp(created_time))) AS DATE)
                ORDER BY ticket_date DESC
                LIMIT 90`}
                    renderContent={(data) => {
                      if (!data?.data_rows || data.data_rows.length === 0) {
                        return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
                      }
                      const chartData = data.data_rows.slice(0, 30).reverse().map(row => {
                        const values = Array.isArray(row) ? row : Object.values(row);
                        return {
                          date: values[0] ? new Date(values[0]).toLocaleDateString() : '-',
                          count: values[1] || 0
                        };
                      });
                      return (
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--mac-grid-line)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} stroke="var(--muted-foreground)" />
                            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} stroke="var(--muted-foreground)" />
                            <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--mac-panel)', border: '1px solid var(--mac-panel-border)', color: 'var(--foreground)' }} />
                            <Line type="monotone" dataKey="count" stroke="var(--mac-green)" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      );
                    }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="ownership">
                <div className="mac-panel-strong rounded-2xl p-4">
                  <div className="mac-eyebrow">Bucket Summary</div>
                  <h3 className="font-display text-lg text-foreground mt-2">Owned vs Contracted</h3>
                  <div className="mt-4">
                    <BucketSummaryTile />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function DashboardContent({ user }) {
  return (
    <div className="mac-dashboard relative min-h-screen">
      <div className="mac-dashboard-bg" aria-hidden="true">
        <div className="mac-grid" />
        <div className="mac-glow" />
      </div>

      <div className="relative z-10 max-w-[1800px] mx-auto px-6 pb-16 pt-10 space-y-10">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mac-panel rounded-3xl p-8"
        >
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
            <div>
              <div className="mac-section-meta">MAC MOUNTAIN · LAKE</div>
              <h1 className="font-display text-4xl md:text-5xl text-foreground mt-3">
                Customer Intelligence{user?.full_name ? ` · ${user.full_name.split(' ')[0]}` : ''}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <DataFreshnessWidget />
              <RefreshControls />
            </div>
          </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="mac-pill">SSOT: curated_core</span>
        </div>
      </motion.header>

        <QuickActionBanner />

        <CustomerAnalyticsPanel />
        <UnmappedNetworkPanel />
        <section className="mac-panel rounded-3xl p-4">
          <div className="flex items-center justify-between px-4 pt-2">
            <div className="mac-section-header">
              <div className="mac-icon-badge">
                <Map className="w-5 h-5" />
              </div>
              <div>
                <div className="mac-section-meta">Network Map</div>
                <h2 className="font-display text-xl text-foreground mt-2">Coverage & Footprint</h2>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">GIS + Vetro layers</span>
          </div>
          <div className="mt-4">
            <NetworkMapTile />
          </div>
        </section>

        <section className="mac-panel rounded-3xl p-4">
          <div className="flex items-center justify-between px-4 pt-2">
            <div className="mac-section-header">
              <div className="mac-icon-badge">
                <LineChartIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="mac-section-meta">Revenue Pulse</div>
                <h2 className="font-display text-xl text-foreground mt-2">MRR Trend (12 Months)</h2>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">curated_core</span>
          </div>
          <div className="mt-4">
            <MainChartCard />
          </div>
        </section>

        <InsightsPanel />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    setUser({ email: 'aws-only@mac.app' });
  }, []);

  return (
    <DashboardRefreshProvider>
      <DashboardContent user={user} />
    </DashboardRefreshProvider>
  );
}
