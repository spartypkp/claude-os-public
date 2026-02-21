/**
 * Smoke Test: App Content
 * Verifies that core app windows render their internal content after opening via dock clicks.
 * Tests content-level testids (calendar-grid, email-list, settings-content) — not just window frames.
 */
const { chromium } = require('playwright');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

const APP_TESTS = [
  {
    name: 'Calendar',
    dockId: 'calendar',
    windowId: 'calendar',
    contentChecks: [
      { testid: 'calendar-app', label: 'Calendar app root' },
      { testid: 'calendar-view', label: 'Calendar view' },
      { testid: 'calendar-toolbar', label: 'Calendar toolbar' },
    ],
  },
  {
    name: 'Email',
    dockId: 'email',
    windowId: 'email',
    contentChecks: [
      { testid: 'email-app', label: 'Email app root' },
      { testid: 'email-list', label: 'Email message list' },
    ],
  },
  {
    name: 'Settings',
    dockId: 'settings',
    windowId: 'settings',
    contentChecks: [
      { testid: 'settings-app', label: 'Settings app root' },
      { testid: 'settings-sidebar', label: 'Settings sidebar' },
      { testid: 'settings-content', label: 'Settings content area' },
    ],
  },
];

(async () => {
  const errors = [];
  const pageErrors = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  try {
    for (const app of APP_TESTS) {
      // Fresh page load for each app
      await page.goto(`${DASHBOARD_URL}/desktop`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForSelector('[data-testid="dock"]', { timeout: 15000 });

      // Click dock icon
      const dockIcon = page.locator(`[data-testid="dock-icon-${app.dockId}"]`);
      if (await dockIcon.count() === 0) {
        console.log(`  SKIP: ${app.name} dock icon not found`);
        continue;
      }
      await dockIcon.click();

      // Wait for window frame
      try {
        await page.waitForSelector(`[data-testid="app-window-${app.windowId}"]`, { timeout: 5000 });
      } catch {
        console.log(`  FAIL: ${app.name} window did not appear`);
        errors.push(`${app.name} window did not appear after dock click`);
        continue;
      }

      // Check each content testid inside the window
      for (const check of app.contentChecks) {
        try {
          await page.waitForSelector(`[data-testid="${check.testid}"]`, { timeout: 5000 });
          console.log(`  PASS: ${app.name} — ${check.label}`);
        } catch {
          console.log(`  FAIL: ${app.name} — ${check.label} not found`);
          errors.push(`${app.name}: ${check.label} (testid="${check.testid}") not found`);
        }
      }

      // Screenshot the app window
      try {
        const window = page.locator(`[data-testid="app-window-${app.windowId}"]`);
        await window.screenshot({ path: `/tmp/smoke-app-${app.dockId}.png` });
        console.log(`  Screenshot: /tmp/smoke-app-${app.dockId}.png`);
      } catch {
        // Non-fatal — screenshot failure shouldn't fail the test
      }
    }
  } catch (err) {
    errors.push(`Test execution failed: ${err.message}`);
  } finally {
    await browser.close();
  }

  if (pageErrors.length > 0) {
    console.log(`\n  CRASH DETECTED: ${pageErrors.length} uncaught error(s):`);
    pageErrors.forEach(e => console.log(`    - ${e.substring(0, 120)}`));
    errors.push(`${pageErrors.length} runtime crash(es) detected`);
  }

  if (errors.length === 0) {
    console.log('\nRESULT: PASS - App content smoke test passed');
    process.exit(0);
  } else {
    console.log(`\nRESULT: FAIL - ${errors.length} error(s):`);
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
})();
