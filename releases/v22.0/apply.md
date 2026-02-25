# Applying v22.0

Step-by-step instructions for updating an existing Claude OS instance to v22.0.

---

## Before You Start

**Run the database migration first.** The contacts feature requires a new table — the backend will fail to start without it.

```bash
sqlite3 .engine/data/life.db < .engine/config/migrations/018_contact_activity.sql
```

---

## 1. Pull and install

```bash
git pull
cd Dashboard && npm install && cd ..
```

`npm install` is required — `@dnd-kit/core` was removed and `textarea-caret` was added. Skipping it causes import errors.

If backend dependencies changed:
```bash
source venv/bin/activate && pip install -r requirements.txt
```

---

## 2. `.engine/` changes

Pure infrastructure — safe to overwrite. These files changed:

**Core:**
- `.engine/src/core/tmux.py` — 300ms injection delay, per-pane locks, async Telegram injection
- `.engine/src/core/scheduler.py` — cron scheduler improvements
- `.engine/src/core/event_log.py` — event log updates

**Adapters:**
- `.engine/src/adapters/life_mcp/server.py` — private tool registrations removed (expected diff)
- `.engine/src/adapters/life_mcp/tools/day.py`, `system.py`, `timeline.py`
- `.engine/src/adapters/telegram/service.py`, `mcp.py`, `messaging.py`
- `.engine/src/adapters/cli/handoff.py`, `reset_day.py`

**Modules:**
- `.engine/src/modules/analytics/mcp.py`, `api.py`, `usage_tracker.py` — subagents operation added
- `.engine/src/modules/contacts/activity.py` (new), `api.py`, `mcp.py`, `signals.py` — activity feed
- `.engine/src/modules/email/mcp.py`, `pipeline.py`, `api.py`, `brief_draft.py` — classifier overhaul
- `.engine/src/modules/email/classifier-prompt.md` (new) — LLM prompt for classifier
- `.engine/src/modules/email/providers/apple.py`, `gmail.py`
- `.engine/src/modules/finder/api.py`, `service.py` — absolute paths
- `.engine/src/modules/handoff/summarizer.py`, `templates.py`, `service.py`, `transcript_parser.py`
- `.engine/src/modules/projects/api.py`
- `.engine/src/modules/sessions/api.py`, `service.py`, `prompts.py`, `subagent.py`, `transcript.py`
- `.engine/src/modules/system/api.py`
- `.engine/src/workers/context_monitor.py`, `imessage_watcher.py`, `today_sync.py`, `watcher.py`
- `.engine/src/app.py` — private module imports removed (expected diff if you have no custom apps)

**Config:**
- `.engine/config/schema.sql` — updated schema (contact_activity table added, private tables absent)
- `.engine/config/accounts.yaml` — minimal template structure
- `.engine/config/migrations/018_contact_activity.sql` — already ran in step 0
- All earlier migrations (001–017) — already applied if you're on v21.0

**Note on `app.py`:** If you've built custom apps and registered them in `app.py`, your version will have extra imports. Don't overwrite blindly — merge the new version's changes into yours.

---

## 3. `Dashboard/` changes

Safe to overwrite unless you've built custom components. `npm install` was already run in step 1.

**New files (just copy in):**
- `Dashboard/app/guide/` — entire directory (new Guide app)
- `Dashboard/components/ClaudePanel/FileMentionMenu.tsx`
- `Dashboard/components/ClaudePanel/hooks/useFileMention.ts`
- `Dashboard/components/desktop/ContextMenu/` — new directory replacing `ContextMenu.tsx`
- `Dashboard/components/desktop/DragGhost.tsx`
- `Dashboard/components/desktop/editors/EditorContext.tsx`
- `Dashboard/components/desktop/apps/contacts/ActivityFeed.tsx`
- `Dashboard/components/desktop/apps/contacts/ContactEventRow.tsx`
- `Dashboard/components/desktop/apps/contacts/TodayPeopleStrip.tsx`
- `Dashboard/store/desktopSettingsStore.ts`
- `Dashboard/lib/pathUtils.ts`
- `Dashboard/types/textarea-caret.d.ts`
- `Dashboard/hooks/useSubagentTranscript.ts`

**Delete these (removed upstream):**
- `Dashboard/components/desktop/ContextMenu.tsx` — replaced by `ContextMenu/` directory
- `Dashboard/components/desktop/apps/contacts/CadenceView.tsx` — cadence system removed

**Modified files (overwrite):**
- All `Dashboard/components/ClaudePanel/` files
- All `Dashboard/components/desktop/editors/` files
- `Dashboard/components/desktop/DesktopWindow.tsx`, `PathBar.tsx`, `ClaudeOS.tsx`, `DesktopIcon.tsx`, `TrashIcon.tsx`, `GetInfoPanel.tsx`, `MoveToModal.tsx`, `QuickLook.tsx`
- `Dashboard/components/desktop/apps/contacts/ContactsWindowContent.tsx`
- `Dashboard/components/desktop/apps/projects/ProjectsWindowContent.tsx`, `ProjectCard.tsx`
- `Dashboard/components/desktop/apps/analytics/ObservatoryWindowContent.tsx`
- `Dashboard/components/desktop/apps/settings/tabs/AppearanceTab.tsx`
- `Dashboard/components/errors/ErrorBoundaries.tsx`
- `Dashboard/components/transcript/TranscriptViewer.tsx`, `TranscriptContext.tsx`
- `Dashboard/components/transcript/tools/` — all files (registry.ts, AgentCard, ClickableRef, MiniTranscript, QuestionCard, ScheduleCard, ToolChip, ExpandedViews, etc.)
- `Dashboard/hooks/useConversation.ts`, `useEventStream.tsx`
- `Dashboard/lib/api.ts`, `systemMessages.ts`, `pathUtils.ts`, `queryClient.ts`
- `Dashboard/store/windowStore.ts`
- `Dashboard/app/globals.css`, `error.tsx`, `desktop/error.tsx`, `not-found.tsx`
- `Dashboard/package.json`, `next.config.ts`

**If you've built custom Dashboard apps:** your `Dashboard/app/[your-app]/` folders are untouched. Only overwrite files listed above.

---

## 4. `.claude/` changes

**Smart merge — don't blindly overwrite.** These files are designed to be customized. Read both versions and integrate new content into yours.

**Roles** (all 7 updated — check each one):
- `.claude/roles/chief/role.md` — added email triage rules, ADHD → "user's operating system" language generalized, Bootstrap Instructions section
- `.claude/roles/chief/interactive.md`
- `.claude/roles/builder/role.md` — Bootstrap Instructions, release tracking section removed
- `.claude/roles/builder/interactive.md`
- `.claude/roles/curator/role.md`, `interactive.md`, `memory-consolidation.md` — Phase 5 Spec Cleanup added
- `.claude/roles/project/role.md` — three-layer filesystem structure documented, Bootstrap Instructions
- `.claude/roles/researcher/role.md`, `idea/role.md`, `writer/role.md`, `project/interactive.md`, `idea/interactive.md`, `researcher/interactive.md`, `writer/interactive.md`

**Modes:**
- `.claude/modes/implementation.md`, `verification.md` — done() summary guidance updated

**Agents** (new agents — safe to copy in, you're just adding):
- `.claude/agents/best-practices.md` (new)
- `.claude/agents/data-scientist.md` (new)
- `.claude/agents/entity-search.md` (new)
- `.claude/agents/practitioner.md` (new)
- `.claude/agents/skeptic.md` (new)
- `.claude/agents/ux-perspective.md` (new)
- Other agents updated in place

**Skills** (safe to overwrite — skills are self-contained prompts):
- `.claude/skills/morning-reset/SKILL.md`
- `.claude/skills/evening-checkin/SKILL.md`
- `.claude/skills/cleanup/SKILL.md`
- `.claude/skills/create-skill/SKILL.md`
- `.claude/skills/setup-telegram/SKILL.md`
- `.claude/skills/temporal-parliament/SKILL.md`
- `.claude/skills/update/SKILL.md` (new — this skill)

**Hooks:**
- `.claude/hooks/session_lifecycle/prompt.py`
- `.claude/hooks/tool_tracking.py`

---

## 5. `CLAUDE.md`

Smart merge. CLAUDE.md changed substantially — generalized "Will" → "the user" throughout, added file discipline rules, updated team() operations table, added subagent table. If you haven't customized yours, overwrite. If you have, integrate these sections:

- **File Discipline** section (new) — specs die on ship, reports go to logs/system/
- **team() operations table** — `reply` and `subscribe` removed, only spawn/list/peek/close/message remain
- **Subagents table** — updated with new agents (data-scientist, best-practices, practitioner, skeptic, ux-perspective, entity-search)

---

## 6. Restart

```bash
./restart.sh
```

---

## 7. Verify

- Open the Contacts app — should show an activity feed, not a phone book
- Open a markdown file — editor controls should be in the PathBar, not the editor toolbar
- Open the Guide app from the Dock — visual guide with chapters should load
- Spawn a subagent — its transcript should stream live inside the spawn card
- Type `@` in ClaudePanel — file picker dropdown should appear
- Use `schedule()` — should render as a card in the transcript

---

## If you've built custom apps

After restarting, check your custom apps against the breaking changes in `v22.0.md`:

1. **`fetchFileTree()` callers** — return type changed to `{ repoRoot, desktopRoot, tree }`
2. **`team("reply")` or `team("subscribe")` usage** — these operations were removed; use `team("message")` instead
3. **CadenceView imports** — if your app imported `CadenceView`, remove those imports
