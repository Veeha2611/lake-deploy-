import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ResultDisplay from '@/components/console/ResultDisplay';
import QueryHistory from '@/components/console/QueryHistory';
import { motion, AnimatePresence } from 'framer-motion';

export default function Console({ user }) {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuestion = urlParams.get('question');
    if (urlQuestion) {
      setQuestion(urlQuestion);
      handleSubmitWithQuestion(urlQuestion);
    }
  }, []);

  const handleSubmitWithQuestion = async (q) => {
    if (!q.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await base44.functions.invoke('answerQuestionV2', {
        question: q.trim()
      });

      const resultData = response.data;
      console.log('[Console] Raw response from answerQuestionV2 (SSOT strict):', resultData);
      setResult(resultData);

      if (resultData && !resultData.error) {
        try {
          await base44.entities.Query.create({
            question: q.trim(),
            response: resultData.answer_markdown || '',
            data_results: resultData.data_results || [],
            visualization_type: resultData.visualization_type || 'table',
            evidence: resultData.evidence || {},
            views_used: resultData.evidence?.views_used || [],
            athena_query_execution_id: resultData.evidence?.athena_query_execution_ids?.[0] || null,
            category: 'general',
            is_pinned: false
          });
        } catch (saveError) {
          console.error('Failed to save query to history:', saveError);
        }
      }
    } catch (error) {
      setResult({
        ok: false,
        error: error.message || 'Failed to execute query'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleSubmitWithQuestion(question);
  };

  const handleSelectQuery = (q) => {
    setQuestion(q);
    handleSubmitWithQuestion(q);
  };

  const quickQuestions = [
    'Show me active customers',
    'What is our total MRR by band?',
    'Which D/E-band accounts need attention?',
    'C-band pricing opportunities?',
  ];

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2">
          MAC Intelligence Console
        </h1>
        <p className="text-muted-foreground">SSOT-enforced front door to AWS Data Lake — all queries validated against curated_ssot.* and curated_core.* only</p>
        <div className="mt-2">
          <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-green-800 dark:text-green-200">SSOT Mode Active · Evidence Required · Two-Pass Architecture</span>
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Query Input & Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Query Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-2 border-border shadow-lg">
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g., Which C-band accounts need pricing review? or Show me customers at risk..."
                    className="min-h-[120px] text-base border-2 focus:border-[var(--mac-forest)] transition-colors"
                    disabled={isLoading}
                  />
                  
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex flex-wrap gap-2">
                      {quickQuestions.map((q, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setQuestion(q)}
                          className="text-xs px-3 py-1.5 bg-secondary hover:bg-[var(--mac-forest)]/10 hover:border-[var(--mac-forest)] border border-border rounded-full text-card-foreground transition-all"
                          disabled={isLoading}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    
                    <Button
                      type="submit"
                      disabled={isLoading || !question.trim()}
                      className="bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] hover:shadow-lg transition-all"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
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
          </motion.div>

          {/* Results Area */}
          <AnimatePresence mode="wait">
            {isLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Card className="border-2 border-border shadow-lg">
                  <CardContent className="p-12 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 mb-4 bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] rounded-full flex items-center justify-center shadow-lg">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <p className="text-card-foreground font-medium">Querying MAC data lake...</p>
                    <p className="text-sm text-muted-foreground mt-1">Discovering and analyzing...</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {!isLoading && result && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <ResultDisplay result={result} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column - Query History */}
        <div className="lg:col-span-1">
          <QueryHistory onSelectQuery={handleSelectQuery} />
        </div>
      </div>
    </div>
  );
}