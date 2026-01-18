"""UserPromptSubmit handler - Heartbeat + context warnings + wakeup trigger.

Handles:
- Session heartbeat (last_seen_at, current_state)
- Context % warnings
- Session status reminders
- TMUX wakeup trigger (worker notification via message injection)

Note: Worker notifications now use TMUX wakeup, not hook injection.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

from . import (
    repo_root, get_db, get_session_id, now_iso,
    format_age, truncate_summary, TaskService, PACIFIC_TZ
)


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


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


def get_context_percent() -> int:
    """Read context % from Claude Code's temp file.

    File location: /tmp/claude-status/{session_id[:8]}.txt
    Format: PERCENT|COST|MODEL (e.g., "45|1.23|opus")

    Returns 0 if file doesn't exist or can't be read.
    """
    session_id = os.environ.get('CLAUDE_SESSION_ID', '')
    if not session_id:
        return 0

    short_id = session_id[:8]
    status_file = Path(f"/tmp/claude-status/{short_id}.txt")

    if status_file.exists():
        try:
            content = status_file.read_text().strip()
            if "|" in content:
                return int(content.split("|")[0])
        except (ValueError, IOError):
            pass

    return 0


def format_context_warning() -> str | None:
    """Return context warning message if context % is high enough."""
    context_pct = get_context_percent()

    if context_pct >= 80:
        return f"[{_timestamp()}] [CLAUDE OS SYS: WARNING]: Context at {context_pct}% - Write reset notes and prepare to transition"
    elif context_pct >= 60:
        return f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Context at {context_pct}% - Consider writing reset notes soon"

    return None


def handle(input_data: dict):
    """Handle UserPromptSubmit - heartbeat + task notifications."""
    try:
        session_id = get_session_id(input_data)
        if not session_id:
            sys.exit(0)

        message = input_data.get('message', '') or input_data.get('prompt', '')

        # Check for wake-up trigger first
        wake_up_trigger = "[CLAUDE OS SYS: NOTIFICATION]: Workers complete"
        if message.startswith(wake_up_trigger):
            response = handle_wakeup_trigger(session_id)
            if response:
                print(json.dumps(response))
                sys.exit(0)

        storage = get_db()
        now = now_iso()

        # Update heartbeat
        storage.execute("""
            UPDATE sessions
            SET last_seen_at = ?, current_state = 'active', updated_at = ?
            WHERE session_id = ?
        """, (now, now, session_id))

        # Emit SSE event for real-time UI updates
        emit_session_state_event(session_id, 'active')

        # Build notification output
        output_sections = []

        # Check for missing session_status
        status_reminder = check_session_status_reminder(storage, session_id)
        if status_reminder:
            output_sections.append(status_reminder)

        # Check context % and add warning if high
        context_warning = format_context_warning()
        if context_warning:
            # Insert at beginning so it's seen first
            output_sections.insert(0, context_warning)

        if output_sections:
            print("\n\n".join(output_sections))

        storage.close()

    except Exception as e:
        print(f"UserPromptSubmit hook error: {e}", file=sys.stderr)

    sys.exit(0)


def handle_wakeup_trigger(session_id: str) -> dict:
    """Handle wake-up trigger by getting completed tasks for conversation.

    Uses hookSpecificOutput.additionalContext to inject task summary into
    Claude's context (not block, which only shows to user).

    Uses conversation-scoped queries so notifications survive resets.
    """
    try:
        storage = get_db()
        task_service = TaskService(storage)

        # Get conversation_id for this session
        result = storage.fetchone(
            "SELECT conversation_id FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        conversation_id = result['conversation_id'] if result else None

        if not conversation_id:
            storage.close()
            return {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": "⚠️ Wake-up triggered but no conversation_id found."
                }
            }

        # Use conversation-scoped queries
        completed_tasks = task_service.get_notified_but_unacked_for_conversation(conversation_id)
        new_completed = task_service.get_unnotified_for_conversation(conversation_id)
        all_tasks = new_completed + completed_tasks

        # Mark new tasks as notified to this conversation
        if new_completed or completed_tasks:
            all_task_ids = [t['id'] for t in all_tasks]
            task_service.mark_conversation_notified(conversation_id, all_task_ids)

        storage.close()

        if all_tasks:
            task_count = len(all_tasks)
            summary = format_wakeup_summary(all_tasks)
            context = f"""📬 {task_count} task{'s' if task_count != 1 else ''} completed and ready for review:

{summary}

Review these results and acknowledge with worker_ack() when processed."""
            return {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": context
                }
            }
        else:
            return {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": "⚠️ Wake-up triggered but no completed tasks found for this session."
                }
            }

    except Exception as e:
        return {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": f"⚠️ Error retrieving task status: {e}"
            }
        }


def format_running(tasks: list) -> str:
    """Format compact display of in-progress tasks."""
    count = len(tasks)
    task_word = "task" if count == 1 else "tasks"

    lines = [f"🔄 {count} {task_word} in progress:"]
    for task in tasks[:10]:
        runtime = format_runtime(task.get('started_at'))
        summary = truncate_summary(task.get('summary', 'Running task'), max_length=60)
        lines.append(f"• {task['short_id']} ({task['type']}) - {summary} [{runtime}]")

    if len(tasks) > 10:
        lines.append(f"...and {len(tasks) - 10} more")

    return "\n".join(lines)


def format_pending(tasks: list) -> str:
    """Format compact display of pending tasks."""
    count = len(tasks)
    task_word = "task" if count == 1 else "tasks"

    lines = [f"⏳ {count} {task_word} pending:"]
    for task in tasks[:10]:
        summary = truncate_summary(task.get('summary', 'Pending task'), max_length=50)
        waiting_reason = task.get('waiting_reason', 'waiting')
        lines.append(f"• {task['short_id']} ({task['type']}) - {summary} ({waiting_reason})")

    if len(tasks) > 10:
        lines.append(f"...and {len(tasks) - 10} more")

    return "\n".join(lines)


def format_runtime(started_at) -> str:
    """Format time since task started."""
    if not started_at:
        return "running"

    try:
        if isinstance(started_at, str):
            started_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        else:
            started_dt = started_at

        if started_dt.tzinfo is None:
            started_dt = started_dt.replace(tzinfo=PACIFIC_TZ)

        now_pacific = datetime.now(PACIFIC_TZ)
        started_pacific = started_dt.astimezone(PACIFIC_TZ)

        delta = now_pacific - started_pacific
        total_seconds = delta.total_seconds()

        if total_seconds < 3600:
            minutes = int(total_seconds / 60)
            return f"{minutes}m running"
        elif total_seconds < 86400:
            hours = int(total_seconds / 3600)
            return f"{hours}h running"
        else:
            days = int(total_seconds / 86400)
            return f"{days}d running ⚠️"
    except Exception:
        return "running"


def format_wakeup_summary(tasks: list) -> str:
    """Format a concise summary of tasks for wake-up notification."""
    lines = []
    for task in tasks[:5]:
        age = format_age(task.get('completed_at'))
        summary = truncate_summary(task.get('summary', 'No summary'), max_length=60)
        lines.append(f"• {task['short_id']} ({task['type']}) - {summary} [{age}]")

    if len(tasks) > 5:
        lines.append(f"...and {len(tasks) - 5} more")

    return "\n".join(lines)


def check_session_status_reminder(storage, session_id: str) -> str | None:
    """Check if session is missing status_text and should be reminded."""
    try:
        result = storage.execute("""
            SELECT status_text, created_at
            FROM sessions
            WHERE session_id = ?
        """, (session_id,)).fetchone()

        if not result:
            return None

        status_text, created_at = result

        if status_text and status_text.strip():
            return None

        # Check if session has been active for at least 2 minutes
        if created_at:
            try:
                if isinstance(created_at, str):
                    created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    created_dt = created_at

                if created_dt.tzinfo is None:
                    created_dt = created_dt.replace(tzinfo=PACIFIC_TZ)

                now_pacific = datetime.now(PACIFIC_TZ)
                created_pacific = created_dt.astimezone(PACIFIC_TZ)

                age_seconds = (now_pacific - created_pacific).total_seconds()

                if age_seconds < 120:
                    return None
            except:
                pass

        return f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Consider setting a session status with `status(\"what you're working on\")` so the user can see at a glance"

    except Exception:
        return None
