"""Unified TMUX message injection service.

All messages to Claude sessions route through here.
Provides semantic message types, target resolution, and centralized injection logic.

Message Format Standard
-----------------------
All injected messages follow this format:

    [CLAUDE OS SYS: CATEGORY]: Title or brief description

    Body paragraphs explaining what's happening and why.

    **Action required:**

    1. Step one
    2. Step two

    Closing reassurance or context.

Categories:
- WARNING: Context warnings, reset warnings (urgent attention needed)
- NOTIFICATION: Worker completions, status updates (informational)
- ACTION: Mission resets, forced actions (system will act)
- INFO: Memory checks, reminders (guidance, not urgent)

This format:
- Establishes authority ("CLAUDE OS SYS")
- Clear categorization
- Works in all terminals (no emoji dependency)
- Scannable and machine-parseable
"""

from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from core.storage import SystemStorage


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


from core.tmux import inject_message, display_message


class MessageType(Enum):
    """Semantic message categories."""
    WAKEUP = "wakeup"           # Worker completions, async notifications
    WARNING = "warning"          # Context/reset warnings
    NOTIFICATION = "notification" # Pings, status updates
    PROMPT = "prompt"            # Initial session prompts


class MessageTarget:
    """Target resolution for TMUX injection."""

    @staticmethod
    def by_session_id(session_id: str, db_path: Path) -> Optional[str]:
        """Resolve session_id → tmux_pane."""
        storage = SystemStorage(db_path)
        result = storage.fetchone(
            "SELECT tmux_pane FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        storage.close()
        return result['tmux_pane'] if result else None

    @staticmethod
    def by_conversation_id(conversation_id: str, db_path: Path) -> Optional[str]:
        """Resolve conversation_id → active session's tmux_pane."""
        storage = SystemStorage(db_path)
        result = storage.fetchone("""
            SELECT tmux_pane FROM sessions
            WHERE conversation_id = ?
              AND ended_at IS NULL
            ORDER BY last_seen_at DESC
            LIMIT 1
        """, (conversation_id,))
        storage.close()
        return result['tmux_pane'] if result else None

    @staticmethod
    def by_role(role: str = "chief") -> str:
        """Resolve role → tmux window target."""
        return f"life:{role}"

    @staticmethod
    def direct(pane_or_window: str) -> str:
        """Use pane/window directly (no resolution)."""
        return pane_or_window


class MessagingService:
    """Unified message injection service."""

    def __init__(self, db_path: Path):
        self.db_path = db_path

    def send(
        self,
        content: str,
        *,
        type: MessageType,
        target: str,
        submit: bool = True,
        delay: float = 0.3
    ) -> bool:
        """Send a message to a Claude session.

        Args:
            content: Message text
            type: Semantic message type
            target: tmux pane or window (use MessageTarget to resolve)
            submit: Press Enter after message
            delay: Seconds to wait before Enter

        Returns:
            True if successful
        """
        return inject_message(target, content, submit=submit, delay=delay)

    def display(
        self,
        content: str,
        target: str,
        duration: int = 5000
    ) -> bool:
        """Display overlay message without touching input buffer.

        Non-destructive notification - appears as overlay and auto-dismisses.
        Does NOT interrupt typing or affect input buffer.

        Use for informational notifications (worker completions, status updates).
        Still use send() for urgent warnings that require immediate action.

        Args:
            content: Message text
            target: tmux pane or window (use MessageTarget to resolve)
            duration: Display time in milliseconds (default 5000 = 5 seconds)

        Returns:
            True if successful
        """
        return display_message(target, content, duration=duration)

    # Convenience methods for common patterns

    def wake_conversation(self, conversation_id: str, summary: Optional[str] = None) -> bool:
        """Wake the active session in a conversation (worker completions).

        Uses tmux injection so Claude actually sees the message.
        """
        target = MessageTarget.by_conversation_id(conversation_id, self.db_path)
        if not target:
            return False

        message = f"[{_timestamp()}] [CLAUDE OS SYS: NOTIFICATION]: Workers complete\n\n{summary or 'Check worker() status for reports'}"
        return self.send(
            message,
            type=MessageType.NOTIFICATION,
            target=target
        )

    def warn_reset(self, session_id: str, minutes: int) -> bool:
        """Send reset warning to a session."""
        target = MessageTarget.by_session_id(session_id, self.db_path)
        if not target:
            return False

        minute_label = "minute" if minutes == 1 else "minutes"
        message = f"""[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context reset in {minutes} {minute_label}

Your context window is filling up. You have {minutes} {minute_label} to prepare for reset.

**Save your state now:**

1. Document current state in Desktop/conversations/[your-work].md
2. Note what you're doing and next steps
3. Call `reset(summary="...", path="Desktop/conversations/[your-work].md", reason="context_low")`

A fresh session will spawn and continue your work seamlessly."""

        return self.send(
            message,
            type=MessageType.WARNING,
            target=target,
            delay=0.2
        )

    def warn_mission_reset(self, minutes: int) -> bool:
        """Send mission reset warning to Chief."""
        target = MessageTarget.by_role("chief")

        minute_label = "minute" if minutes == 1 else "minutes"
        message = f"""[{_timestamp()}] [CLAUDE OS SYS: ACTION]: Mission reset in {minutes} {minute_label}

A critical mission needs this window. Your session will be force-reset.

**Save your state now:**

1. Document current work in Desktop/conversations/[your-file].md
2. End your turn—the system will reset you automatically

Your work continues in a fresh Chief session after the mission."""

        return self.send(
            message,
            type=MessageType.WARNING,
            target=target,
            delay=0.2
        )

    def notify_specialist_complete(self, session_id: str, role: str, summary: str) -> bool:
        """Notify Chief that a background specialist completed.

        Called by done() when specialist is in background mode.
        Uses tmux injection so Claude actually sees the message.
        """
        target = MessageTarget.by_role("chief")
        short_id = session_id[:8] if session_id else "unknown"

        message = f"[{_timestamp()}] [CLAUDE OS SYS: NOTIFICATION]: {role.title()} {short_id} complete\n\n{summary}"

        return self.send(
            message,
            type=MessageType.NOTIFICATION,
            target=target
        )

    def send_system_message(self, session_id: str, title: str, body: str) -> bool:
        """Send a system message to a specific session.

        Generic method for system-to-Claude notifications.
        Used by specialist flow completion, mission notifications, etc.
        """
        target = MessageTarget.by_session_id(session_id, self.db_path)
        if not target:
            # Fallback to Chief window if session not found
            target = MessageTarget.by_role("chief")

        message = f"[{_timestamp()}] [CLAUDE OS SYS: NOTIFICATION]: {title}\n\n{body}"

        return self.send(
            message,
            type=MessageType.NOTIFICATION,
            target=target
        )

    def send_initial_prompt(self, window_name: str, prompt: str) -> bool:
        """Send initial prompt when spawning a session."""
        target = MessageTarget.by_role(window_name)

        return self.send(
            prompt,
            type=MessageType.PROMPT,
            target=target,
            delay=0.3
        )


# Singleton instance
_messaging: Optional[MessagingService] = None


def get_messaging(db_path: Path) -> MessagingService:
    """Get or create messaging instance."""
    global _messaging
    if _messaging is None:
        _messaging = MessagingService(db_path)
    return _messaging
