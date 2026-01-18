"""Stop handler - session reminders + context warnings.

Handles:
- Session-specific reminders (background mode ping reminder)
- Progressive context warnings (60% memory check → 80%/90%/95% reset)

Note: Worker notifications now handled via TMUX wakeup only.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

from . import (
    repo_root, get_db, get_session_id, now_iso,
    format_age, TaskService
)


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# Track context warnings to avoid repeat alerts
# Context warnings now tracked in database (context_warning_level column)
# This hook serves as backup when monitoring loop is down

# Progressive warning thresholds (in order)
# Each threshold triggers once per session
# 60% = memory hygiene check (not reset warning)
# 80%+ = reset warnings with increasing urgency
# Note: Same messages as ContextMonitor - this hook is backup
WARNING_THRESHOLDS = [
    (60, "memory"),    # Memory hygiene reminder (one-time)
    (80, "suggest"),   # First reset suggestion
    (90, "urgent"),    # Write reset notes NOW
    (95, "critical"),  # CRITICAL - reset immediately
]


def handle(input_data: dict):
    """Handle Stop event - extract text + check for task notifications + reminders."""
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
            debug_log(f"Blocking with reminder: {reminder[:50]}...")
            output = {
                "decision": "block",
                "reason": reminder
            }
            debug_log(f"Output: {json.dumps(output)}")
            print(json.dumps(output))
        else:
            # Check for progressive context warnings (60% memory → 80% suggest → 90% urgent → 95% critical)
            context_warning = get_context_warning(session_id)
            if context_warning:
                debug_log(f"Blocking with context warning")
                output = {
                    "decision": "block",
                    "reason": context_warning
                }
                print(json.dumps(output))
            else:
                debug_log(f"No reminder or warning for session, marking idle")
                # No pending notifications, reminders, or warnings - mark idle
                mark_idle(session_id)

    except Exception as e:
        print(f"Stop hook error: {e}", file=sys.stderr)
        try:
            mark_idle(get_session_id(input_data))
        except:
            pass

    sys.exit(0)


DEBUG_FILE = repo_root / ".engine/state/stop-reminder-debug.log"

def debug_log(msg: str):
    """Write debug message to log file."""
    try:
        from datetime import datetime
        with open(DEBUG_FILE, "a") as f:
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except:
        pass

def get_session_reminder(storage, session_id: str) -> str | None:
    """Check if session needs a reminder before ending.

    Returns reminder message if needed, None otherwise.
    Only triggers once per session to avoid infinite loops.
    """
    try:
        debug_log(f"get_session_reminder called for {session_id}")

        result = storage.execute(
            "SELECT role, mode, has_pinged FROM sessions WHERE session_id = ?",
            (session_id,)
        ).fetchone()

        if not result:
            debug_log(f"No session found for {session_id}")
            return None

        role = result[0] or 'chief'
        mode = result[1] or 'interactive'
        has_pinged = result[2] or 0

        debug_log(f"Session {session_id}: role={role}, mode={mode}, has_pinged={has_pinged}")

        # Background sessions should ping before ending
        if mode == 'background' and not has_pinged:
            debug_log(f"Triggering reminder for {session_id}")
            # Mark as pinged to avoid repeat reminders (autocommit mode, no commit needed)
            storage.execute(
                "UPDATE sessions SET has_pinged = 1 WHERE session_id = ?",
                (session_id,)
            )

            reminder_msg = (
                f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Reminder - Use done() to end cleanly\n\n"
                "You're in background mode. Use `done(summary=\"what you accomplished\")` to:\n"
                "- Log your work\n"
                "- Auto-notify Chief\n"
                "- Close cleanly\n\n"
                "If you're waiting for workers to complete, ignore this and continue waiting."
            )
            debug_log(f"Returning reminder: {reminder_msg[:30]}...")
            return reminder_msg

        # Chief should reset, not exit (but this is advisory, not enforcement)
        # The reset policy is documented but we don't hard-block - Chief knows the rules

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


def emit_session_state_event(session_id: str, state: str):
    """Fire-and-forget HTTP POST to backend to emit session.state SSE event."""
    try:
        import requests
        url = "http://localhost:5001/api/system/sessions/notify-event"
        payload = {
            "event_type": "session.state",
            "session_id": session_id,
            "data": {"state": state}
        }
        requests.post(url, json=payload, timeout=0.5)
    except Exception:
        pass  # Fire and forget - don't block on failures


# Context warning helpers

def get_context_percent(session_id: str) -> int | None:
    """Get context percentage by parsing Claude Code's native warning.

    Uses claude_status.py to parse the authoritative "Context low (X% remaining)"
    warning from tmux pane content.

    Returns percent USED (not remaining), or None if no warning detected.

    Note: This only returns a value when Claude Code shows its native warning
    (typically at 90%+ usage). Below that, returns None (context is healthy).
    """
    try:
        # Get tmux pane for this session
        storage = get_db()
        result = storage.execute(
            "SELECT tmux_pane FROM sessions WHERE session_id = ?",
            (session_id,)
        ).fetchone()
        storage.close()

        if not result or not result[0]:
            return None

        tmux_pane = result[0]

        # Import and use claude_status module
        import sys
        sys.path.insert(0, str(repo_root / ".engine" / "src"))
        from services.claude_status import get_session_claude_status

        # Parse status from tmux pane
        status = get_session_claude_status(tmux_pane)

        if not status or not status.context_warning:
            # No warning detected - context is healthy (below 90%)
            return None

        # Return percent USED (not remaining)
        return status.context_percent_used

    except Exception as e:
        debug_log(f"Failed to get context percent: {e}")
        return None


# Removed: get_warning_level_shown() and set_warning_level_shown()
# Now using database column sessions.context_warning_level


def is_autonomous_mode(session_id: str) -> bool:
    """Check if session is in autonomous/background mode (needs earlier warnings)."""
    try:
        storage = get_db()
        result = storage.execute(
            "SELECT mode FROM sessions WHERE session_id = ?",
            (session_id,)
        ).fetchone()
        storage.close()

        if result:
            mode = result[0] or 'interactive'
            return mode in ('background', 'mission', 'autonomous')
        return False
    except Exception:
        return False


def get_warning_message(percent: int, severity: str, is_autonomous: bool) -> str:
    """Generate appropriate warning message based on severity level."""

    mode_note = ""
    if is_autonomous:
        mode_note = "\n\n**AUTONOMOUS MODE:** No human backup. Reset early or risk getting stuck."

    if severity == "memory":
        # Memory hygiene check - NOT a reset warning
        # This is a gentle "are you being a good Claude?" nudge
        return (
            f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Memory check ({percent}% context used)\n\n"
            f"You're building up context. Make sure you're externalizing:\n"
            f"- Current state → Desktop/working/[your-file].md\n"
            f"- Observations → MEMORY.md (Chief section)\n"
            f"- Decisions → Reference specs, don't keep in head\n\n"
            f"Good Claudes externalize context early and often."
        )

    elif severity == "suggest":
        # First reset suggestion - advisory, not urgent
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
        # Time to act - write reset notes NOW
        return (
            f"[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context at {percent}% - URGENT\n\n"
            f"You're approaching context limits. Stop current task at a clean boundary.\n\n"
            f"**Reset protocol required:**\n\n"
            f"1. Save minimal state to Desktop/working/[file].md (what you're doing, key files, next step)\n"
            f"2. `reset(summary=\"...\", path=\"Desktop/working/[file].md\", reason=\"context_low\")`\n\n"
            f"Do NOT attempt more implementation. Your successor continues from your notes.{mode_note}"
        )

    elif severity == "critical":
        # CRITICAL - reset immediately, no more work
        return (
            f"[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context at {percent}% - CRITICAL\n\n"
            f"**RESET IMMEDIATELY OR YOU WILL BE STUCK.**\n\n"
            f"1. Write ONE sentence to Desktop/working/emergency-reset.md (what you're doing)\n"
            f"2. `reset(summary=\"Emergency reset at {percent}%\", path=\"Desktop/working/emergency-reset.md\", reason=\"context_low\")`\n\n"
            f"Your successor will figure it out. RESET NOW.{mode_note}"
        )

    return f"Context at {percent}%"


def get_context_warning(session_id: str) -> str | None:
    """Check if context warning should be shown (backup to monitoring loop).

    Returns warning message if a new threshold has been crossed, None otherwise.
    Uses progressive thresholds:
    - 60%: Memory hygiene reminder (not reset warning)
    - 80%: First reset suggestion
    - 90%: Urgent - write reset notes NOW
    - 95%: Critical - reset immediately

    Each threshold triggers exactly once per session.
    In autonomous mode (background/mission), thresholds shift down by 10%.
    """
    try:
        percent = get_context_percent(session_id)
        if percent is None:
            return None

        # Get from database (not tmp file)
        storage = get_db()
        result = storage.fetchone(
            "SELECT context_warning_level, mode FROM sessions WHERE session_id = ?",
            (session_id,)
        )

        if not result:
            storage.close()
            return None

        already_warned = result['context_warning_level'] or 0
        mode = result['mode'] or 'interactive'
        is_autonomous = mode in ('background', 'mission', 'autonomous')

        # Autonomous mode: shift thresholds down by 10%
        # (60% becomes effective at 50%, etc.)
        threshold_offset = 10 if is_autonomous else 0

        # Check thresholds in reverse order (highest first) to find the active one
        for threshold, severity in reversed(WARNING_THRESHOLDS):
            effective_threshold = threshold - threshold_offset

            if percent >= effective_threshold and already_warned < threshold:
                # Update database
                storage.execute(
                    "UPDATE sessions SET context_warning_level = ? WHERE session_id = ?",
                    (threshold, session_id)
                )
                storage.close()
                return get_warning_message(percent, severity, is_autonomous)

        storage.close()
        return None
    except Exception as e:
        debug_log(f"Context warning check failed: {e}")
        return None
