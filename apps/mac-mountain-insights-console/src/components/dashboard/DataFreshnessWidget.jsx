import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Database, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';

/**
 * DATA FRESHNESS WIDGET
 * 
 * Shows per-system data freshness:
 * - Last dt (partition date)
 * - SSOT count (row count in latest partition)
 * - Exception count (rows with issues)
 * - Guard status (OK/FAIL)
 * - Links to manifests
 */

export default function DataFreshnessWidget() {
  const { data: freshnessData, isLoading } = useQuery({
    queryKey: ['data-freshness'],
    queryFn: async () => {
      try {
        // Query multiple SSOT tables for freshness
        const [mrrFreshness, projectsFreshness, ticketsFreshness] = await Promise.all([
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: {
              sql: `SELECT 
                MAX(period_month) as latest_dt,
                COUNT(*) as ssot_count,
                COUNT(CASE WHEN mrr_total < 0 THEN 1 END) as exception_count
              FROM curated_core.v_monthly_mrr_platt
              WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
              LIMIT 1`
            }
          }),
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: {
              sql: `SELECT 
                COUNT(*) as ssot_count,
                COUNT(CASE WHEN project_id IS NULL THEN 1 END) as exception_count
              FROM curated_core.projects_enriched
              LIMIT 1`
            }
          }),
          base44.functions.invoke('aiLayerQuery', {
            template_id: 'freeform_sql_v1',
            params: {
              sql: `SELECT 
                COUNT(*) as ssot_count,
                COUNT(CASE WHEN customer_id IS NULL OR customer_id = '' THEN 1 END) as exception_count
              FROM curated_core.v_cci_tickets_clean
              LIMIT 1`
            }
          })
        ]);

        const extractRow = (response) => {
          const row = response?.data?.data_rows?.[0];
          return Array.isArray(row) ? row : Object.values(row || {});
        };

        const mrrRow = extractRow(mrrFreshness);
        const projectsRow = extractRow(projectsFreshness);
        const ticketsRow = extractRow(ticketsFreshness);

        return {
          systems: [
            {
              name: 'MRR & Revenue',
              latest_dt: mrrRow[0] || 'Unknown',
              ssot_count: mrrRow[1] || 0,
              exception_count: mrrRow[2] || 0,
              guard_ok: (mrrRow[2] || 0) === 0,
              qid: mrrFreshness?.data?.athena_query_execution_id
            },
            {
              name: 'Projects Pipeline',
              latest_dt: 'Current',
              ssot_count: projectsRow[0] || 0,
              exception_count: projectsRow[1] || 0,
              guard_ok: (projectsRow[1] || 0) === 0,
              qid: projectsFreshness?.data?.athena_query_execution_id
            },
            {
              name: 'Support Tickets',
              latest_dt: 'Current',
              ssot_count: ticketsRow[0] || 0,
              exception_count: ticketsRow[1] || 0,
              guard_ok: (ticketsRow[1] || 0) === 0,
              qid: ticketsFreshness?.data?.athena_query_execution_id
            }
          ],
          last_check: new Date().toISOString()
        };
      } catch (error) {
        console.error('Data freshness check failed:', error);
        return { systems: [], error: error.message };
      }
    },
    refetchInterval: 300000, // 5 minutes
    staleTime: 240000 // 4 minutes
  });

  if (isLoading) {
    return (
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="w-4 h-4 animate-pulse" />
            Checking data freshness...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!freshnessData || freshnessData.error) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle className="w-4 h-4" />
            Freshness check failed
          </div>
        </CardContent>
      </Card>
    );
  }

  const allGuardsOK = freshnessData.systems.every(s => s.guard_ok);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="cursor-pointer"
        >
          <Card className={`border-2 transition-all hover:shadow-md ${
            allGuardsOK 
              ? 'border-green-200 dark:border-green-800' 
              : 'border-amber-200 dark:border-amber-800'
          }`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  allGuardsOK ? 'bg-green-500' : 'bg-amber-500'
                } animate-pulse`} />
                <div>
                  <div className="text-xs font-semibold text-card-foreground">
                    Data Lake Status
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {freshnessData.systems.length} systems monitored
                  </div>
                </div>
                {allGuardsOK ? (
                  <CheckCircle className="w-5 h-5 text-green-600 ml-auto" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 ml-auto" />
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--mac-forest)]" />
            SSOT Data Freshness Monitor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Real-time monitoring of curated_ssot.* and curated_core.* data sources.
              Each system shows latest partition date, row counts, and data quality guard status.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {freshnessData.systems.map((system, idx) => (
              <Card key={idx} className={`${
                !system.guard_ok ? 'border-amber-200 dark:border-amber-800' : ''
              }`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{system.name}</CardTitle>
                    {system.guard_ok ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Guard OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Guard Failed
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Latest Partition</div>
                      <div className="font-semibold flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {system.latest_dt}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">SSOT Count</div>
                      <div className="font-semibold text-green-600">
                        {system.ssot_count.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Exceptions</div>
                      <div className={`font-semibold ${
                        system.exception_count > 0 ? 'text-amber-600' : 'text-green-600'
                      }`}>
                        {system.exception_count.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Query ID</div>
                      {system.qid ? (
                        <a
                          href={`https://console.aws.amazon.com/athena/home?region=us-east-2#/query-editor/history/${system.qid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          View QID
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-xs text-muted-foreground text-right">
            Last checked: {new Date(freshnessData.last_check).toLocaleTimeString()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}