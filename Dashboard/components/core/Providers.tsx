/**
 * App Providers - Wraps the app with necessary context providers.
 * 
 * Jan 2026 Architecture Overhaul:
 * - QueryClientProvider: React Query for data fetching
 * - EventStreamProvider: SSE connection for real-time updates
 */

'use client';

import { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { EventStreamProvider } from '@/hooks/useEventStream';
import { DarkModeSync } from './DarkModeSync';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <EventStreamProvider>
        <DarkModeSync />
        {children}
      </EventStreamProvider>
    </QueryClientProvider>
  );
}

