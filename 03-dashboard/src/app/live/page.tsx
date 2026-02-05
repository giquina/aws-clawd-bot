'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AutoRefreshIndicator, RefreshPulse } from '@/components/auto-refresh-indicator';
import { useLiveState } from '@/hooks/use-live-state';
import { formatUptime } from '@/lib/utils';
import type {
  LiveAgent,
  LiveOutcome,
  LiveDeployment,
  TimelineEntry,
  LivePendingConfirmation,
  LiveConversationSession,
} from '@/lib/api';
import {
  Radio,
  Bot,
  Cpu,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader,
  GitBranch,
  Rocket,
  RefreshCw,
  Activity,
  AlertCircle,
  MessageSquare,
  Terminal,
} from 'lucide-react';

const REFRESH_INTERVAL_MS = 5000;

export default function LivePage() {
  const {
    data: state,
    loading,
    error,
    lastUpdated,
    isAutoRefreshEnabled,
    isRefreshing,
    toggleAutoRefresh,
    refresh,
  } = useLiveState();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="text-gray-600 dark:text-gray-400">Connecting to live feed...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Connection Error</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <Button onClick={refresh} variant="primary" className="w-full">
              Reconnect
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <Radio className="h-6 w-6 text-red-600 dark:text-red-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Live Agent View</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Real-time agent activity & visibility</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <AutoRefreshIndicator
            lastUpdated={lastUpdated}
            isEnabled={isAutoRefreshEnabled}
            isRefreshing={isRefreshing}
            onToggle={toggleAutoRefresh}
            intervalMs={REFRESH_INTERVAL_MS}
          />
          <Button onClick={refresh} variant="outline" size="md" disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Bar */}
      <RefreshPulse isRefreshing={isRefreshing}>
        <StatusBar uptime={state.uptime} heapMB={state.memoryUsage.heapMB} queue={state.taskQueue} />
      </RefreshPulse>

      {/* Agent Cards */}
      <RefreshPulse isRefreshing={isRefreshing}>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Active Agents</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            {state.activeSessions && state.activeSessions.length > 0 &&
              state.activeSessions.map((session) => (
                <SessionCard key={session.chatId} session={session} />
              ))
            }
          </div>
        </div>
      </RefreshPulse>

      {/* Current Task */}
      {state.currentTask && (
        <RefreshPulse isRefreshing={isRefreshing}>
          <CurrentTaskCard task={state.currentTask} />
        </RefreshPulse>
      )}

      {/* Pending Confirmations */}
      {Object.keys(state.pendingConfirmations).length > 0 && (
        <PendingConfirmations confirmations={state.pendingConfirmations} />
      )}

      {/* Activity Timeline */}
      <RefreshPulse isRefreshing={isRefreshing}>
        <ActivityTimeline entries={state.timeline} />
      </RefreshPulse>

      {/* Bottom Grid: Outcomes + Deployments */}
      <RefreshPulse isRefreshing={isRefreshing}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <OutcomesCard outcomes={state.recentOutcomes} />
          <DeploymentsCard deployments={state.recentDeployments} />
        </div>
      </RefreshPulse>
    </div>
  );
}

// ── Sub-components ──

function StatusBar({ uptime, heapMB, queue }: { uptime: number; heapMB: number; queue: { queued: number; running: number; capacity: number } }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-medium text-gray-900 dark:text-white">Bot Online</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Uptime: {formatUptime(uptime)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <Cpu className="h-3.5 w-3.5" />
            <span>Heap: {heapMB} MB</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <Activity className="h-3.5 w-3.5" />
            <span>Queue: {queue.running}/{queue.capacity}</span>
            {queue.queued > 0 && (
              <Badge variant="warning">{queue.queued} waiting</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentCard({ agent }: { agent: LiveAgent }) {
  const isMain = agent.type === 'main';
  const borderColor = agent.status === 'active' || agent.status === 'running'
    ? 'border-green-300 dark:border-green-700'
    : 'border-gray-200 dark:border-gray-700';

  return (
    <Card className={borderColor}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${isMain ? 'bg-primary-100 dark:bg-primary-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            {isMain ? (
              <Bot className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            ) : (
              <Terminal className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white text-sm">{agent.name}</span>
              <div className={`h-2 w-2 rounded-full ${agent.status === 'active' || agent.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isMain ? `Uptime: ${formatUptime(agent.uptime || 0)}` : agent.task || 'Running...'}
            </p>
            {!isMain && agent.startedAt && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Running {formatElapsed(agent.startedAt)}
                {agent.pid ? ` · PID ${agent.pid}` : ''}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionCard({ session }: { session: LiveConversationSession }) {
  const modeColors: Record<string, string> = {
    designing: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    planning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    coding: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    iterating: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  };

  return (
    <Card className="border-purple-300 dark:border-purple-700">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white text-sm">Conversation Session</span>
              <Badge className={`text-xs ${modeColors[session.mode] || ''}`}>{session.mode}</Badge>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {session.projectName || session.repo || `Chat ${session.chatId}`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CurrentTaskCard({ task }: { task: TimelineEntry }) {
  return (
    <Card className="border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-primary-500 animate-pulse" />
          <CardTitle className="text-base">Current Task</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-gray-900 dark:text-white font-medium">{task.message}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
          <Badge variant="outline">{task.source}</Badge>
          <span>{formatTimeAgo(task.timestamp)}</span>
          {task.meta && Object.keys(task.meta).length > 0 && (
            <span className="text-gray-400">
              {Object.entries(task.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingConfirmations({ confirmations }: { confirmations: Record<string, LivePendingConfirmation> }) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        Awaiting Confirmation
      </h2>
      {Object.entries(confirmations).map(([userId, conf]) => (
        <Card key={userId} className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="font-medium text-gray-900 dark:text-white text-sm">{conf.action}</span>
                {conf.params?.target ? (
                  <Badge variant="outline">{String(conf.params.target)}</Badge>
                ) : null}
              </div>
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {conf.minutesRemaining}m remaining
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries, autoScroll]);

  const levelColor = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      case 'warn': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'activity': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const sourceIcon = (source: string) => {
    switch (source.toLowerCase()) {
      case 'telegram': return '\u{1F4AC}';
      case 'ai': return '\u{1F916}';
      case 'skill': return '\u26A1';
      case 'webhook': return '\u{1F517}';
      case 'system': return '\u2699\uFE0F';
      case 'voice': return '\u{1F399}\uFE0F';
      default: return '\u{1F4CB}';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity Timeline</CardTitle>
          <Badge variant="outline">{entries.length} events</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="max-h-80 overflow-y-auto space-y-1.5 scrollbar-thin"
          onScroll={(e) => {
            const el = e.currentTarget;
            setAutoScroll(el.scrollTop < 10);
          }}
        >
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No activity recorded yet. Send a message to ClawdBot to see it here.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap mt-0.5">
                  {new Date(entry.timestamp).toLocaleTimeString('en-GB')}
                </span>
                <span className="text-sm" title={entry.source}>
                  {sourceIcon(entry.source)}
                </span>
                <Badge className={`text-[10px] px-1.5 py-0 ${levelColor(entry.level)}`}>
                  {entry.level}
                </Badge>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OutcomesCard({ outcomes }: { outcomes: LiveOutcome[] }) {
  const resultIcon = (result: string) => {
    switch (result) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
      case 'pending': return <Loader className="h-4 w-4 text-yellow-600 dark:text-yellow-400 animate-spin" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-gray-400" />;
      default: return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Outcomes</CardTitle>
      </CardHeader>
      <CardContent>
        {outcomes.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No outcomes recorded yet</p>
        ) : (
          <div className="space-y-2">
            {outcomes.slice(0, 8).map((outcome) => (
              <div key={outcome.id} className="flex items-center gap-2 text-sm">
                {resultIcon(outcome.result)}
                <span className="font-medium text-gray-900 dark:text-white">{outcome.action_type}</span>
                {outcome.repo && (
                  <Badge variant="outline" className="text-xs">{outcome.repo}</Badge>
                )}
                <span className="text-gray-500 dark:text-gray-400 flex-1 truncate text-xs">
                  {outcome.action_detail || ''}
                </span>
                {outcome.pr_url && (
                  <a href={outcome.pr_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs">
                    <GitBranch className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeploymentsCard({ deployments }: { deployments: LiveDeployment[] }) {
  const statusVariant = (status: string) => {
    switch (status) {
      case 'success': case 'completed': return 'success';
      case 'failed': case 'error': return 'error';
      case 'pending': case 'running': return 'warning';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Deployments</CardTitle>
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No deployments recorded yet</p>
        ) : (
          <div className="space-y-2">
            {deployments.slice(0, 5).map((deploy) => (
              <div key={deploy.id} className="flex items-center gap-2 text-sm">
                <Rocket className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-900 dark:text-white">{deploy.repo}</span>
                <Badge variant={statusVariant(deploy.status) as 'success' | 'error' | 'warning' | 'default'}>
                  {deploy.status}
                </Badge>
                <span className="text-xs text-gray-400 flex-1 text-right">
                  {formatTimeAgo(deploy.created_at)}
                </span>
                {deploy.url && (
                  <a href={deploy.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs">
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Helpers ──

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function formatElapsed(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
