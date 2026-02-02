'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMockLogs, LogLevel, LogEntry } from '@/hooks/useMockLogs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Search,
  Download,
  Trash2,
  Play,
  Pause,
  ChevronDown,
  Filter,
} from 'lucide-react';

type FilterLevel = 'ALL' | LogLevel;

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function formatFullTimestamp(date: Date): string {
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'INFO':
      return 'text-gray-300';
    case 'WARN':
      return 'text-yellow-400';
    case 'ERROR':
      return 'text-red-400';
    default:
      return 'text-gray-300';
  }
}

export default function LogsPage() {
  const { logs, clearLogs, isGenerating, toggleGeneration } = useMockLogs({
    maxLogs: 500,
    autoGenerate: true,
    generateIntervalMs: 3000,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('ALL');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Filter logs based on search and level
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchQuery === '' ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.level.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;

    return matchesSearch && matchesLevel;
  });

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // Handle scroll to disable auto-scroll when user scrolls up
  const handleScroll = useCallback(() => {
    if (!logsContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  }, [autoScroll]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target as Node)
      ) {
        setShowFilterDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Export logs as text file
  const exportLogs = useCallback(() => {
    const content = filteredLogs
      .map(
        (log) =>
          `[${formatFullTimestamp(log.timestamp)}] [${log.level}] ${log.message}`
      )
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clawdbot-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  // Count logs by level
  const logCounts = {
    total: logs.length,
    info: logs.filter((l) => l.level === 'INFO').length,
    warn: logs.filter((l) => l.level === 'WARN').length,
    error: logs.filter((l) => l.level === 'ERROR').length,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Live Logs
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Real-time system logs and events
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-refresh toggle */}
          <Button
            variant={isGenerating ? 'primary' : 'outline'}
            size="sm"
            onClick={toggleGeneration}
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Pause className="h-4 w-4" />
                <span className="hidden sm:inline">Pause</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Resume</span>
              </>
            )}
          </Button>

          {/* Clear button */}
          <Button
            variant="outline"
            size="sm"
            onClick={clearLogs}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>

          {/* Export button */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportLogs}
            disabled={filteredLogs.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">Total:</span>
          <Badge variant="outline">{logCounts.total}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">Info:</span>
          <Badge variant="default">{logCounts.info}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">Warnings:</span>
          <Badge variant="warning">{logCounts.warn}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">Errors:</span>
          <Badge variant="error">{logCounts.error}</Badge>
        </div>
        {autoScroll && (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs">Auto-scroll</span>
          </div>
        )}
      </div>

      {/* Search and Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <Input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filter dropdown */}
        <div className="relative" ref={filterDropdownRef}>
          <Button
            variant="outline"
            size="md"
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="gap-2 w-full sm:w-auto justify-between"
          >
            <Filter className="h-4 w-4" />
            <span>
              {filterLevel === 'ALL' ? 'All Levels' : filterLevel}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                showFilterDropdown && 'rotate-180'
              )}
            />
          </Button>

          {showFilterDropdown && (
            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-10">
              {(['ALL', 'INFO', 'WARN', 'ERROR'] as FilterLevel[]).map(
                (level) => (
                  <button
                    key={level}
                    onClick={() => {
                      setFilterLevel(level);
                      setShowFilterDropdown(false);
                    }}
                    className={cn(
                      'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                      'first:rounded-t-md last:rounded-b-md',
                      filterLevel === level &&
                        'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                    )}
                  >
                    {level === 'ALL' ? 'All Levels' : level}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Matching count */}
      {(searchQuery || filterLevel !== 'ALL') && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredLogs.length} of {logs.length} logs
          {searchQuery && ` matching "${searchQuery}"`}
          {filterLevel !== 'ALL' && ` (${filterLevel} only)`}
        </div>
      )}

      {/* Logs terminal display */}
      <div className="rounded-lg border border-gray-700 overflow-hidden shadow-lg">
        {/* Terminal header */}
        <div className="bg-gray-800 px-4 py-2 flex items-center gap-2 border-b border-gray-700">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <div className="h-3 w-3 rounded-full bg-yellow-500" />
            <div className="h-3 w-3 rounded-full bg-green-500" />
          </div>
          <span className="text-gray-400 text-sm font-mono ml-2">
            clawdbot-logs
          </span>
          <div className="flex-1" />
          {isGenerating && (
            <span className="text-xs text-green-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Terminal content */}
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="bg-gray-900 p-4 h-[500px] overflow-y-auto font-mono text-sm"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileText className="h-12 w-12 mb-3 opacity-20" />
              <p>
                {logs.length === 0
                  ? 'No logs yet'
                  : 'No logs match your filter'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log) => (
                <LogLine key={log.id} log={log} searchQuery={searchQuery} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom info */}
      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
        <span>Maximum 500 log entries displayed. Older entries are automatically removed.</span>
        <span>
          {isGenerating
            ? 'Auto-refresh: enabled (every 3s)'
            : 'Auto-refresh: paused'}
        </span>
      </div>
    </div>
  );
}

interface LogLineProps {
  log: LogEntry;
  searchQuery: string;
}

function LogLine({ log, searchQuery }: LogLineProps) {
  // Highlight matching text
  const highlightText = (text: string) => {
    if (!searchQuery) return text;

    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          className="bg-yellow-400/30 text-yellow-200 rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="flex items-start gap-3 py-1 hover:bg-gray-800/50 px-2 -mx-2 rounded transition-colors group">
      {/* Timestamp */}
      <span className="text-gray-500 shrink-0 tabular-nums">
        {formatTimestamp(log.timestamp)}
      </span>

      {/* Level badge */}
      <span
        className={cn(
          'shrink-0 w-14 text-center font-semibold',
          getLevelColor(log.level)
        )}
      >
        [{log.level}]
      </span>

      {/* Message */}
      <span className={cn('flex-1 break-all', getLevelColor(log.level))}>
        {highlightText(log.message)}
      </span>
    </div>
  );
}
