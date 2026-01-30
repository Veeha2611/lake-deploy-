import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const quickSuggestions = [
  "How many active customers do we have?",
  "Show CCI bands rollup with MRR",
  "What are the worst 20 E-band accounts?",
  "Show Hosted PBX uplift opportunities over $1000"
];

export default function QueryInput({ onSubmit, isLoading }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSubmit(query);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about your data... e.g., 'What's our subscriber churn rate this month?'"
            className="min-h-[120px] resize-none pr-24 text-lg border-slate-200 focus:border-[#5C7B5F] focus:ring-[#5C7B5F]/20 rounded-xl"
          />
          <Button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute bottom-4 right-4 bg-gradient-to-r from-[#5C7B5F] to-[#3D5A3D] hover:from-[#4A6A4D] hover:to-[#2D4A2D] text-white rounded-xl px-6"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Ask AI
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Quick Suggestions */}
      <div className="mt-4">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <Sparkles className="w-4 h-4" />
          <span>Try asking:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <AnimatePresence>
            {quickSuggestions.map((suggestion, index) => (
              <motion.button
                key={suggestion}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-4 py-2 bg-slate-50 hover:bg-[#C5E4ED]/50 text-slate-600 hover:text-[#3D5A3D] rounded-full text-sm transition-colors border border-slate-100 hover:border-[#C5E4ED]"
              >
                {suggestion}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}