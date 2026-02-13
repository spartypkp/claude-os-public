"""Stop handler - session mode reminders only.

Handles session-specific reminders:
- Background mode: remind to use mcp__life__done tool
- Specialist phases: remind about phase transitions

Context warnings are handled by ContextMonitor via TMUX injection.
This hook does NOT handle context warnings.
"""

import json
import sys
from datetime import datetime

from . import (
    get_db, get_session_id, now_iso,
    emit_session_state_event
)


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def handle(input_data: dict):
    """Handle Stop event - check for mode-specific reminders."""
    try:
        session_id = get_session_id(input_data)
        if not session_id:
            sys.exit(0)

        # Check if we're already in a stop hook continuation (prevents infinite loops)
        stop_hook_active = input_data.get('stop_hook_active', False)
        if stop_hook_active:
            mark_idle(session_id)
            sys.exit(0)

        # Check for session-specific reminders
        storage = get_db()
        reminder = get_session_reminder(storage, session_id)
        storage.close()

        if reminder:
            output = {
                "decision": "block",
                "reason": reminder
            }
            print(json.dumps(output))
        else:
            # No pending reminders - mark idle
            mark_idle(session_id)

    except Exception as e:
        print(f"Stop hook error: {e}", file=sys.stderr)
        try:
            mark_idle(get_session_id(input_data))
        except:
            pass

    sys.exit(0)


def get_session_reminder(storage, session_id: str) -> str | None:
    """Check if session needs a reminder before ending.

    Returns reminder message if needed, None otherwise.
    Only triggers once per session to avoid infinite loops.
    """
    try:
        result = storage.execute(
            "SELECT role, mode, has_pinged FROM sessions WHERE session_id = ?",
            (session_id,)
        ).fetchone()

        if not result:
            return None

        role = result[0] or 'chief'
        mode = result[1] or 'interactive'
        has_pinged = result[2] or 0

        # Background sessions should ping before ending
        if mode == 'background' and not has_pinged:
            # Mark as pinged to avoid repeat reminders
            storage.execute(
                "UPDATE sessions SET has_pinged = 1 WHERE session_id = ?",
                (session_id,)
            )

            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Reminder - Use mcp__life__done tool to end cleanly\n\n"
                "You're in background mode. Call the `mcp__life__done` tool with summary \"what you accomplished\" to:\n"
                "- Log your work\n"
                "- Auto-notify Chief\n"
                "- Close cleanly\n\n"
                "If you're waiting for workers to complete, ignore this and continue waiting."
            )

        # Specialist 3-mode loop: preparation, implementation, verification
        if mode == 'preparation' and not has_pinged:
            storage.execute(
                "UPDATE sessions SET has_pinged = 1 WHERE session_id = ?",
                (session_id,)
            )
            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Preparation phase reminder\n\n"
                "You're in **preparation** mode. After creating plan.md:\n\n"
                "Call the `mcp__life__done` tool with summary \"Plan created, ready for implementation\"\n\n"
                "This spawns Implementation mode to execute your plan."
            )

        if mode == 'implementation' and not has_pinged:
            storage.execute(
                "UPDATE sessions SET has_pinged = 1 WHERE session_id = ?",
                (session_id,)
            )
            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Implementation phase reminder\n\n"
                "You're in **implementation** mode. After completing the plan steps:\n\n"
                "Call the `mcp__life__done` tool with summary \"Implementation complete, ready for verification\"\n\n"
                "This spawns Verification mode to check your work."
            )

        if mode == 'verification' and not has_pinged:
            storage.execute(
                "UPDATE sessions SET has_pinged = 1 WHERE session_id = ?",
                (session_id,)
            )
            return (
                f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Verification phase reminder\n\n"
                "You're in **verification** mode. After checking all criteria:\n\n"
                "If all criteria pass: Call the `mcp__life__done` tool with summary \"All N criteria passed\", passed true\n\n"
                "If criteria fail: Call the `mcp__life__done` tool with summary \"M of N criteria met\", passed false, feedback \"What needs fixing\"\n\n"
                "passed true completes the work. passed false spawns another Implementation iteration."
            )

        return None

    except Exception as e:
        print(f"Warning: Failed to check session reminder: {e}", file=sys.stderr)
        return None


def mark_idle(session_id: str):
    """Mark session as idle in database and emit SSE event."""
    try:
        storage = get_db()
        now = now_iso()

        storage.execute("""
            UPDATE sessions
            SET last_seen_at = ?, current_state = 'idle'
            WHERE session_id = ?
        """, (now, session_id))

        storage.close()

        # Emit SSE event for real-time UI updates
        emit_session_state_event(session_id, 'idle')

    except Exception as e:
        print(f"Failed to mark session idle: {e}", file=sys.stderr)
