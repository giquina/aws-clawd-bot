'use client';

import { useState, useEffect, useCallback } from 'react';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
}

const INFO_MESSAGES = [
  'Telegram message received from user 123456',
  'Processing skill: project-context',
  'AI response generated in 1.2s',
  'GitHub webhook received: push to main',
  'Morning brief scheduled for 08:00',
  'Chat registry loaded: 5 registered chats',
  'Voice transcription completed via Groq Whisper',
  'Memory loaded: 156 messages, 42 facts',
  'Project context set to: aws-clawd-bot',
  'Skill registry initialized with 35 skills',
  'Auto-refresh triggered for dashboard',
  'WhatsApp message queued for delivery',
  'Health check passed: all services operational',
  'AI mode set to balanced routing',
  'Telegram webhook processed in 45ms',
  'Cache hit for project: giquina-web',
  'Scheduled job started: nightly-autonomous',
  'GitHub API rate limit: 4,892 remaining',
  'Session created for user: muhammad',
  'Command parsed: project status',
  'Groq API response received in 0.8s',
  'Message sent via Telegram Bot API',
  'Audit log entry created',
  'Alert escalation timer started',
];

const WARN_MESSAGES = [
  'Rate limit approaching: 100 requests remaining',
  'GitHub webhook signature verification slow',
  'Large message truncated to 4096 characters',
  'AI response retry attempt 1 of 3',
  'Cache miss for project: unknown-repo',
  'Telegram API rate limited, backing off',
  'Memory usage high: 85% utilized',
  'Slow query detected: 2.5s response time',
  'Deprecated skill command used: old-syntax',
  'Voice call attempt failed, retrying',
  'WhatsApp message delivery delayed',
  'GitHub API secondary rate limit hit',
];

const ERROR_MESSAGES = [
  'Failed to connect to GitHub API: timeout',
  'Telegram message send failed: 429 Too Many Requests',
  'AI provider error: Anthropic API unavailable',
  'Voice call failed: Twilio connection error',
  'Database connection lost, attempting reconnect',
  'GitHub webhook processing failed: invalid payload',
  'Authentication failed for API request',
  'Memory save failed: disk full',
  'Skill execution error: project-context crashed',
  'Alert escalation failed: no phone number configured',
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomLog(): LogEntry {
  // Weight towards INFO (70%), WARN (20%), ERROR (10%)
  const rand = Math.random();
  let level: LogLevel;
  let messages: string[];

  if (rand < 0.7) {
    level = 'INFO';
    messages = INFO_MESSAGES;
  } else if (rand < 0.9) {
    level = 'WARN';
    messages = WARN_MESSAGES;
  } else {
    level = 'ERROR';
    messages = ERROR_MESSAGES;
  }

  return {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date(),
    level,
    message: getRandomElement(messages),
  };
}

function generateInitialLogs(count: number = 50): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const log = generateRandomLog();
    // Spread logs over the last 5 minutes
    log.timestamp = new Date(now - (count - i) * 6000);
    log.id = `log-${log.timestamp.getTime()}-${Math.random().toString(36).substring(2, 9)}`;
    logs.push(log);
  }

  return logs;
}

interface UseMockLogsOptions {
  maxLogs?: number;
  autoGenerate?: boolean;
  generateIntervalMs?: number;
}

export function useMockLogs(options: UseMockLogsOptions = {}) {
  const { maxLogs = 500, autoGenerate = true, generateIntervalMs = 2000 } = options;

  const [logs, setLogs] = useState<LogEntry[]>(() => generateInitialLogs());
  const [isGenerating, setIsGenerating] = useState(autoGenerate);

  const addLog = useCallback((log: LogEntry) => {
    setLogs((prev) => {
      const newLogs = [...prev, log];
      // Keep only the last maxLogs entries
      if (newLogs.length > maxLogs) {
        return newLogs.slice(newLogs.length - maxLogs);
      }
      return newLogs;
    });
  }, [maxLogs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const toggleGeneration = useCallback(() => {
    setIsGenerating((prev) => !prev);
  }, []);

  // Auto-generate logs at intervals
  useEffect(() => {
    if (!isGenerating) return;

    const interval = setInterval(() => {
      // Generate 1-3 logs at random intervals
      const count = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          addLog(generateRandomLog());
        }, i * 200);
      }
    }, generateIntervalMs);

    return () => clearInterval(interval);
  }, [isGenerating, generateIntervalMs, addLog]);

  return {
    logs,
    addLog,
    clearLogs,
    isGenerating,
    toggleGeneration,
  };
}
