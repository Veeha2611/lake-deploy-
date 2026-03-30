import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function SchemaDiscovery() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const runDiscovery = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('discoverProjectsSchema');
      setData(response.data);
    } catch (error) {
      console.error('Discovery failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDiscovery();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Button onClick={runDiscovery}>Run Schema Discovery</Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Schema Discovery: projects_enriched</h1>
        <p className="text-sm text-muted-foreground">
          Diagnosing column mapping issues in curated_core.projects_enriched
        </p>
      </div>

      {/* Columns */}
      <Card>
        <CardHeader>
          <CardTitle>Table Columns (SHOW COLUMNS)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded overflow-x-auto">
            {JSON.stringify(data.columns, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* View Definition */}
      <Card>
        <CardHeader>
          <CardTitle>View Definition (if view)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded overflow-x-auto whitespace-pre-wrap">
            {typeof data.view_definition === 'string' 
              ? data.view_definition 
              : JSON.stringify(data.view_definition, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* Sample Data */}
      <Card>
        <CardHeader>
          <CardTitle>Sample Data (SELECT * LIMIT 3)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-xs font-semibold">Columns:</p>
            <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded overflow-x-auto">
              {JSON.stringify(data.sample_columns, null, 2)}
            </pre>
            <p className="text-xs font-semibold mt-4">Data Rows:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    {(data.sample_columns || []).map((col, idx) => (
                      <th key={idx} className="p-2 text-left border font-semibold">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.sample_data || []).map((row, idx) => {
                    const values = Array.isArray(row) ? row : Object.values(row);
                    return (
                      <tr key={idx} className="border-b">
                        {values.map((val, vIdx) => (
                          <td key={vIdx} className="p-2 border">{val || '(null)'}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Raw Source Sample */}
      <Card>
        <CardHeader>
          <CardTitle>Raw Source Table Sample (raw.projects_pipeline_lc_pipeline)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-xs font-semibold">Columns:</p>
            <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded overflow-x-auto">
              {JSON.stringify(data.raw_source_columns, null, 2)}
            </pre>
            <p className="text-xs font-semibold mt-4">Data Rows:</p>
            {typeof data.raw_source_sample === 'string' ? (
              <p className="text-xs text-amber-600">{data.raw_source_sample}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      {(data.raw_source_columns || []).map((col, idx) => (
                        <th key={idx} className="p-2 text-left border font-semibold">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.raw_source_sample || []).map((row, idx) => {
                      const values = Array.isArray(row) ? row : Object.values(row);
                      return (
                        <tr key={idx} className="border-b">
                          {values.map((val, vIdx) => (
                            <td key={vIdx} className="p-2 border text-xs">{val || '(null)'}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}