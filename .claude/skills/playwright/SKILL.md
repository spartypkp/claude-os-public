---
name: playwright
description: Dashboard UI testing for Claude OS. Run smoke tests to verify components render, take screenshots of app windows, check for React crashes. Use after any Dashboard component change.
---

# Dashboard UI Testing

Test the Claude OS Dashboard with Playwright. Purpose-built for Dashboard changes — NOT a generic web testing tool.

## Common Mistakes (Read This First)

**1. Don't write raw Playwright for Dashboard testing. Use the helpers.**
```javascript
// WRONG — you'll get the testid wrong, miss the /desktop route, forget to wait for dock
const page = await browser.newPage();
await page.goto("http://localhost:3000");
await page.click('[data-testid="dock-icon-Calendar"]'); // wrong case, will timeout

// RIGHT — one line, handles everything
const calWindow = await helpers.openDashboardApp(page, 'calendar');
```

**2. run.js needs FULL file paths, not just names.**
```bash
# WRONG — run.js treats "smoke-widgets" as inline JavaScript code, fails with "smoke is not defined"
node run.js smoke-widgets

# RIGHT — full path to the test file
node run.js tests/smoke-widgets.js
```

**3. Testids are lowercase kebab-case. Always.**
```
dock-icon-calendar     ✓     dock-icon-Calendar     ✗
app-window-email       ✓     app-window-Email       ✗
```

**4. Don't use `networkidle` for waitUntil.** Dashboard has SSE connections that never idle. Use `'load'`.

**5. Page errors are warnings, not failures.** The Dashboard has a pre-existing Performance API error. Don't fail smoke tests on `pageerror` events — log them as warnings.

## Quick Commands

```bash
PW=".claude/skills/playwright"

# Run all smoke tests
cd $PW && node run.js tests/smoke-all.js

# Run individual tests (MUST use full path)
cd $PW && node run.js tests/smoke-desktop.js    # Desktop shell, dock, menubar
cd $PW && node run.js tests/smoke-apps.js        # Open each app via dock
cd $PW && node run.js tests/smoke-widgets.js     # Widget dropdowns, dark mode
cd $PW && node run.js tests/smoke-app-content.js # Calendar/Email/Settings content
```

## Helpers (The API)

Three helpers in `lib/helpers.js`. These are how you interact with the Dashboard — they handle navigation, waiting, and selectors correctly.

```javascript
const helpers = require('./lib/helpers');

// Launch browser with standard config (headless, no-sandbox)
const browser = await helpers.launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Open an app: navigates to /desktop, waits for dock, clicks icon, waits for window
const window = await helpers.openDashboardApp(page, 'calendar');
// Accepts: 'finder', 'calendar', 'contacts', 'email', 'settings'

// Get locator for an already-open app window
const window = helpers.getAppWindow(page, 'calendar');

// Screenshot just the app window element (not full page)
await helpers.screenshotApp(page, 'calendar', '/tmp/calendar.png');
```

**Always use `openDashboardApp` to open apps.** It handles:
- Navigating to `/desktop` first (apps only exist on this route)
- Waiting for the dock to render (React hydration)
- Clicking the correct dock icon (`dock-icon-{appId}`)
- Waiting for the window to appear (`app-window-{appId}`)

## Verifying Dashboard Changes

After modifying a component:

### 1. Run smoke tests
```bash
cd .claude/skills/playwright && node run.js tests/smoke-all.js
```

### 2. Screenshot and inspect the specific app
Write inline code that uses helpers. Pass it to run.js:

```javascript
// Inline code — run.js wraps this in async IIFE with Playwright imports + helpers
const browser = await helpers.launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const calWindow = await helpers.openDashboardApp(page, 'calendar');
await page.waitForTimeout(3000); // let async data load

await helpers.screenshotApp(page, 'calendar', '/tmp/calendar-check.png');
await browser.close();
```

View the screenshot with the Read tool to verify visually.

### 3. Check content rendered
```javascript
await page.waitForSelector('[data-testid="calendar-grid"]', { timeout: 5000 });
await page.waitForSelector('[data-testid="email-list"]', { timeout: 5000 });
```

## Debugging UI Issues

When something looks wrong visually (empty areas, missing elements, broken layouts), use these patterns to diagnose from Playwright:

### Capture console errors
```javascript
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => {
  consoleErrors.push('PAGE ERROR: ' + err.message);
});
```

### Count elements in the DOM
```javascript
const eventCount = await page.locator('.sx__event').count();
console.log('Events in DOM: ' + eventCount);
// If count > 0 but nothing visible → CSS/overflow problem
// If count === 0 → data loading or rendering problem
```

### Inspect element dimensions and computed styles
```javascript
const info = await page.locator('[data-testid="calendar-grid"]').evaluate(el => {
  const style = window.getComputedStyle(el);
  return {
    w: el.offsetWidth,
    h: el.offsetHeight,
    scrollHeight: el.scrollHeight,
    overflow: style.overflow,
    overflowY: style.overflowY,
  };
});
console.log(JSON.stringify(info));
// scrollHeight >> h with overflow:hidden = content is clipped/invisible
```

### Trace DOM hierarchy with dimensions
Use this to find where a layout chain breaks:
```javascript
const chain = await page.locator('[data-testid="your-container"]').evaluate(el => {
  function desc(e, depth) {
    if (depth > 5) return '';
    const s = getComputedStyle(e);
    let r = '  '.repeat(depth) + e.tagName;
    if (e.className) r += '.' + e.className.split(' ').slice(0, 3).join('.');
    r += ` [${e.offsetWidth}x${e.offsetHeight} overflow:${s.overflow}]`;
    r += '\\n';
    if (e.children.length > 0 && depth < 5) r += desc(e.children[0], depth + 1);
    return r;
  }
  return desc(el, 0);
});
console.log(chain);
```

### Check if elements are visible vs just in the DOM
```javascript
const eventInfo = await page.locator('.some-element').evaluateAll(els => {
  return els.map(el => ({
    text: el.textContent?.substring(0, 40),
    w: el.offsetWidth, h: el.offsetHeight,
    rect: el.getBoundingClientRect(),
    visibility: getComputedStyle(el).visibility,
    opacity: getComputedStyle(el).opacity,
  }));
});
```

## data-testid Reference

All Dashboard elements use `data-testid` for stable selectors. **Never use class names or text content as selectors.**

### Shell Elements

| testid | Component | Purpose |
|--------|-----------|---------|
| `desktop` | ClaudeOS.tsx | Main container |
| `dock` | Dock.tsx | Dock container |
| `dock-icon-{id}` | Dock.tsx | Dock icons (finder, calendar, contacts, email, settings) |
| `desktop-icon-{name}` | DesktopIcon.tsx | Desktop file icons (slugified) |
| `app-window-{type}` | DesktopWindow.tsx | Window wrapper |
| `window-close` | DesktopWindow.tsx | Red close button |
| `window-minimize` | DesktopWindow.tsx | Yellow minimize button |
| `window-maximize` | DesktopWindow.tsx | Green maximize button |
| `menubar` | Menubar.tsx | Menubar root |
| `widget-{title}` | Menubar.tsx | Widget dropdown buttons |
| `dark-mode-toggle` | Menubar.tsx | Dark mode toggle |
| `menubar-clock` | Menubar.tsx | Clock span |
| `claude-panel` | ClaudePanel.tsx | Claude panel container |
| `chat-input` | ChatInput.tsx | Chat textarea |
| `send-button` | ChatInput.tsx | Send button |
| `conversation-list` | ConversationList.tsx | Session list |

### App Content

| testid | Component | Purpose |
|--------|-----------|---------|
| `calendar-app` | CalendarWindowContent.tsx | Calendar root |
| `calendar-view` | CalendarView.tsx | Calendar view root |
| `calendar-toolbar` | CalendarView.tsx | Toolbar/header |
| `calendar-grid` | CalendarView.tsx | Schedule-X container |
| `calendar-sidebar` | CalendarSidebar.tsx | Sidebar root |
| `email-app` | EmailWindowContent.tsx | Email root |
| `email-accounts` | EmailWindowContent.tsx | Account filter bar |
| `email-list` | EmailWindowContent.tsx | Message list |
| `settings-app` | SettingsWindowContent.tsx | Settings root |
| `settings-sidebar` | SettingsWindowContent.tsx | Nav sidebar |
| `settings-tab-{id}` | SettingsWindowContent.tsx | Tab buttons |
| `settings-content` | SettingsWindowContent.tsx | Content area |
| `finder-app` | FinderWindowContent.tsx | Finder root |
| `roles-app` | RolesWindow.tsx | Roles root |

### Custom App Pages

| testid | Component |
|--------|-----------|

| `app-job-search` | Job Search page |
| `app-turbine` | Turbine page |

## Writing New Tests

```javascript
const { chromium } = require('playwright');
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

(async () => {
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Log page errors as warnings, not failures
  page.on('pageerror', err => console.warn('Page error:', err.message));

  try {
    await page.goto(`${DASHBOARD_URL}/desktop`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('[data-testid="dock"]', { timeout: 15000 });

    // Your checks using data-testid selectors:
    const el = await page.$('[data-testid="your-element"]');
    if (el) {
      console.log('  PASS: Element found');
    } else {
      errors.push('Element not found');
    }

  } catch (err) {
    errors.push(`Failed: ${err.message}`);
  } finally {
    await browser.close();
  }

  if (errors.length === 0) {
    console.log('\nRESULT: PASS');
    process.exit(0);
  } else {
    console.log(`\nRESULT: FAIL - ${errors.length} error(s):`);
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
})();
```

Key patterns:
- Always `headless: true` (specialists run without a display)
- Use `data-testid` selectors exclusively
- `waitUntil: 'load'` for initial page load (not `networkidle`)
- `waitForSelector` with timeout after dock clicks
- Exit 0 for pass, 1 for fail
- `RESULT: PASS` / `RESULT: FAIL` for machine-readable output

## Adding testids to New Components

1. Add `data-testid="descriptive-name"` to the outermost meaningful element
2. Lowercase kebab-case only, no uppercase
3. For dynamic elements: `` data-testid={`prefix-${id}`} ``
4. Prefer leaf elements (buttons, inputs) over wrapper divs
5. Update the tables above in this file

## How run.js Works

Scripts execute via `run.js` — wraps bare code in async IIFE with Playwright imports and helpers pre-loaded.

```bash
# Run a test file (MUST be a real file path)
cd .claude/skills/playwright && node run.js tests/smoke-desktop.js

# Run inline code (gets wrapped automatically — helpers and chromium available)
cd .claude/skills/playwright && node run.js 'await page.goto("http://localhost:3000")'

# First-time setup
cd .claude/skills/playwright && npm run setup
```

**Important:** `run.js` checks if the argument is a file path first. If the file doesn't exist, it treats the argument as inline JavaScript. This means `node run.js smoke-widgets` will try to execute `smoke-widgets` as JS code and fail with "smoke is not defined". Always use full paths.

## What Smoke Tests Check

| Test | What It Verifies |
|------|-----------------|
| `smoke-desktop.js` | Page loads, dock/menubar/claude-panel present, 5+ dock icons, widgets, clock |
| `smoke-apps.js` | Each core app opens via dock click, custom app pages render |
| `smoke-widgets.js` | Widget dropdowns interactive, clock text, dark mode toggle |
| `smoke-app-content.js` | Calendar/Email/Settings content testids render inside windows |

All tests save screenshots to `/tmp/smoke-*.png`.
