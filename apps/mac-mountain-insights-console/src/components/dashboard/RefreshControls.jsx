import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { useDashboardRefresh } from './DashboardRefreshProvider';
import { Badge } from '@/components/ui/badge';

const INTERVALS = [
  { value: 0, label: 'Off' },
  { value: 30000, label: '30 seconds' },
  { value: 60000, label: '60 seconds' },
  { value: 120000, label: '2 minutes' },
  { value: 300000, label: '5 minutes' }
];

export default function RefreshControls() {
  const { 
    refreshInterval, 
    setRefreshInterval, 
    lastRefreshTime, 
    triggerRefresh,
    isPaused,
    setIsPaused,
    hasNewData,
    setHasNewData
  } = useDashboardRefresh();

  const [refreshing, setRefreshing] = React.useState(false);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    triggerRefresh();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleResumeRefresh = () => {
    setIsPaused(false);
    setHasNewData(false);
    triggerRefresh();
  };

  const timeAgo = () => {
    const seconds = Math.floor((Date.now() - lastRefreshTime) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  return (
    <div className="flex items-center gap-3">
      {hasNewData && isPaused && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleResumeRefresh}
          className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-50"
        >
          <AlertCircle className="w-4 h-4" />
          New Data Available
        </Button>
      )}
      
      <div className="flex items-center gap-2">
        <Select
          value={String(refreshInterval)}
          onValueChange={(val) => setRefreshInterval(Number(val))}
        >
          <SelectTrigger className="w-32 h-8 text-xs mac-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERVALS.map(interval => (
              <SelectItem key={interval.value} value={String(interval.value)} className="text-xs">
                {interval.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleManualRefresh}
        disabled={refreshing}
        className="gap-2 mac-button-outline"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh
      </Button>

      <Badge variant="outline" className="text-xs mac-pill" title="Last refresh">
        {timeAgo()}
      </Badge>
    </div>
  );
}
