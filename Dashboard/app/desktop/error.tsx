'use client';

/**
 * Desktop Error Boundary
 *
 * The main ClaudeOS interface crashed. Uses same escalating retry
 * as all other boundaries for consistency.
 */

import { useState } from 'react';
import { Check, ChevronDown, Clipboard, RefreshCw } from 'lucide-react';
import { getErrorMessage } from '@/components/errors/error-messages';
import { useAutoRetry } from '@/components/errors/ErrorBoundaries';
import { copyErrorToClipboard } from '@/components/errors/copy-error';

export default function DesktopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const msg = getErrorMessage(error);
  const [copied, setCopied] = useState(false);
  const [showStack, setShowStack] = useState(false);
  const { countdown, gaveUp, retryNow, retryCount, maxRetries } = useAutoRetry(reset);

  const handleCopy = async () => {
    const success = await copyErrorToClipboard(error, 'Desktop');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-xl p-6 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="text-3xl">{msg.icon}</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {msg.headline}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              {!gaveUp ? (
                <>
                  Usually transient. Claude may be editing a component.
                  {retryCount > 0 && <> Attempt {retryCount}/{maxRetries}.</>}
                </>
              ) : (
                <>Persisted through {maxRetries} retries. Copy the error and paste to Claude.</>
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={retryNow}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {!gaveUp && countdown > 0 ? `Reload Desktop (${countdown}s)` : 'Reload Desktop'}
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-[var(--surface-muted)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[var(--color-success)]" /> : <Clipboard className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy for Claude'}
          </button>
        </div>

        {/* Error details */}
        <div className="bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded p-3 space-y-2">
          <div className="font-mono text-xs">
            <div className="text-[var(--color-error)] font-semibold">{error.name || 'Error'}</div>
            <div className="text-[var(--text-secondary)] mt-1 break-words">{error.message}</div>
          </div>
          {error.stack && (
            <div>
              <button
                onClick={() => setShowStack(!showStack)}
                className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showStack ? '' : '-rotate-90'}`} />
                Stack trace
              </button>
              {showStack && (
                <pre className="mt-1 text-[10px] text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap max-h-40">
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Recovery footer */}
        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => window.location.reload()}
            className="hover:text-[var(--text-secondary)] transition-colors"
          >
            Hard refresh
          </button>
          <span>
            Nothing working? Run <code className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] font-mono">./restart.sh</code>
          </span>
        </div>
      </div>
    </div>
  );
}
