import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { runSSOTQuery } from '@/api/ssotQuery';
import { motion } from 'framer-motion';

const COLORS = ['#5C7B5F', '#7B8B8E', '#B8D8E5'];

export default function MainChartCard() {
  const { data: chartData, isLoading, error } = useQuery({
    queryKey: ['main-chart'],
    queryFn: async () => {
      try {
        const response = await runSSOTQuery({
          queryId: 'platt_billing_mrr_trend_12m',
          label: 'MRR Trend (12 Months)'
        });
        
        if (response?.data?.data_rows && Array.isArray(response.data.data_rows) && response.data.data_rows.length > 0) {
          return response.data.data_rows.map((row) => {
            const values = Array.isArray(row) ? row : Object.values(row);
            const rawDate = values[0];
            const date = rawDate ? new Date(rawDate) : null;
            const label = date ? date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : String(rawDate || '');
            return {
              month: label,
              mrr: Number(values[1]) || 0,
              customers: Number(values[2]) || 0
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

    return (
      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
        <XAxis dataKey="month" stroke="var(--muted-foreground)" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
        <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'var(--card)', 
            border: '1px solid var(--mac-panel-border)', 
            borderRadius: '8px',
            color: 'var(--foreground)',
            fontWeight: '600'
          }}
          labelStyle={{ color: 'var(--foreground)' }}
          itemStyle={{ color: 'var(--foreground)' }}
          formatter={(value) => `$${Number(value).toFixed(0)}`}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--foreground)' }} />
        <Area
          type="monotone"
          dataKey="mrr"
          name="MRR"
          stroke="var(--mac-forest)"
          fill="rgba(92, 123, 95, 0.2)"
          strokeWidth={2}
        />
      </AreaChart>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="mac-panel">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="mac-icon-badge">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-xl">MRR Trend (12 Months)</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Platt billing MRR, latest 12 months</p>
              </div>
            </div>
            
            <Badge variant="outline" className="text-xs mac-pill">
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
