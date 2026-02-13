import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, Sparkles, Users, TrendingUp, AlertCircle, Network, Ticket, DollarSign, FileText } from 'lucide-react';
import { MAC_API_BASE } from '@/lib/mac-app-flags';
import { getAuthToken } from '@/lib/cognitoAuth';
import { addQueryHistory } from '@/lib/queryHistoryStore';
import ResultDisplay from '@/components/console/ResultDisplay';
import QueryHistory from '@/components/console/QueryHistory';
import TopicQueryModal from '@/components/topics/TopicQueryModal';
import { motion, AnimatePresence } from 'framer-motion';

const looksLikeSql = (input) => /^\s*(select|with)\b/i.test(input);

function normalizeRows(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  if (!Array.isArray(columns) || columns.length === 0) return rows;
  const first = rows[0];
  if (!Array.isArray(first) || first.length !== columns.length) return rows;
  const matchesHeader = first.every((val, idx) =>
    String(val).trim().toLowerCase() === String(columns[idx]).trim().toLowerCase()
  );
  return matchesHeader ? rows.slice(1) : rows;
}

export default function Console() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [topicModal, setTopicModal] = useState({ isOpen: false, questionId: null, title: null, subtitle: null });
  const [sessionId, setSessionId] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [buildId, setBuildId] = useState(null);
  const chatScrollRef = React.useRef(null);

  useEffect(() => {
    const loadRegistry = async () => {
      if (!MAC_API_BASE) return;
      const baseUrl = MAC_API_BASE.replace(/\/$/, '');
      const token = await getAuthToken();
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${baseUrl}/registry`, { headers });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.registry) {
        setRegistry(json.registry);
      }
    };
    loadRegistry();
  }, []);

  const resetSession = (reason = null) => {
    if (typeof window === 'undefined') return;
    const sessionKey = 'mac_console_session_id';
    const previousSession = window.sessionStorage.getItem(sessionKey);
    if (previousSession) {
      window.sessionStorage.removeItem(`mac_console_session_${previousSession}`);
    }
    const nextSession = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(sessionKey, nextSession);
    setSessionId(nextSession);
    setConversation([]);
    setResult(null);
    if (reason) {
      console.info(`[Console] Session reset: ${reason}`);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sessionKey = 'mac_console_session_id';
    let currentSession = window.sessionStorage.getItem(sessionKey);
    if (!currentSession) {
      currentSession = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem(sessionKey, currentSession);
    }
    setSessionId(currentSession);
    const stored = window.sessionStorage.getItem(`mac_console_session_${currentSession}`);
    if (stored) {
      try {
        setConversation(JSON.parse(stored));
      } catch (err) {
        console.warn('[Console] Failed to parse stored conversation', err);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const buildKey = 'mac_console_build_id';
    const fetchBuildId = async () => {
      try {
        const res = await fetch('/release.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const nextBuildId = data?.build_id || data?.built_at || null;
        if (!nextBuildId) return;
        setBuildId(nextBuildId);
        const previousBuildId = window.localStorage.getItem(buildKey);
        if (previousBuildId && previousBuildId !== nextBuildId) {
          resetSession('new build detected');
        }
        window.localStorage.setItem(buildKey, nextBuildId);
      } catch (err) {
        console.warn('[Console] Unable to load release.json', err);
      }
    };
    fetchBuildId();
  }, []);

  useEffect(() => {
    if (!sessionId || typeof window === 'undefined') return;
    window.sessionStorage.setItem(`mac_console_session_${sessionId}`, JSON.stringify(conversation));
  }, [sessionId, conversation]);

  const registryIds = useMemo(() => registry.map((entry) => entry.question_id), [registry]);

  const parseExplicitQuestionId = (input) => {
    const trimmed = input.trim();
    const explicitIdMatch = trimmed.match(/^(question_id|id)\s*:\s*([\w-]+)/i);
    return explicitIdMatch ? explicitIdMatch[2] : null;
  };

  const runQuery = async (text, contextEntry = null) => {
    const trimmedQuery = String(text || '').trim();
    if (!trimmedQuery || isLoading) return;

    const fallbackContext = contextEntry?.question
      ? contextEntry
      : [...conversation]
          .reverse()
          .find((entry) => entry?.status === 'complete' && entry?.result?.case_id);

    setIsLoading(true);
    setResult(null);
    const entryId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pendingEntry = {
      id: entryId,
      question: trimmedQuery,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    setConversation((prev) => [...prev, pendingEntry]);

    try {
      if (looksLikeSql(trimmedQuery)) {
        const errorResult = {
          ok: false,
          error: 'SQL is disabled in AWS-only mode. Use plan-language or a question_id.'
        };
        setResult(errorResult);
        setConversation((prev) =>
          prev.map((entry) =>
            entry.id === entryId ? { ...entry, status: 'error', result: errorResult } : entry
          )
        );
        setIsLoading(false);
        return;
      }

      const explicitQuestionId = parseExplicitQuestionId(trimmedQuery);
      if (explicitQuestionId && registryIds.length && !registryIds.includes(explicitQuestionId)) {
        const errorResult = {
          ok: false,
          error: `Question_id \"${explicitQuestionId}\" is not in the SSOT registry.`,
          supported_question_ids: registryIds
        };
        setResult(errorResult);
        setConversation((prev) =>
          prev.map((entry) =>
            entry.id === entryId ? { ...entry, status: 'error', result: errorResult } : entry
          )
        );
        setIsLoading(false);
        return;
      }

      if (!MAC_API_BASE) {
        throw new Error('MAC API base not configured');
      }

      const baseUrl = MAC_API_BASE.replace(/\/$/, '');
      const payload = explicitQuestionId
        ? { question_id: explicitQuestionId, params: {} }
        : { question: trimmedQuery };

      if (sessionId) {
        payload.thread_id = sessionId;
      }

      if (fallbackContext?.question) {
        payload.context = {
          case_id: fallbackContext.result?.case_id || null,
          question: fallbackContext.question,
          answer_markdown: fallbackContext.result?.answer_markdown || '',
          question_id: fallbackContext.result?.question_id || fallbackContext.result?.evidence?.query_id || null,
          metric_key: fallbackContext.result?.metric_key || null
        };
      }

      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `MAC API error (${res.status})`);
      }

      const columns = json.columns || [];
      const rows = normalizeRows(json.rows || [], columns);
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

      const resultData = {
        ok: true,
        answer_markdown: json.answer_markdown || '',
        data_rows: rows,
        columns,
        data_results,
        case_id: json.case_id || null,
        metric_key: json.metric_key || null,
        verification: json.verification || null,
        agent_steps: json.agent_steps || [],
        evidence_pack: json.evidence_pack || null,
        actions_available: json.actions_available || [],
        question_id: json.question_id || explicitQuestionId || 'freeform_sql',
        question_text: trimmedQuery,
        evidence: {
          athena_query_execution_id: json.query_execution_id || null,
          generated_sql: json.generated_sql || json.sql || null,
          views_used: json.views_used || [],
          query_id: json.question_id || explicitQuestionId || 'freeform_sql'
        }
      };

      setResult(resultData);
      setConversation((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, status: 'complete', result: resultData } : entry
        )
      );
      addQueryHistory(trimmedQuery);
    } catch (error) {
      const errorResult = { ok: false, error: error.message || 'Failed to execute query' };
      setResult(errorResult);
      setConversation((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, status: 'error', result: errorResult } : entry
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await runQuery(query);
    setQuery('');
  };

  const quickQuestions = [
    'What is our total MRR?',
    'Show me active accounts',
    'How many billing customers do we have?',
    'Which customers are at risk?',
    'Run month-end close summary',
    'Show the revenue report for the last 12 months',
    'Show passings and subscribers',
    'Show the network health summary',
    'Show me the projects pipeline'
  ];

  const topicCards = [
    {
      id: 'revenue-report',
      name: 'Revenue Report',
      description: 'Monthly revenue rollup and ARPU for the last 12 months',
      icon: DollarSign,
      color: 'from-emerald-500 to-emerald-600',
      questionId: 'revenue_report_12m',
      subtitle: 'Revenue report (last 12 months)'
    },
    {
      id: 'month-end-close',
      name: 'Month-End Close',
      description: 'Latest month close summary with MRR and churn signals',
      icon: FileText,
      color: 'from-sky-500 to-sky-600',
      questionId: 'month_end_close',
      subtitle: 'Month-end close summary'
    },
    {
      id: 'customer-identity',
      name: 'Customer Identity',
      description: 'Billing customers, active services, subscriptions, and SSOT totals',
      icon: Users,
      color: 'from-teal-500 to-teal-600',
      questionId: 'customer_identity_overview',
      subtitle: 'Customer identity overview'
    },
    {
      id: 'passings-subscribers',
      name: 'Passings & Subscribers',
      description: 'Network passings, subscribers, and penetration overview',
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      questionId: 'passings_subscribers',
      subtitle: 'Passings and subscribers summary'
    },
    {
      id: 'network-health',
      name: 'Network Health',
      description: 'Network mix by passings, subscriptions, ARPU, and MRR',
      icon: Network,
      color: 'from-indigo-500 to-indigo-600',
      questionId: 'network_health',
      subtitle: 'Network health detail'
    },
    {
      id: 'at-risk',
      name: 'At Risk & Retention',
      description: 'Problem accounts requiring immediate attention',
      icon: AlertCircle,
      color: 'from-red-500 to-red-600',
      questionId: 'at_risk_customers',
      subtitle: 'At-risk customers (D/E)'
    },
    {
      id: 'ticket-burden',
      name: 'Ticket Burden',
      description: 'Support ticket burden distribution and volume',
      icon: Ticket,
      color: 'from-purple-500 to-purple-600',
      questionId: 'ticket_burden_lake',
      subtitle: 'Ticket burden by band'
    },
    {
      id: 'projects-pipeline',
      name: 'Projects Pipeline',
      description: 'Pipeline summary from curated projects + Monday updates',
      icon: TrendingUp,
      color: 'from-amber-500 to-amber-600',
      questionId: 'projects_pipeline',
      subtitle: 'Projects pipeline summary'
    }
  ];

  const handleTopicClick = (topic) => {
    if (!topic.questionId) return;
    setTopicModal({ isOpen: true, questionId: topic.questionId, title: topic.name, subtitle: topic.subtitle || null });
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [conversation.length]);

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2">
          MAC AI Console
        </h1>
        <p className="text-muted-foreground">
          Plan-language queries routed through the SSOT registry with evidence attached.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Sparkles className="w-4 h-4 text-[var(--mac-forest)]" />
            <span className="text-xs font-medium text-slate-700">AWS-only • Allowlist enforced • Evidence required</span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="text-xs"
            onClick={() => resetSession('manual clear')}
          >
            Clear session
          </Button>
          {buildId && (
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Build {buildId}</span>
          )}
        </div>
      </motion.header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col h-[calc(100vh-240px)]">
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto pr-2 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key="conversation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                {conversation.length === 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl bg-white/90 border border-slate-200 px-4 py-4 shadow-sm">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">MAC AI</div>
                        <div className="text-sm text-slate-800 whitespace-pre-wrap">
                          Ask a question to start a case. I’ll plan → run → verify → answer with evidence attached.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {quickQuestions.slice(0, 4).map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => runQuery(q)}
                              className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-full text-slate-800 transition-all"
                              disabled={isLoading}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 text-xs text-slate-500">
                          Tip: after an answer, use <span className="font-medium text-slate-700">Verify</span> and <span className="font-medium text-slate-700">Show Evidence</span> for cross-checks and query IDs.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {conversation.map((entry) => (
                  <div key={entry.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-slate-100 border border-slate-200 px-4 py-3 shadow-sm">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">You</div>
                        <div className="text-sm text-slate-800 whitespace-pre-wrap">{entry.question}</div>
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="w-full">
                        {entry.status === 'pending' && (
                          <Card className="border-2 border-border shadow-lg">
                            <CardContent className="p-8 flex flex-col items-center justify-center">
                              <div className="w-12 h-12 mb-3 bg-gradient-to-br from-[var(--mac-forest)] to-[var(--mac-dark)] rounded-full flex items-center justify-center shadow-lg">
                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                              </div>
                              <p className="text-card-foreground font-medium">Querying MAC data lake...</p>
                              <p className="text-xs text-muted-foreground mt-1">Enforcing SSOT registry.</p>
                            </CardContent>
                          </Card>
                        )}
                        {entry.status !== 'pending' && entry.result && (
                          <ResultDisplay
                            result={entry.result}
                            onFollowup={(text) => runQuery(text, entry)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="pt-4">
            <Card className="border-2 border-border shadow-lg">
              <CardContent className="p-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  <Textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask a question (plain English). Follow-ups automatically use the last answer as context."
                    className="min-h-[72px] text-base border-2 focus:border-[var(--mac-forest)] transition-colors bg-background text-foreground placeholder:text-muted-foreground"
                    disabled={isLoading}
                  />

                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex flex-wrap gap-2">
                      {quickQuestions.map((q, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setQuery(q)}
                          className="text-xs px-3 py-1.5 bg-secondary hover:bg-[var(--mac-forest)]/10 border border-border rounded-full text-card-foreground transition-all"
                          disabled={isLoading}
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading || !query.trim()}
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
          </div>
        </div>

        <div className="lg:col-span-1">
          <QueryHistory onSelectQuery={setQuery} />

          <Card className="border-2 border-border mt-4">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--mac-forest)]" />
                <CardTitle className="text-base">Topic Library</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {topicCards.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => handleTopicClick(topic)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary hover:border-[var(--mac-forest)] transition-all group"
                >
                  <p className="text-sm font-medium text-card-foreground group-hover:text-[var(--mac-forest)]">
                    {topic.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {topic.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <TopicQueryModal
        isOpen={topicModal.isOpen}
        onClose={() => setTopicModal({ isOpen: false, questionId: null, title: null, subtitle: null })}
        questionId={topicModal.questionId}
        title={topicModal.title}
        subtitle={topicModal.subtitle}
      />
    </div>
  );
}
