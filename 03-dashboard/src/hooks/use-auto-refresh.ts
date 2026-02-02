'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseAutoRefreshOptions<T> {
  fetchFunction: () => Promise<T>;
  intervalMs: number;
  enabled?: boolean;
  storageKey?: string;
}

interface UseAutoRefreshResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isAutoRefreshEnabled: boolean;
  isRefreshing: boolean;
  toggleAutoRefresh: () => void;
  refresh: () => Promise<void>;
}

export function useAutoRefresh<T>({
  fetchFunction,
  intervalMs,
  enabled = true,
  storageKey,
}: UseAutoRefreshOptions<T>): UseAutoRefreshResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(() => {
    if (typeof window !== 'undefined' && storageKey) {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? stored === 'true' : enabled;
    }
    return enabled;
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fetchFunctionRef = useRef(fetchFunction);
  fetchFunctionRef.current = fetchFunction;

  const fetchData = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setIsRefreshing(true);
      }
      setError(null);
      const result = await fetchFunctionRef.current();
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const toggleAutoRefresh = useCallback(() => {
    setIsAutoRefreshEnabled((prev) => {
      const newValue = !prev;
      if (storageKey && typeof window !== 'undefined') {
        localStorage.setItem(storageKey, String(newValue));
      }
      return newValue;
    });
  }, [storageKey]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isAutoRefreshEnabled && intervalMs > 0) {
      intervalRef.current = setInterval(() => {
        fetchData();
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAutoRefreshEnabled, intervalMs, fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    isAutoRefreshEnabled,
    isRefreshing,
    toggleAutoRefresh,
    refresh,
  };
}
