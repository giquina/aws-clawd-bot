'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type StatusResponse } from '@/lib/api';
import { formatUptime, formatRelativeTime } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import {
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Activity,
  Server,
  Bell,
  Mail,
  RefreshCw
} from 'lucide-react';

const REFRESH_INTERVAL_MS = 30000; // 30 seconds
const STORAGE_KEY = 'clawdbot-status-auto-refresh';

// Mock historical data for last 7 days (100% uptime)
const HISTORICAL_STATUS = [
  { day: 'Mon', status: 'up' },
  { day: 'Tue', status: 'up' },
  { day: 'Wed', status: 'up' },
  { day: 'Thu', status: 'up' },
  { day: 'Fri', status: 'up' },
  { day: 'Sat', status: 'up' },
  { day: 'Sun', status: 'up' },
];

export default function StatusPage() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

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

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      // Mock subscription - just show success message
      setSubscribed(true);
      setEmail('');
    }
  };

  const isOnline = status?.status === 'online';
  const uptimePercentage = '100'; // Mock uptime percentage

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            ClawdBot Status
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Real-time operational status and system health
          </p>
        </div>

        {/* Main Status Card */}
        <Card className="relative overflow-hidden">
          {loading ? (
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                <p className="text-gray-600 dark:text-gray-400">Checking status...</p>
              </div>
            </CardContent>
          ) : error ? (
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
                    ClawdBot is Down
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    We are experiencing issues. Please check back later.
                  </p>
                  <Button onClick={refresh} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            </CardContent>
          ) : (
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-6">
                {/* Status Indicator */}
                <div className="relative">
                  <div className={`h-24 w-24 rounded-full flex items-center justify-center ${
                    isOnline
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    <div className={`h-12 w-12 rounded-full ${
                      isOnline ? 'bg-green-500' : 'bg-red-500'
                    } animate-pulse`}></div>
                  </div>
                  {isOnline && (
                    <div className="absolute -top-1 -right-1">
                      <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 bg-white dark:bg-gray-800 rounded-full" />
                    </div>
                  )}
                </div>

                {/* Status Message */}
                <div className="text-center">
                  <h2 className={`text-3xl font-bold mb-2 ${
                    isOnline
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {isOnline ? 'ClawdBot is Operational' : 'ClawdBot is Down'}
                  </h2>
                  <Badge variant={isOnline ? 'success' : 'error'} className="text-sm px-4 py-1">
                    {isOnline ? 'All Systems Operational' : 'Service Disruption'}
                  </Badge>
                </div>

                {/* Uptime Display */}
                {status && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Clock className="h-5 w-5" />
                    <span className="text-lg">
                      Uptime: <span className="font-semibold text-gray-900 dark:text-white">
                        {formatUptime(status.uptime)}
                      </span>
                    </span>
                  </div>
                )}

                {/* Last Checked */}
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span>Last checked: {lastUpdated ? formatRelativeTime(lastUpdated) : 'Never'}</span>
                  <button
                    onClick={refresh}
                    disabled={isRefreshing}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Refresh now"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </CardContent>
          )}

          {/* Auto-refresh indicator bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
            {isAutoRefreshEnabled && (
              <div className="h-full bg-primary-600 animate-status-progress" />
            )}
          </div>
        </Card>

        {/* System Metrics */}
        {status && !error && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Version</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      v{status.version}
                    </p>
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">Skills Loaded</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {status.skillCount}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Server</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      AWS EC2
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Features Status Grid */}
        {status && !error && (
          <Card>
            <CardHeader>
              <CardTitle>System Components</CardTitle>
              <CardDescription>Status of all ClawdBot subsystems</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <FeatureStatusItem
                  name="Memory"
                  enabled={status.features.memory}
                />
                <FeatureStatusItem
                  name="Skills"
                  enabled={status.features.skills}
                />
                <FeatureStatusItem
                  name="Scheduler"
                  enabled={status.features.scheduler}
                />
                <FeatureStatusItem
                  name="Project Intelligence"
                  enabled={status.features.projectIntelligence}
                />
                <FeatureStatusItem
                  name="Action Executor"
                  enabled={status.features.actionExecutor}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historical Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Last 7 Days</CardTitle>
                <CardDescription>Historical uptime status</CardDescription>
              </div>
              <Badge variant="success" className="text-sm">
                {uptimePercentage}% uptime
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              {HISTORICAL_STATUS.map((day, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                  <div
                    className={`h-8 w-8 rounded-full ${
                      day.status === 'up'
                        ? 'bg-green-500'
                        : day.status === 'partial'
                          ? 'bg-yellow-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    title={`${day.day}: ${day.status === 'up' ? 'Operational' : 'Issues'}`}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{day.day}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span>Operational</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                <span>Partial Outage</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                <span>No Data</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscribe Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <Bell className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <CardTitle>Get Notified of Outages</CardTitle>
                <CardDescription>
                  Subscribe to receive email notifications when ClawdBot experiences issues
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {subscribed ? (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-green-700 dark:text-green-300">
                  Thanks for subscribing! You will be notified of any service disruptions.
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Button type="submit" variant="primary">
                  <Mail className="h-4 w-4 mr-2" />
                  Subscribe
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Auto-refresh Toggle */}
        <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span>Auto-refresh: {isAutoRefreshEnabled ? 'On' : 'Off'}</span>
          <button
            onClick={toggleAutoRefresh}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              isAutoRefreshEnabled
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {isAutoRefreshEnabled ? 'Disable' : 'Enable'}
          </button>
          <span className="text-xs">
            (refreshes every {REFRESH_INTERVAL_MS / 1000}s)
          </span>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 pb-8">
          <p>ClawdBot v2.3 - Running on AWS EC2 (eu-north-1)</p>
          <p className="mt-1">
            Questions? Reach out via Telegram or WhatsApp
          </p>
        </div>
      </div>
    </div>
  );
}

interface FeatureStatusItemProps {
  name: string;
  enabled: boolean;
}

function FeatureStatusItem({ name, enabled }: FeatureStatusItemProps) {
  return (
    <div className={`flex flex-col items-center p-4 rounded-lg border ${
      enabled
        ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }`}>
      {enabled ? (
        <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mb-2" />
      ) : (
        <XCircle className="h-8 w-8 text-red-600 dark:text-red-400 mb-2" />
      )}
      <span className={`text-sm font-medium text-center ${
        enabled
          ? 'text-green-700 dark:text-green-300'
          : 'text-gray-600 dark:text-gray-400'
      }`}>
        {name}
      </span>
      <span className={`text-xs mt-1 ${
        enabled
          ? 'text-green-600 dark:text-green-400'
          : 'text-gray-500 dark:text-gray-500'
      }`}>
        {enabled ? 'Active' : 'Disabled'}
      </span>
    </div>
  );
}
