import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function DebugProjects() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const runDebug = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('debugProjectsData');
      setData(response.data);
    } catch (error) {
      console.error('Debug failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDebug();
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
        <Button onClick={runDebug}>Run Debug Query</Button>
      </div>
    );
  }

  const countsGrouped = (data.counts || []).reduce((acc, row) => {
    const values = Array.isArray(row) ? row : Object.values(row);
    const dimension = values[0];
    const value = values[1];
    const count = values[2];
    
    if (!acc[dimension]) acc[dimension] = [];
    acc[dimension].push({ value, count });
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Debug: First 20 Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2 text-left border">Project Name</th>
                  <th className="p-2 text-left border">Entity</th>
                  <th className="p-2 text-left border">State</th>
                  <th className="p-2 text-left border">Type</th>
                  <th className="p-2 text-left border">Stage</th>
                  <th className="p-2 text-left border">Priority</th>
                  <th className="p-2 text-right border">Scenario Count</th>
                  <th className="p-2 text-left border">Latest Run</th>
                </tr>
              </thead>
              <tbody>
                {(data.debug_rows || []).map((row, idx) => {
                  const values = Array.isArray(row) ? row : Object.values(row);
                  return (
                    <tr key={idx} className="border-b">
                      <td className="p-2 border font-medium">{values[0]}</td>
                      <td className="p-2 border">{values[1]}</td>
                      <td className="p-2 border">{values[2]}</td>
                      <td className="p-2 border">{values[3]}</td>
                      <td className="p-2 border">{values[4]}</td>
                      <td className="p-2 border">{values[5]}</td>
                      <td className="p-2 border text-right">{values[6]}</td>
                      <td className="p-2 border text-xs">{values[7] || 'N/A'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(countsGrouped).map(([dimension, items]) => (
          <Card key={dimension}>
            <CardHeader>
              <CardTitle className="text-sm capitalize">{dimension} Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                {items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="font-medium">{item.value || '(null)'}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}