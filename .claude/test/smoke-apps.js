/**
 * Smoke Test: Core Apps
 * Verifies core app windows open via dock clicks and custom app routes render.
 */
const { chromium } = require('playwright');

// Core apps that open as windows
const CORE_APPS = [
  { dockId: 'finder', windowId: 'finder', name: 'Finder' },
  { dockId: 'calendar', windowId: 'calendar', name: 'Calendar' },
  { dockId: 'contacts', windowId: 'contacts', name: 'Contacts' },
  { dockId: 'email', windowId: 'email', name: 'Mail' },
  { dockId: 'settings', windowId: 'settings', name: 'Settings' },
];

// Custom apps that render at dedicated routes
const CUSTOM_APP_ROUTES = [
  { route: '/ember', pageId: 'app-ember', name: 'Ember' },
  { route: '/job-search', pageId: 'app-job-search', name: 'Job Search' },
  { route: '/turbine', pageId: 'app-turbine', name: 'Turbine' },
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
    // Test each core app one at a time with a fresh page load
    for (const app of CORE_APPS) {
      await page.goto('http://localhost:3000/desktop', { waitUntil: 'load', timeout: 30000 });
      await page.waitForSelector('[data-testid="dock"]', { timeout: 15000 });

      const dockIcon = page.locator(`[data-testid="dock-icon-${app.dockId}"]`);
      if (await dockIcon.count() === 0) {
        console.log(`  SKIP: ${app.name} dock icon not found`);
        continue;
      }

      await dockIcon.click();

      try {
        await page.waitForSelector(`[data-testid="app-window-${app.windowId}"]`, { timeout: 5000 });
        console.log(`  PASS: ${app.name} window opened`);
      } catch {
        console.log(`  FAIL: ${app.name} window did not appear`);
        errors.push(`${app.name} window did not appear after dock click`);
      }
    }

    // Test custom apps (navigate directly to routes)
    for (const app of CUSTOM_APP_ROUTES) {
      await page.goto(`http://localhost:3000${app.route}`, { waitUntil: 'load', timeout: 15000 });

      try {
        await page.waitForSelector(`[data-testid="${app.pageId}"]`, { timeout: 10000 });
        console.log(`  PASS: ${app.name} page rendered`);
      } catch {
        console.log(`  FAIL: ${app.name} page did not render at ${app.route}`);
        errors.push(`${app.name} page did not render at ${app.route}`);
      }
    }

    await page.screenshot({ path: '/tmp/smoke-apps.png' });
    console.log('  Screenshot: /tmp/smoke-apps.png');

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
    console.log('\nRESULT: PASS - App smoke test passed');
    process.exit(0);
  } else {
    console.log(`\nRESULT: FAIL - ${errors.length} error(s):`);
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
})();
