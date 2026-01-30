import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, BarChart3, LineChart as LineIcon, Download, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';

const COLORS = ['#5C7B5F', '#7B8B8E', '#B8D8E5'];

export default function MainChartCard() {
  const [chartType, setChartType] = useState('area');

  const { data: chartData, isLoading, error } = useQuery({
    queryKey: ['main-chart'],
    queryFn: async () => {
      try {
        const response = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { 
            sql: `WITH customer_month AS (
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
              SUM(mrr_total_customer_month) as total_mrr
            FROM customer_bands
            WHERE action_band IS NOT NULL
            GROUP BY action_band
            ORDER BY action_band
            LIMIT 10`
          }
        });
        
        if (response?.data?.data_rows && Array.isArray(response.data.data_rows) && response.data.data_rows.length > 0) {
          return response.data.data_rows.map(row => {
            const values = Array.isArray(row) ? row : Object.values(row);
            const rawBand = String(values[0] || '');
            const bandLabel = `Band ${rawBand.replace(/_.*$/, '')}`;
            return {
              band: bandLabel,
              mrr: values[1] || 0
            };
          });
        }
        return [];
      } catch (error) {
        console.error('Main chart error:', error);
        return [];
      }
    },
    refetchInterval: 60000,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const renderChart = () => {
    if (!chartData || chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-80 text-muted-foreground">
          No chart data available
        </div>
      );
    }

    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 30, left: 0, bottom: 0 }
    };

    return (
      <BarChart {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
        <XAxis dataKey="band" stroke="#f97316" tick={{ fontSize: 11, fill: '#f97316' }} />
        <YAxis stroke="#f97316" tick={{ fontSize: 11, fill: '#f97316' }} />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'var(--card)', 
            border: '2px solid #f97316', 
            borderRadius: '8px',
            color: '#f97316',
            fontWeight: '600'
          }}
          labelStyle={{ color: '#f97316' }}
          itemStyle={{ color: '#f97316' }}
          formatter={(value) => `$${Number(value).toFixed(2)}`}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--foreground)' }} />
        <Bar dataKey="mrr" fill="#5C7B5F" radius={[8, 8, 0, 0]} name="MRR by Band" />
      </BarChart>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="border-2 border-border shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)]">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl">MRR by Action Band</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Monthly recurring revenue by customer segment</p>
              </div>
            </div>
            
            <Badge variant="outline" className="text-xs">
              Real-time
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-80">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
            </div>
          ) : !chartData || chartData.length === 0 ? (
            <div className="flex items-center justify-center h-80 text-muted-foreground">
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              {renderChart()}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}