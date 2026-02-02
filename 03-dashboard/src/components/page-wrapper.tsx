'use client';

import { usePathname } from 'next/navigation';

interface PageWrapperProps {
  children: React.ReactNode;
}

const publicPages = ['/', '/login'];

export function PageWrapper({ children }: PageWrapperProps) {
  const pathname = usePathname();
  const isPublicPage = publicPages.includes(pathname);

  // Public pages handle their own layout (landing, login)
  if (isPublicPage) {
    return <>{children}</>;
  }

  // Authenticated pages get the standard container
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </main>
  );
}
