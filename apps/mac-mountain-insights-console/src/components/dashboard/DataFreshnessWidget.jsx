import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Database, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { MAC_API_BASE } from '@/lib/mac-app-flags';
import { getAuthToken } from '@/lib/cognitoAuth';
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
        if (!MAC_API_BASE) {
          return { systems: [], error: 'MAC API base is not configured.' };
        }

        const baseUrl = MAC_API_BASE.replace(/\/$/, '');
        const token = await getAuthToken();
        const headers = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(`${baseUrl}/health?guards=1`, { headers });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { systems: [], error: json?.error || 'Health check failed.' };
        }
        if (json?.guard_status?.systems?.length) {
          return json.guard_status;
        }
        return { systems: [], error: 'Guard status unavailable.' };
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
      <Card className="mac-panel">
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
      <Card className="mac-panel border border-destructive/30">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertTriangle className="w-4 h-4" />
            Freshness check failed
          </div>
        </CardContent>
      </Card>
    );
  }

  const allGuardsOK = freshnessData.systems.every(s => s.guard_status ? s.guard_status === 'ok' : s.guard_ok);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="cursor-pointer"
        >
          <Card className={`mac-panel transition-all hover:shadow-sm ${
            allGuardsOK 
              ? 'border border-[var(--mac-badge-border)]' 
              : 'border border-amber-300/50'
          }`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  allGuardsOK ? 'bg-[var(--mac-forest)]' : 'bg-amber-500'
                } animate-pulse`} />
                <div>
                  <div className="text-xs font-semibold text-card-foreground">
                    Lake Status
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {freshnessData.systems.length} systems
                  </div>
                </div>
                {allGuardsOK ? (
                  <CheckCircle className="w-5 h-5 text-[var(--mac-forest)] ml-auto" />
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
          <div className="mac-panel rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              Real-time monitoring of curated_ssot.* and curated_core.* data sources.
              Each system shows latest partition date, row counts, and data quality guard status.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {freshnessData.systems.map((system, idx) => (
              <Card key={idx} className={`mac-panel ${system.guard_status && system.guard_status !== 'ok' ? 'border border-amber-300/50' : ''}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{system.name}</CardTitle>
                    {system.guard_status === 'warn' ? (
                      <Badge className="bg-amber-100 text-amber-700">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Guard Warning
                      </Badge>
                    ) : system.guard_status === 'fail' || system.guard_ok === false ? (
                      <Badge className="bg-amber-100 text-amber-700">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Guard Failed
                      </Badge>
                    ) : (
                      <Badge className="bg-[var(--mac-badge-bg)] text-[var(--mac-badge-text)]">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Guard OK
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
                      <div className="font-semibold text-[var(--mac-forest)]">
                        {system.ssot_count.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Exceptions</div>
                      <div className={`font-semibold ${
                        system.exception_count > 0 ? 'text-amber-600' : 'text-[var(--mac-forest)]'
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
                        <span className="text-xs text-muted-foreground">
                          {system.error ? 'Guard query failed' : 'N/A'}
                        </span>
                      )}
                    </div>
                  </div>
                  {system.error ? (
                    <div className="mt-3 text-xs text-amber-700">
                      {system.error}
                    </div>
                  ) : null}
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
