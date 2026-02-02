'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getApiKey } from '@/lib/api';
import {
  MessageSquare,
  Sparkles,
  GitBranch,
  Brain,
  Phone,
  Send,
  Bot,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle
} from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: 'Multi-Platform',
    description: 'Control via Telegram, WhatsApp, or Voice calls. Responds 24/7 from AWS EC2.',
    highlights: ['Telegram (Primary)', 'WhatsApp (Backup)', 'Voice Calls (Critical)']
  },
  {
    icon: Sparkles,
    title: '37+ Skills',
    description: 'From project management to code deployment, voice notes to image analysis.',
    highlights: ['Remote Execution', 'Task Management', 'Voice Transcription']
  },
  {
    icon: GitBranch,
    title: 'GitHub Integration',
    description: 'Real-time webhooks, automated PR creation, CI/CD monitoring and alerts.',
    highlights: ['Webhook Alerts', 'Auto PR Creation', 'CI Monitoring']
  },
  {
    icon: Brain,
    title: 'Smart AI Routing',
    description: 'Uses Groq (FREE), Claude Opus/Sonnet, Grok, and Perplexity based on query type.',
    highlights: ['Cost Optimized', 'Multi-Model', 'Context Aware']
  }
];

const capabilities = [
  { icon: Bot, text: 'Natural language commands' },
  { icon: Zap, text: 'Automated morning briefs' },
  { icon: Shield, text: 'Alert escalation system' },
  { icon: Phone, text: 'Voice call notifications' },
  { icon: Send, text: 'Multi-channel messaging' },
  { icon: GitBranch, text: 'Project intelligence' }
];

export default function LandingPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const apiKey = getApiKey();
    if (apiKey) {
      setIsAuthenticated(true);
    }
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-100 dark:bg-primary-900/30 rounded-full blur-3xl opacity-50"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-200 dark:bg-primary-800/30 rounded-full blur-3xl opacity-30"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16">
          <div className="text-center">
            {/* Logo and Badge */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <div className="h-12 w-12 bg-primary-600 rounded-xl flex items-center justify-center">
                  <Bot className="h-7 w-7 text-white" />
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">ClawdBot</span>
              </div>
              <Badge variant="default" className="ml-2">v2.3</Badge>
            </div>

            {/* Hero Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              AI Agent Control Center
            </h1>

            {/* Tagline */}
            <p className="mt-6 text-xl sm:text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Monitor and manage your 24/7 AI assistant
            </p>

            {/* Description */}
            <p className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
              ClawdBot is a full development assistant running on AWS EC2 - controllable via
              Telegram, WhatsApp, or voice calls. Read repos, parse TODOs, deploy code, run tests,
              and receive proactive morning reports.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              {isAuthenticated ? (
                <Link href="/dashboard">
                  <Button size="lg" className="text-lg px-8 py-4">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button size="lg" className="text-lg px-8 py-4">
                    Get Started
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              )}
              <a
                href="https://github.com/giquina/aws-clawd-bot"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="lg" className="text-lg px-8 py-4">
                  <GitBranch className="mr-2 h-5 w-5" />
                  View on GitHub
                </Button>
              </a>
            </div>

            {/* Quick Stats */}
            <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Live on AWS EC2</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary-500" />
                <span>37+ Skills</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary-500" />
                <span>4 AI Providers</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary-500" />
                <span>3 Platforms</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Powerful Features</h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Everything you need to manage your AI assistant from anywhere
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl">
                      <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                      <CardDescription className="text-base mb-4">
                        {feature.description}
                      </CardDescription>
                      <div className="flex flex-wrap gap-2">
                        {feature.highlights.map((highlight) => (
                          <Badge key={highlight} variant="outline" className="text-xs">
                            {highlight}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Capabilities Section */}
      <div className="bg-gray-900 dark:bg-gray-950 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white">Built for Developers</h2>
            <p className="mt-4 text-lg text-gray-400">
              A Claude Code Agent that works around the clock
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {capabilities.map((capability) => {
              const Icon = capability.icon;
              return (
                <div
                  key={capability.text}
                  className="flex flex-col items-center text-center p-4"
                >
                  <div className="p-3 bg-gray-800 rounded-xl mb-3">
                    <Icon className="h-6 w-6 text-primary-400" />
                  </div>
                  <p className="text-sm text-gray-300">{capability.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">How It Works</h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Get started in minutes with your API key
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Get Your API Key</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Send &quot;api key&quot; to your ClawdBot on Telegram to receive your personal access key.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Enter Key in Dashboard</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Paste your API key in the login page to authenticate with your ClawdBot instance.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Start Managing</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Monitor status, view projects, check skills, and manage your AI assistant from anywhere.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <Card className="bg-gradient-to-r from-primary-600 to-primary-700 border-0">
          <div className="text-center py-12 px-6">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-primary-100 text-lg mb-8 max-w-2xl mx-auto">
              Access your ClawdBot dashboard and take control of your AI assistant today.
            </p>
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-white text-primary-600 hover:bg-gray-100 text-lg px-8"
                >
                  Open Dashboard
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-white text-primary-600 hover:bg-gray-100 text-lg px-8"
                >
                  Login Now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary-600" />
              <span className="font-semibold text-gray-900 dark:text-gray-100">ClawdBot</span>
              <span className="text-gray-500 dark:text-gray-400">v2.3</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Powered by Claude AI. Running 24/7 on AWS EC2.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
