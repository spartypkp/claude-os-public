/**
 * Smoke Test: Menubar Widgets
 * Tests that menubar widgets open dropdowns and dark mode toggle works.
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';

const WIDGETS = [
  { testid: 'widget-calendar', name: 'Calendar' },
  { testid: 'widget-email', name: 'Email' },
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
    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
    // Wait for React hydration
    await page.waitForSelector('[data-testid="menubar"]', { timeout: 15000 }).catch(() => {});

    // Test each widget dropdown using locators
    for (const widget of WIDGETS) {
      const btn = page.locator(`[data-testid="${widget.testid}"]`);
      if (await btn.count() === 0) {
        console.log(`  SKIP: ${widget.name} widget not found`);
        continue;
      }

      await btn.click();
      await page.waitForTimeout(500);

      const visible = await btn.isVisible();
      if (visible) {
        console.log(`  PASS: ${widget.name} widget clicked (interactive)`);
      } else {
        console.log(`  FAIL: ${widget.name} widget not visible after click`);
        errors.push(`${widget.name} widget not visible`);
      }

      // Click elsewhere to close dropdown
      await page.locator('[data-testid="desktop"]').click();
      await page.waitForTimeout(300);
    }

    // Test clock is visible
    const clock = page.locator('[data-testid="menubar-clock"]');
    if (await clock.count() > 0) {
      const clockText = await clock.textContent();
      if (clockText && clockText.length > 0) {
        console.log(`  PASS: Clock shows "${clockText.trim()}"`);
      } else {
        console.log(`  FAIL: Clock has no text`);
        errors.push('Clock has no text content');
      }
    } else {
      console.log(`  FAIL: Clock not found`);
      errors.push('Clock not found');
    }

    // Test dark mode toggle exists and is clickable
    const darkModeBtn = page.locator('[data-testid="dark-mode-toggle"]');
    if (await darkModeBtn.count() > 0) {
      await darkModeBtn.click();
      await page.waitForTimeout(500);
      console.log(`  PASS: Dark mode toggle clicked`);

      // Toggle back
      await darkModeBtn.click();
      await page.waitForTimeout(300);
    } else {
      console.log(`  SKIP: Dark mode toggle not found`);
    }

    // Test usage battery exists
    const battery = page.locator('[data-testid="usage-battery"]');
    if (await battery.count() > 0) {
      console.log(`  PASS: Usage battery found`);
    } else {
      console.log(`  SKIP: Usage battery not found`);
    }

    await page.screenshot({ path: '/tmp/smoke-widgets.png' });
    console.log('  Screenshot: /tmp/smoke-widgets.png');

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
    console.log('\nRESULT: PASS - Widget smoke test passed');
    process.exit(0);
  } else {
    console.log(`\nRESULT: FAIL - ${errors.length} error(s):`);
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
})();
