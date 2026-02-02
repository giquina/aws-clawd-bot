'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setApiKey, getApiKey, api } from '@/lib/api';
import { ArrowLeft, Key, Send, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if already authenticated
    const existingKey = getApiKey();
    if (existingKey) {
      // Verify the key is still valid
      verifyAndRedirect(existingKey);
    }
  }, []);

  const verifyAndRedirect = async (key: string) => {
    try {
      setApiKey(key);
      await api.getStatus();
      router.push('/dashboard');
    } catch {
      // Key is invalid, clear it
      setApiKey('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKeyInput.trim()) {
      setError('Please enter your API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Set the API key temporarily to test it
      setApiKey(apiKeyInput.trim());

      // Try to fetch status to verify the key
      await api.getStatus();

      // Success - key is valid
      setSuccess(true);

      // Redirect to dashboard after brief success message
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (err) {
      // Key is invalid
      setApiKey(''); // Clear the invalid key
      setError('Invalid API key. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex flex-col pt-16">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Back Link */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors mb-8"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Home</span>
          </Link>

          <Card className="shadow-xl">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center mb-4">
                <Key className="h-8 w-8 text-primary-600 dark:text-primary-400" />
              </div>
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription className="text-base">
                Enter your ClawdBot API key to continue
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="Enter your API key"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    disabled={loading || success}
                    className="text-center text-lg py-3"
                    autoComplete="off"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
                    <CheckCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm">Authentication successful! Redirecting...</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full py-3 text-lg"
                  disabled={loading || success}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : success ? (
                    <>
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Success
                    </>
                  ) : (
                    <>
                      Login
                    </>
                  )}
                </Button>
              </form>

              {/* Help Section */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <Send className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                      Need your API key?
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Send <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono text-xs">api key</code> to your ClawdBot on Telegram to receive it.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your API key is stored locally and never shared.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>ClawdBot Dashboard v2.3</p>
      </footer>
    </div>
  );
}
