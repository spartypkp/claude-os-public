"""Context monitoring loop - single 90% threshold warning + emergency reset.

Monitors active sessions for context usage:
1. At 90%: Send warning via TMUX injection (ESC + inject message)
2. At 100% (context full): Emergency reset (Claude is stuck, force handoff)

Single pathway for context warnings. Hooks don't handle this.
Runs as background loop in main.py, polls every 30s.
"""

import asyncio
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from core.storage import SystemStorage
from adapters.telegram.messaging import get_messaging, MessageType
from modules.sessions.claude_status import get_session_claude_status
from core.tmux import send_escape_to_pane_async
from core.perf import record_worker_latency


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# Single threshold - 90%
WARNING_THRESHOLD = 90
POLL_INTERVAL = 30  # seconds

# Paths
REPO_ROOT = Path(__file__).resolve().parents[3]  # .engine/src/workers -> repo root


class ContextMonitor:
    """Monitors context usage - warns at 90%, emergency resets at 100%."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.messaging = get_messaging(db_path)
        self.running = False

    async def start(self):
        """Start the monitoring loop."""
        self.running = True
        while self.running:
            try:
                start = time.perf_counter()
                errored = False
                try:
                    await self.check_all_sessions()
                except Exception:
                    errored = True
                    raise
                finally:
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    record_worker_latency("context_monitor.tick", elapsed_ms, errored)
            except Exception as e:
                print(f"Context monitor error: {e}")
            await asyncio.sleep(POLL_INTERVAL)

    def stop(self):
        """Stop the monitoring loop."""
        self.running = False

    async def check_all_sessions(self):
        """Check context for all active sessions."""
        storage = SystemStorage(self.db_path)

        rows = storage.fetchall("""
            SELECT session_id, tmux_pane, role, mode, conversation_id, context_warning_level
            FROM sessions
            WHERE ended_at IS NULL AND tmux_pane IS NOT NULL
        """)

        for row in rows:
            await self.check_session(
                storage,
                row['session_id'],
                row['tmux_pane'],
                row['role'] or 'builder',
                row['mode'] or 'interactive',
                row['conversation_id'],
                row['context_warning_level'] or 0
            )

        storage.close()

    async def check_session(
        self,
        storage: SystemStorage,
        session_id: str,
        tmux_pane: str,
        role: str,
        mode: str,
        conversation_id: str,
        already_warned: int
    ):
        """Check context for a single session."""
        status = await asyncio.to_thread(get_session_claude_status, tmux_pane)
        if not status:
            return

        # PRIORITY 1: Context full - emergency reset (Claude is stuck)
        if status.context_full:
            print(f"Context FULL detected: {session_id[:8]} - initiating emergency reset")
            await self.emergency_reset(storage, session_id, tmux_pane, role, mode, conversation_id)
            return

        # PRIORITY 2: Context warning at 90%
        if already_warned >= WARNING_THRESHOLD:
            return  # Already warned this session

        if status.context_percent_used and status.context_percent_used >= WARNING_THRESHOLD:
            is_autonomous = mode in ('background', 'mission', 'autonomous')
            await self.send_warning(storage, session_id, tmux_pane, status.context_percent_used, is_autonomous)

    async def send_warning(
        self,
        storage: SystemStorage,
        session_id: str,
        tmux_pane: str,
        percent: int,
        is_autonomous: bool
    ):
        """Send context warning via TMUX injection."""
        # 1. Interrupt with ESC
        await send_escape_to_pane_async(tmux_pane)

        # 2. Wait for interrupt to take effect
        await asyncio.sleep(0.2)

        # 3. Build and inject warning
        message = self._build_warning(percent, is_autonomous)
        success = self.messaging.send(
            message,
            type=MessageType.WARNING,
            target=tmux_pane,
            submit=True,
            delay=0.3
        )

        if success:
            # 4. Mark warned in database
            storage.execute(
                "UPDATE sessions SET context_warning_level = ? WHERE session_id = ?",
                (WARNING_THRESHOLD, session_id)
            )
            print(f"Context warning: {session_id[:8]} at {percent}%")

    async def emergency_reset(
        self,
        storage: SystemStorage,
        session_id: str,
        tmux_pane: str,
        role: str,
        mode: str,
        conversation_id: str
    ):
        """Emergency reset when context is full. Claude can't do cleanup.

        Creates a handoff record and spawns handoff.py to:
        1. Run summarizer on transcript (extracts value even though Claude is stuck)
        2. Kill the tmux pane
        3. Spawn fresh session with auto-generated handoff
        """
        try:
            # Check for pending handoff (avoid double-reset)
            existing = storage.fetchone(
                "SELECT id FROM handoffs WHERE session_id = ? AND status IN ('pending', 'executing')",
                (session_id,)
            )
            if existing:
                print(f"Emergency reset skipped - handoff already pending for {session_id[:8]}")
                return

            # Create handoff record
            handoff_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()

            storage.execute("""
                INSERT INTO handoffs (
                    id, session_id, role, mode, tmux_pane, handoff_path, reason,
                    conversation_id, status, requested_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
            """, (
                handoff_id, session_id, role, mode, tmux_pane, "auto", "emergency_context_full",
                conversation_id, now_iso, now_iso, now_iso
            ))

            # Spawn handoff executor (same as reset() MCP tool does)
            handoff_script = REPO_ROOT / ".engine/src/adapters/cli/handoff.py"
            python_path = REPO_ROOT / "venv/bin/python"

            print(f"Emergency reset: spawning handoff executor for {session_id[:8]}")

            subprocess.Popen(
                [str(python_path), str(handoff_script), handoff_id],
                start_new_session=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        except Exception as e:
            print(f"Emergency reset failed for {session_id[:8]}: {e}")

    def _build_warning(self, percent: int, is_autonomous: bool) -> str:
        """Build the warning message."""
        mode_note = ""
        if is_autonomous:
            mode_note = "\n\n**AUTONOMOUS MODE:** No human backup. Reset now or risk getting stuck."

        return (
            f"[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context at {percent}%\n\n"
            f"Time to reset. Do cleanup, then call `reset(\"what you accomplished\")`\n\n"
            f"**Before reset:**\n"
            f"- Update specs/working files to reflect what actually happened\n"
            f"- Log state to TODAY.md (timeline, open loops)\n"
            f"- Clean Desktop/conversations/ (delete temp files)\n\n"
            f"Summarizer auto-generates handoff from your transcript.{mode_note}"
        )


# Singleton
_monitor: Optional[ContextMonitor] = None

def get_monitor(db_path: Path) -> ContextMonitor:
    """Get or create monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = ContextMonitor(db_path)
    return _monitor
