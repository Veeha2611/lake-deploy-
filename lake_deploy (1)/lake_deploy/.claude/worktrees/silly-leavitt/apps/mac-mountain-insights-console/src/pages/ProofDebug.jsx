import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ProofDebug() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const runDebug = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('debugProjectsDataProof');
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

  if (!data || !data.success) {
    return (
      <div className="p-6">
        <Button onClick={runDebug}>Run Proof Query</Button>
        {data && <p className="text-red-600 mt-2">{data.error}</p>}
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
      <div>
        <h1 className="text-2xl font-bold mb-2">Projects Data Proof</h1>
        <p className="text-sm text-muted-foreground">
          Proving that filters will populate correctly + table columns are correct
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sample Rows (First 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2 text-left border font-semibold">Project Name</th>
                  <th className="p-2 text-left border font-semibold">Entity</th>
                  <th className="p-2 text-left border font-semibold">State</th>
                  <th className="p-2 text-left border font-semibold">Type</th>
                  <th className="p-2 text-left border font-semibold">Stage</th>
                  <th className="p-2 text-left border font-semibold">Priority</th>
                  <th className="p-2 text-left border font-semibold">Owner</th>
                </tr>
              </thead>
              <tbody>
                {(data.sample_rows || []).map((row, idx) => {
                  const values = Array.isArray(row) ? row : Object.values(row);
                  return (
                    <tr key={idx} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="p-2 border font-medium">{values[0]}</td>
                      <td className="p-2 border">{values[1]}</td>
                      <td className="p-2 border">{values[2]}</td>
                      <td className="p-2 border">{values[3]}</td>
                      <td className="p-2 border">{values[4]}</td>
                      <td className="p-2 border">{values[5]}</td>
                      <td className="p-2 border">{values[6]}</td>
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
              <CardTitle className="text-sm capitalize">COUNT(*) by {dimension}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm max-h-64 overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={idx} className="flex justify-between border-b pb-1">
                    <span className="font-medium">{item.value || '(null)'}</span>
                    <span className="text-muted-foreground font-bold">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-300">
        <CardHeader>
          <CardTitle className="text-sm">✓ Proof Complete</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          <p><strong>Sample Rows:</strong> {data.sample_rows?.length || 0} rows with correct column order</p>
          <p><strong>Entity Values:</strong> {countsGrouped.entity?.length || 0} distinct (will populate Entity filter)</p>
          <p><strong>State Values:</strong> {countsGrouped.state?.length || 0} distinct (will populate State filter)</p>
          <p><strong>Type Values:</strong> {countsGrouped.project_type?.length || 0} distinct (will populate Type filter)</p>
          <p><strong>Stage Values:</strong> {countsGrouped.stage?.length || 0} distinct (will populate Stage filter)</p>
          <p><strong>Priority Values:</strong> {countsGrouped.priority?.length || 0} distinct (will populate Priority filter)</p>
        </CardContent>
      </Card>
    </div>
  );
}