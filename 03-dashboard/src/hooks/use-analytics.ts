'use client';

import { useState, useMemo } from 'react';

export type TimeRange = '7d' | '30d' | '90d';

export interface DailyMessages {
  date: string;
  day: string;
  count: number;
}

export interface ProviderUsage {
  name: string;
  percentage: number;
  cost: number;
  color: string;
  requests: number;
}

export interface SkillUsage {
  rank: number;
  name: string;
  usageCount: number;
  lastUsed: string;
}

export interface PlatformUsage {
  name: string;
  percentage: number;
  count: number;
  color: string;
}

export interface AnalyticsData {
  totalMessages: number;
  messageTrend: number;
  aiQueries: number;
  aiCost: number;
  topSkills: string[];
  avgResponseTime: number;
  messagesOverTime: DailyMessages[];
  providerUsage: ProviderUsage[];
  skillUsage: SkillUsage[];
  platformUsage: PlatformUsage[];
}

function generateMockData(timeRange: TimeRange): AnalyticsData {
  const multiplier = timeRange === '7d' ? 1 : timeRange === '30d' ? 4 : 12;

  // Generate messages over time (last 7 days for visualization)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const messagesOverTime: DailyMessages[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayIndex = date.getDay();
    // More realistic usage pattern - higher on weekdays
    const baseCount = dayIndex === 0 || dayIndex === 6 ? 25 : 65;
    const variance = Math.floor(Math.random() * 30);
    messagesOverTime.push({
      date: date.toISOString().split('T')[0],
      day: days[(dayIndex + 6) % 7], // Adjust to start Monday
      count: baseCount + variance,
    });
  }

  // Top skills with realistic data
  const skillUsage: SkillUsage[] = [
    { rank: 1, name: 'project-context', usageCount: 187 * multiplier, lastUsed: '2 min ago' },
    { rank: 2, name: 'remote-exec', usageCount: 156 * multiplier, lastUsed: '5 min ago' },
    { rank: 3, name: 'help', usageCount: 134 * multiplier, lastUsed: '12 min ago' },
    { rank: 4, name: 'memory', usageCount: 98 * multiplier, lastUsed: '25 min ago' },
    { rank: 5, name: 'github', usageCount: 87 * multiplier, lastUsed: '1 hour ago' },
    { rank: 6, name: 'coder', usageCount: 76 * multiplier, lastUsed: '1 hour ago' },
    { rank: 7, name: 'morning-brief', usageCount: 45 * multiplier, lastUsed: '8 hours ago' },
    { rank: 8, name: 'deadlines', usageCount: 42 * multiplier, lastUsed: '3 hours ago' },
    { rank: 9, name: 'voice-call', usageCount: 38 * multiplier, lastUsed: '6 hours ago' },
    { rank: 10, name: 'research', usageCount: 35 * multiplier, lastUsed: '2 hours ago' },
  ];

  // AI Provider usage
  const providerUsage: ProviderUsage[] = [
    { name: 'Groq (FREE)', percentage: 45, cost: 0, color: '#f97316', requests: 512 * multiplier },
    { name: 'Claude Sonnet', percentage: 35, cost: 8.45 * multiplier, color: '#8b5cf6', requests: 398 * multiplier },
    { name: 'Claude Opus', percentage: 15, cost: 12.30 * multiplier, color: '#a855f7', requests: 171 * multiplier },
    { name: 'Grok', percentage: 5, cost: 1.80 * multiplier, color: '#3b82f6', requests: 57 * multiplier },
  ];

  // Platform usage
  const platformUsage: PlatformUsage[] = [
    { name: 'Telegram', percentage: 72, count: 820 * multiplier, color: '#0088cc' },
    { name: 'WhatsApp', percentage: 23, count: 262 * multiplier, color: '#25d366' },
    { name: 'Voice', percentage: 5, count: 57 * multiplier, color: '#ef4444' },
  ];

  return {
    totalMessages: 1138 * multiplier,
    messageTrend: 12,
    aiQueries: 1138 * multiplier,
    aiCost: 22.55 * multiplier,
    topSkills: skillUsage.slice(0, 5).map(s => s.name),
    avgResponseTime: 1.2,
    messagesOverTime,
    providerUsage,
    skillUsage,
    platformUsage,
  };
}

export function useAnalytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);

  const data = useMemo(() => generateMockData(timeRange), [timeRange]);

  return {
    data,
    loading,
    error,
    timeRange,
    setTimeRange,
  };
}
