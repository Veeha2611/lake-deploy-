import React from 'react';
import { Layers } from 'lucide-react';
import DashboardTile from '@/components/dashboard/DashboardTile';
import { motion } from 'framer-motion';

const BUCKET_SQL = `
WITH mix_by_bucket AS (
  SELECT
    CASE
      WHEN network_type = 'Owned FTTP' THEN 'owned_fttp'
      WHEN network_type = 'Contracted' THEN 'contracted_fttp'
      WHEN network_type = 'CLEC' THEN 'clec_business'
      ELSE 'clec_business'
    END AS bucket,
    SUM(COALESCE(mrr_billed, mrr)) AS total_mrr,
    SUM(COALESCE(billed_customers, subscriptions, active_services, 0)) AS customer_count
  FROM curated_recon.v_network_mix_billing_aligned_latest
  WHERE network_type IN ('Owned FTTP', 'Contracted', 'CLEC')
  GROUP BY 1
),
fsa_by_bucket AS (
  SELECT
    bucket,
    COUNT(DISTINCT fsa_id) AS fsa_count
  FROM curated_core.v_vetro_fsa_tagged
  GROUP BY bucket
)
SELECT
  m.bucket,
  COALESCE(f.fsa_count, 0) AS fsa_count,
  COALESCE(m.customer_count, 0) AS customer_count,
  COALESCE(m.total_mrr, 0) AS total_mrr,
  CASE
    WHEN COALESCE(m.customer_count, 0) > 0 THEN m.total_mrr / m.customer_count
    ELSE NULL
  END AS revenue_per_customer
FROM mix_by_bucket AS m
LEFT JOIN fsa_by_bucket AS f
  ON m.bucket = f.bucket
ORDER BY
  CASE m.bucket
    WHEN 'owned_fttp'      THEN 1
    WHEN 'contracted_fttp' THEN 2
    ELSE 3
  END
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

export default function BucketSummaryTile() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.4 }}
    >
      <DashboardTile
        title="Bucket Summary — Owned / Contracted / CLEC"
        icon={Layers}
        tileId="bucket_summary"
        supportedPeriods={['current']}
        sql={BUCKET_SQL}
        renderContent={(data) => {
          if (!data?.data_rows || data.data_rows.length === 0) {
            return <div className="text-center text-muted-foreground py-8 text-sm">No data available</div>;
          }

          try {
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.data_rows.map((row, idx) => {
                  const values = Array.isArray(row) ? row : Object.values(row);
                  const bucket = values[0];
                  const fsaCount = Number(values[1]) || 0;
                  const customerCount = Number(values[2]) || 0;
                  const totalMrr = Number(values[3]) || 0;
                  const revPerCustomer = Number(values[4]) || 0;

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
                          <div className="text-muted-foreground">Customers</div>
                          <div className="text-lg font-bold text-card-foreground">
                            {customerCount.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-border/50">
                        <div className="text-muted-foreground text-xs">Total MRR</div>
                        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                          ${(totalMrr / 1000).toFixed(1)}K
                        </div>
                      </div>

                      <div className="text-xs">
                        <div className="text-muted-foreground">Revenue/Customer</div>
                        <div className="font-semibold text-card-foreground">
                          ${revPerCustomer.toFixed(2)}
                        </div>
                      </div>
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
        }}
      />
    </motion.div>
  );
}
