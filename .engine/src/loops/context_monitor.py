"""Context monitoring loop - proactive warnings.

Monitors active sessions for context usage and sends proactive warnings
before Claude gets stuck. Uses ESC interrupt + TMUX injection.

Runs as background loop in main.py, polls every 30s.
"""

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from services.storage import SystemStorage
from services.messaging import get_messaging, MessageType


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


from services.claude_status import get_session_claude_status
from utils.tmux import send_escape_to_pane


# Warning thresholds (percent used, severity label)
WARNING_THRESHOLDS = [
    (60, "memory"),
    (80, "suggest"),
    (90, "urgent"),
    (95, "critical"),
]

AUTONOMOUS_OFFSET = 10  # Warnings 10% earlier in autonomous mode
POLL_INTERVAL = 30  # seconds


class ContextMonitor:
    """Monitors context usage and sends proactive warnings."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.messaging = get_messaging(db_path)
        self.running = False

    async def start(self):
        """Start the monitoring loop."""
        self.running = True
        while self.running:
            try:
                await self.check_all_sessions()
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
            SELECT session_id, tmux_pane, mode, context_warning_level
            FROM sessions
            WHERE ended_at IS NULL AND tmux_pane IS NOT NULL
        """)

        for row in rows:
            await self.check_session(
                storage,
                row['session_id'],
                row['tmux_pane'],
                row['mode'] or 'interactive',
                row['context_warning_level'] or 0
            )

        storage.close()

    async def check_session(
        self,
        storage: SystemStorage,
        session_id: str,
        tmux_pane: str,
        mode: str,
        current_level: int
    ):
        """Check context for a single session."""
        status = get_session_claude_status(tmux_pane)
        if not status or not status.context_percent_used:
            return

        percent = status.context_percent_used
        is_autonomous = mode in ('background', 'mission', 'autonomous')
        threshold_offset = AUTONOMOUS_OFFSET if is_autonomous else 0

        # Check thresholds (highest to lowest)
        for threshold, severity in reversed(WARNING_THRESHOLDS):
            effective_threshold = threshold - threshold_offset

            if percent >= effective_threshold and current_level < threshold:
                await self.send_warning(
                    storage, session_id, tmux_pane,
                    threshold, severity, percent, is_autonomous
                )
                break

    async def send_warning(
        self,
        storage: SystemStorage,
        session_id: str,
        tmux_pane: str,
        threshold: int,
        severity: str,
        percent: int,
        is_autonomous: bool
    ):
        """Send proactive context warning with ESC interrupt."""

        # 1. Interrupt with ESC
        send_escape_to_pane(tmux_pane)

        # 2. Wait for interrupt
        await asyncio.sleep(0.2)

        # 3. Build and inject warning
        message = self.get_warning_message(percent, severity, is_autonomous)
        success = self.messaging.send(
            message,
            type=MessageType.WARNING,
            target=tmux_pane,
            submit=True,
            delay=0.3
        )

        if success:
            # 4. Update database
            storage.execute(
                "UPDATE sessions SET context_warning_level = ? WHERE session_id = ?",
                (threshold, session_id)
            )
            print(f"Context warning: {session_id[:8]} at {percent}% ({severity})")

    def get_warning_message(self, percent: int, severity: str, is_autonomous: bool) -> str:
        """Generate warning message."""
        mode_note = ""
        if is_autonomous:
            mode_note = "\n\n**AUTONOMOUS MODE:** No human backup. Reset early or risk getting stuck."

        if severity == "memory":
            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Memory check ({percent}% context used)\n\n"
                f"You're building up context. Make sure you're externalizing:\n"
                f"- Current state → Desktop/working/[your-file].md\n"
                f"- Observations → MEMORY.md (Chief section)\n"
                f"- Decisions → Reference specs, don't keep in head\n\n"
                f"Good Claudes externalize context early and often."
            )

        elif severity == "suggest":
            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context at {percent}%\n\n"
                f"Your context window is filling up. At 95%, you won't be able to continue effectively.\n\n"
                f"**Initiate reset protocol now:**\n\n"
                f"1. Document current state in Desktop/working/[your-work].md\n"
                f"2. Note what you're doing and next steps\n"
                f"3. Call `reset(summary=\"...\", path=\"Desktop/working/[your-work].md\", reason=\"context_low\")`\n\n"
                f"A fresh session will spawn and continue your work seamlessly.{mode_note}"
            )

        elif severity == "urgent":
            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context at {percent}% - URGENT\n\n"
                f"You're approaching context limits. Stop current task at a clean boundary.\n\n"
                f"**Reset protocol required:**\n\n"
                f"1. Save minimal state to Desktop/working/[file].md (what you're doing, key files, next step)\n"
                f"2. `reset(summary=\"...\", path=\"Desktop/working/[file].md\", reason=\"context_low\")`\n\n"
                f"Do NOT attempt more implementation. Your successor continues from your notes.{mode_note}"
            )

        elif severity == "critical":
            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context at {percent}% - CRITICAL\n\n"
                f"**RESET IMMEDIATELY OR YOU WILL BE STUCK.**\n\n"
                f"1. Write ONE sentence to Desktop/working/emergency-reset.md (what you're doing)\n"
                f"2. `reset(summary=\"Emergency reset at {percent}%\", path=\"Desktop/working/emergency-reset.md\", reason=\"context_low\")`\n\n"
                f"Your successor will figure it out. RESET NOW.{mode_note}"
            )

        return f"Context at {percent}%"


# Singleton
_monitor: Optional[ContextMonitor] = None

def get_monitor(db_path: Path) -> ContextMonitor:
    """Get or create monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = ContextMonitor(db_path)
    return _monitor
