"""Cron scheduler — unified dispatcher for all scheduled operations.

Replaces duty_scheduler.py, triggers.py, and mission executor with one system.
Desktop/SCHEDULE.md is the human-readable source of truth. This module parses it,
manages a 60-second polling loop, and routes entries by action type.

Three action types:
- inject <target>: Send text into a live Claude session's tmux pane
- spawn <role>: Spawn a specialist directly (no Chief needed)
- exec: Run a registered Python function (no LLM, deterministic)
"""

import asyncio
import hashlib
import logging
import os
import re
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from croniter import croniter

from core.config import settings
from core.storage import SystemStorage
from core.perf import record_worker_latency
from core.events import event_bus
from core.tmux import inject_message, window_exists

logger = logging.getLogger("scheduler")

PACIFIC = ZoneInfo("America/Los_Angeles")


# =============================================================================
# DATA MODEL
# =============================================================================

@dataclass
class CronEntry:
    """A parsed schedule entry."""
    id: str                     # Stable hash of expression + action + payload
    expression: str             # Cron expression or ISO datetime
    action_type: str            # 'inject', 'spawn', 'exec'
    target: str                 # For inject: window name. For spawn: role. For exec: empty.
    payload: str                # Message text, spec path, or function name
    critical: bool = False      # If true, catch up on missed runs
    one_off: bool = False       # ISO datetime entries auto-delete after firing
    section: str = ""           # Section header from SCHEDULE.md (cosmetic)

    @staticmethod
    def make_id(expression: str, action: str, payload: str) -> str:
        """Generate a stable ID from entry content."""
        content = f"{expression}|{action}|{payload}"
        return hashlib.sha256(content.encode()).hexdigest()[:12]


# =============================================================================
# EXEC REGISTRY — deterministic Python functions
# =============================================================================

def _vacuum_database():
    """VACUUM the system database."""
    storage = SystemStorage(settings.db_path)
    storage.execute("VACUUM")
    storage.close()
    logger.info("Database vacuumed")


def _rotate_logs():
    """Rotate old log files."""
    logs_dir = settings.repo_root / "Desktop" / "logs"
    if not logs_dir.exists():
        return
    cutoff = datetime.now() - timedelta(days=30)
    removed = 0
    for f in logs_dir.rglob("*.md"):
        try:
            mtime = datetime.fromtimestamp(f.stat().st_mtime)
            if mtime < cutoff:
                f.unlink()
                removed += 1
        except Exception:
            pass
    if removed:
        logger.info(f"Rotated {removed} old log files")


def _usage_snapshot():
    """Take a usage analytics snapshot."""
    # The usage tracker already polls on its own interval.
    # This just ensures a snapshot if the tracker missed one.
    try:
        import urllib.request
        req = urllib.request.Request("http://localhost:5001/api/analytics/usage/current")
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception:
        pass


def _cleanup_orphan_sessions():
    """Clean up orphaned sessions in the database."""
    storage = SystemStorage(settings.db_path)
    cutoff = (datetime.now() - timedelta(hours=6)).isoformat()
    storage.execute("""
        UPDATE sessions SET ended_at = datetime('now'), end_reason = 'orphan_cleanup'
        WHERE ended_at IS NULL AND last_seen_at < ?
    """, (cutoff,))
    storage.close()


EXEC_REGISTRY: Dict[str, Callable] = {
    "vacuum_database": _vacuum_database,
    "rotate_logs": _rotate_logs,
    "usage_snapshot": _usage_snapshot,
    "cleanup_orphan_sessions": _cleanup_orphan_sessions,
}


# =============================================================================
# SCHEDULE PARSER
# =============================================================================

def parse_schedule(schedule_path: Path) -> List[CronEntry]:
    """Parse Desktop/SCHEDULE.md into CronEntry objects.

    Format: `expression | action | payload [| flags]`
    Section headers (## ...) are cosmetic. Blank lines and comments (#) ignored.
    """
    if not schedule_path.exists():
        return []

    entries = []
    current_section = ""

    for line in schedule_path.read_text().splitlines():
        stripped = line.strip()

        # Track section headers
        if stripped.startswith("## "):
            current_section = stripped[3:].strip()
            continue

        # Skip blanks, comments, top-level header
        if not stripped or stripped.startswith("#") or stripped.startswith("---"):
            continue

        # Parse entry: expression | action | payload [| flags]
        parts = [p.strip() for p in stripped.split("|")]
        if len(parts) < 3:
            continue

        expression = parts[0]
        action_raw = parts[1]
        payload = parts[2]
        flags = parts[3] if len(parts) > 3 else ""

        # Parse action: "inject chief", "spawn researcher", "exec"
        action_parts = action_raw.split(None, 1)
        action_type = action_parts[0].lower()
        target = action_parts[1] if len(action_parts) > 1 else ""

        if action_type not in ("inject", "spawn", "exec"):
            logger.warning(f"Unknown action type '{action_type}' in schedule: {stripped}")
            continue

        # Determine if one-off (ISO datetime vs cron expression)
        one_off = _is_iso_datetime(expression)

        # Validate cron expression
        if not one_off:
            try:
                croniter(expression)
            except (ValueError, KeyError):
                logger.warning(f"Invalid cron expression '{expression}' in schedule: {stripped}")
                continue

        entry = CronEntry(
            id=CronEntry.make_id(expression, action_raw, payload),
            expression=expression,
            action_type=action_type,
            target=target,
            payload=payload,
            critical="critical" in flags.lower(),
            one_off=one_off,
            section=current_section,
        )
        entries.append(entry)

    return entries


def _is_iso_datetime(s: str) -> bool:
    """Check if string looks like an ISO datetime (not a cron expression)."""
    # ISO datetimes start with 4 digits (year)
    return bool(re.match(r'^\d{4}-\d{2}-\d{2}', s))


def _parse_iso_datetime(s: str) -> Optional[datetime]:
    """Parse ISO datetime string to timezone-aware datetime."""
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=PACIFIC)
        return dt
    except (ValueError, TypeError):
        return None


# =============================================================================
# CRON SCHEDULER
# =============================================================================

class CronScheduler:
    """Unified cron dispatcher.

    - Parses SCHEDULE.md on startup and watches for changes
    - 60-second polling loop
    - Routes actions: inject → tmux, spawn → SessionService, exec → registry
    - Tracks state in cron_entries/cron_log DB tables
    - Absorbs calendar triggers from the old triggers.py
    """

    def __init__(self):
        self.schedule_path = settings.desktop_dir / "SCHEDULE.md"
        self.heartbeat_path = settings.desktop_dir / "HEARTBEAT.md"
        self.storage = SystemStorage(settings.db_path)
        self.entries: List[CronEntry] = []
        self._schedule_mtime: float = 0
        self._triggered_events: set = set()  # Calendar events already triggered
        self._caffeinate_proc: Optional[subprocess.Popen] = None

        self._ensure_tables()

    def _ensure_tables(self):
        """Create cron tables if they don't exist."""
        self.storage.execute("""
            CREATE TABLE IF NOT EXISTS cron_entries (
                id TEXT PRIMARY KEY,
                expression TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target TEXT NOT NULL DEFAULT '',
                payload TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                critical INTEGER DEFAULT 0,
                one_off INTEGER DEFAULT 0,
                last_run TEXT,
                next_run TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.storage.execute("""
            CREATE TABLE IF NOT EXISTS cron_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_id TEXT NOT NULL,
                fired_at TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT,
                duration_ms INTEGER
            )
        """)
        self.storage.execute("""
            CREATE INDEX IF NOT EXISTS idx_cron_log_entry ON cron_log(entry_id)
        """)
        self.storage.execute("""
            CREATE INDEX IF NOT EXISTS idx_cron_log_fired ON cron_log(fired_at DESC)
        """)
        self.storage.execute("""
            CREATE INDEX IF NOT EXISTS idx_cron_entries_next ON cron_entries(next_run)
            WHERE enabled = 1
        """)

    # =========================================================================
    # SCHEDULE LOADING
    # =========================================================================

    def load_schedule(self):
        """Parse SCHEDULE.md and sync with DB."""
        self.entries = parse_schedule(self.schedule_path)
        self._schedule_mtime = self._get_mtime(self.schedule_path)
        self._sync_db()
        logger.info(f"Loaded {len(self.entries)} schedule entries")

    def _schedule_changed(self) -> bool:
        """Check if SCHEDULE.md has been modified since last load."""
        current_mtime = self._get_mtime(self.schedule_path)
        return current_mtime != self._schedule_mtime

    def _get_mtime(self, path: Path) -> float:
        """Get file modification time, 0 if not exists."""
        try:
            return path.stat().st_mtime
        except (FileNotFoundError, OSError):
            return 0

    def _sync_db(self):
        """Sync parsed entries with DB. Preserve last_run for existing entries."""
        # Get existing entries
        existing = {}
        for row in self.storage.fetchall("SELECT id, last_run, enabled FROM cron_entries"):
            existing[row["id"]] = {"last_run": row["last_run"], "enabled": row["enabled"]}

        current_ids = set()
        for entry in self.entries:
            current_ids.add(entry.id)
            if entry.id in existing:
                # Update expression/payload but keep last_run and enabled
                self.storage.execute("""
                    UPDATE cron_entries
                    SET expression = ?, action_type = ?, target = ?, payload = ?,
                        critical = ?, one_off = ?
                    WHERE id = ?
                """, (entry.expression, entry.action_type, entry.target, entry.payload,
                      int(entry.critical), int(entry.one_off), entry.id))
            else:
                # New entry
                next_run = self._compute_next_run(entry)
                self.storage.execute("""
                    INSERT INTO cron_entries (id, expression, action_type, target, payload,
                                            critical, one_off, next_run)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (entry.id, entry.expression, entry.action_type, entry.target,
                      entry.payload, int(entry.critical), int(entry.one_off), next_run))

        # Remove stale entries (in DB but not in file)
        stale_ids = set(existing.keys()) - current_ids
        for stale_id in stale_ids:
            self.storage.execute("DELETE FROM cron_entries WHERE id = ?", (stale_id,))

        # Recompute next_run for all entries
        for entry in self.entries:
            row = self.storage.fetchone("SELECT last_run FROM cron_entries WHERE id = ?", (entry.id,))
            last_run = row["last_run"] if row else None
            next_run = self._compute_next_run(entry, last_run)
            self.storage.execute("UPDATE cron_entries SET next_run = ? WHERE id = ?", (next_run, entry.id))

    def _compute_next_run(self, entry: CronEntry, last_run: Optional[str] = None) -> Optional[str]:
        """Compute next_run time for an entry."""
        now = datetime.now(PACIFIC)

        if entry.one_off:
            dt = _parse_iso_datetime(entry.expression)
            return dt.isoformat() if dt else None

        try:
            base = now
            if last_run:
                try:
                    lr = datetime.fromisoformat(last_run)
                    if lr.tzinfo is None:
                        lr = lr.replace(tzinfo=PACIFIC)
                    base = lr
                except (ValueError, TypeError):
                    pass

            cron = croniter(entry.expression, base)
            next_dt = cron.get_next(datetime)
            if next_dt.tzinfo is None:
                next_dt = next_dt.replace(tzinfo=PACIFIC)
            return next_dt.isoformat()
        except Exception:
            return None

    # =========================================================================
    # MAIN LOOP
    # =========================================================================

    async def run_forever(self, stop_event: asyncio.Event):
        """Main scheduler loop — runs until stop_event is set."""
        logger.info("Cron scheduler starting...")

        # Initial load
        self.load_schedule()

        # Check for missed runs on startup
        await self._catch_up_missed()

        logger.info(f"Cron scheduler running ({len(self.entries)} entries)")

        cleanup_counter = 0

        try:
            while not stop_event.is_set():
                tick_start = time.perf_counter()
                errored = False

                try:
                    # Reload schedule if file changed
                    if self._schedule_changed():
                        self.load_schedule()
                        logger.info("Schedule reloaded (file changed)")

                    # Process due entries
                    await self._process_due_entries()

                    # Check calendar triggers (absorbed from triggers.py)
                    await self._check_calendar_triggers()

                except Exception as e:
                    errored = True
                    logger.error(f"Scheduler tick error: {e}", exc_info=True)
                finally:
                    elapsed_ms = (time.perf_counter() - tick_start) * 1000
                    record_worker_latency("scheduler.tick", elapsed_ms, errored)

                # Periodic calendar event set cleanup (every ~60 ticks = 1 hour)
                cleanup_counter += 1
                if cleanup_counter >= 60:
                    self._triggered_events.clear()
                    cleanup_counter = 0

                # Wait 60 seconds (or until stop)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=60.0)
                    break
                except asyncio.TimeoutError:
                    continue

        except Exception as e:
            logger.error(f"Scheduler fatal error: {e}", exc_info=True)
        finally:
            # Kill caffeinate if running
            if self._caffeinate_proc:
                try:
                    self._caffeinate_proc.terminate()
                except Exception:
                    pass
            logger.info("Cron scheduler stopped")

    # =========================================================================
    # ENTRY PROCESSING
    # =========================================================================

    async def _process_due_entries(self):
        """Check all entries and dispatch any that are due."""
        now = datetime.now(PACIFIC)
        now_iso = now.isoformat()

        rows = self.storage.fetchall("""
            SELECT id, expression, action_type, target, payload, critical, one_off, last_run, next_run
            FROM cron_entries
            WHERE enabled = 1 AND next_run IS NOT NULL AND next_run <= ?
        """, (now_iso,))

        for row in rows:
            entry_id = row["id"]
            action_type = row["action_type"]
            target = row["target"]
            payload = row["payload"]
            one_off = bool(row["one_off"])

            start = time.perf_counter()
            status = "error"
            notes = None

            try:
                if action_type == "inject":
                    status, notes = await self._dispatch_inject(target, payload)
                elif action_type == "spawn":
                    status, notes = await self._dispatch_spawn(target, payload)
                elif action_type == "exec":
                    status, notes = await self._dispatch_exec(payload)
                else:
                    status = "error"
                    notes = f"Unknown action type: {action_type}"
            except Exception as e:
                status = "error"
                notes = str(e)
                logger.error(f"Dispatch error for {entry_id}: {e}", exc_info=True)

            elapsed_ms = int((time.perf_counter() - start) * 1000)

            # Log execution
            self.storage.execute("""
                INSERT INTO cron_log (entry_id, fired_at, status, notes, duration_ms)
                VALUES (?, ?, ?, ?, ?)
            """, (entry_id, now_iso, status, notes, elapsed_ms))

            # Update last_run and compute next_run
            entry_obj = self._find_entry(entry_id)
            next_run = self._compute_next_run(entry_obj, now_iso) if entry_obj and not one_off else None

            self.storage.execute("""
                UPDATE cron_entries SET last_run = ?, next_run = ? WHERE id = ?
            """, (now_iso, next_run, entry_id))

            # Handle one-off cleanup
            if one_off and status == "delivered":
                await self._remove_one_off(entry_id, row["expression"])

            # Emit event
            await event_bus.publish("cron.fired", {
                "entry_id": entry_id,
                "action_type": action_type,
                "target": target,
                "payload": payload[:100],
                "status": status,
            })

    def _find_entry(self, entry_id: str) -> Optional[CronEntry]:
        """Find a CronEntry by ID."""
        for entry in self.entries:
            if entry.id == entry_id:
                return entry
        return None

    # =========================================================================
    # ACTION DISPATCHERS
    # =========================================================================

    async def _dispatch_inject(self, target: str, payload: str) -> Tuple[str, Optional[str]]:
        """Inject a message into a tmux session.

        If target is 'chief' and Chief is dead, resurrect first.
        """
        tmux_target = f"life:{target}"

        # Check if target window exists
        if not window_exists(target):
            if target == "chief":
                # Resurrect Chief
                logger.info("Chief not running — resurrecting for cron delivery")
                resurrected = await self._resurrect_chief()
                if not resurrected:
                    return "chief_dead", "Failed to resurrect Chief"
            else:
                return "target_dead", f"Window '{target}' not found"

        # Format the message
        is_wake = payload.strip() == "[WAKE]"
        if is_wake:
            message = "[WAKE]"
        else:
            now_str = datetime.now(PACIFIC).strftime("%H:%M")
            message = f"[CRON {now_str}] {payload}"

        # Inject
        success = await asyncio.to_thread(
            inject_message,
            tmux_target,
            message,
            True,   # submit
            0.15,   # delay
            True,   # cleanup
        )

        if success:
            return "delivered", None
        else:
            return "error", "inject_message returned False"

    async def _dispatch_spawn(self, role: str, spec_path: str) -> Tuple[str, Optional[str]]:
        """Spawn a specialist directly (no Chief needed)."""
        from modules.sessions import SessionManager

        full_spec = settings.repo_root / spec_path
        if not full_spec.exists():
            return "error", f"Spec not found: {spec_path}"

        # Caffeinate for overnight spawns (midnight to 6am)
        hour = datetime.now(PACIFIC).hour
        if 0 <= hour < 6:
            self._start_caffeinate(7200)  # 2 hours

        # Generate conversation ID
        ts = datetime.now(PACIFIC).strftime("%m%d-%H%M")
        conversation_id = f"{ts}-{role}-{uuid.uuid4().hex[:8]}"
        workspace = settings.repo_root / "Desktop/conversations" / conversation_id
        workspace.mkdir(parents=True, exist_ok=True)

        # Create progress.md
        timestamp = datetime.now(PACIFIC).strftime("%Y-%m-%d %H:%M")
        (workspace / "progress.md").write_text(
            f"# Progress Log\n\nStarted: {timestamp}\nMax iterations: 10\n\n"
        )

        # Spawn in background thread (non-blocking)
        def _do_spawn():
            try:
                manager = SessionManager(repo_root=settings.repo_root)
                result = manager.spawn(
                    role=role,
                    mode="preparation",
                    conversation_id=conversation_id,
                    description=f"Scheduled {role}",
                    spec_path=str(full_spec),
                )
                if result.success:
                    logger.info(f"Scheduled spawn succeeded: {role}/{conversation_id}")
                else:
                    logger.error(f"Scheduled spawn failed: {result.error}")
            except Exception as e:
                logger.error(f"Scheduled spawn error: {e}")

        import threading
        thread = threading.Thread(target=_do_spawn, daemon=True, name=f"cron-spawn-{conversation_id}")
        thread.start()

        return "delivered", f"Spawned {role} as {conversation_id}"

    async def _dispatch_exec(self, func_name: str) -> Tuple[str, Optional[str]]:
        """Execute a registered Python function."""
        func = EXEC_REGISTRY.get(func_name)
        if not func:
            return "error", f"Function '{func_name}' not in EXEC_REGISTRY"

        try:
            await asyncio.to_thread(func)
            return "delivered", None
        except Exception as e:
            return "error", str(e)

    # =========================================================================
    # CHIEF RESURRECTION
    # =========================================================================

    async def _resurrect_chief(self) -> bool:
        """Spawn a fresh Chief if none is running. Returns True if ready."""
        try:
            from modules.sessions import SessionManager
            manager = SessionManager(repo_root=settings.repo_root)

            # Spawn Chief (blocking — we need to wait for readiness)
            def _spawn():
                result = manager.spawn_chief()
                return result.success

            success = await asyncio.to_thread(_spawn)
            if success:
                logger.info("Chief resurrected successfully")
                # Wait a bit for hooks to load
                await asyncio.sleep(3)
            return success
        except Exception as e:
            logger.error(f"Chief resurrection failed: {e}")
            return False

    # =========================================================================
    # CALENDAR TRIGGERS (absorbed from triggers.py)
    # =========================================================================

    async def _check_calendar_triggers(self):
        """Check for upcoming calendar events and notify Chief."""
        try:
            from modules.calendar import get_events
        except ImportError:
            return

        now = datetime.now()
        window_start = now + timedelta(minutes=14)
        window_end = now + timedelta(minutes=16)

        try:
            events = get_events(
                from_date=window_start,
                to_date=window_end,
                use_preferred=True,
            )
        except Exception:
            return

        for event in events:
            event_id = event.get("id")
            if not event_id or event_id in self._triggered_events:
                continue

            title = event.get("summary", "Unknown Event")
            if not window_exists("chief"):
                continue

            now_str = datetime.now(PACIFIC).strftime("%H:%M")
            message = (
                f"[CRON {now_str}] [PRE-EVENT] Event \"{title}\" in ~15 min. "
                f"Decide if the user needs context. If important, send brief via Telegram."
            )

            success = await asyncio.to_thread(
                inject_message,
                "life:chief",
                message,
                True, 0.15, True,
            )

            if success:
                self._triggered_events.add(event_id)
                logger.info(f"Pre-event trigger fired: {title}")

    # =========================================================================
    # MISSED RUN CATCH-UP
    # =========================================================================

    async def _catch_up_missed(self):
        """On startup, catch up any missed critical runs."""
        now = datetime.now(PACIFIC)
        now_iso = now.isoformat()

        rows = self.storage.fetchall("""
            SELECT id, expression, action_type, target, payload, critical, one_off, last_run, next_run
            FROM cron_entries
            WHERE enabled = 1 AND next_run IS NOT NULL AND next_run < ?
        """, (now_iso,))

        for row in rows:
            entry_id = row["id"]
            critical = bool(row["critical"])
            one_off = bool(row["one_off"])
            action_type = row["action_type"]
            target = row["target"]
            payload = row["payload"]

            if critical:
                # Critical entries: run immediately
                logger.info(f"Catching up missed critical entry: {entry_id} ({payload[:50]})")
                status = "error"
                notes = None

                try:
                    if action_type == "inject":
                        status, notes = await self._dispatch_inject(target, payload)
                    elif action_type == "spawn":
                        status, notes = await self._dispatch_spawn(target, payload)
                    elif action_type == "exec":
                        status, notes = await self._dispatch_exec(payload)
                except Exception as e:
                    notes = str(e)

                self.storage.execute("""
                    INSERT INTO cron_log (entry_id, fired_at, status, notes)
                    VALUES (?, ?, ?, ?)
                """, (entry_id, now_iso, f"caught_up:{status}", notes))

            elif one_off:
                # One-off: deliver late
                logger.info(f"Delivering late one-off: {entry_id}")
                if action_type == "inject":
                    now_str = datetime.now(PACIFIC).strftime("%H:%M")
                    late_payload = f"[LATE] {payload}"
                    await self._dispatch_inject(target, late_payload)

                self.storage.execute("""
                    INSERT INTO cron_log (entry_id, fired_at, status, notes)
                    VALUES (?, ?, 'delivered_late', NULL)
                """, (entry_id, now_iso))

                # Clean up one-off
                await self._remove_one_off(entry_id, row["expression"])
            else:
                # Recurring non-critical: skip to next interval
                self.storage.execute("""
                    INSERT INTO cron_log (entry_id, fired_at, status, notes)
                    VALUES (?, ?, 'skipped', 'Non-critical, skipped to next interval')
                """, (entry_id, now_iso))

            # Recompute next_run
            entry_obj = self._find_entry(entry_id)
            if entry_obj and not one_off:
                next_run = self._compute_next_run(entry_obj, now_iso)
                self.storage.execute(
                    "UPDATE cron_entries SET last_run = ?, next_run = ? WHERE id = ?",
                    (now_iso, next_run, entry_id)
                )

    # =========================================================================
    # ONE-OFF CLEANUP
    # =========================================================================

    async def _remove_one_off(self, entry_id: str, expression: str):
        """Remove a fired one-off entry from SCHEDULE.md."""
        try:
            if not self.schedule_path.exists():
                return

            lines = self.schedule_path.read_text().splitlines()
            new_lines = []
            for line in lines:
                # Keep lines that don't start with this expression
                stripped = line.strip()
                if stripped.startswith(expression):
                    logger.info(f"Removing fired one-off: {stripped[:60]}")
                    continue
                new_lines.append(line)

            self.schedule_path.write_text("\n".join(new_lines) + "\n")
            self._schedule_mtime = self._get_mtime(self.schedule_path)

            # Disable in DB
            self.storage.execute(
                "UPDATE cron_entries SET enabled = 0 WHERE id = ?", (entry_id,)
            )

            # Remove from in-memory entries
            self.entries = [e for e in self.entries if e.id != entry_id]

        except Exception as e:
            logger.error(f"Failed to remove one-off {entry_id}: {e}")

    # =========================================================================
    # CAFFEINATE
    # =========================================================================

    def _start_caffeinate(self, seconds: int):
        """Start caffeinate to prevent sleep during overnight work."""
        if self._caffeinate_proc and self._caffeinate_proc.poll() is None:
            return  # Already running

        try:
            self._caffeinate_proc = subprocess.Popen(
                ["caffeinate", "-i", "-t", str(seconds)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info(f"Started caffeinate for {seconds}s")
        except Exception as e:
            logger.warning(f"Failed to start caffeinate: {e}")

    # =========================================================================
    # PUBLIC API (for MCP tool)
    # =========================================================================

    def list_entries(self) -> List[Dict[str, Any]]:
        """List all entries with DB state."""
        rows = self.storage.fetchall("""
            SELECT id, expression, action_type, target, payload, enabled, critical,
                   one_off, last_run, next_run
            FROM cron_entries
            ORDER BY next_run NULLS LAST
        """)
        return [dict(row) for row in rows]

    def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent execution history."""
        rows = self.storage.fetchall("""
            SELECT cl.entry_id, cl.fired_at, cl.status, cl.notes, cl.duration_ms,
                   ce.action_type, ce.target, ce.payload
            FROM cron_log cl
            LEFT JOIN cron_entries ce ON cl.entry_id = ce.id
            ORDER BY cl.fired_at DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in rows]

    def add_entry(self, expression: str, action: str, payload: str,
                  critical: bool = False) -> str:
        """Add an entry to SCHEDULE.md and DB. Returns entry ID."""
        # Determine section
        one_off = _is_iso_datetime(expression)
        section = "One-Off" if one_off else "Recurring"

        # Validate
        if not one_off:
            try:
                croniter(expression)
            except (ValueError, KeyError):
                raise ValueError(f"Invalid cron expression: {expression}")

        # Build the schedule line
        flags = " | critical" if critical else ""
        line = f"{expression} | {action} | {payload}{flags}"

        # Append to SCHEDULE.md under appropriate section
        self._append_to_schedule(section, line)

        # Reload
        self.load_schedule()

        entry_id = CronEntry.make_id(expression, action, payload)
        return entry_id

    def remove_entry(self, entry_id: str) -> bool:
        """Remove an entry from SCHEDULE.md and DB."""
        row = self.storage.fetchone("SELECT expression FROM cron_entries WHERE id = ?", (entry_id,))
        if not row:
            return False

        expression = row["expression"]

        # Remove from file
        if self.schedule_path.exists():
            lines = self.schedule_path.read_text().splitlines()
            new_lines = [l for l in lines if not l.strip().startswith(expression)]
            self.schedule_path.write_text("\n".join(new_lines) + "\n")

        # Remove from DB
        self.storage.execute("DELETE FROM cron_entries WHERE id = ?", (entry_id,))

        # Reload
        self.load_schedule()
        return True

    def set_enabled(self, entry_id: str, enabled: bool) -> bool:
        """Enable or disable an entry."""
        row = self.storage.fetchone("SELECT id FROM cron_entries WHERE id = ?", (entry_id,))
        if not row:
            return False
        self.storage.execute(
            "UPDATE cron_entries SET enabled = ? WHERE id = ?",
            (int(enabled), entry_id)
        )
        return True

    def _append_to_schedule(self, section: str, line: str):
        """Append a line under a section in SCHEDULE.md."""
        if not self.schedule_path.exists():
            self.schedule_path.write_text(f"# Schedule\n\n## {section}\n{line}\n")
            return

        content = self.schedule_path.read_text()
        lines = content.splitlines()

        # Find the section
        section_header = f"## {section}"
        section_idx = None
        for i, l in enumerate(lines):
            if l.strip() == section_header:
                section_idx = i
                break

        if section_idx is not None:
            # Find next section or end of file
            insert_idx = section_idx + 1
            while insert_idx < len(lines) and not lines[insert_idx].strip().startswith("## "):
                insert_idx += 1
            # Insert before next section (or end)
            lines.insert(insert_idx, line)
        else:
            # Create section at end
            lines.append("")
            lines.append(section_header)
            lines.append(line)

        self.schedule_path.write_text("\n".join(lines) + "\n")


# =============================================================================
# ENTRY POINT
# =============================================================================

# Module-level scheduler instance for MCP tool access
_scheduler: Optional[CronScheduler] = None


def get_scheduler() -> Optional[CronScheduler]:
    """Get the running scheduler instance (for MCP tool)."""
    return _scheduler


async def start_scheduler(stop_event: asyncio.Event):
    """Start the cron scheduler background service."""
    global _scheduler
    _scheduler = CronScheduler()
    await _scheduler.run_forever(stop_event)
