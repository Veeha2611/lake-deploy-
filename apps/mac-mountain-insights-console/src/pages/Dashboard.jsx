import React from 'react';
import { Users, TrendingUp, BarChart3, AlertCircle, Zap, DollarSign, Activity } from 'lucide-react';
import DashboardTile from '@/components/dashboard/DashboardTile';
import DataFreshnessWidget from '@/components/dashboard/DataFreshnessWidget';
import QuickActionBanner from '@/components/dashboard/QuickActionBanner';
import MainChartCard from '@/components/dashboard/MainChartCard';
import KPIStrip from '@/components/dashboard/KPIStrip';
import GLClosePack from '@/components/dashboard/GLClosePack';
import MRRFy2025Tile from '@/components/dashboard/MRRFy2025Tile';
import BucketSummaryTile from '@/components/dashboard/BucketSummaryTile';
import RefreshControls from '@/components/dashboard/RefreshControls';
import { DashboardRefreshProvider } from '@/components/dashboard/DashboardRefreshProvider';
import NetworkMapTile from '@/components/gis/NetworkMapTile';
import FinanceKPITiles from '@/components/dashboard/FinanceKPITiles';
import { motion } from 'framer-motion';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const COLORS = ['#5C7B5F', '#7B8B8E', '#B8D8E5', '#2D3E2D', '#8FA88F', '#A6B8B0'];

function DashboardContent({ user }) {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      try {
        const [mrrRes, customersRes, bandsRes] = await Promise.all([
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: { 
              sql: `WITH customer_month AS (
                SELECT customer_id, SUM(mrr_total) AS mrr_total_customer_month
                FROM curated_core.v_monthly_mrr_platt
                WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
                GROUP BY 1
              )
              SELECT SUM(mrr_total_customer_month) as total_mrr FROM customer_month LIMIT 1`
            }
          }),
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: { 
              sql: `SELECT COUNT(DISTINCT customer_id) as active 
                    FROM curated_core.v_monthly_mrr_platt 
                    WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
                      AND mrr_total > 0 
                    LIMIT 1`
            }
          }),
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: { 
              sql: `SELECT action_band, COUNT(*) as count FROM curated_core.v_customer_fully_loaded_margin_banded WHERE action_band IN ('D', 'E') GROUP BY action_band LIMIT 10`
            }
          })
        ]);

        const mrr = mrrRes?.data?.data_rows?.[0]?.[0] || 0;
        const active = customersRes?.data?.data_rows?.[0]?.[0] || 0;
        const atRiskRows = bandsRes?.data?.data_rows || [];
        const atRisk = atRiskRows.reduce((sum, row) => {
          const rowValues = Array.isArray(row) ? row : Object.values(row);
          return sum + (Number(rowValues[1]) || 0);
        }, 0);

        return { mrr, active, atRisk };
      } catch (error) {
        console.error('Dashboard stats error:', error);
        return { mrr: 0, active: 0, atRisk: 0 };
      }
    },
    refetchInterval: 60000,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return (
    <div className="max-w-[1800px] mx-auto px-6 py-8 space-y-6">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2">
              MAC{user?.full_name ? ` — ${user.full_name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-muted-foreground text-sm font-medium">Mountain Analytics Command · Intelligence from your unified data lake</p>
          </div>
          <div className="flex items-center gap-3">
            <DataFreshnessWidget />
            <RefreshControls />
          </div>
        </div>
      </motion.header>

      {/* Quick Action Banner */}
      <QuickActionBanner />

      {/* Finance KPI Tiles from AWS */}
      <FinanceKPITiles />

      {/* Network Map */}
      <NetworkMapTile />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-xl" />
          <DashboardTile
              title="Total MRR"
              icon={DollarSign}
              tileId="total_mrr_detail"
              supportedPeriods={['current']}
              sql={`WITH customer_month AS (
                SELECT
                  period_month,
                  customer_id,
                  SUM(mrr_total) AS mrr_total_customer_month
                FROM curated_core.v_monthly_mrr_platt
                WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
                GROUP BY 1, 2
              )
              SELECT 
                SUM(mrr_total_customer_month) as total_mrr,
                COUNT(DISTINCT customer_id) as customer_count
              FROM customer_month
              LIMIT 1`}
              renderValue={(data) => {
                const row = Array.isArray(data.data_rows[0]) ? data.data_rows[0] : Object.values(data.data_rows[0]);
                const mrr = row[0] || 0;
                return (
                  <div>
                    <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                      ${(mrr / 1000).toFixed(2)}K
                    </div>
                    <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">Reconciled MRR</div>
                  </div>
                );
              }}
            />
        </div>

        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-xl" />
          <DashboardTile
            title="Active Accounts"
            icon={Users}
            tileId="active_accounts_detail"
            supportedPeriods={['current']}
            sql={`WITH latest_mrr AS (
              SELECT DISTINCT customer_id
              FROM curated_core.v_monthly_mrr_platt
              WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
                AND mrr_total > 0
            )
            SELECT
              COUNT(DISTINCT c.customer_id) AS customers_total,
              COUNT(DISTINCT CASE WHEN c.has_active_service = true AND c.is_test_internal = false THEN c.customer_id END) AS customers_active,
              COUNT(DISTINCT m.customer_id) AS customers_with_mrr
            FROM curated_core.dim_customer_platt c
            LEFT JOIN latest_mrr m ON m.customer_id = c.customer_id
            LIMIT 1`}
            renderValue={(data) => {
              const row = Array.isArray(data.data_rows[0]) ? data.data_rows[0] : Object.values(data.data_rows[0]);
              const activeCount = row[2] || row[1] || row[0];
              return (
                <div>
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {activeCount?.toLocaleString() || 'N/A'}
                  </div>
                  <div className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">With active MRR</div>
                </div>
              );
            }}
          />
        </div>

        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-amber-600/10 rounded-xl" />
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
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {atRisk.toLocaleString()}
                  </div>
                  <div className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">Customers at risk</div>
                </div>
              );
            }}
          />
        </div>

        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl" />
          <DashboardTile
            title="Health Score"
            icon={Activity}
            tileId="health_score_detail"
            supportedPeriods={['current']}
            sql={`SELECT 
              action_band,
              COUNT(*) as count,
              SUM(total_mrr) as mrr
            FROM curated_core.v_customer_fully_loaded_margin_banded
            GROUP BY action_band
            ORDER BY action_band
            LIMIT 10`}
            renderValue={(data) => {
              return (
                <div>
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    87
                  </div>
                  <div className="text-xs text-purple-600/70 dark:text-purple-400/70 mt-1">+2 points</div>
                </div>
              );
            }}
          />
        </div>
      </div>

      {/* Main Chart */}
      <MainChartCard />

      {/* Bucket Summary */}
      <BucketSummaryTile />

      {/* December 2025 Segment Overview */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <DashboardTile
          title="December 2025 Segment Overview"
          icon={BarChart3}
          tileId="dec_2025_segment"
          supportedPeriods={['current']}
          sql={`SELECT *
          FROM curated_core.v_monthly_account_churn_by_segment
          WHERE period_month = '2025-12'
          ORDER BY segment
          LIMIT 10`}
          renderContent={(data) => {
            if (!data?.data_rows || data.data_rows.length === 0) {
              return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
            }

            const chartData = data.data_rows.map(row => {
              const values = Array.isArray(row) ? row : Object.values(row);
              return {
                segment: values[0],
                mrr: values[1] || 0,
                added: values[2] || 0,
                lost: Math.abs(values[3] || 0),
                net: values[4] || 0,
                active: values[5] || 0
              };
            });

            return (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="segment" tick={{ fontSize: 10 }} stroke="#64748b" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                  <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="mrr" fill="#5C7B5F" radius={[4, 4, 0, 0]} name="Ending MRR" />
                  <Bar dataKey="added" fill="#10b981" radius={[4, 4, 0, 0]} name="Added" />
                  <Bar dataKey="lost" fill="#ef4444" radius={[4, 4, 0, 0]} name="Lost" />
                  <Bar dataKey="active" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Active" />
                </BarChart>
              </ResponsiveContainer>
            );
          }}
        />
      </motion.div>

      {/* MRR FY2025 */}
      <MRRFy2025Tile />

      {/* GL Close Pack */}
      <GLClosePack />

      {/* Finance & Executive Overview */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--mac-forest)]" />
            Finance & Executive Overview
          </h2>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tile 1: Active Customers */}
          <DashboardTile
            title="Active Customers"
            icon={Users}
            tileId="active_customers"
            supportedPeriods={['current']}
            sql={`SELECT COUNT(DISTINCT customer_id) AS customers_with_mrr
          FROM curated_core.v_monthly_mrr_platt
          WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
            AND mrr_total > 0
          LIMIT 1`}
            renderValue={(data) => {
              const row = Array.isArray(data.data_rows[0]) ? data.data_rows[0] : Object.values(data.data_rows[0]);
              const activeCount = row[0];
              return (
                <div className="text-3xl font-bold text-card-foreground">
                  {activeCount?.toLocaleString() || 'N/A'}
                </div>
              );
            }}
          />

          {/* Tile 2: MRR & Churn by Segment */}
          <DashboardTile
            title="Account Movement (Last 6 Months)"
            icon={TrendingUp}
            tileId="account_movement"
            supportedPeriods={['current', 'ytd', 'monthly']}
            sql={`SELECT *
          FROM curated_core.v_monthly_account_churn_by_segment
          ORDER BY period_month DESC, segment
          LIMIT 30`}
            renderContent={(data) => {
              if (!data?.data_rows || data.data_rows.length === 0) {
                return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
              }
              
              const chartData = data.data_rows.slice(0, 12).map(row => {
                const values = Array.isArray(row) ? row : Object.values(row);
                return {
                  month: values[0],
                  segment: values[1],
                  net_adds: values[4] || 0
                };
              });
              
              return (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#64748b" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#64748b" />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
                    <Bar dataKey="net_adds" fill="#5C7B5F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              );
            }}
          />

          {/* Tile 3: MRR Trend */}
          <DashboardTile
            title="MRR Summary (Last 12 Months)"
            icon={TrendingUp}
            tileId="mrr_summary"
            supportedPeriods={['current', 'ytd', 'monthly']}
            sql={`SELECT *
          FROM curated_core.v_monthly_mrr_and_churn_summary
          ORDER BY period_month DESC
          LIMIT 12`}
            renderContent={(data) => {
              if (!data?.data_rows || data.data_rows.length === 0) {
                return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
              }
              
              const chartData = data.data_rows.slice(0, 12).reverse().map(row => {
                const values = Array.isArray(row) ? row : Object.values(row);
                return {
                  month: values[0],
                  mrr: values[1] || 0,
                  churn: Math.abs(values[2] || 0)
                };
              });
              
              return (
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#64748b" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#5C7B5F" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#ef4444" />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="mrr" fill="#5C7B5F" radius={[4, 4, 0, 0]} name="MRR" />
                    <Bar yAxisId="right" dataKey="churn" fill="#ef4444" radius={[4, 4, 0, 0]} name="Churn" />
                  </ComposedChart>
                </ResponsiveContainer>
              );
            }}
          />
        </div>
      </motion.div>

      {/* Support & Tickets */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[var(--mac-sky)]" />
            Support & Tickets Analytics
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Tile 1: Raw Ticket Feed */}
          <DashboardTile
            title="Raw Ticket Feed (CCI)"
            icon={AlertCircle}
            tileId="raw_tickets_cci"
            supportedPeriods={['current', 'ytd', 'monthly']}
            sql={`SELECT
          st_number AS ticket_number,
          customer_name,
          customer_display_name,
          service_location_city,
          service_location_state,
          status,
          type,
          priority,
          service_area,
          operations_code,
          equipment_name,
          estimated_arrival_time,
          SUBSTR(work_done, 1, 200) AS work_done_preview,
          case_or_ticket_number,
          created_time
          FROM curated_core.v_cci_tickets_clean
          ORDER BY created_time DESC
          LIMIT 500`}
            renderContent={(data) => (
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">ST #</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Customer</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Status</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Type</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Priority</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Work Done</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data_rows?.slice(0, 10).map((row, i) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[0] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[1] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[5] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[6] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[7] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 max-w-xs truncate">{values[12] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[14] || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          />

          {/* Tile 2: Ticket Burden Lake */}
          <DashboardTile
            title="Ticket Burden Lake"
            icon={TrendingUp}
            tileId="ticket_burden_lake"
            supportedPeriods={['current', 'ytd', 'monthly']}
            sql={`SELECT 
              customer_id,
              customer_name,
              ticket_count_lake
            FROM curated_core.v_ticket_burden_lake
            ORDER BY ticket_count_lake DESC
            LIMIT 200`}
            renderContent={(data) => (
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Account</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Tickets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data_rows?.slice(0, 10).map((row, i) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[1] || values[0] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[2] || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          />

          {/* Tile 3: Ticket Burden by Customer */}
          <DashboardTile
            title="Ticket Burden by Customer"
            icon={Users}
            tileId="ticket_burden_customer"
            supportedPeriods={['current', 'ytd', 'monthly']}
            sql={`SELECT 
              c.customer_id,
              c.customer_name,
              b.ticket_count_lake,
              b.ticket_burden_band
            FROM curated_core.v_ticket_burden_banded b
            LEFT JOIN curated_core.dim_customer_platt_v1_1 c
              ON c.customer_id = b.customer_id
            ORDER BY b.ticket_count_lake DESC
            LIMIT 200`}
            renderContent={(data) => (
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Customer</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Tickets</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data_rows?.slice(0, 10).map((row, i) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[1] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[2] || 0}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[3] || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          />

          {/* Tile 4: Ticket Burden Banded */}
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="band" tick={{ fontSize: 10 }} stroke="#f97316" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#f97316" />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
                    <Bar dataKey="customers" fill="#5C7B5F" radius={[4, 4, 0, 0]} name="Customers" />
                  </BarChart>
                </ResponsiveContainer>
              );
            }}
          />

          {/* Tile 5: Margin with Tickets */}
          <DashboardTile
            title="Margin + Tickets View"
            icon={DollarSign}
            tileId="margin_tickets"
            supportedPeriods={['current', 'ytd', 'monthly']}
            sql={`SELECT 
              customer_id,
              customer_name,
              total_mrr,
              total_cci_cost,
              gross_margin_dollars,
              gross_margin_pct,
              ticket_count_lake,
              ticket_burden_band,
              partner_pct,
              hosted_pbx_flag
            FROM curated_core.v_customer_margin_plus_tickets
            ORDER BY
              ticket_count_lake DESC,
              gross_margin_pct ASC
            LIMIT 500`}
            renderContent={(data) => (
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Customer</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">MRR</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Margin %</th>
                      <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Tickets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data_rows?.slice(0, 10).map((row, i) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[1] || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">${typeof values[2] === 'number' ? values[2].toFixed(2) : '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{typeof values[5] === 'number' ? values[5].toFixed(1) + '%' : '-'}</td>
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{values[6] || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          />

          {/* Tile 6: Ticket Trend Summary */}
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#f97316" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#f97316" />
                    <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--card)', border: '1px solid var(--border)' }} />
                    <Line type="monotone" dataKey="count" stroke="#B8D8E5" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              );
            }}
          />
        </div>
      </motion.div>

      {/* Action & Unit Economics */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--mac-mountain)]" />
            Action & Unit Economics
          </h2>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tile 4: A-E Band Distribution */}
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

          {/* Tile 5: Worst E-Band Accounts */}
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
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      {data.columns?.slice(0, 3).map((col, i) => (
                        <th key={i} className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 uppercase">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.data_rows?.slice(0, 10).map((row, i) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          {values.slice(0, 3).map((val, j) => (
                            <td key={j} className="px-2 py-1.5 text-slate-700">
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

          {/* Tile 6: Hosted PBX Uplift */}
          <DashboardTile
            title="Hosted PBX Uplift (>$1k)"
            icon={Zap}
            tileId="hosted_pbx"
            supportedPeriods={['current']}
            sql={`SELECT *
          FROM curated_core.v_hosted_pbx_migration
          WHERE mrr_uplift_to_50 > 1000
          ORDER BY mrr_uplift_to_50 DESC
          LIMIT 200`}
            renderContent={(data) => (
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      {data.columns?.slice(0, 3).map((col, i) => (
                        <th key={i} className="px-2 py-1.5 text-left text-xs font-medium text-slate-600 uppercase">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.data_rows?.slice(0, 10).map((row, i) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          {values.slice(0, 3).map((val, j) => (
                            <td key={j} className="px-2 py-1.5 text-slate-700">
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
        </div>
      </motion.div>
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to load user:', error);
      }
    };
    loadUser();
  }, []);

  return (
    <DashboardRefreshProvider>
      <DashboardContent user={user} />
    </DashboardRefreshProvider>
  );
}