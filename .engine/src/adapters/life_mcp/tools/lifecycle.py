"""CRITICAL: Claude's session lifecycle tools.

These tools MUST work even if other parts of the system are broken.
If these fail, Claude cannot end sessions, hand off, or report status.

Tools:
    - reset(summary, path): Refresh context - spawn fresh session, kill current
    - done(summary): Work complete - log and close session
    - status(text): Report what I'm doing (dashboard sidebar)

Design principles:
    - Minimal dependencies (only core.*, no domain imports at module level)
    - Domain imports inside functions (fail gracefully)
    - Extra error handling
    - Clear logging
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastmcp import FastMCP

from core.mcp_helpers import (
    PACIFIC,
    REPO_ROOT,
    SYSTEM_ROOT,
    get_db,
    get_current_session_id,
    get_current_session_role,
    derive_window_name,
)
from core.timeline import log_session_event

logger = logging.getLogger(__name__)

mcp = FastMCP("life-lifecycle")


# =============================================================================
# SSE EVENT NOTIFICATION
# =============================================================================

def _notify_backend_event(event_type: str, session_id: str, data: dict = None):
    """Notify the backend to emit an SSE event.

    MCP tools can't directly emit events to the SSE stream because they run
    in a different process than the FastAPI backend. This function bridges
    that gap by making an HTTP request to the backend's notify-event endpoint.
    """
    import urllib.request
    import json as json_module

    try:
        url = "http://localhost:5001/api/sessions/notify-event"
        payload = json_module.dumps({
            "event_type": event_type,
            "session_id": session_id,
            "data": data or {}
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=5) as response:
            pass  # Fire and forget

    except Exception as e:
        logger.debug(f"Backend notification failed (non-critical): {e}")


# =============================================================================
# STATUS TOOL
# =============================================================================

@mcp.tool()
def status(text: str) -> Dict[str, Any]:
    """Report what I'm doing (shows in Dashboard sidebar).

    Args:
        text: Brief description (3-5 words) e.g., "MCP consolidation", "API debugging"

    Returns:
        Object with success status
    """
    try:
        session_id = get_current_session_id()
        if not session_id:
            return {"success": False, "error": "No session ID found"}

        with get_db() as conn:
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "UPDATE sessions SET status_text = ?, updated_at = ? WHERE session_id = ?",
                (text, now, session_id)
            )
            conn.commit()

        _notify_backend_event("session.status", session_id, {"status_text": text})

        return {"success": True, "status": text}
    except Exception as e:
        logger.error(f"status() failed: {e}")
        return {"success": False, "error": str(e)}


# =============================================================================
# RESET TOOL
# =============================================================================

@mcp.tool()
def reset(summary: str) -> Dict[str, Any]:
    """Refresh context - spawn fresh me, kill current me.

    Use when:
    - Context running low (stop hook warns at 90%)
    - MCP changed (fresh session gets new imports)
    - Autonomous work at batch boundaries

    YOUR responsibility (before AND after calling reset):
    - Update specs/working files to reflect what actually happened
    - Log operational state to TODAY.md (timeline, open loops)
    - Clean Desktop/conversations/ (delete temp files, consolidate)

    SUMMARIZER handles (automatically):
    - Reading your transcript
    - Capturing conversational context (tone, callbacks, thread)
    - Writing tactical handoff for fresh Claude

    You handle operational truth. Summarizer handles conversation flow.

    After reset() returns, you have a cleanup window while summarizer runs.
    Use it. Pane dies when summarizer finishes.

    Args:
        summary: What was accomplished (logged to TODAY.md)

    Returns:
        Object with cleanup instructions. Pane dies after summarizer completes.
    """
    try:
        session_id = get_current_session_id()
        if not session_id:
            return {"success": False, "error": "No session ID found - cannot initiate reset"}

        role = get_current_session_role() or "builder"

        # Get session info and validate
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT role, mode, tmux_pane, conversation_id FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()

            if not row:
                return {"success": False, "error": f"Session {session_id} not found in database"}

            role = row["role"] or "chief"
            mode = row["mode"] or "interactive"
            tmux_pane = row["tmux_pane"]
            conversation_id = row["conversation_id"]

            # Check for pending handoff (rate limiting)
            cursor = conn.execute(
                "SELECT id FROM handoffs WHERE session_id = ? AND status IN ('pending', 'executing')",
                (session_id,)
            )
            if cursor.fetchone():
                return {"success": False, "error": "Reset already pending for this session"}

            # Log summary to Timeline
            log_session_event(summary, role, mode)

            # Create handoff record
            handoff_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()
            spec_path = os.environ.get("SPEC_PATH")

            # Handoff path placeholder - summarizer will update with actual path
            conn.execute("""
                INSERT INTO handoffs (
                    id, session_id, role, mode, tmux_pane, handoff_path, reason,
                    conversation_id, spec_path, status, requested_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
            """, (handoff_id, session_id, role, mode, tmux_pane, "auto", "reset", conversation_id, spec_path, now_iso, now_iso, now_iso))
            conn.commit()

        # Notify frontend that reset has been initiated
        _notify_backend_event("session.reset_initiated", session_id, {
            "handoff_id": handoff_id,
            "role": role,
            "mode": mode
        })

        # Spawn handoff executor (detached - runs summarizer, then kills pane)
        handoff_script = REPO_ROOT / ".engine/src/adapters/cli/handoff.py"
        python_path = REPO_ROOT / "venv/bin/python"

        logger.info(f"Spawning handoff executor: {handoff_id} for session {session_id} (role={role}, mode={mode})")

        # Run handoff.py - it logs to .engine/data/logs/handoff.log
        subprocess.Popen(
            [str(python_path), str(handoff_script), handoff_id],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        return {
            "success": True,
            "handoff_id": handoff_id[:8],
            "logged_to": "Timeline",
            "cleanup_window": "You have time while summarizer runs. Use it.",
            "before_pane_dies": [
                "Update specs/working files to reflect what actually happened",
                "Log operational state to TODAY.md (timeline, open loops)",
                "Clean Desktop/conversations/ (delete temp files, consolidate)",
            ],
            "summarizer_handles": "Conversational context and tactical handoff",
            "reminder": "✓ Handoff generating. Do cleanup now — pane dies when summarizer finishes."
        }

    except Exception as e:
        logger.error(f"reset() failed: {e}")
        return {"success": False, "error": str(e)}


# =============================================================================
# DONE TOOL
# =============================================================================

def _handle_mission_chief_completion(session_id: str, summary: str) -> Dict[str, Any]:
    """Handle mission-Chief completion: transition to interactive mode."""
    try:
        log_session_event(f"MISSION COMPLETE - {summary}", "chief", "mission")

        with get_db() as conn:
            cursor = conn.execute(
                "SELECT mission_execution_id FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            mission_execution_id = row["mission_execution_id"] if row else None

            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute("""
                UPDATE sessions
                SET mode = 'interactive',
                    status_text = 'Active',
                    updated_at = ?
                WHERE session_id = ?
            """, (now_iso, session_id))
            conn.commit()

            if mission_execution_id:
                conn.execute("""
                    UPDATE mission_executions
                    SET status = 'completed',
                        completed_at = ?
                    WHERE id = ?
                """, (now_iso, mission_execution_id))
                conn.commit()

        os.environ["CLAUDE_SESSION_MODE"] = "interactive"

        _notify_backend_event("mission.chief_completed", session_id, {})
        _notify_backend_event("session.mode_changed", session_id, {"mode": "interactive"})

        return {
            "success": True,
            "logged_to": "TODAY.md → System",
            "summary": summary,
            "reminder": "✓ Mission complete. Transitioned to interactive mode. Continue as normal Chief."
        }

    except Exception as e:
        logger.error(f"_handle_mission_chief_completion failed: {e}")
        return {"success": False, "error": str(e)}


def _spawn_next_mode(role: str, mode: str, conversation_id: str, description: str, spec_path: Optional[str] = None) -> Dict[str, Any]:
    """Spawn next specialist mode (implementation or verification)."""
    try:
        # Import SessionManager only when needed
        sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
        from modules.sessions import SessionManager

        manager = SessionManager(repo_root=REPO_ROOT)
        result = manager.spawn(
            role=role,
            mode=mode,
            conversation_id=conversation_id,
            description=description,
            spec_path=spec_path,
        )
        return result
    except Exception as e:
        logger.error(f"_spawn_next_mode failed: {e}")
        return type('Result', (), {'success': False, 'error': str(e)})()


def _notify_chief(conversation_id: str, role: str, summary: str, failed: bool = False):
    """Notify Chief about specialist completion."""
    try:
        with get_db() as conn:
            chief = conn.execute(
                """SELECT session_id FROM sessions
                   WHERE role = 'chief' AND ended_at IS NULL
                   ORDER BY started_at DESC LIMIT 1"""
            ).fetchone()

            if chief:
                from adapters.telegram.messaging import get_messaging
                messaging = get_messaging(SYSTEM_ROOT / "data/db/system.db")

                if failed:
                    messaging.send_system_message(
                        chief["session_id"],
                        f"Specialist FAILED - {role} ({conversation_id})",
                        f"{summary}\n\nWorkspace: Desktop/conversations/{conversation_id}/"
                    )
                else:
                    messaging.send_system_message(
                        chief["session_id"],
                        f"Specialist complete - {role} ({conversation_id})",
                        f"{summary}\n\nWorkspace: Desktop/conversations/{conversation_id}/"
                    )
    except Exception as e:
        logger.warning(f"Chief notification failed: {e}")


def _mark_session_ended(session_id: str, status_text: str = "Complete"):
    """Mark session as ended in database."""
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET status_text = ?, current_state = 'ended', ended_at = ?, updated_at = ? WHERE session_id = ?",
            (status_text, now_iso, now_iso, session_id)
        )
        conn.commit()


def _schedule_pane_kill(session_id: str):
    """Schedule tmux pane kill after delay."""
    with get_db() as conn:
        cursor = conn.execute("SELECT tmux_pane FROM sessions WHERE session_id = ?", (session_id,))
        row = cursor.fetchone()
        if row and row["tmux_pane"]:
            subprocess.Popen(
                ["bash", "-c", f"sleep 3 && tmux kill-pane -t {row['tmux_pane']}"],
                start_new_session=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )


@mcp.tool()
def done(
    summary: str,
    passed: Optional[bool] = None,
    feedback: Optional[str] = None,
    spec: Optional[str] = None,
    sprint: Optional[str] = None
) -> Dict[str, Any]:
    """Work complete - log, close session, and kill tmux pane.

    Special cases:
    - Chief in mission mode transitions to interactive (doesn't exit)
    - Specialist modes (preparation/implementation/verification) transition to next mode

    Use when work is finished (not handing off to another session).
    After logging and updating DB, the tmux pane closes after ~3 seconds.

    Args:
        summary: What was accomplished (logged to TODAY.md)
        passed: VERIFICATION mode only - did verification pass?
        feedback: VERIFICATION mode only - what to fix if failed
        spec: Spec path if working from one (validates recently modified)
        sprint: Sprint path if using one (validates recently modified)

    Returns:
        Object with success status. Pane closes ~3 seconds after return (or spawns next mode).
    """
    try:
        session_id = get_current_session_id()
        if not session_id:
            return {"success": False, "error": "No session ID found"}

        role = get_current_session_role() or "builder"
        mode = os.environ.get("CLAUDE_SESSION_MODE", "interactive")

        # SPECIAL CASE: Mission-Chief transitions to interactive mode
        if role == "chief" and mode == "mission":
            return _handle_mission_chief_completion(session_id, summary)

        # SPECIALIST MODE TRANSITIONS
        conversation_id = os.environ.get("CLAUDE_CONVERSATION_ID", "")

        if mode == "preparation":
            return _handle_preparation_done(session_id, role, conversation_id, summary)
        elif mode == "implementation":
            return _handle_implementation_done(session_id, role, conversation_id, summary)
        elif mode == "verification":
            return _handle_verification_done(session_id, role, conversation_id, summary, passed, feedback)

        # NORMAL COMPLETION
        return _handle_normal_done(session_id, role, mode, summary, spec, sprint)

    except Exception as e:
        logger.error(f"done() failed: {e}")
        return {"success": False, "error": str(e)}


def _handle_preparation_done(session_id: str, role: str, conversation_id: str, summary: str) -> Dict[str, Any]:
    """Handle preparation mode completion - validate plan.md and spawn implementation."""
    if not conversation_id:
        return {"success": False, "error": "No conversation_id - cannot transition"}

    workspace = REPO_ROOT / "Desktop/conversations" / conversation_id
    plan_file = workspace / "plan.md"

    if not plan_file.exists():
        return {"success": False, "error": "plan.md not found - preparation incomplete"}

    # Log to progress.md
    progress_file = workspace / "progress.md"
    timestamp = datetime.now(PACIFIC).strftime("%H:%M")
    with open(progress_file, "a") as f:
        f.write(f"\n=== PREPARATION at {timestamp} ===\n{summary}\n")

    # Spawn implementation mode (inherit spec_path from env)
    spec_path = os.environ.get("SPEC_PATH")
    result = _spawn_next_mode(role, "implementation", conversation_id, f"{role.title()} implementing", spec_path=spec_path)

    if result.success:
        log_session_event(summary, role, "preparation")
        _mark_session_ended(session_id)
        _notify_backend_event("session.ended", session_id, {"reason": "mode_transition"})
        _schedule_pane_kill(session_id)

        return {
            "success": True,
            "next_mode": "implementation",
            "spawned_session": result.session_id[:8],
            "reminder": "✓ Preparation complete. Implementation mode spawned."
        }
    else:
        return {"success": False, "error": f"Failed to spawn implementation: {result.error}"}


def _handle_implementation_done(session_id: str, role: str, conversation_id: str, summary: str) -> Dict[str, Any]:
    """Handle implementation mode completion - spawn verification."""
    if not conversation_id:
        return {"success": False, "error": "No conversation_id - cannot transition"}

    workspace = REPO_ROOT / "Desktop/conversations" / conversation_id
    progress_file = workspace / "progress.md"

    # Count iteration
    with get_db() as conn:
        cursor = conn.execute(
            """SELECT COUNT(*) as iter_count FROM sessions
               WHERE conversation_id = ? AND mode = 'implementation' AND ended_at IS NOT NULL""",
            (conversation_id,)
        )
        row = cursor.fetchone()
        iteration = (row["iter_count"] + 1) if row else 1

    # Log to progress.md
    timestamp = datetime.now(PACIFIC).strftime("%H:%M")
    with open(progress_file, "a") as f:
        f.write(f"\n=== IMPLEMENTATION (iteration {iteration}) at {timestamp} ===\n{summary}\nCalling for verification.\n")

    # Spawn verification mode (inherit spec_path from env)
    spec_path = os.environ.get("SPEC_PATH")
    result = _spawn_next_mode(role, "verification", conversation_id, f"{role.title()} verifying", spec_path=spec_path)

    if result.success:
        log_session_event(summary, role, "implementation")
        _mark_session_ended(session_id)
        _notify_backend_event("session.ended", session_id, {"reason": "mode_transition"})
        _schedule_pane_kill(session_id)

        return {
            "success": True,
            "next_mode": "verification",
            "spawned_session": result.session_id[:8],
            "iteration": iteration,
            "reminder": "✓ Implementation complete. Verification mode spawned."
        }
    else:
        return {"success": False, "error": f"Failed to spawn verification: {result.error}"}


def _handle_verification_done(session_id: str, role: str, conversation_id: str, summary: str, passed: Optional[bool], feedback: Optional[str]) -> Dict[str, Any]:
    """Handle verification mode completion - pass exits, fail loops back."""
    if passed is None:
        return {"success": False, "error": "Verification mode requires 'passed' parameter (True/False)"}

    if not conversation_id:
        return {"success": False, "error": "No conversation_id - cannot process verification"}

    workspace = REPO_ROOT / "Desktop/conversations" / conversation_id
    progress_file = workspace / "progress.md"
    timestamp = datetime.now(PACIFIC).strftime("%H:%M")

    if passed:
        # PASS - log success, notify Chief, exit
        with open(progress_file, "a") as f:
            f.write(f"\n=== VERIFICATION at {timestamp} ===\nPASS: {summary}\n")

        _notify_chief(conversation_id, role, summary)

        log_session_event(summary, role, "verification")
        _mark_session_ended(session_id)
        _notify_backend_event("session.ended", session_id, {"reason": "verification_passed"})
        _schedule_pane_kill(session_id)

        return {
            "success": True,
            "verification": "passed",
            "reminder": "✓ Verification passed. Work complete. Chief notified. Pane closing."
        }
    else:
        # FAIL - check iteration limit, maybe loop back
        if not feedback:
            return {"success": False, "error": "Verification failed requires 'feedback' parameter"}

        with open(progress_file, "a") as f:
            f.write(f"\n=== VERIFICATION at {timestamp} ===\nFAIL: {summary}\nFeedback: {feedback}\n")

        # Check iteration limit
        with get_db() as conn:
            cursor = conn.execute(
                """SELECT COUNT(*) as iter_count FROM sessions
                   WHERE conversation_id = ? AND mode = 'implementation' AND ended_at IS NOT NULL""",
                (conversation_id,)
            )
            row = cursor.fetchone()
            current_iteration = row["iter_count"] if row else 0

        max_iterations = 10  # TODO: Get from workspace config

        if current_iteration >= max_iterations:
            # Max iterations exceeded
            _notify_chief(conversation_id, role, f"Max iterations ({max_iterations}) reached.\n\n{summary}\n\nLast feedback: {feedback}", failed=True)

            log_session_event(f"FAILED: {summary}", role, "verification")
            _mark_session_ended(session_id, "Failed")
            _notify_backend_event("session.ended", session_id, {"reason": "max_iterations"})
            _schedule_pane_kill(session_id)

            return {
                "success": False,
                "verification": "failed_max_iterations",
                "iterations": current_iteration,
                "max_iterations": max_iterations,
                "error": f"Max iterations ({max_iterations}) reached. Work incomplete. Chief notified."
            }

        # Spawn implementation to fix issues (inherit spec_path from env)
        spec_path = os.environ.get("SPEC_PATH")
        result = _spawn_next_mode(role, "implementation", conversation_id, f"{role.title()} fixing issues", spec_path=spec_path)

        if result.success:
            log_session_event(summary, role, "verification")
            _mark_session_ended(session_id)
            _notify_backend_event("session.ended", session_id, {"reason": "mode_transition"})
            _schedule_pane_kill(session_id)

            return {
                "success": True,
                "verification": "failed_retry",
                "next_mode": "implementation",
                "spawned_session": result.session_id[:8],
                "feedback": feedback,
                "iteration": current_iteration + 1,
                "max_iterations": max_iterations,
                "reminder": "✗ Verification failed. Implementation mode respawned to address feedback."
            }
        else:
            return {"success": False, "error": f"Failed to spawn implementation: {result.error}"}


def _handle_normal_done(session_id: str, role: str, mode: str, summary: str, spec: Optional[str], sprint: Optional[str]) -> Dict[str, Any]:
    """Handle normal (non-specialist) session completion."""
    # Validate spec/sprint
    warnings = []
    now = datetime.now()
    for name, file_path in [("spec", spec), ("sprint", sprint)]:
        if file_path:
            full_path = REPO_ROOT / file_path
            if full_path.exists():
                mtime = datetime.fromtimestamp(full_path.stat().st_mtime)
                if (now - mtime).total_seconds() > 1800:
                    warnings.append(f"{name} file '{file_path}' not modified recently - did you update it?")
            else:
                warnings.append(f"{name} file '{file_path}' not found")

    # Log to Timeline
    log_session_event(summary, role, mode)

    # Get tmux_pane and update session
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT tmux_pane FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        row = cursor.fetchone()
        tmux_pane = row["tmux_pane"] if row else None

    _mark_session_ended(session_id, "Session complete")
    _notify_backend_event("session.ended", session_id, {"reason": "done"})

    # Background mode: notify Chief
    chief_notified = False
    if mode == "background":
        try:
            with get_db() as conn:
                chief = conn.execute(
                    """SELECT session_id FROM sessions
                       WHERE role = 'chief' AND ended_at IS NULL
                       ORDER BY started_at DESC LIMIT 1"""
                ).fetchone()

                if chief and chief["session_id"] != session_id:
                    from adapters.telegram.messaging import get_messaging
                    messaging = get_messaging(SYSTEM_ROOT / "data/db/system.db")
                    if messaging.notify_specialist_complete(session_id, role, summary):
                        chief_notified = True
        except Exception as e:
            logger.warning(f"Chief notification failed: {e}")

    # Kill tmux pane after delay
    if tmux_pane:
        subprocess.Popen(
            ["bash", "-c", f"sleep 3 && tmux kill-pane -t {tmux_pane}"],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    result = {
        "success": True,
        "logged_to": "Timeline",
        "summary": summary,
        "chief_notified": chief_notified,
        "reminder": "✓ Logged to Timeline. Pane will close in ~3 seconds."
    }

    if warnings:
        result["warnings"] = warnings

    return result
