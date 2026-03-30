import React from 'react';
import { Layers } from 'lucide-react';
import DashboardTile from '@/components/dashboard/DashboardTile';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BUCKET_SQL_SUBSCRIPTIONS = `
SELECT
  bucket,
  fsa_count,
  customer_count,
  total_mrr,
  revenue_per_customer
FROM curated_core.v_bucket_summary_latest
ORDER BY CASE bucket WHEN 'owned_fttp' THEN 1 WHEN 'contracted_fttp' THEN 2 ELSE 3 END
`;

const BUCKET_SQL_BILLING = `
WITH billed AS (
  SELECT
    CASE
      WHEN network_type = 'Owned FTTP' THEN 'owned_fttp'
      WHEN network_type = 'Contracted' THEN 'contracted_fttp'
      WHEN network_type = 'CLEC' THEN 'clec_business'
      ELSE 'unmapped'
    END AS bucket,
    CAST(SUM(COALESCE(billed_customers, 0)) AS bigint) AS billed_customers,
    SUM(COALESCE(mrr_billed, 0)) AS billed_mrr,
    CAST(SUM(COALESCE(active_services, 0)) AS bigint) AS active_services,
    MAX(period_month) AS period_month,
    MAX(modeled_dt) AS modeled_dt
  FROM curated_recon.v_network_mix_billing_aligned_latest
  WHERE network <> 'Unmapped'
    AND network_type IN ('Owned FTTP', 'Contracted', 'CLEC')
  GROUP BY 1
), fsa AS (
  SELECT bucket, fsa_count
  FROM curated_core.v_bucket_summary_latest
)
SELECT
  b.bucket,
  COALESCE(f.fsa_count, 0) AS fsa_count,
  b.billed_customers,
  b.billed_mrr,
  CASE
    WHEN b.billed_customers > 0 THEN b.billed_mrr / b.billed_customers
    ELSE NULL
  END AS revenue_per_customer,
  b.active_services,
  b.period_month,
  b.modeled_dt
FROM billed b
LEFT JOIN fsa f
  ON b.bucket = f.bucket
ORDER BY CASE b.bucket WHEN 'owned_fttp' THEN 1 WHEN 'contracted_fttp' THEN 2 ELSE 3 END
`;

const bucketLabels = {
  'owned_fttp': 'Owned FTTP',
  'contracted_fttp': 'Contracted FTTP',
  'clec_business': 'CLEC Business'
};

const bucketColors = {
  'owned_fttp': 'from-emerald-500/20 to-emerald-600/10',
  'contracted_fttp': 'from-blue-500/20 to-blue-600/10',
  'clec_business': 'from-purple-500/20 to-purple-600/10'
};

function renderBuckets(data, opts = {}) {
  const {
    countLabel = 'Count',
    countIndex = 2,
    totalLabel = 'Total MRR',
    totalIndex = 3,
    revLabel = 'Revenue/Unit',
    revIndex = 4,
    extra = null,
  } = opts;

  if (!data?.data_rows || data.data_rows.length === 0) {
    return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
  }

  try {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.data_rows.map((row) => {
          const values = Array.isArray(row) ? row : Object.values(row);
          const bucket = values[0];
          const fsaCount = Number(values[1]) || 0;
          const countValue = Number(values[countIndex]) || 0;
          const totalValue = Number(values[totalIndex]) || 0;
          const revPer = Number(values[revIndex]) || 0;

          return (
            <div
              key={bucket}
              className={`relative overflow-hidden rounded-lg border border-border p-4 bg-gradient-to-br ${bucketColors[bucket] || 'from-slate-500/20 to-slate-600/10'}`}
            >
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm text-card-foreground mb-1">
                    {bucketLabels[bucket] || bucket}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">FSAs</div>
                    <div className="text-lg font-bold text-card-foreground">
                      {fsaCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">{countLabel}</div>
                    <div className="text-lg font-bold text-card-foreground">
                      {countValue.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/50">
                  <div className="text-muted-foreground text-xs">{totalLabel}</div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    ${(totalValue / 1000).toFixed(1)}K
                  </div>
                </div>

                <div className="text-xs">
                  <div className="text-muted-foreground">{revLabel}</div>
                  <div className="font-semibold text-card-foreground">
                    ${revPer.toFixed(2)}
                  </div>
                </div>

                {extra ? extra(values) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  } catch (error) {
    console.error('Bucket tile render error:', error);
    return <div className="text-center text-red-600 py-8 text-sm">Error rendering bucket data</div>;
  }
}

export default function BucketSummaryTile() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <Tabs defaultValue="subscriptions" className="w-full">
        <TabsList className="mb-3">
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions">
          <DashboardTile
            title="Bucket Summary — Owned / Contracted / CLEC"
            icon={Layers}
            tileId="bucket_summary"
            supportedPeriods={['current']}
            sql={BUCKET_SQL_SUBSCRIPTIONS}
            renderContent={(data) => renderBuckets(data, {
              countLabel: 'Subscriptions',
              countIndex: 2,
              totalLabel: 'Modeled MRR',
              totalIndex: 3,
              revLabel: 'MRR / Subscription',
              revIndex: 4,
            })}
          />
        </TabsContent>

        <TabsContent value="billing">
          <DashboardTile
            title="Bucket Summary (Billing) — Owned / Contracted / CLEC"
            icon={Layers}
            tileId="bucket_summary_billing"
            supportedPeriods={['current']}
            sql={BUCKET_SQL_BILLING}
            renderContent={(data) => renderBuckets(data, {
              countLabel: 'Billed Customers',
              countIndex: 2,
              totalLabel: 'Billed MRR',
              totalIndex: 3,
              revLabel: 'MRR / Billed Customer',
              revIndex: 4,
              extra: (values) => {
                const activeServices = Number(values[5]) || 0;
                const periodMonth = values[6] ? String(values[6]).slice(0, 7) : '';
                const modeledDt = values[7] ? String(values[7]).slice(0, 10) : '';
                return (
                  <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                    <div>Active services: {activeServices.toLocaleString()}</div>
                    <div>Period: {periodMonth || '—'} · Modeled dt: {modeledDt || '—'}</div>
                  </div>
                );
              }
            })}
          />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
