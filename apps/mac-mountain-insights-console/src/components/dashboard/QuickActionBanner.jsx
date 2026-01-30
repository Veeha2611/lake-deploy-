import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, MessageSquare, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function QuickActionBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="relative overflow-hidden border-2 border-[var(--mac-forest)]/20 bg-gradient-to-br from-[var(--mac-forest)]/5 via-[var(--mac-sky)]/10 to-[var(--mac-forest)]/5">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        
        <div className="relative z-10 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-card-foreground mb-1">
                MAC Intelligence at Your Command
              </h3>
              <p className="text-sm text-muted-foreground">
                Query customers, margins, action bands, and churn in plain English · Instant answers from your unified commercial data lake
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Link to={createPageUrl('Console')}>
              <Button className="bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] hover:shadow-lg transition-all">
                <MessageSquare className="w-4 h-4 mr-2" />
                Start Querying
              </Button>
            </Link>
            <Link to={createPageUrl('Topics')}>
              <Button variant="outline" className="border-[var(--mac-forest)] text-[var(--mac-forest)] hover:bg-[var(--mac-forest)]/10">
                <TrendingUp className="w-4 h-4 mr-2" />
                Explore Topics
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}