'use client';

/**
 * Activity Error Boundary
 *
 * Catches errors in the activity/sessions view.
 * Provides recovery specific to session management.
 */

export default function ActivityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen bg-[hsl(240,6%,4%)] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl">📊</div>
          <h1 className="text-xl font-semibold text-[hsl(240,5%,96%)]">
            Activity View Error
          </h1>
          <p className="text-[hsl(240,5%,65%)]">
            Unable to load the activity dashboard.
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
            Reload Activity
          </button>
          <a
            href="/desktop"
            className="px-6 py-2.5 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] rounded-lg font-medium transition-colors text-center"
          >
            Return to Desktop
          </a>
        </div>

        {/* Help Text */}
        <div className="text-center text-sm text-[hsl(240,5%,55%)]">
          This might be a backend connection issue. Check if the API is running at <code className="px-1.5 py-0.5 bg-[hsl(240,5%,9%)] rounded">localhost:5001</code>
        </div>
      </div>
    </div>
  );
}
