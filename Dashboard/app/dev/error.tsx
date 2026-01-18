'use client';

/**
 * Dev Tools Error Boundary
 *
 * Catches errors in development/testing routes.
 * Always shows full error details since these are dev-only routes.
 */

export default function DevError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[hsl(240,6%,4%)] p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="text-4xl">🔧</div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-[hsl(240,5%,96%)]">
              Dev Tools Error
            </h1>
            <p className="text-[hsl(240,5%,65%)] mt-1">
              Something broke in the development tools.
            </p>
          </div>
        </div>

        {/* Error Details (Always shown for dev routes) */}
        <div className="bg-[hsl(240,5%,9%)] border border-[hsl(240,3%,15%)] rounded-lg p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-[hsl(240,5%,65%)]">Error Name</div>
            <div className="font-mono text-red-400">
              {error.name || 'Error'}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-[hsl(240,5%,65%)]">Message</div>
            <div className="font-mono text-sm text-[hsl(240,5%,85%)] whitespace-pre-wrap break-words">
              {error.message}
            </div>
          </div>

          {error.digest && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[hsl(240,5%,65%)]">Digest</div>
              <div className="font-mono text-xs text-[hsl(240,5%,65%)]">
                {error.digest}
              </div>
            </div>
          )}

          {error.stack && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[hsl(240,5%,65%)]">Stack Trace</div>
              <pre className="font-mono text-xs text-[hsl(240,5%,65%)] overflow-x-auto whitespace-pre-wrap bg-[hsl(240,5%,4%)] border border-[hsl(240,3%,12%)] rounded p-4 max-h-96 overflow-y-auto">
                {error.stack}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
          <a
            href="/dev"
            className="px-6 py-2.5 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] rounded-lg font-medium transition-colors"
          >
            Back to Dev Home
          </a>
          <a
            href="/desktop"
            className="px-6 py-2.5 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] rounded-lg font-medium transition-colors"
          >
            Return to Desktop
          </a>
        </div>

        {/* Dev Note */}
        <div className="text-sm text-[hsl(240,5%,55%)] bg-[hsl(240,5%,7%)] border border-[hsl(240,3%,12%)] rounded p-4">
          <strong>Dev Note:</strong> This error boundary always shows full details since /dev routes are for development only.
        </div>
      </div>
    </div>
  );
}
