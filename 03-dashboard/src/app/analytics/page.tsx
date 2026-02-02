'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAnalytics, TimeRange } from '@/hooks/use-analytics';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  MessageSquare,
  Zap,
  Sparkles,
  Clock,
  TrendingUp,
  Send,
  Phone,
  DollarSign,
} from 'lucide-react';

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export default function AnalyticsPage() {
  const { data, timeRange, setTimeRange } = useAnalytics();
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const maxMessageCount = Math.max(...data.messagesOverTime.map(d => d.count));

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-gray-100">
            <BarChart3 className="h-8 w-8 text-primary-600" />
            Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Usage statistics and insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          {timeRangeOptions.map((option) => (
            <Button
              key={option.value}
              onClick={() => setTimeRange(option.value)}
              variant={timeRange === option.value ? 'primary' : 'outline'}
              size="sm"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Messages */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Messages</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {data.totalMessages.toLocaleString()}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                    +{data.messageTrend}% this week
                  </span>
                </div>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Queries */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">AI Queries</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {data.aiQueries.toLocaleString()}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <DollarSign className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ~${data.aiCost.toFixed(2)} estimated
                  </span>
                </div>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Zap className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills Used */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Top Skills</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {data.topSkills.slice(0, 3).map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  +{data.topSkills.length - 3} more
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Sparkles className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Response Time */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg Response Time</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {data.avgResponseTime}s
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  P95: 2.8s
                </p>
              </div>
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages Over Time Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Messages Over Time</CardTitle>
            <CardDescription>Daily message volume for the past 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 h-48">
              {data.messagesOverTime.map((day, index) => {
                const heightPercentage = (day.count / maxMessageCount) * 100;
                const isHovered = hoveredBar === index;
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-2 relative"
                    onMouseEnter={() => setHoveredBar(index)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        {day.count} messages
                      </div>
                    )}
                    {/* Bar */}
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={cn(
                          'w-full rounded-t-md transition-all duration-200',
                          isHovered
                            ? 'bg-primary-500'
                            : 'bg-primary-400 dark:bg-primary-600'
                        )}
                        style={{ height: `${heightPercentage}%`, minHeight: '4px' }}
                      />
                    </div>
                    {/* Label */}
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {day.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* AI Provider Usage */}
        <Card>
          <CardHeader>
            <CardTitle>AI Provider Usage</CardTitle>
            <CardDescription>Request distribution by AI provider</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.providerUsage.map((provider) => (
              <div key={provider.name} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: provider.color }}
                    />
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {provider.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                    <span>{provider.percentage}%</span>
                    <span className="text-xs">
                      {provider.cost === 0 ? (
                        <Badge variant="success" className="text-xs py-0">FREE</Badge>
                      ) : (
                        `$${provider.cost.toFixed(2)}`
                      )}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${provider.percentage}%`,
                      backgroundColor: provider.color,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {provider.requests.toLocaleString()} requests
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Skills Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Skills</CardTitle>
            <CardDescription>Most frequently used skills</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Skill Name
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Usage Count
                    </th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Last Used
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.skillUsage.map((skill) => (
                    <tr
                      key={skill.name}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="py-3 px-2">
                        <span className={cn(
                          'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                          skill.rank <= 3
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        )}>
                          {skill.rank}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {skill.name}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-gray-600 dark:text-gray-400">
                          {skill.usageCount.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="text-gray-500 dark:text-gray-500 text-sm">
                          {skill.lastUsed}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Platform Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Distribution</CardTitle>
            <CardDescription>Messages by communication channel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.platformUsage.map((platform) => {
              const Icon = platform.name === 'Telegram'
                ? Send
                : platform.name === 'WhatsApp'
                  ? MessageSquare
                  : Phone;

              return (
                <div key={platform.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1.5 rounded"
                        style={{ backgroundColor: `${platform.color}20` }}
                      >
                        <Icon
                          className="h-4 w-4"
                          style={{ color: platform.color }}
                        />
                      </div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {platform.name}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {platform.percentage}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${platform.percentage}%`,
                        backgroundColor: platform.color,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {platform.count.toLocaleString()} messages
                  </p>
                </div>
              );
            })}

            {/* Visual pie-like representation */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 text-center">
                Distribution Overview
              </p>
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  {/* Background circle */}
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    {data.platformUsage.reduce((acc, platform, index) => {
                      const prevOffset = acc.offset;
                      const circumference = 2 * Math.PI * 40;
                      const dashLength = (platform.percentage / 100) * circumference;
                      const dashGap = circumference - dashLength;

                      acc.elements.push(
                        <circle
                          key={platform.name}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke={platform.color}
                          strokeWidth="20"
                          strokeDasharray={`${dashLength} ${dashGap}`}
                          strokeDashoffset={-prevOffset}
                          className="transition-all duration-500"
                        />
                      );

                      acc.offset += dashLength;
                      return acc;
                    }, { elements: [] as React.ReactNode[], offset: 0 }).elements}
                  </svg>
                  {/* Center text */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {data.platformUsage.reduce((sum, p) => sum + p.count, 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">total</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer note */}
      <div className="text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Analytics data is generated from mock data. Connect to a real analytics API for live statistics.
        </p>
      </div>
    </div>
  );
}
