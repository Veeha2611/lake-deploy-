import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, Loader2, CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';

export default function SSOTTestPack() {
  const [lastRun, setLastRun] = React.useState(null);
  
  const runTestsMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('getSSOTTestPack', {});
      return response.data;
    },
    onSuccess: (data) => {
      setLastRun(data);
    }
  });

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2">
          SSOT Test Pack
        </h1>
        <p className="text-muted-foreground">
          Validates console accuracy with 10 test questions proving SSOT architecture
        </p>
      </motion.header>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Test Execution</CardTitle>
            <Button
              onClick={() => runTestsMutation.mutate()}
              disabled={runTestsMutation.isPending}
              className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
            >
              {runTestsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Run All Tests
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {lastRun && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{lastRun.summary.passed}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{lastRun.summary.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{lastRun.summary.errors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-700">{lastRun.summary.total_tests}</div>
                <div className="text-xs text-muted-foreground">Total Tests</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{lastRun.summary.pass_rate}</div>
                <div className="text-xs text-muted-foreground">Pass Rate</div>
              </div>
            </div>

            {lastRun.all_tests_passed ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-800 dark:text-green-200">
                    All tests passed! SSOT architecture is working correctly.
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="font-semibold text-amber-800 dark:text-amber-200">
                    Some tests failed. Review results below.
                  </span>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground mb-4">
              Run at: {new Date(lastRun.run_at).toLocaleString()}
            </div>
          </CardContent>
        )}
      </Card>

      {lastRun && (
        <div className="space-y-4">
          {lastRun.tests.map((test) => (
            <motion.div
              key={test.test_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className={
                test.status === 'PASS' 
                  ? 'border-green-200 dark:border-green-800' 
                  : test.status === 'FAIL'
                  ? 'border-red-200 dark:border-red-800'
                  : 'border-amber-200 dark:border-amber-800'
              }>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {test.status === 'PASS' && <CheckCircle className="w-5 h-5 text-green-600" />}
                        {test.status === 'FAIL' && <XCircle className="w-5 h-5 text-red-600" />}
                        {test.status === 'ERROR' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
                        <Badge variant={
                          test.status === 'PASS' ? 'default' : 'destructive'
                        } className={
                          test.status === 'PASS' 
                            ? 'bg-green-100 text-green-800' 
                            : test.status === 'FAIL'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }>
                          {test.status}
                        </Badge>
                      </div>
                      <CardTitle className="text-base">{test.question}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expected View: <code>{test.expected_view}</code>
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {test.validation_message && (
                    <div className="text-sm">
                      <span className="font-medium">Validation: </span>
                      <span className={
                        test.status === 'PASS' ? 'text-green-700' : 'text-red-700'
                      }>
                        {test.validation_message}
                      </span>
                    </div>
                  )}

                  {test.evidence && (
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-xs space-y-2">
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">QIDs: </span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {test.evidence.qids.length > 0 ? test.evidence.qids.length : 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Views Used: </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {test.evidence.views_used.map((v, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {v}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">Rows: </span>
                        <span className="text-slate-600 dark:text-slate-400">{test.evidence.rows_returned}</span>
                      </div>
                    </div>
                  )}

                  {test.answer_preview && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Answer Preview:</div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{test.answer_preview}</p>
                    </div>
                  )}

                  {test.error && (
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                      <div className="text-xs font-medium text-red-700 dark:text-red-300">Error:</div>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{test.error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {!lastRun && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              No test results yet. Click "Run All Tests" to validate SSOT architecture.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}