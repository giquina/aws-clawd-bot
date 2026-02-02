'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Pause, Play } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AutoRefreshIndicatorProps {
  lastUpdated: Date | null;
  isEnabled: boolean;
  isRefreshing: boolean;
  onToggle: () => void;
  intervalMs: number;
  className?: string;
}

export function AutoRefreshIndicator({
  lastUpdated,
  isEnabled,
  isRefreshing,
  onToggle,
  intervalMs,
  className,
}: AutoRefreshIndicatorProps) {
  const [, setTick] = useState(0);

  // Update the relative time display every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const intervalSeconds = Math.round(intervalMs / 1000);

  return (
    <div
      className={cn(
        'flex items-center gap-3 text-xs text-gray-500',
        className
      )}
    >
      {/* Last updated indicator */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-all duration-300',
            isRefreshing
              ? 'bg-blue-500 animate-pulse'
              : isEnabled
              ? 'bg-green-500'
              : 'bg-gray-400'
          )}
        />
        <span>
          {lastUpdated ? formatRelativeTime(lastUpdated) : 'Loading...'}
        </span>
      </div>

      {/* Divider */}
      <div className="h-3 w-px bg-gray-300" />

      {/* Auto-refresh toggle */}
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200',
          'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
          isEnabled ? 'text-green-600' : 'text-gray-500'
        )}
        title={
          isEnabled
            ? `Auto-refresh enabled (every ${intervalSeconds}s)`
            : 'Auto-refresh disabled'
        }
      >
        {isRefreshing ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : isEnabled ? (
          <Play className="h-3 w-3" />
        ) : (
          <Pause className="h-3 w-3" />
        )}
        <span className="hidden sm:inline">
          Auto: {isEnabled ? 'ON' : 'OFF'}
        </span>
      </button>
    </div>
  );
}

interface RefreshPulseProps {
  isRefreshing: boolean;
  children: React.ReactNode;
  className?: string;
}

export function RefreshPulse({ isRefreshing, children, className }: RefreshPulseProps) {
  return (
    <div
      className={cn(
        'transition-all duration-300',
        isRefreshing && 'animate-pulse ring-2 ring-blue-500/20 rounded-lg',
        className
      )}
    >
      {children}
    </div>
  );
}
