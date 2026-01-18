'use client';

/**
 * Root App Error Boundary
 *
 * Catches errors in the main app (below the root layout).
 * Preserves the shell/navigation while showing error UI.
 */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-semibold text-[hsl(240,5%,96%)]">
            Something went wrong
          </h1>
          <p className="text-[hsl(240,5%,65%)]">
            The application encountered an error while loading this page.
          </p>
        </div>

        {/* Error Details (Dev Mode Only) */}
        {isDev && (
          <div className="bg-[hsl(240,5%,9%)] border border-[hsl(240,3%,15%)] rounded-lg p-4 space-y-2">
            <div className="font-mono text-sm">
              <div className="text-red-400 font-semibold mb-2">
                {error.name || 'Error'}
              </div>
              <div className="text-[hsl(240,5%,75%)] whitespace-pre-wrap break-words">
                {error.message}
              </div>
              {error.digest && (
                <div className="text-[hsl(240,5%,55%)] text-xs mt-2">
                  Digest: {error.digest}
                </div>
              )}
            </div>
            {error.stack && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-[hsl(240,5%,65%)] hover:text-[hsl(240,5%,85%)]">
                  Stack trace
                </summary>
                <pre className="mt-2 text-xs text-[hsl(240,5%,65%)] overflow-x-auto whitespace-pre-wrap">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
          <a
            href="/desktop"
            className="px-6 py-2.5 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] rounded-lg font-medium transition-colors text-center"
          >
            Return to Desktop
          </a>
        </div>
      </div>
    </div>
  );
}
