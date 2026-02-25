'use client';

/**
 * Root App Error Boundary
 *
 * Full-page error when a route crashes. Uses the same useAutoRetry
 * as component-level boundaries for consistent escalating retries.
 */

import { useState } from 'react';
import { Check, ChevronDown, Clipboard, RefreshCw } from 'lucide-react';
import { getErrorMessage } from '@/components/errors/error-messages';
import { useAutoRetry } from '@/components/errors/ErrorBoundaries';
import { copyErrorToClipboard } from '@/components/errors/copy-error';

export default function Error({
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
    const success = await copyErrorToClipboard(error, 'Route');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-5xl">{msg.icon}</div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {msg.headline}
          </h1>
        </div>

        {/* Actions — right after the headline */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={retryNow}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {!gaveUp && countdown > 0 ? `Try Again (${countdown}s)` : 'Try Again'}
          </button>
          <button
            onClick={handleCopy}
            className="px-5 py-2.5 bg-[var(--surface-base)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-[var(--color-success)]" /> : <Clipboard className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy for Claude'}
          </button>
        </div>

        {/* Guidance — muted, below actions */}
        <div className="text-xs text-[var(--text-muted)] text-center leading-relaxed">
          {!gaveUp ? (
            <>
              Usually transient. Claude may be mid-edit.
              {retryCount > 0 && <> Attempt {retryCount}/{maxRetries}.</>}
            </>
          ) : (
            <>Persisted through {maxRetries} retries. Copy the error and paste to Claude.</>
          )}
        </div>

        {/* Error details */}
        <div className="bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg p-3">
          <div className="font-mono text-xs">
            <div className="text-[var(--color-error)] font-semibold">{error.name || 'Error'}</div>
            <div className="text-[var(--text-secondary)] mt-1 break-words">{error.message}</div>
            {error.digest && (
              <div className="text-[var(--text-muted)] text-[10px] mt-1">Digest: {error.digest}</div>
            )}
          </div>
          {error.stack && (
            <div className="mt-2">
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

        {/* Escape hatch + recovery */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <a href="/desktop" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
            Return to Desktop
          </a>
          <span className="text-[10px] text-[var(--text-muted)]">
            Nothing working? Run <code className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] font-mono">./restart.sh</code>
          </span>
        </div>
      </div>
    </div>
  );
}
