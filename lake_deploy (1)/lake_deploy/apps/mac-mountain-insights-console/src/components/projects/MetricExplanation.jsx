import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Code, Database, Info } from 'lucide-react';

export default function MetricExplanation({ explanation }) {
  if (!explanation) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          <HelpCircle className="w-4 h-4 text-muted-foreground hover:text-[var(--mac-forest)]" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="w-5 h-5 text-[var(--mac-forest)]" />
            How is {explanation.metric_name} calculated?
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Plain Language Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="w-4 h-4" />
                Formula (Plain Language)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{explanation.formula_human}</p>
            </CardContent>
          </Card>

          {/* Mathematical Expression */}
          {explanation.formula_expression && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  Mathematical Expression
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded text-xs overflow-x-auto">
                  {explanation.formula_expression}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Data Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" />
                Data Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {explanation.inputs_frontend && explanation.inputs_frontend.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">Frontend Inputs:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {explanation.inputs_frontend.map((input, i) => (
                      <Badge key={i} variant="outline" className="font-mono text-xs">
                        {input}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {explanation.inputs_backend && explanation.inputs_backend.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">Backend Tables/Views:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {explanation.inputs_backend.map((input, i) => (
                      <Badge key={i} variant="outline" className="font-mono text-xs bg-blue-50 text-blue-700 border-blue-200">
                        {input}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {explanation.s3_sources && explanation.s3_sources.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">S3 Files:</span>
                  <div className="mt-1 space-y-1">
                    {explanation.s3_sources.map((source, i) => (
                      <div key={i} className="text-xs font-mono text-muted-foreground bg-slate-50 dark:bg-slate-900 p-2 rounded">
                        {source}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Coloring Logic */}
          {explanation.coloring_logic && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Coloring Logic</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{explanation.coloring_logic}</p>
              </CardContent>
            </Card>
          )}

          {/* Notes / Warnings */}
          {explanation.notes && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> {explanation.notes}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}