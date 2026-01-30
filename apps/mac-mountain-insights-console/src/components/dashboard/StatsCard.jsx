import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUp, ArrowDown, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function StatsCard({ title, value, change, changeType, icon: Icon, color = 'emerald', isLoading, onClick }) {
  const colorClasses = {
    emerald: {
      bg: 'from-emerald-500 to-emerald-600',
      light: 'bg-emerald-50 dark:bg-emerald-950/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800'
    },
    blue: {
      bg: 'from-blue-500 to-blue-600',
      light: 'bg-blue-50 dark:bg-blue-950/20',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800'
    },
    amber: {
      bg: 'from-amber-500 to-amber-600',
      light: 'bg-amber-50 dark:bg-amber-950/20',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800'
    },
    slate: {
      bg: 'from-slate-500 to-slate-600',
      light: 'bg-slate-50 dark:bg-slate-950/20',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-800'
    },
    purple: {
      bg: 'from-purple-500 to-purple-600',
      light: 'bg-purple-50 dark:bg-purple-950/20',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-200 dark:border-purple-800'
    }
  };

  const colors = colorClasses[color] || colorClasses.emerald;
  const isPositive = changeType === 'positive';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={onClick ? 'cursor-pointer' : ''}
    >
      <Card className={`relative overflow-hidden border-2 ${colors.border} hover:shadow-xl transition-all duration-300 ${colors.light}`}>
        <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${colors.bg} opacity-10 rounded-full -translate-y-16 translate-x-16`} />
        
        <CardContent className="p-6 relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${colors.bg} shadow-lg`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            
            {change && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${isPositive ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'}`}>
                {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                <span className="text-xs font-bold">{change}</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-3xl font-bold text-card-foreground">
              {isLoading ? (
                <div className="h-9 w-24 bg-muted animate-pulse rounded" />
              ) : (
                value
              )}
            </div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}