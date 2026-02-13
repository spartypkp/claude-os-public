# Dashboard Testing Conventions

## data-testid Naming

All key Dashboard elements have `data-testid` attributes for Playwright selectors. These are stable across style/class changes.

### Naming Patterns

| Pattern | Example | Where |
|---------|---------|-------|
| `desktop` | `desktop` | ClaudeOS.tsx main container |
| `dock` | `dock` | Dock.tsx container |
| `dock-icon-{id}` | `dock-icon-finder` | Dock.tsx icon buttons |
| `desktop-icon-{name}` | `desktop-icon-identity` | DesktopIcon.tsx (slugified name) |
| `app-window-{type}` | `app-window-finder` | DesktopWindow.tsx window wrapper |
| `window-close` | `window-close` | DesktopWindow.tsx red button |
| `window-minimize` | `window-minimize` | DesktopWindow.tsx yellow button |
| `window-maximize` | `window-maximize` | DesktopWindow.tsx green button |
| `menubar` | `menubar` | Menubar.tsx root |
| `widget-{title}` | `widget-calendar` | Menubar.tsx WidgetDropdown button |
| `dark-mode-toggle` | `dark-mode-toggle` | Menubar.tsx toggle button |
| `menubar-clock` | `menubar-clock` | Menubar.tsx clock span |
| `about-button` | `about-button` | Menubar.tsx about button |
| `usage-battery` | `usage-battery` | Menubar.tsx usage indicator |
| `claude-panel` | `claude-panel` | ClaudePanel.tsx main container |
| `chat-input` | `chat-input` | ChatInput.tsx textarea |
| `send-button` | `send-button` | ChatInput.tsx send button |
| `stop-button` | `stop-button` | ChatInput.tsx stop button |
| `conversation-list` | `conversation-list` | ConversationList.tsx container |
| `spawn-specialist` | `spawn-specialist` | ConversationList.tsx button |
| `minimize-panel` | `minimize-panel` | ConversationList.tsx button |
| `app-{name}` | `app-job-search` | Custom app page wrappers |

### Adding testids to New Components

1. Add `data-testid="descriptive-name"` to the outermost meaningful element
2. Follow the existing naming patterns above
3. Use kebab-case, no uppercase
4. For dynamic elements, use template: `data-testid={\`prefix-${id}\`}`
5. Prefer leaf elements (buttons, inputs) over wrapper divs
6. Add the new testid to this table

### Rules

- **Never use class names or text content as selectors** — they change with styling
- **Prefer data-testid** — stable, semantic, independent of implementation
- **One testid per interactive element** — not every div needs one
- **Dynamic IDs use consistent prefixes** — `dock-icon-*`, `desktop-icon-*`, `app-window-*`

## Running Smoke Tests

### All tests at once

```bash
cd $PROJECT_ROOT/.claude/skills/playwright && node run.js $PROJECT_ROOT/.claude/test/smoke-all.js
```

### Individual tests

```bash
cd $PROJECT_ROOT/.claude/skills/playwright && node run.js $PROJECT_ROOT/.claude/test/smoke-desktop.js
cd $PROJECT_ROOT/.claude/skills/playwright && node run.js $PROJECT_ROOT/.claude/test/smoke-apps.js
cd $PROJECT_ROOT/.claude/skills/playwright && node run.js $PROJECT_ROOT/.claude/test/smoke-widgets.js
```

### What smoke tests check

| Test | What It Verifies |
|------|-----------------|
| `smoke-desktop.js` | Page loads, desktop/dock/menubar/claude-panel present, dock has 5+ icons, widgets present, clock visible, no runtime crashes |
| `smoke-apps.js` | Each core app opens as a window via dock click, custom app pages render, no runtime crashes |
| `smoke-widgets.js` | Widget dropdowns are interactive, clock shows time, dark mode toggle works, no runtime crashes |

### Screenshots

All smoke tests save screenshots to `/tmp/smoke-*.png` for visual verification.

## Writing New Smoke Tests

Use this template:

```javascript
const { chromium } = require('playwright');
const TARGET_URL = 'http://localhost:3000';

(async () => {
  const errors = [];
  const pageErrors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Catch runtime crashes
  page.on('pageerror', err => { pageErrors.push(err.message); });

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Your checks here using data-testid selectors:
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

  // Crash detection
  if (pageErrors.length > 0) {
    errors.push(`${pageErrors.length} runtime crash(es)`);
  }

  // Exit with appropriate code
  if (errors.length === 0) {
    console.log('\nRESULT: PASS');
    process.exit(0);
  } else {
    console.log(`\nRESULT: FAIL - ${errors.length} error(s)`);
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
})();
```

Key patterns:
- Always listen for `pageerror` — this catches React render crashes
- Use `waitUntil: 'networkidle'` for initial load
- Use `waitForTimeout` after clicks (animations, state changes)
- Exit 0 for pass, 1 for fail
- Print `RESULT: PASS` or `RESULT: FAIL` for machine-readable output
