'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getApiKey, setApiKey } from '@/lib/api';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  FolderGit2,
  Sparkles,
  MessageSquare,
  BarChart3,
  Settings,
  LogOut,
  Bot,
  LogIn
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderGit2 },
  { name: 'Skills', href: '/skills', icon: Sparkles },
  { name: 'Memory', href: '/memory', icon: MessageSquare },
  { name: 'AI Stats', href: '/ai-stats', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const apiKey = getApiKey();
    setIsAuthenticated(!!apiKey);
  }, [pathname]); // Re-check auth on route change

  const handleLogout = () => {
    setApiKey('');
    setIsAuthenticated(false);
    router.push('/');
  };

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Bot className="h-6 w-6 text-primary-600 mr-2" />
                <span className="text-xl font-bold text-primary-600">ClawdBot</span>
              </div>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Minimal nav for landing and login pages
  const isPublicPage = pathname === '/' || pathname === '/login';

  if (isPublicPage) {
    return (
      <nav className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm border-b border-gray-200 dark:border-gray-700 fixed top-0 left-0 right-0 z-50 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link href="/" className="flex-shrink-0 flex items-center">
                <Bot className="h-6 w-6 text-primary-600 mr-2" />
                <span className="text-xl font-bold text-primary-600">ClawdBot</span>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAuthenticated ? (
                <Link href="/dashboard">
                  <Button variant="primary" size="md">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Dashboard
                  </Button>
                </Link>
              ) : pathname !== '/login' ? (
                <Link href="/login">
                  <Button variant="primary" size="md">
                    <LogIn className="h-4 w-4 mr-2" />
                    Login
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Full nav for authenticated pages
  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/dashboard" className="flex-shrink-0 flex items-center">
              <Bot className="h-6 w-6 text-primary-600 mr-2" />
              <span className="text-xl font-bold text-primary-600">ClawdBot</span>
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Dashboard</span>
            </Link>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center px-3 py-2 text-sm font-medium rounded-md',
                      'transition-colors duration-200',
                      isActive
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
      {/* Mobile nav */}
      <div className="sm:hidden border-t border-gray-200 dark:border-gray-700">
        <div className="flex overflow-x-auto px-2 py-2 space-x-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap',
                  isActive
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <Icon className="w-4 h-4 mr-1" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
