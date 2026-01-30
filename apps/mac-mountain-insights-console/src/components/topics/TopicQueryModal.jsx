import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ResultDisplay from '@/components/console/ResultDisplay';

export default function TopicQueryModal({ isOpen, onClose, query, title }) {
  const { data: result, isLoading } = useQuery({
    queryKey: ['topic-query', query],
    queryFn: async () => {
      if (!query) return null;
      const response = await base44.functions.invoke('answerQuestion', {
        question: query
      });
      return response.data;
    },
    enabled: isOpen && !!query,
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-slate-900">{title}</DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-sm text-slate-600 mt-1">{query}</p>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <div className="w-16 h-16 mb-4 bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
            <p className="text-slate-600 font-medium">Querying MAC data lake...</p>
          </div>
        ) : result ? (
          <ResultDisplay result={result} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}