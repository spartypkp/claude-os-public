/**
 * 404 Not Found Page
 *
 * Shown when a route doesn't exist.
 * Server component (not a boundary, just a special page).
 */

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-5xl">📭</div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            404 — Page not found
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            This route doesn't exist or has been removed.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <a
            href="/desktop"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Return to Desktop
          </a>
          <a
            href="/guide"
            className="px-5 py-2.5 bg-[var(--surface-base)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg font-medium transition-colors"
          >
            Open Guide
          </a>
        </div>

        {/* Hint */}
        <div className="text-center">
          <span className="text-xs text-[var(--text-muted)]">
            If something broke, run{' '}
            <code className="px-1 py-0.5 rounded bg-[var(--surface-sunken)] font-mono">
              ./restart.sh
            </code>
          </span>
        </div>
      </div>
    </div>
  );
}
