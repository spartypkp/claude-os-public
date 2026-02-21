// Dashboard Playwright Helpers
// Purpose-built for Claude OS Dashboard testing.

const { chromium } = require('playwright');

/**
 * Parse extra HTTP headers from environment variables.
 * Supports PW_HEADER_NAME/PW_HEADER_VALUE or PW_EXTRA_HEADERS JSON.
 */
function getExtraHeadersFromEnv() {
  const headerName = process.env.PW_HEADER_NAME;
  const headerValue = process.env.PW_HEADER_VALUE;
  if (headerName && headerValue) return { [headerName]: headerValue };

  const headersJson = process.env.PW_EXTRA_HEADERS;
  if (headersJson) {
    try {
      const parsed = JSON.parse(headersJson);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
    } catch (e) { /* ignore */ }
  }
  return null;
}

/**
 * Launch browser with standard configuration.
 */
async function launchBrowser(options = {}) {
  return await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...options,
  });
}

/**
 * Safe click with retry logic.
 */
async function safeClick(page, selector, options = {}) {
  const maxRetries = options.retries || 3;
  const retryDelay = options.retryDelay || 1000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout: options.timeout || 5000 });
      await page.click(selector, { force: options.force || false, timeout: options.timeout || 5000 });
      return true;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      console.log(`Retry ${i + 1}/${maxRetries} for clicking ${selector}`);
      await page.waitForTimeout(retryDelay);
    }
  }
}

/**
 * Detect running dev servers on common ports.
 */
async function detectDevServers(customPorts = []) {
  const http = require('http');
  const commonPorts = [3000, 3001, 3002, 5173, 8080, 8000, 4200, 5000, 5001, 9000];
  const allPorts = [...new Set([...commonPorts, ...customPorts])];
  const detectedServers = [];

  for (const port of allPorts) {
    try {
      await new Promise((resolve) => {
        const req = http.request({ hostname: 'localhost', port, path: '/', method: 'HEAD', timeout: 500 }, (res) => {
          if (res.statusCode < 500) {
            detectedServers.push(`http://localhost:${port}`);
          }
          resolve();
        });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.end();
      });
    } catch (e) { /* skip */ }
  }
  return detectedServers;
}

// ── Dashboard-Specific Helpers ──────────────────────────────────────────

/**
 * Open a Dashboard app by clicking its dock icon.
 * Navigates to /desktop, waits for the dock, clicks the icon, waits for the window.
 * @param {Object} page - Playwright page
 * @param {string} appId - 'calendar', 'email', 'settings', 'finder', 'contacts'
 * @param {Object} options - { baseUrl, timeout }
 * @returns {Object} Locator for the app window
 */
async function openDashboardApp(page, appId, options = {}) {
  const baseUrl = options.baseUrl || process.env.DASHBOARD_URL || 'http://localhost:3000';
  const timeout = options.timeout || 15000;

  await page.goto(`${baseUrl}/desktop`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="dock"]', { timeout });

  const dockIcon = page.locator(`[data-testid="dock-icon-${appId}"]`);
  await dockIcon.click();

  const windowSelector = `[data-testid="app-window-${appId}"]`;
  await page.waitForSelector(windowSelector, { timeout: 5000 });

  return page.locator(windowSelector);
}

/**
 * Get locator for an already-open app window.
 */
function getAppWindow(page, appId) {
  return page.locator(`[data-testid="app-window-${appId}"]`);
}

/**
 * Screenshot just an app window element.
 * @param {string} filename - Output path (defaults to /tmp/app-{appId}.png)
 */
async function screenshotApp(page, appId, filename) {
  const outputPath = filename || `/tmp/app-${appId}.png`;
  const window = page.locator(`[data-testid="app-window-${appId}"]`);
  await window.screenshot({ path: outputPath });
  console.log(`Screenshot saved: ${outputPath}`);
  return outputPath;
}

module.exports = {
  getExtraHeadersFromEnv,
  launchBrowser,
  safeClick,
  detectDevServers,
  openDashboardApp,
  getAppWindow,
  screenshotApp,
};
