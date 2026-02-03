'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiKey } from '@/lib/api';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'ACTIVITY';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_CLAWDBOT_URL || 'http://16.171.150.151:3000';

function mapLevel(level: string): LogLevel {
  switch (level?.toLowerCase()) {
    case 'error': return 'ERROR';
    case 'warn': return 'WARN';
    case 'activity': return 'ACTIVITY';
    default: return 'INFO';
  }
}

interface UseRealLogsOptions {
  maxLogs?: number;
  pollIntervalMs?: number;
  autoStart?: boolean;
}

export function useRealLogs(options: UseRealLogsOptions = {}) {
  const { maxLogs = 500, pollIntervalMs = 3000, autoStart = true } = options;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPolling, setIsPolling] = useState(autoStart);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastIdRef = useRef<number>(0);

  const fetchLogs = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setLastError('No API key set. Go to Settings to configure.');
      setIsConnected(false);
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api/logs?limit=100`, {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setIsConnected(true);
      setLastError(null);

      if (data.logs && data.logs.length > 0) {
        // Convert API logs to LogEntry format
        const newEntries: LogEntry[] = data.logs
          .filter((l: { id: number }) => l.id > lastIdRef.current)
          .map((l: { id: number; timestamp: string; level: string; source: string; message: string }) => ({
            id: `log-${l.id}`,
            timestamp: new Date(l.timestamp),
            level: mapLevel(l.level),
            source: l.source || 'system',
            message: l.source ? `[${l.source}] ${l.message}` : l.message,
          }));

        if (newEntries.length > 0) {
          // Track the highest ID we've seen
          const maxId = Math.max(...data.logs.map((l: { id: number }) => l.id));
          lastIdRef.current = maxId;

          setLogs(prev => {
            const combined = [...prev, ...newEntries];
            return combined.length > maxLogs ? combined.slice(-maxLogs) : combined;
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLastError(msg);
      setIsConnected(false);
    }
  }, [maxLogs]);

  // Initial fetch
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Polling
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(fetchLogs, pollIntervalMs);
    return () => clearInterval(interval);
  }, [isPolling, pollIntervalMs, fetchLogs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const togglePolling = useCallback(() => {
    setIsPolling(prev => !prev);
  }, []);

  return {
    logs,
    clearLogs,
    isGenerating: isPolling,
    toggleGeneration: togglePolling,
    isConnected,
    lastError,
  };
}
