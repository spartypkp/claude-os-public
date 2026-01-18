'use client';

import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '@/hooks/useTheme';

export function ToastProvider() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only render on client to prevent hydration mismatch
  if (!mounted) return null;

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
          backdropFilter: 'blur(12px)',
          fontSize: '14px',
        },
        className: 'toast',
      }}
      theme={resolvedTheme}
    />
  );
}
