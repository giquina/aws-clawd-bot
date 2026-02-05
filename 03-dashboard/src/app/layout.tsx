import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/nav';
import { PageWrapper } from '@/components/page-wrapper';
import { ToastProvider } from '@/components/ui/toast';
import { CoworkerPanel } from '@/components/coworker-panel';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ClawdBot Dashboard',
  description: 'Web dashboard for ClawdBot - Your AI Assistant Control Center',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Script to prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('clawdbot-theme') || 'system';
                  var isDark = theme === 'dark' ||
                    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <ToastProvider>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            <Nav />
            <PageWrapper>
              {children}
            </PageWrapper>
            <CoworkerPanel />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
