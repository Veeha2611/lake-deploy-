import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Code2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import ResultDisplay from '@/components/console/ResultDisplay';

export default function ConsoleWidget() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const quickQueries = [
    "SELECT COUNT(*) AS projects FROM curated_core.projects_enriched",
    "SELECT MAX(period_month) AS latest_mrr_month FROM curated_core.v_monthly_mrr_platt",
    "SELECT customer_id, total_mrr FROM curated_core.v_customer_fully_loaded_margin_banded ORDER BY total_mrr DESC LIMIT 10"
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: query.trim() }
      });
      setResult(response.data);
    } catch (error) {
      setResult({ ok: false, error: error.message || 'Failed to execute query' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-white via-[var(--mac-sky)]/5 to-white border-0 shadow-lg overflow-hidden relative group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[var(--mac-sky)]/30 to-transparent rounded-full -translate-y-32 translate-x-32 blur-2xl" />
        <CardContent className="p-6 relative z-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Code2 className="w-5 h-5 text-[var(--mac-forest)]" />
              <span className="text-sm font-medium text-slate-700">Run a quick SQL check</span>
            </div>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SELECT COUNT(*) FROM curated_core.projects_enriched"
              className="min-h-[80px] text-base resize-none border-slate-200 focus:border-[var(--mac-forest)] focus:ring-[var(--mac-forest)] font-mono"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {quickQueries.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setQuery(q)}
                    className="text-xs px-3 py-1.5 bg-gradient-to-r from-slate-100 to-slate-200 hover:from-[var(--mac-sky)]/30 hover:to-[var(--mac-forest)]/10 rounded-full text-slate-700 transition-all shadow-sm hover:shadow-md"
                    disabled={isLoading}
                  >
                    Example {i + 1}
                  </button>
                ))}
              </div>

              <Button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] hover:from-[var(--mac-dark)] hover:to-[var(--mac-forest)] shadow-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Execute
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="bg-white border-0 shadow-sm">
              <CardContent className="p-8 flex flex-col items-center justify-center">
                <div className="w-12 h-12 mb-3 bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] rounded-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
                <p className="text-slate-600 font-medium text-sm">Querying MAC data lake...</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!isLoading && result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <ResultDisplay result={result} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
