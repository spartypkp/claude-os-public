/**
 * Smoke Test: Desktop
 * Verifies the Dashboard desktop loads without errors and core elements render.
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';

(async () => {
  const errors = [];
  const consoleErrors = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Collect console errors and page errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  try {
    // Load the desktop and wait for React to hydrate
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
    // Wait for desktop element to appear (React hydration)
    await page.waitForSelector('[data-testid="desktop"]', { timeout: 15000 }).catch(() => {});

    // Check core elements exist
    const checks = [
      { selector: '[data-testid="desktop"]', name: 'Desktop' },
      { selector: '[data-testid="dock"]', name: 'Dock' },
      { selector: '[data-testid="menubar"]', name: 'Menubar' },
      { selector: '[data-testid="claude-panel"]', name: 'Claude Panel' },
    ];

    for (const check of checks) {
      const el = await page.$(check.selector);
      if (el) {
        console.log(`  PASS: ${check.name} found`);
      } else {
        console.log(`  FAIL: ${check.name} not found (${check.selector})`);
        errors.push(`${check.name} not found`);
      }
    }

    // Verify dock has icons
    const dockIcons = await page.$$('[data-testid^="dock-icon-"]');
    if (dockIcons.length >= 5) {
      console.log(`  PASS: Dock has ${dockIcons.length} icons`);
    } else {
      console.log(`  FAIL: Dock has only ${dockIcons.length} icons (expected >= 5)`);
      errors.push(`Dock has only ${dockIcons.length} icons`);
    }

    // Verify menubar has widgets
    const widgets = await page.$$('[data-testid^="widget-"]');
    if (widgets.length >= 2) {
      console.log(`  PASS: Menubar has ${widgets.length} widgets`);
    } else {
      console.log(`  FAIL: Menubar has only ${widgets.length} widgets (expected >= 2)`);
      errors.push(`Menubar has only ${widgets.length} widgets`);
    }

    // Verify clock is visible
    const clock = await page.$('[data-testid="menubar-clock"]');
    if (clock) {
      console.log(`  PASS: Clock visible`);
    } else {
      console.log(`  FAIL: Clock not found`);
      errors.push('Clock not found');
    }

    // Take screenshot
    await page.screenshot({ path: '/tmp/smoke-desktop.png', fullPage: true });
    console.log('  Screenshot: /tmp/smoke-desktop.png');

  } catch (err) {
    errors.push(`Page load failed: ${err.message}`);
  } finally {
    await browser.close();
  }

  // Report page errors
  if (consoleErrors.length > 0) {
    console.log(`\n  WARNING: ${consoleErrors.length} console error(s):`);
    consoleErrors.slice(0, 5).forEach(e => console.log(`    - ${e.substring(0, 120)}`));
  }

  // Final result
  if (errors.length === 0) {
    console.log('\nRESULT: PASS - Desktop smoke test passed');
    process.exit(0);
  } else {
    console.log(`\nRESULT: FAIL - ${errors.length} error(s):`);
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
})();
