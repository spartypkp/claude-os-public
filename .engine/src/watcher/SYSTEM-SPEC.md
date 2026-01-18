# Watcher - Specification

**Location:** `.engine/src/watcher/`
**Purpose:** Monitors filesystem for changes and keeps derived views synchronized.

---

## How It Works

The watcher uses `watchfiles` (Rust-based async file watcher) to monitor directories for changes. When files change, feature modules react and update derived state.

**Entry point:** `engine.py` - main watcher loop
**Config:** `config.py` - watched directories, settings

---

## Feature Modules

Three active modules in `modules/`:

| Module | Watches | Updates |
|--------|---------|---------|
| `DomainsModule` | `**/LIFE-SPEC.md` | SYSTEM-INDEX.md domain hierarchy |
| `ContactsModule` | `Desktop/contacts/`, `system.db` | Contact markdown files |
| `TodayContextModule` | `Desktop/TODAY.md` | Context injection state |

**Module interface:** Each module implements:
- `should_process(path, change_type)` → bool
- `process(path, change_type)` → None

---

## Watched Paths

Defined in `loops/watcher.py` (not the entire repo!):

```python
watch_paths = [
    "Desktop",              # LIFE-SPEC.md, APP-SPEC.md, contacts/
    ".claude/guides",       # Guide markdown files
    ".engine/data",         # system.db changes
    ".engine/src",          # SYSTEM-SPEC.md files
    ".engine/config",       # SYSTEM-SPEC.md in config/
]
```

**NOT watched:** `Dashboard/`, `Workspace/`, `node_modules/`, `.next/`

---

## Event Flow

```
File Change Detected
        │
        ▼
┌───────────────────┐
│   WatcherEngine   │
│   (engine.py)     │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Route to Module  │
│  (routing.py)     │
└───────────────────┘
        │
        ├──▶ DomainsModule.process()
        ├──▶ ContactsModule.process()
        └──▶ TodayContextModule.process()
```

---

## Key Files

| File | Purpose |
|------|---------|
| `engine.py` | Main watcher loop, event handling |
| `config.py` | WatcherPaths, settings |
| `routing.py` | Routes events to modules |
| `module.py` | Base class for feature modules |
| `cache.py` | Caching utilities |
| `events.py` | Event types and helpers |
| `constants.py` | Watched dirs, file patterns |

---

## Removed Modules

Several modules were removed in late 2025 as functionality moved to hooks or became obsolete:

- SessionsModule
- PlanningModule
- NavigationModule
- NotificationsModule
- AsyncHelpersModule

---

## Related

- **Loops:** `loops/watcher.py` - Runs watcher in background loop
- **SSE Bus:** `utils/sse_bus.py` - Publishes change events to Dashboard
- **Services:** `services/domains.py` - Domain hierarchy business logic

