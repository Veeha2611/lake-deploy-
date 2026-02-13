import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, TrendingUp, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { loadQueryHistory, clearQueryHistory } from '@/lib/queryHistoryStore';

export default function QueryHistory({ onSelectQuery }) {
  const [queries, setQueries] = useState([]);

  useEffect(() => {
    const refresh = () => setQueries(loadQueryHistory());
    refresh();
    if (typeof window !== 'undefined') {
      window.addEventListener('mac-query-history-updated', refresh);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mac-query-history-updated', refresh);
      }
    };
  }, []);

  const handleClearHistory = async () => {
    if (!queries || queries.length === 0) return;
    
    try {
      clearQueryHistory();
      setQueries([]);
      toast.success('Query history cleared');
    } catch (error) {
      toast.error('Failed to clear history');
    }
  };

  const popularQueries = [
    'What is our total MRR?',
    'Show me active accounts',
    'Which customers are at risk?',
    'Show the network health summary',
    'Show me the projects pipeline'
  ];

  return (
    <div className="space-y-4">
      {/* Recent Queries */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--mac-forest)]" />
                <CardTitle className="text-base">Recent Queries</CardTitle>
              </div>
              {queries && queries.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                  className="h-8 text-xs hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {queries && queries.length > 0 ? (
              queries.slice(0, 5).map((query, idx) => (
                <button
                  key={query.id}
                  onClick={() => onSelectQuery(query.question)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary hover:border-[var(--mac-forest)] transition-all group"
                >
                  <p className="text-sm font-medium text-card-foreground group-hover:text-[var(--mac-forest)] line-clamp-2">
                    {query.question}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(query.created_date).toLocaleDateString()}
                  </p>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No recent queries</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Popular Queries */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-2 border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--mac-forest)]" />
              <CardTitle className="text-base">Example Prompts</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {popularQueries.map((query, idx) => (
              <button
                key={idx}
                onClick={() => onSelectQuery(query)}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary hover:border-[var(--mac-forest)] transition-all group"
              >
                <p className="text-sm font-medium text-card-foreground group-hover:text-[var(--mac-forest)]">
                  {query}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
