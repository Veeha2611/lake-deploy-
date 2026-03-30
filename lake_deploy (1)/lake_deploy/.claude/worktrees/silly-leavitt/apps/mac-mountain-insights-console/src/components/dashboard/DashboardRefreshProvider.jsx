import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DashboardRefreshContext = createContext(null);

export function useDashboardRefresh() {
  const context = useContext(DashboardRefreshContext);
  if (!context) {
    throw new Error('useDashboardRefresh must be used within DashboardRefreshProvider');
  }
  return context;
}

export function DashboardRefreshProvider({ children }) {
  const [refreshInterval, setRefreshInterval] = useState(60000); // Default 60s
  const [lastRefreshTime, setLastRefreshTime] = useState(Date.now());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hasNewData, setHasNewData] = useState(false);

  // Manual refresh
  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
    setLastRefreshTime(Date.now());
    setHasNewData(false);
  }, []);

  // Auto-refresh loop
  useEffect(() => {
    if (refreshInterval === 0) return; // Off

    const interval = setInterval(() => {
      // Only refresh if page is visible and not paused
      if (document.visibilityState === 'visible' && !isPaused) {
        triggerRefresh();
      } else if (isPaused) {
        // If paused, mark that new data is available
        setHasNewData(true);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, isPaused, triggerRefresh]);

  // Pause when page becomes hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setIsPaused(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const value = {
    refreshInterval,
    setRefreshInterval,
    lastRefreshTime,
    refreshTrigger,
    triggerRefresh,
    isPaused,
    setIsPaused,
    hasNewData,
    setHasNewData
  };

  return (
    <DashboardRefreshContext.Provider value={value}>
      {children}
    </DashboardRefreshContext.Provider>
  );
}