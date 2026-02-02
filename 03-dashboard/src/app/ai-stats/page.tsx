'use client';

import { useEffect, useState } from 'react';
import { api, type StatusResponse } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  RefreshCw,
  Loader2,
  AlertCircle,
  Zap,
  DollarSign,
  TrendingDown,
  Brain,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface AIStats {
  groq: ProviderStats;
  claude: ProviderStats;
  grok: ProviderStats;
  total: {
    requests: number;
    tokens: number;
    cost: number;
    savings: number;
  };
}

interface ProviderStats {
  requests: number;
  tokens: number;
  cost: number;
  models?: Record<string, number>;
}

export default function AIStatsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      setError(null);
      const data = await api.getStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchStatus();
  }

  // Mock AI stats since the API might not have detailed stats yet
  // In production, this would come from the status response
  const mockStats: AIStats = {
    groq: {
      requests: 847,
      tokens: 125000,
      cost: 0,
      models: {
        'llama-3.3-70b-versatile': 720,
        'whisper-large-v3': 127,
      },
    },
    claude: {
      requests: 234,
      tokens: 89000,
      cost: 12.45,
      models: {
        'claude-opus-4-5': 45,
        'claude-sonnet-4': 189,
      },
    },
    grok: {
      requests: 56,
      tokens: 18000,
      cost: 1.80,
      models: {
        'grok-3-fast': 56,
      },
    },
    total: {
      requests: 1137,
      tokens: 232000,
      cost: 14.25,
      savings: 42.35, // Estimated savings from using Groq
    },
  };

  const stats = mockStats;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-gray-600 dark:text-gray-400">Loading AI statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <CardTitle>Error Loading Stats</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchStatus} variant="primary">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-gray-100">
            <BarChart3 className="h-8 w-8 text-primary-600" />
            AI Statistics
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Multi-provider usage and cost breakdown
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="md"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Requests</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.total.requests.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Tokens</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {(stats.total.tokens / 1000).toFixed(0)}K
                </p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ${stats.total.cost.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <DollarSign className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400">Groq Savings</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  ${stats.total.savings.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-green-200 dark:bg-green-800/50 rounded-lg">
                <TrendingDown className="h-6 w-6 text-green-700 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Groq */}
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-orange-500" />
                <CardTitle>Groq</CardTitle>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">FREE</Badge>
            </div>
            <CardDescription>
              LLaMA 3.3 70B + Whisper (voice)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Requests</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.groq.requests}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tokens</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{(stats.groq.tokens / 1000).toFixed(0)}K</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Model Breakdown</p>
              {stats.groq.models && Object.entries(stats.groq.models).map(([model, count]) => (
                <div key={model} className="flex items-center justify-between text-sm py-1">
                  <span className="text-gray-600 dark:text-gray-400 truncate mr-2">{model}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{count}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Cost</span>
                <span className="text-lg font-bold text-green-600 dark:text-green-400">$0.00</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Claude */}
        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <CardTitle>Claude</CardTitle>
              </div>
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">Premium</Badge>
            </div>
            <CardDescription>
              Opus (Brain) + Sonnet (Coder)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Requests</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.claude.requests}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tokens</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{(stats.claude.tokens / 1000).toFixed(0)}K</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Model Breakdown</p>
              {stats.claude.models && Object.entries(stats.claude.models).map(([model, count]) => (
                <div key={model} className="flex items-center justify-between text-sm py-1">
                  <span className="text-gray-600 dark:text-gray-400 truncate mr-2">{model}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{count}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Cost</span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">${stats.claude.cost.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grok */}
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                <CardTitle>Grok</CardTitle>
              </div>
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Social</Badge>
            </div>
            <CardDescription>
              xAI for Twitter/X and trends
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Requests</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.grok.requests}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tokens</p>
                <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{(stats.grok.tokens / 1000).toFixed(0)}K</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Model Breakdown</p>
              {stats.grok.models && Object.entries(stats.grok.models).map(([model, count]) => (
                <div key={model} className="flex items-center justify-between text-sm py-1">
                  <span className="text-gray-600 dark:text-gray-400 truncate mr-2">{model}</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{count}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Cost</span>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">${stats.grok.cost.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Routing Info */}
      <Card>
        <CardHeader>
          <CardTitle>Smart AI Routing</CardTitle>
          <CardDescription>
            How ClawdBot chooses the right AI for each query
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Groq (FREE)</span>
              </div>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                <li>- Simple greetings</li>
                <li>- Short queries</li>
                <li>- Voice transcription</li>
                <li>- General chat</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Claude</span>
              </div>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                <li>- <strong>Opus:</strong> Planning, strategy</li>
                <li>- <strong>Sonnet:</strong> Coding, debugging</li>
                <li>- Complex analysis</li>
                <li>- Document processing</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Grok</span>
              </div>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                <li>- Twitter/X searches</li>
                <li>- Real-time trends</li>
                <li>- Social media queries</li>
                <li>- Current events</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
