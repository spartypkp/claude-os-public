/**
 * App Providers - Wraps the app with necessary context providers.
 *
 * Jan 2026 Architecture Overhaul:
 * - QueryClientProvider: React Query for data fetching
 * - EventStreamProvider: SSE connection for real-time updates (system events)
 * - FileEventProvider: SSE connection for real-time file changes (1 shared connection)
 * - Global unhandled rejection catcher for async errors
 */

'use client';

import { ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { EventStreamProvider } from '@/hooks/useEventStream';
import { FileEventProvider } from '@/hooks/useFileEvents';
import { DarkModeSync } from './DarkModeSync';
import { toast } from 'sonner';
import { copyErrorToClipboard } from '@/components/errors/copy-error';

/** Opens external links (http/https, different origin) in a new tab */
function ExternalLinkHandler({ children }: { children: ReactNode }) {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Only intercept absolute http/https URLs
      if (!href.startsWith('http://') && !href.startsWith('https://')) return;

      // Don't intercept same-origin links (internal Next.js navigation)
      try {
        const url = new URL(href);
        if (url.origin === window.location.origin) return;
      } catch {
        return;
      }

      event.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return <>{children}</>;
}

/** Catches unhandled promise rejections that error boundaries miss */
function GlobalErrorCatcher({ children }: { children: ReactNode }) {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      const message = error?.message || String(error) || 'Unknown error';

      // Don't toast for aborted fetches (normal during navigation/cleanup)
      if (message.includes('AbortError') || message.includes('aborted')) return;

      console.error('[Unhandled Rejection]', error);
      toast.error(message, {
        duration: 8000,
        action: {
          label: 'Copy',
          onClick: () => {
            const err = error instanceof Error ? error : new Error(message);
            copyErrorToClipboard(err);
          },
        },
      });
    };

    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return <>{children}</>;
}

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <EventStreamProvider>
        <FileEventProvider>
          <DarkModeSync />
          <GlobalErrorCatcher>
            <ExternalLinkHandler>
              {children}
            </ExternalLinkHandler>
          </GlobalErrorCatcher>
        </FileEventProvider>
      </EventStreamProvider>
    </QueryClientProvider>
  );
}

