'use client';

import { useAutoRefresh } from './use-auto-refresh';
import { api, type LiveStateResponse } from '@/lib/api';

const LIVE_REFRESH_INTERVAL_MS = 5000; // 5 seconds for live view
const STORAGE_KEY = 'clawdbot-live-auto-refresh';

export function useLiveState() {
  return useAutoRefresh<LiveStateResponse>({
    fetchFunction: api.getLiveState,
    intervalMs: LIVE_REFRESH_INTERVAL_MS,
    enabled: true,
    storageKey: STORAGE_KEY,
  });
}
