/**
 * 404 Not Found Page
 *
 * Shown when a route doesn't exist.
 * Server component (not a boundary, just a special page).
 */

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[hsl(240,6%,4%)] flex items-center justify-center p-4">
      <div className="max-w-xl w-full text-center space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="text-7xl">🔍</div>
          <h1 className="text-3xl font-semibold text-[hsl(240,5%,96%)]">
            404
          </h1>
          <p className="text-lg text-[hsl(240,5%,65%)]">
            Page not found
          </p>
        </div>

        {/* Description */}
        <p className="text-[hsl(240,5%,75%)]">
          The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/desktop"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Go to Desktop
          </a>
          <a
            href="/activity"
            className="px-6 py-2.5 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] rounded-lg font-medium transition-colors"
          >
            View Activity
          </a>
        </div>

        {/* Common Routes */}
        <div className="pt-8 space-y-3">
          <div className="text-sm text-[hsl(240,5%,55%)]">
            Common destinations:
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            <a
              href="/dev/tools"
              className="px-3 py-1.5 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,85%)] text-sm rounded transition-colors"
            >
              Dev Tools
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
