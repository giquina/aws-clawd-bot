'use client';

import { useEffect, useState } from 'react';
import { getApiKey, setApiKey, api, type StatusResponse } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import {
  Settings,
  Key,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
} from 'lucide-react';

export default function SettingsPage() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const savedKey = getApiKey();
    if (savedKey) {
      setApiKeyInput(savedKey);
    }
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      setLoading(true);
      const data = await api.getStatus();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveApiKey() {
    setApiKey(apiKeyInput);
    setSaved(true);
    setTestResult(null);
    toast.success('API key saved successfully');
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      await api.getStatus();
      setTestResult('success');
      toast.success('Connection successful!');
      fetchStatus();
    } catch (err) {
      setTestResult('error');
      toast.error('Connection failed. Check your API key.');
    } finally {
      setTesting(false);
    }
  }

  function handleClearApiKey() {
    setApiKeyInput('');
    setApiKey('');
    setTestResult(null);
    toast.info('API key cleared');
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-gray-100">
          <Settings className="h-8 w-8 text-primary-600" />
          Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Configure your dashboard connection
        </p>
      </div>

      {/* API Key Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <CardTitle>API Key</CardTitle>
          </div>
          <CardDescription>
            Enter your ClawdBot API key to connect to the server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showApiKey ? 'text' : 'password'}
                placeholder="Enter your API key..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <Button onClick={handleSaveApiKey} variant="primary">
              <Save className="h-4 w-4 mr-2" />
              {saved ? 'Saved!' : 'Save'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleTestConnection}
              variant="outline"
              disabled={!apiKeyInput || testing}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              onClick={() => setShowClearConfirm(true)}
              variant="ghost"
              disabled={!apiKeyInput}
            >
              Clear
            </Button>

            {testResult === 'success' && (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                <CheckCircle className="h-4 w-4" />
                Connected successfully
              </div>
            )}
            {testResult === 'error' && (
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-sm">
                <XCircle className="h-4 w-4" />
                Connection failed
              </div>
            )}
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm text-gray-600 dark:text-gray-400">
            <p>
              Your API key is stored locally in your browser and is never sent to any third-party servers.
              It is only used to authenticate requests to your ClawdBot server.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Server Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle>Server Status</CardTitle>
          </div>
          <CardDescription>
            Current ClawdBot server information
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading server status...
            </div>
          ) : status ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                  <Badge variant={status.status === 'online' ? 'success' : 'error'}>
                    {status.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Version</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{status.version}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Skills</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{status.skillCount} loaded</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Server</p>
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100">16.171.150.151:3000</p>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Features</p>
                <div className="flex flex-wrap gap-2">
                  <FeatureBadge label="Memory" enabled={status.features.memory} />
                  <FeatureBadge label="Skills" enabled={status.features.skills} />
                  <FeatureBadge label="Scheduler" enabled={status.features.scheduler} />
                  <FeatureBadge label="Project Intelligence" enabled={status.features.projectIntelligence} />
                  <FeatureBadge label="Action Executor" enabled={status.features.actionExecutor} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertCircle className="h-4 w-4" />
              Unable to fetch server status. Check your API key.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentation Links */}
      <Card>
        <CardHeader>
          <CardTitle>Documentation</CardTitle>
          <CardDescription>
            Learn more about ClawdBot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="https://github.com/giquina/aws-clawd-bot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <ExternalLink className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">GitHub Repository</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Source code and issues</p>
              </div>
            </a>

            <a
              href="https://github.com/giquina/aws-clawd-bot/blob/main/CLAUDE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <ExternalLink className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">CLAUDE.md</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Full documentation</p>
              </div>
            </a>

            <a
              href="https://github.com/giquina/aws-clawd-bot/blob/main/02-whatsapp-bot/mcp-server/README.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <ExternalLink className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">MCP Server Setup</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Claude Desktop integration</p>
              </div>
            </a>

            <a
              href="https://github.com/giquina/aws-clawd-bot/blob/main/TODO.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <ExternalLink className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">TODO.md</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Roadmap and tasks</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About ClawdBot Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
          <p>
            <strong className="text-gray-900 dark:text-gray-100">ClawdBot v2.3</strong> is a WhatsApp-controlled Claude Code Agent running 24/7 on AWS EC2.
          </p>
          <p>
            This dashboard provides a web interface to monitor bot status, view projects, browse skills,
            and manage your ClawdBot instance.
          </p>
          <p className="pt-2 text-gray-500 dark:text-gray-500">
            Built with Next.js 14, Tailwind CSS, and deployed on Vercel.
          </p>
        </CardContent>
      </Card>

      {/* Clear API Key Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearApiKey}
        title="Clear API Key"
        message="Are you sure you want to clear your API key? You will need to enter it again to connect to the server."
        confirmText="Clear"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

function FeatureBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm">
      {enabled ? (
        <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
      )}
      <span className={enabled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}>{label}</span>
    </div>
  );
}
