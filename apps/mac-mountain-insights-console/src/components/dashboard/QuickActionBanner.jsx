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
      <Card className="relative overflow-hidden mac-panel">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(197,228,237,0.85),transparent_60%),linear-gradient(120deg,rgba(92,123,95,0.16),transparent_65%)]" />
        <div className="relative z-10 p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="mac-icon-badge">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="mac-section-meta">AI Quick Action</div>
              <h3 className="text-lg font-display text-card-foreground mt-2">
                Ask the lake in plain English
              </h3>
              <p className="text-sm text-muted-foreground">
                Evidence-backed answers from your unified commercial data lake. Deterministic templates first, AI narration second.
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Link to={createPageUrl('Console')}>
              <Button className="mac-button-primary hover:shadow-sm transition-all">
                <MessageSquare className="w-4 h-4 mr-2" />
                Start Querying
              </Button>
            </Link>
            <Link to={`${createPageUrl('Console')}#topics`}>
              <Button variant="outline" className="mac-button-outline">
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
