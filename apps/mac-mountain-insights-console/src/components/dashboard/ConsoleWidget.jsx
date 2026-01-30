import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import ResultDisplay from '@/components/console/ResultDisplay';

export default function ConsoleWidget() {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const quickQuestions = [
    'Active customers?',
    'Total MRR?',
    'E-band accounts?',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await base44.functions.invoke('answerQuestion', {
        question: question.trim()
      });
      setResult(response.data);
    } catch (error) {
      setResult({
        ok: false,
        error: error.message || 'Failed to execute query'
      });
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
              <Sparkles className="w-5 h-5 text-[var(--mac-forest)] animate-pulse" />
              <span className="text-sm font-medium text-slate-700">Query MAC's commercial data in plain English</span>
            </div>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Which C-band accounts need pricing review? or Show me D/E band customers"
              className="min-h-[80px] text-base resize-none border-slate-200 focus:border-[var(--mac-forest)] focus:ring-[var(--mac-forest)]"
              disabled={isLoading}
            />
            
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setQuestion(q)}
                    className="text-xs px-3 py-1.5 bg-gradient-to-r from-slate-100 to-slate-200 hover:from-[var(--mac-sky)]/30 hover:to-[var(--mac-forest)]/10 rounded-full text-slate-700 transition-all shadow-sm hover:shadow-md"
                    disabled={isLoading}
                  >
                    {q}
                  </button>
                ))}
              </div>
              
              <Button
                type="submit"
                disabled={isLoading || !question.trim()}
                className="bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] hover:from-[var(--mac-dark)] hover:to-[var(--mac-forest)] shadow-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Querying...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Ask
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