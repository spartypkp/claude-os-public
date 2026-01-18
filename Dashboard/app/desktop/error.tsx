'use client';

/**
 * Desktop Error Boundary
 *
 * Catches errors in the Desktop view - the main ClaudeOS interface.
 * Shows error overlay on the desktop background.
 */

export default function DesktopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen bg-[hsl(240,6%,4%)] flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-[hsl(240,5%,9%)] border border-[hsl(240,3%,15%)] rounded-xl p-6 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="text-3xl">⚠️</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[hsl(240,5%,96%)]">
              Desktop Error
            </h2>
            <p className="text-sm text-[hsl(240,5%,65%)] mt-1">
              The desktop environment encountered an error.
            </p>
          </div>
        </div>

        {/* Error Details (Dev Mode Only) */}
        {isDev && (
          <div className="bg-[hsl(240,5%,4%)] border border-[hsl(240,3%,12%)] rounded p-3 space-y-2">
            <div className="font-mono text-xs">
              <div className="text-red-400 font-semibold">
                {error.name || 'Error'}
              </div>
              <div className="text-[hsl(240,5%,75%)] mt-1 break-words">
                {error.message}
              </div>
            </div>
            {error.stack && (
              <details>
                <summary className="cursor-pointer text-xs text-[hsl(240,5%,65%)] hover:text-[hsl(240,5%,85%)]">
                  Stack trace
                </summary>
                <pre className="mt-2 text-xs text-[hsl(240,5%,65%)] overflow-x-auto whitespace-pre-wrap max-h-40">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Reload Desktop
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[hsl(240,5%,12%)] hover:bg-[hsl(240,5%,15%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] text-sm rounded-lg font-medium transition-colors"
          >
            Hard Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
