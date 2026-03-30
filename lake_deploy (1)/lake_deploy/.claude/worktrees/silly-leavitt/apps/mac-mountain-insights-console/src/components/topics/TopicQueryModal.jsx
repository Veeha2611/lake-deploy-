import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ResultDisplay from '@/components/console/ResultDisplay';
import { MAC_API_BASE } from '@/lib/mac-app-flags';
import { getAuthToken } from '@/lib/cognitoAuth';

export default function TopicQueryModal({ isOpen, onClose, questionId, title, subtitle }) {
  const { data: result, isLoading } = useQuery({
    queryKey: ['topic-query', questionId],
    queryFn: async () => {
      if (!questionId) return null;
      if (!MAC_API_BASE) {
        return { ok: false, error: 'MAC API base not configured' };
      }
      const baseUrl = MAC_API_BASE.replace(/\/$/, '');
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question_id: questionId, params: {} })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        return { ok: false, error: json.error || `MAC API error (${res.status})` };
      }

      const columns = json.columns || [];
      const rows = json.rows || [];
      const data_results = columns.length
        ? rows.map((row) => {
            const values = Array.isArray(row) ? row : Object.values(row || {});
            const obj = {};
            columns.forEach((col, idx) => {
              obj[col] = values[idx];
            });
            return obj;
          })
        : [];

      return {
        ok: true,
        answer_markdown: json.answer_markdown || '',
        data_rows: rows,
        columns,
        data_results,
        evidence: {
          athena_query_execution_id: json.query_execution_id || null,
          generated_sql: json.sql || null,
          views_used: json.views_used || [],
          query_id: json.question_id || questionId
        }
      };
    },
    enabled: isOpen && !!questionId,
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
          {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
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
