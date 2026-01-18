'use client';

import { useState } from 'react';

/**
 * Error Boundary Test Page
 *
 * Allows testing error boundaries by triggering different types of errors.
 * Only available in /dev routes.
 */

export default function ErrorTestPage() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error('Test error: Error boundary is working correctly!');
  }

  return (
    <div className="min-h-screen bg-[hsl(240,6%,4%)] p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(240,5%,96%)]">
            Error Boundary Test
          </h1>
          <p className="text-[hsl(240,5%,65%)] mt-2">
            Use these buttons to test different error scenarios.
          </p>
        </div>

        <div className="bg-[hsl(240,5%,9%)] border border-[hsl(240,3%,15%)] rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium text-[hsl(240,5%,96%)] mb-4">
              Test Scenarios
            </h2>

            <div className="space-y-3">
              {/* Client Component Error */}
              <button
                onClick={() => setShouldThrow(true)}
                className="w-full px-4 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 text-red-400 rounded-lg font-medium transition-colors text-left"
              >
                <div className="font-semibold">Throw Client Error</div>
                <div className="text-sm opacity-75 mt-1">
                  Triggers error boundary in this /dev route
                </div>
              </button>

              {/* Async Error */}
              <button
                onClick={() => {
                  setTimeout(() => {
                    throw new Error('Async error test');
                  }, 100);
                }}
                className="w-full px-4 py-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/30 text-orange-400 rounded-lg font-medium transition-colors text-left"
              >
                <div className="font-semibold">Throw Async Error</div>
                <div className="text-sm opacity-75 mt-1">
                  Throws error after timeout (may not be caught by error boundary)
                </div>
              </button>

              {/* Promise Rejection */}
              <button
                onClick={() => {
                  Promise.reject(new Error('Promise rejection test'));
                }}
                className="w-full px-4 py-3 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/30 text-yellow-400 rounded-lg font-medium transition-colors text-left"
              >
                <div className="font-semibold">Promise Rejection</div>
                <div className="text-sm opacity-75 mt-1">
                  Unhandled promise rejection (check console)
                </div>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-[hsl(240,3%,15%)]">
            <h3 className="text-sm font-medium text-[hsl(240,5%,85%)] mb-2">
              Expected Behavior
            </h3>
            <ul className="text-sm text-[hsl(240,5%,65%)] space-y-1">
              <li>• Client errors should show the /dev error boundary</li>
              <li>• Error boundary shows full stack traces in dev mode</li>
              <li>• "Try Again" button should reset the error boundary</li>
              <li>• Navigation links should work to escape the error state</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-3">
          <a
            href="/dev"
            className="px-4 py-2 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] rounded-lg font-medium transition-colors"
          >
            Back to Dev
          </a>
          <a
            href="/desktop"
            className="px-4 py-2 bg-[hsl(240,5%,9%)] hover:bg-[hsl(240,5%,12%)] border border-[hsl(240,3%,15%)] text-[hsl(240,5%,96%)] rounded-lg font-medium transition-colors"
          >
            Desktop
          </a>
        </div>
      </div>
    </div>
  );
}
