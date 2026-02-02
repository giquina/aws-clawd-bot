'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, type StatusResponse } from '@/lib/api';
import { formatUptime } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { AutoRefreshIndicator, RefreshPulse } from '@/components/auto-refresh-indicator';
import { Activity, Clock, Zap, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

const REFRESH_INTERVAL_MS = 30000; // 30 seconds
const STORAGE_KEY = 'clawdbot-dashboard-auto-refresh';

export default function DashboardPage() {
  const {
    data: status,
    loading,
    error,
    lastUpdated,
    isAutoRefreshEnabled,
    isRefreshing,
    toggleAutoRefresh,
    refresh,
  } = useAutoRefresh<StatusResponse>({
    fetchFunction: api.getStatus,
    intervalMs: REFRESH_INTERVAL_MS,
    enabled: true,
    storageKey: STORAGE_KEY,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading bot status...</p>
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
              <CardTitle>Error Loading Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <Button onClick={refresh} variant="primary" className="w-full">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status) return null;

  const isOnline = status.status === 'online';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">ClawdBot Status & Overview</p>
        </div>
        <div className="flex items-center gap-4">
          <AutoRefreshIndicator
            lastUpdated={lastUpdated}
            isEnabled={isAutoRefreshEnabled}
            isRefreshing={isRefreshing}
            onToggle={toggleAutoRefresh}
            intervalMs={REFRESH_INTERVAL_MS}
          />
          <Button
            onClick={refresh}
            variant="outline"
            size="md"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <RefreshPulse isRefreshing={isRefreshing}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                <CardTitle>Bot Status</CardTitle>
              </div>
              <Badge variant={isOnline ? 'success' : 'error'}>
                {isOnline ? 'Online' : 'Offline'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Uptime</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatUptime(status.uptime)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Version</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {status.version}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Skills</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {status.skillCount} loaded
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </RefreshPulse>

      {/* Stats Cards */}
      {status.stats && (
        <RefreshPulse isRefreshing={isRefreshing}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Messages</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{status.stats.totalMessages}</p>
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Memory Facts</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{status.stats.totalFacts}</p>
                  </div>
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Activity className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Pending Tasks</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{status.stats.pendingTasks}</p>
                  </div>
                  <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                    <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Completed Tasks</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{status.stats.completedTasks}</p>
                  </div>
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </RefreshPulse>
      )}

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FeatureCard
          title="Memory System"
          description="Conversation history and learned facts"
          enabled={status.features.memory}
        />
        <FeatureCard
          title="Skills System"
          description="37+ modular command handlers"
          enabled={status.features.skills}
        />
        <FeatureCard
          title="Scheduler"
          description="Automated tasks and briefings"
          enabled={status.features.scheduler}
        />
        <FeatureCard
          title="Project Intelligence"
          description="Smart project routing and awareness"
          enabled={status.features.projectIntelligence}
        />
        <FeatureCard
          title="Action Executor"
          description="Voice-triggered automation"
          enabled={status.features.actionExecutor}
        />
        <FeatureCard
          title="Multi-AI Routing"
          description="Groq, Claude, Grok and Perplexity"
          enabled={true}
        />
      </div>
    </div>
  );
}

interface FeatureCardProps {
  title: string;
  description: string;
  enabled: boolean;
}

function FeatureCard({ title, description, enabled }: FeatureCardProps) {
  return (
    <Card className={enabled ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {enabled ? (
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="h-5 w-5 text-gray-400" />
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
