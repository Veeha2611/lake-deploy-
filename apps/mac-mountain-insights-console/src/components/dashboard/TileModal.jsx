import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, ChevronDown, ChevronUp, BarChart3, PieChart, LineChart, Table, Download, Loader2, Calendar } from 'lucide-react';
import { BarChart, Bar, PieChart as RePieChart, Pie, LineChart as ReLineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TableWithSort from '../console/TableWithSort';

const COLORS = ['#5C7B5F', '#7B8B8E', '#B8D8E5', '#2D3E2D', '#8FA88F', '#A6B8B0'];

export default function TileModal({ isOpen, onClose, title, data, sql, icon: Icon, tileId, supportedPeriods = ['current'] }) {
  const [viewType, setViewType] = useState('table');
  const [showEvidence, setShowEvidence] = useState(false);
  const [timePeriod, setTimePeriod] = useState('current');

  // Fetch extended data when modal opens and period changes
  const { data: extendedData, isLoading: isLoadingExtended } = useQuery({
    queryKey: ['tile-extended', tileId, timePeriod],
    queryFn: async () => {
      if (timePeriod === 'current') return data;
      
      const { getTileSql } = await import('@/components/dashboard/tileSqlDefinitions');
      const { sql: sqlToUse } = getTileSql(tileId, timePeriod);
      
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: sqlToUse }
      });
      
      return response.data;
    },
    enabled: isOpen && tileId !== undefined,
    initialData: data,
  });

  const displayData = extendedData || data;

  // Normalize data to have data_results as array of objects
  const normalizedData = useMemo(() => {
    if (!displayData || !displayData.data_rows) return null;
    
    const normalized = { ...displayData };
    
    // Convert data_rows to data_results (array of objects)
    if (normalized.data_rows && normalized.columns) {
      normalized.data_results = normalized.data_rows.map(row => {
        const rowValues = Array.isArray(row) ? row : Object.values(row);
        const obj = {};
        normalized.columns.forEach((col, idx) => {
          obj[col] = rowValues[idx];
        });
        return obj;
      });
    }
    
    return normalized;
  }, [displayData]);

  const handleExport = () => {
    if (!normalizedData?.data_results || normalizedData.data_results.length === 0) return;
    
    const columns = Object.keys(normalizedData.data_results[0]);
    let csv = columns.join(',') + '\n';
    normalizedData.data_results.forEach(row => {
      csv += columns.map(col => `"${row[col] ?? ''}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_${timePeriod}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  if (!normalizedData) return null;

  const chartData = normalizedData.data_results?.slice(0, 50) || [];
  const columns = normalizedData.data_results?.[0] ? Object.keys(normalizedData.data_results[0]) : [];
  
  // Determine if data is suitable for pie chart - needs categorical + numeric
  const isPieChartSuitable = useMemo(() => {
    if (chartData.length === 0 || chartData.length > 20 || columns.length < 2) return false;
    
    // Check if first column is string-like and second is numeric
    const firstColSample = chartData[0]?.[columns[0]];
    const secondColSample = chartData[0]?.[columns[1]];
    
    const hasStringKey = typeof firstColSample === 'string' || firstColSample === null;
    const hasNumericValue = typeof secondColSample === 'number' || !isNaN(Number(secondColSample));
    
    return hasStringKey && hasNumericValue;
  }, [chartData, columns]);

  if (!normalizedData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {Icon && <Icon className="w-6 h-6 text-[var(--mac-forest)]" />}
              <DialogTitle className="text-2xl font-bold text-card-foreground">{title}</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              {supportedPeriods.length > 1 && (
                <div className="flex items-center gap-1 mr-2 border-r pr-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Button
                    variant={timePeriod === 'current' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimePeriod('current')}
                    disabled={!supportedPeriods.includes('current')}
                    className={timePeriod === 'current' ? 'bg-[var(--mac-forest)] h-7 text-xs' : 'h-7 text-xs'}
                  >
                    Current
                  </Button>
                  <Button
                    variant={timePeriod === 'ytd' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimePeriod('ytd')}
                    disabled={!supportedPeriods.includes('ytd')}
                    className={timePeriod === 'ytd' ? 'bg-[var(--mac-forest)] h-7 text-xs' : 'h-7 text-xs'}
                  >
                    YTD
                  </Button>
                  <Button
                    variant={timePeriod === 'monthly' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTimePeriod('monthly')}
                    disabled={!supportedPeriods.includes('monthly')}
                    className={timePeriod === 'monthly' ? 'bg-[var(--mac-forest)] h-7 text-xs' : 'h-7 text-xs'}
                  >
                    Monthly
                  </Button>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="hover:bg-emerald-50 hover:border-emerald-500"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant={viewType === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewType('table')}
                className={viewType === 'table' ? 'bg-[var(--mac-forest)]' : ''}
              >
                <Table className="w-4 h-4" />
              </Button>
              <Button
                variant={viewType === 'bar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewType('bar')}
                className={viewType === 'bar' ? 'bg-[var(--mac-forest)]' : ''}
              >
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewType === 'line' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewType('line')}
                className={viewType === 'line' ? 'bg-[var(--mac-forest)]' : ''}
              >
                <LineChart className="w-4 h-4" />
              </Button>
              <Button
                variant={viewType === 'pie' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewType('pie')}
                className={viewType === 'pie' ? 'bg-[var(--mac-forest)]' : ''}
                disabled={!isPieChartSuitable}
                title={!isPieChartSuitable ? 'Pie chart not suitable for this data' : 'Pie chart view'}
              >
                <PieChart className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoadingExtended && timePeriod !== 'current' ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
          </div>
        ) : (
          <div className="mt-4">
          {viewType === 'table' && normalizedData.data_results && (
            <TableWithSort data={normalizedData.data_results} columns={columns} />
          )}

          {viewType === 'bar' && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey={columns[0]} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px',
                    color: 'var(--foreground)'
                  }} 
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {columns.slice(1).map((col, idx) => (
                  <Bar key={col} dataKey={col} fill={COLORS[idx % COLORS.length]} radius={[8, 8, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}

          {viewType === 'line' && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={400}>
              <ReLineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey={columns[0]} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px',
                    color: 'var(--foreground)'
                  }} 
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {columns.slice(1).map((col, idx) => (
                  <Line key={col} type="monotone" dataKey={col} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} />
                ))}
              </ReLineChart>
            </ResponsiveContainer>
          )}

          {viewType === 'pie' && isPieChartSuitable && (
            <ResponsiveContainer width="100%" height={500}>
              <RePieChart>
                <Pie
                  data={chartData.map(item => {
                    const name = String(item[columns[0]] || 'Unknown');
                    const value = Number(item[columns[1]]) || 0;
                    return { name, value };
                  }).filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent, value }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={150}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => value.toLocaleString()} 
                  contentStyle={{ 
                    backgroundColor: 'var(--card)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px' 
                  }}
                />
                <Legend />
              </RePieChart>
            </ResponsiveContainer>
          )}
          
          {viewType === 'pie' && !isPieChartSuitable && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center text-muted-foreground">
                <PieChart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Pie chart not available for this data</p>
                <p className="text-sm mt-1 max-w-md">
                  {chartData.length > 20 
                    ? `Too many categories (${chartData.length}). Try filtering or use a bar chart instead.`
                    : chartData.length === 0
                    ? 'No data available.'
                    : 'Data structure not suitable. Pie charts require a categorical dimension and a numeric value.'}
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Badge variant="outline" className="text-xs">
              {normalizedData.data_results?.length || 0} rows
            </Badge>
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Database className="w-3 h-3" />
              Evidence
              {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {showEvidence && normalizedData && (
            <div className="mt-3 p-3 bg-secondary rounded-lg space-y-2 text-xs">
              {normalizedData.evidence?.athena_query_execution_id && (
                <div>
                  <span className="text-muted-foreground font-medium">Execution ID:</span>
                  <div className="font-mono text-muted-foreground break-all text-[10px] mt-0.5">
                    {normalizedData.evidence.athena_query_execution_id}
                  </div>
                </div>
              )}
              {tileId && (
                <div>
                  <span className="text-muted-foreground font-medium">Period:</span>
                  <div className="text-muted-foreground text-[10px] mt-0.5">
                    {timePeriod.toUpperCase()} mode
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}