"""Core MCP tools: team, reset, done, status, service, mission."""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import uuid
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from tools.helpers import (
    PACIFIC,
    REPO_ROOT,
    SYSTEM_ROOT,
    get_db,
    get_services,
    get_current_session_id,
    get_current_session_role,
    get_current_session_mode,
    get_current_conversation_id,
    get_conversation_id,
    derive_window_name,
    resolve_short_id,
)
from utils.timeline import log_session_event

mcp = FastMCP("life-core")


# =============================================================================
# SSE EVENT NOTIFICATION
# =============================================================================
# MCP tools run in Claude Code's process, which is SEPARATE from the FastAPI
# backend. The event_bus in this process has NO subscribers - subscribers are
# in the backend process. So we need to HTTP POST to the backend to emit events.
# =============================================================================

def _notify_backend_event(event_type: str, session_id: str, data: dict = None):
    """Notify the backend to emit an SSE event.

    MCP tools can't directly emit events to the SSE stream because they run
    in a different process than the FastAPI backend. This function bridges
    that gap by making an HTTP request to the backend's notify-event endpoint.

    Args:
        event_type: Event type (e.g., "session.started", "session.ended")
        session_id: The session ID this event relates to
        data: Additional event data (role, mode, reason, etc.)
    """
    import urllib.request
    import json as json_module

    try:
        url = "http://localhost:5001/api/system/sessions/notify-event"
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
            pass  # We don't need the response, just fire and forget

    except Exception:
        pass  # Best effort - don't break MCP tool if backend is down


# =============================================================================
# PING - REMOVED
# =============================================================================
# ping() was removed in Jan 2026 tools audit.
# Notification logic moved into done() - background specialists now notify
# Chief automatically when they complete via done().
# =============================================================================


# ============================================================================
# CONSOLIDATED TOOLS (Phase 1 - MCP Consolidation)
# ============================================================================

# ----------------------------------------------------------------------------
# TEAM TOOL (Consolidated) - CHIEF ONLY
# Replaces: session_spawn, session_list, session_peek, session_close
# Role restriction at tool level
# ----------------------------------------------------------------------------


@mcp.tool()
def team(
    operation: str,
    id: Optional[str] = None,
    role: Optional[str] = None,
    spec_path: Optional[str] = None,
    max_iterations: int = 10,
    description: Optional[str] = None,
    project_path: Optional[str] = None,
    lines: int = 50,
) -> Dict[str, Any]:
    """Team orchestration (spawn, monitor, close team members). **Chief only.**

    Args:
        operation: Operation - 'spawn', 'list', 'peek', 'close'
        id: Team member ID (required for peek, close)
        role: Session role for spawn - 'builder', 'deep-work', 'project', 'idea'
        spec_path: Path to spec file (REQUIRED for spawn) - Specialist flow starts at preparation
        max_iterations: Max specialist iterations before giving up (default 10)
        description: Status text for dashboard
        project_path: For 'project' role - path to target project
        lines: Number of lines to capture for peek (default 50)

    Returns:
        Object with success status and operation-specific data

    Examples:
        team("spawn", role="builder", spec_path="Desktop/working/api-bug-spec.md")
        team("spawn", role="deep-work", spec_path="Desktop/working/research-spec.md", max_iterations=5)
        team("list")
        team("peek", id="abc12345")
        team("close", id="abc12345")
    """
    # Chief only - role check at tool level
    caller_role = get_current_session_role()
    if caller_role != "chief":
        return {
            "success": False,
            "error": f"team() is Chief only. Your role: {caller_role or 'unknown'}"
        }

    try:
        if operation == "spawn":
            if not role:
                return {"success": False, "error": "role required for spawn"}
            if not spec_path:
                return {"success": False, "error": "spec_path required for spawn (specialist flow)"}

            # Validate spec exists
            full_spec_path = REPO_ROOT / spec_path
            if not full_spec_path.exists():
                return {"success": False, "error": f"Spec not found: {spec_path}"}

            # Generate conversation_id for specialist workspace
            conversation_id = f"{role}-{uuid.uuid4().hex[:8]}"
            workspace = REPO_ROOT / "Desktop/working" / conversation_id
            workspace.mkdir(parents=True, exist_ok=True)

            # Copy spec to workspace
            import shutil
            shutil.copy(full_spec_path, workspace / "spec.md")

            # Create empty progress.md
            timestamp = datetime.now(PACIFIC).strftime("%Y-%m-%d %H:%M")
            (workspace / "progress.md").write_text(f"# Progress Log\n\nStarted: {timestamp}\nMax iterations: {max_iterations}\n\n")

            # Spawn in preparation mode
            sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
            from services import SessionManager

            manager = SessionManager(repo_root=REPO_ROOT)
            result = manager.spawn(
                role=role,
                mode="preparation",
                conversation_id=conversation_id,
                description=description or f"{role.title()} preparing",
                project_path=project_path,
            )

            if result.success:
                # Emit SSE event for Dashboard real-time update
                _notify_backend_event("session.started", result.session_id, {
                    "role": role,
                    "mode": "preparation",
                    "conversation_id": conversation_id,
                    "window": result.window_name,
                    "description": description,
                    "specialist_mode": True,
                })

                return {
                    "success": True,
                    "session_id": result.session_id[:8],
                    "window_name": result.window_name,
                    "conversation_id": conversation_id,
                    "workspace": f"Desktop/working/{conversation_id}/",
                    "reminder": f"✓ Specialist flow started. Preparation mode. Workspace: Desktop/working/{conversation_id}/"
                }
            else:
                return {"success": False, "error": result.error}

        elif operation == "list":
            with get_db() as conn:
                cursor = conn.execute("""
                    SELECT session_id, role, status_text, started_at, last_seen_at
                    FROM sessions
                    WHERE ended_at IS NULL
                    ORDER BY started_at DESC
                """)
                rows = cursor.fetchall()

            sessions = []
            for row in rows:
                r = row["role"] or "unknown"
                sid = row["session_id"]
                sessions.append({
                    "id": sid[:8],
                    "role": r,
                    "status": row["status_text"],
                    "window": derive_window_name(r, sid),
                    "started": row["started_at"],
                    "last_seen": row["last_seen_at"]
                })

            return {"success": True, "sessions": sessions, "count": len(sessions)}

        elif operation == "peek":
            if not id:
                return {"success": False, "error": "id required for peek"}

            with get_db() as conn:
                cursor = conn.execute(
                    "SELECT session_id, role FROM sessions WHERE session_id LIKE ?",
                    (f"{id}%",)
                )
                row = cursor.fetchone()

            if not row:
                return {"success": False, "error": f"Session {id} not found"}

            r = row["role"] or "unknown"
            full_id = row["session_id"]
            window_name = derive_window_name(r, full_id)

            result = subprocess.run(
                ["tmux", "capture-pane", "-p", "-t", f"life:{window_name}", "-S", f"-{lines}"],
                capture_output=True, text=True, timeout=5
            )

            if result.returncode != 0:
                return {"success": False, "error": f"Failed to capture pane: {result.stderr.strip()}"}

            return {
                "success": True,
                "session_id": id,
                "full_id": full_id,
                "role": r,
                "window": window_name,
                "output": result.stdout,
                "lines": lines
            }

        elif operation == "close":
            if not id:
                return {"success": False, "error": "id required for close"}

            with get_db() as conn:
                cursor = conn.execute(
                    "SELECT session_id, role, ended_at FROM sessions WHERE session_id LIKE ?",
                    (f"{id}%",)
                )
                row = cursor.fetchone()

                if not row:
                    return {"success": False, "error": f"Session {id} not found"}

                full_id = row["session_id"]
                r = row["role"] or "unknown"
                window = derive_window_name(r, full_id)
                already_ended = row["ended_at"] is not None

                if r == "chief":
                    return {"success": False, "error": "Cannot close Chief's window - it persists"}

                if not already_ended:
                    now = datetime.now(timezone.utc).isoformat()
                    conn.execute(
                        "UPDATE sessions SET ended_at = ? WHERE session_id = ?",
                        (now, full_id)
                    )
                    conn.commit()

                    # Emit SSE event for Dashboard real-time update
                    _notify_backend_event("session.ended", full_id, {"reason": "close"})

            window_killed = False
            if window:
                try:
                    result = subprocess.run(
                        ["tmux", "kill-window", "-t", f"life:{window}"],
                        capture_output=True,
                        timeout=5
                    )
                    window_killed = result.returncode == 0
                except Exception:
                    pass

            return {
                "success": True,
                "session_id": id,
                "full_id": full_id,
                "role": r,
                "window": window,
                "was_already_ended": already_ended,
                "window_killed": window_killed,
                "reminder": "Closed. Verify their work is logged and specs are current."
            }

        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use spawn, list, peek, or close."}

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timeout during operation"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@mcp.tool()
def reset(
    summary: str,
    path: str,
    reason: str = "context_low",
    spec: Optional[str] = None,
    sprint: Optional[str] = None
) -> Dict[str, Any]:
    """Refresh context - spawn fresh me, kill current me.

    Use when:
    - Context running low
    - MCP changed (fresh session gets new imports)
    - Autonomous work at batch boundaries

    Before calling:
    1. Write handoff notes to path
    2. Optionally update spec/sprint files

    Args:
        summary: What was accomplished (logged to TODAY.md)
        path: Handoff document path (e.g., "Workspace/working/my-work.md")
        reason: Why - 'context_low', 'chief_cycle', 'mcp_refresh'
        spec: Spec path if working from one (validates recently modified)
        sprint: Sprint path if using one (validates recently modified)

    Returns:
        Object with success status. Session ends ~5 seconds after success.
    """
    try:
        import subprocess

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
            conversation_id = row["conversation_id"]  # Inherit for continuity

            # Check for pending handoff (rate limiting)
            cursor = conn.execute(
                "SELECT id FROM handoffs WHERE session_id = ? AND status IN ('pending', 'executing')",
                (session_id,)
            )
            if cursor.fetchone():
                return {"success": False, "error": "Reset already pending for this session"}

            # NOTE: Worker blocking removed (Jan 2026)
            # Workers belong to conversation_id, not session_id.
            # New session inherits workers via conversation_id, no orphaning.

            # Validate spec/sprint were recently modified (within last 30 min)
            warnings = []
            now = datetime.now()
            for name, file_path in [("spec", spec), ("sprint", sprint)]:
                if file_path:
                    full_path = REPO_ROOT / file_path
                    if full_path.exists():
                        mtime = datetime.fromtimestamp(full_path.stat().st_mtime)
                        if (now - mtime).total_seconds() > 1800:  # 30 minutes
                            warnings.append(f"{name} file '{file_path}' not modified recently - did you update it?")
                    else:
                        warnings.append(f"{name} file '{file_path}' not found")

            # Log summary to Timeline
            log_session_event(summary, role, mode)

            # Create handoff record (includes conversation_id for inheritance)
            handoff_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()

            conn.execute("""
                INSERT INTO handoffs (
                    id, session_id, role, mode, tmux_pane, handoff_path, reason,
                    conversation_id, status, requested_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
            """, (handoff_id, session_id, role, mode, tmux_pane, path, reason, conversation_id, now_iso, now_iso, now_iso))
            conn.commit()

        # Spawn handoff executor
        handoff_script = REPO_ROOT / ".engine/src/cli/handoff.py"
        python_path = REPO_ROOT / "venv/bin/python"

        subprocess.Popen(
            [str(python_path), str(handoff_script), handoff_id],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        result = {
            "success": True,
            "handoff_id": handoff_id[:8],
            "logged_to": "Timeline",
            "handoff_path": path,
            "reminder": "✓ Logged to Timeline. Fresh session incoming!"
        }

        if warnings:
            result["warnings"] = warnings

        return result

    except Exception as e:
        return {"success": False, "error": str(e)}


def _handle_mission_chief_completion(session_id: str, summary: str) -> Dict[str, Any]:
    """Handle mission-Chief completion: transition to interactive mode.

    Mission-Chief doesn't exit after done() - it flips to interactive mode
    and continues as the day's Chief session.
    """
    try:
        # Log to Timeline
        log_session_event(f"MISSION COMPLETE - {summary}", "chief", "mission")

        # Get mission_execution_id to mark it complete
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT mission_execution_id FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            mission_execution_id = row["mission_execution_id"] if row else None

            # Update session: flip to interactive mode
            now_iso = datetime.now(timezone.utc).isoformat()
            conn.execute("""
                UPDATE sessions
                SET mode = 'interactive',
                    status_text = 'Active',
                    updated_at = ?
                WHERE session_id = ?
            """, (now_iso, session_id))
            conn.commit()

            # Mark mission execution as complete
            if mission_execution_id:
                conn.execute("""
                    UPDATE mission_executions
                    SET status = 'completed',
                        completed_at = ?
                    WHERE id = ?
                """, (now_iso, mission_execution_id))
                conn.commit()

        # Update environment variable so this session knows it's interactive now
        os.environ["CLAUDE_SESSION_MODE"] = "interactive"

        # Emit events for Dashboard via HTTP (MCP runs in separate process)
        _notify_backend_event("mission.chief_completed", session_id, {})
        _notify_backend_event("session.mode_changed", session_id, {"mode": "interactive"})

        return {
            "success": True,
            "logged_to": "TODAY.md → System",
            "summary": summary,
            "reminder": "✓ Mission complete. Transitioned to interactive mode. Continue as normal Chief."
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


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
        import subprocess

        session_id = get_current_session_id()
        if not session_id:
            return {"success": False, "error": "No session ID found"}

        role = get_current_session_role() or "builder"
        mode = os.environ.get("CLAUDE_SESSION_MODE", "interactive")

        # SPECIAL CASE: Mission-Chief transitions to interactive mode
        if role == "chief" and mode == "mission":
            return _handle_mission_chief_completion(session_id, summary)

        # SPECIALIST MODE TRANSITIONS (preparation → implementation → verification)
        conversation_id = os.environ.get("CLAUDE_CONVERSATION_ID", "")

        if mode == "preparation":
            # PREPARATION MODE: Validate plan.md and spawn implementation
            if not conversation_id:
                return {"success": False, "error": "No conversation_id - cannot transition"}

            workspace = REPO_ROOT / "Desktop/working" / conversation_id
            plan_file = workspace / "plan.md"

            if not plan_file.exists():
                return {"success": False, "error": "plan.md not found - preparation incomplete"}

            # Log to progress.md
            progress_file = workspace / "progress.md"
            timestamp = datetime.now(PACIFIC).strftime("%H:%M")
            with open(progress_file, "a") as f:
                f.write(f"\n=== PREPARATION at {timestamp} ===\n{summary}\n")

            # Spawn implementation mode
            sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
            from services import SessionManager

            manager = SessionManager(repo_root=REPO_ROOT)
            result = manager.spawn(
                role=role,
                mode="implementation",
                conversation_id=conversation_id,
                description=f"{role.title()} implementing"
            )

            if result.success:
                # Mark current session as ended
                log_session_event(summary, role, mode)
                now_iso = datetime.now(timezone.utc).isoformat()
                with get_db() as conn:
                    conn.execute(
                        "UPDATE sessions SET status_text = 'Complete', current_state = 'ended', ended_at = ?, updated_at = ? WHERE session_id = ?",
                        (now_iso, now_iso, session_id)
                    )
                    conn.commit()

                _notify_backend_event("session.ended", session_id, {"reason": "mode_transition"})

                # Schedule pane kill
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

                return {
                    "success": True,
                    "next_mode": "implementation",
                    "spawned_session": result.session_id[:8],
                    "reminder": "✓ Preparation complete. Implementation mode spawned."
                }
            else:
                return {"success": False, "error": f"Failed to spawn implementation: {result.error}"}

        elif mode == "implementation":
            # IMPLEMENTATION MODE: Log progress and spawn verification
            if not conversation_id:
                return {"success": False, "error": "No conversation_id - cannot transition"}

            workspace = REPO_ROOT / "Desktop/working" / conversation_id
            progress_file = workspace / "progress.md"

            # Count current iteration
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

            # Spawn verification mode
            sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
            from services import SessionManager

            manager = SessionManager(repo_root=REPO_ROOT)
            result = manager.spawn(
                role=role,
                mode="verification",
                conversation_id=conversation_id,
                description=f"{role.title()} verifying"
            )

            if result.success:
                # Mark current session as ended
                log_session_event(summary, role, mode)
                now_iso = datetime.now(timezone.utc).isoformat()
                with get_db() as conn:
                    conn.execute(
                        "UPDATE sessions SET status_text = 'Complete', current_state = 'ended', ended_at = ?, updated_at = ? WHERE session_id = ?",
                        (now_iso, now_iso, session_id)
                    )
                    conn.commit()

                _notify_backend_event("session.ended", session_id, {"reason": "mode_transition"})

                # Schedule pane kill
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

                return {
                    "success": True,
                    "next_mode": "verification",
                    "spawned_session": result.session_id[:8],
                    "iteration": iteration,
                    "reminder": "✓ Implementation complete. Verification mode spawned."
                }
            else:
                return {"success": False, "error": f"Failed to spawn verification: {result.error}"}

        elif mode == "verification":
            # VERIFICATION MODE: Requires passed parameter
            if passed is None:
                return {"success": False, "error": "Verification mode requires 'passed' parameter (True/False)"}

            if not conversation_id:
                return {"success": False, "error": "No conversation_id - cannot process verification"}

            workspace = REPO_ROOT / "Desktop/working" / conversation_id
            progress_file = workspace / "progress.md"
            timestamp = datetime.now(PACIFIC).strftime("%H:%M")

            if passed:
                # PASS - log success, notify Chief, and exit
                with open(progress_file, "a") as f:
                    f.write(f"\n=== VERIFICATION at {timestamp} ===\nPASS: {summary}\n")

                # Notify Chief of completion
                try:
                    with get_db() as conn:
                        chief = conn.execute(
                            """SELECT session_id FROM sessions
                               WHERE role = 'chief' AND ended_at IS NULL
                               ORDER BY started_at DESC LIMIT 1"""
                        ).fetchone()

                        if chief:
                            from services.messaging import get_messaging
                            messaging = get_messaging(SYSTEM_ROOT / "data/db/system.db")
                            messaging.send_system_message(
                                chief["session_id"],
                                f"Specialist complete - {role} ({conversation_id})",
                                f"{summary}\n\nWorkspace: Desktop/working/{conversation_id}/"
                            )
                except Exception as e:
                    print(f"Chief notification failed: {e}", file=sys.stderr)

                # Normal exit
                log_session_event(summary, role, mode)
                now_iso = datetime.now(timezone.utc).isoformat()
                with get_db() as conn:
                    conn.execute(
                        "UPDATE sessions SET status_text = 'Complete', current_state = 'ended', ended_at = ?, updated_at = ? WHERE session_id = ?",
                        (now_iso, now_iso, session_id)
                    )
                    conn.commit()

                _notify_backend_event("session.ended", session_id, {"reason": "verification_passed"})

                # Schedule pane kill
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

                return {
                    "success": True,
                    "verification": "passed",
                    "reminder": "✓ Verification passed. Work complete. Chief notified. Pane closing."
                }

            else:
                # FAIL - log feedback and spawn implementation (or fail if max iterations)
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

                # TODO: Get max_iterations from workspace config or sessions table
                max_iterations = 10

                if current_iteration >= max_iterations:
                    # Max iterations exceeded - notify Chief and fail
                    try:
                        with get_db() as conn:
                            chief = conn.execute(
                                """SELECT session_id FROM sessions
                                   WHERE role = 'chief' AND ended_at IS NULL
                                   ORDER BY started_at DESC LIMIT 1"""
                            ).fetchone()

                            if chief:
                                from services.messaging import get_messaging
                                messaging = get_messaging(SYSTEM_ROOT / "data/db/system.db")
                                messaging.send_system_message(
                                    chief["session_id"],
                                    f"Specialist FAILED - {role} ({conversation_id})",
                                    f"Max iterations ({max_iterations}) reached without passing verification.\n\n{summary}\n\nLast feedback: {feedback}\n\nWorkspace: Desktop/working/{conversation_id}/"
                                )
                    except Exception as e:
                        print(f"Chief notification failed: {e}", file=sys.stderr)

                    # Exit
                    log_session_event(f"FAILED: {summary}", role, mode)
                    now_iso = datetime.now(timezone.utc).isoformat()
                    with get_db() as conn:
                        conn.execute(
                            "UPDATE sessions SET status_text = 'Failed', current_state = 'ended', ended_at = ?, updated_at = ? WHERE session_id = ?",
                            (now_iso, now_iso, session_id)
                        )
                        conn.commit()

                    _notify_backend_event("session.ended", session_id, {"reason": "max_iterations"})

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

                    return {
                        "success": False,
                        "verification": "failed_max_iterations",
                        "iterations": current_iteration,
                        "max_iterations": max_iterations,
                        "error": f"Max iterations ({max_iterations}) reached. Work incomplete. Chief notified."
                    }

                # Spawn implementation mode to fix issues
                sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
                from services import SessionManager

                manager = SessionManager(repo_root=REPO_ROOT)
                result = manager.spawn(
                    role=role,
                    mode="implementation",
                    conversation_id=conversation_id,
                    description=f"{role.title()} fixing issues"
                )

                if result.success:
                    # Mark current session as ended
                    log_session_event(summary, role, mode)
                    now_iso = datetime.now(timezone.utc).isoformat()
                    with get_db() as conn:
                        conn.execute(
                            "UPDATE sessions SET status_text = 'Complete', current_state = 'ended', ended_at = ?, updated_at = ? WHERE session_id = ?",
                            (now_iso, now_iso, session_id)
                        )
                        conn.commit()

                    _notify_backend_event("session.ended", session_id, {"reason": "mode_transition"})

                    # Schedule pane kill
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

        # Validate spec/sprint were recently modified
        warnings = []
        now = datetime.now()
        for name, file_path in [("spec", spec), ("sprint", sprint)]:
            if file_path:
                full_path = REPO_ROOT / file_path
                if full_path.exists():
                    mtime = datetime.fromtimestamp(full_path.stat().st_mtime)
                    if (now - mtime).total_seconds() > 1800:  # 30 minutes
                        warnings.append(f"{name} file '{file_path}' not modified recently - did you update it?")
                else:
                    warnings.append(f"{name} file '{file_path}' not found")

        # Log summary to Timeline
        log_result = log_session_event(summary, role, mode)

        # Get tmux_pane and update session status
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT tmux_pane FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            tmux_pane = row["tmux_pane"] if row else None

            # Update session status
            now_iso = datetime.now(timezone.utc).isoformat()

            conn.execute(
                "UPDATE sessions SET status_text = 'Session complete', current_state = 'ended', ended_at = ?, updated_at = ? WHERE session_id = ?",
                (now_iso, now_iso, session_id)
            )
            conn.commit()

        # Emit SSE event for Dashboard real-time update
        _notify_backend_event("session.ended", session_id, {"reason": "done"})

        # BACKGROUND MODE: Notify Chief that specialist completed
        # (Replaces old ping() functionality - specialists auto-notify on done)
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
                        from services.messaging import get_messaging
                        messaging = get_messaging(SYSTEM_ROOT / "data/db/system.db")
                        # Notify Chief about completion
                        if messaging.notify_specialist_complete(session_id, role, summary):
                            chief_notified = True
            except Exception as e:
                print(f"Chief notification failed: {e}", file=sys.stderr)

        # Kill tmux pane after delay (gives Claude time to finish responding)
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

    except Exception as e:
        return {"success": False, "error": str(e)}


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

        # Emit SSE event for Dashboard real-time update via HTTP
        _notify_backend_event("session.status", session_id, {"status_text": text})

        return {"success": True, "status": text}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# SERVICE TOOL
# =============================================================================

@mcp.tool()
def service(
    operation: str,
    name: Optional[str] = None,
    lines: int = 50,
) -> Dict[str, Any]:
    """Service management for backend, dashboard, and MCP.

    Args:
        operation: Operation - 'status', 'restart', 'logs', 'mcp'
        name: Service name - 'backend' or 'dashboard' (required for restart, logs)
        lines: Number of log lines to tail (default 50)

    Returns:
        Object with success status and service data

    Examples:
        service("status")
        service("restart", name="backend")
        service("logs", name="dashboard", lines=100)
        service("mcp")  # Validate MCP compiles, then reset to reload
    """
    try:
        SERVICES = {
            "backend": {
                "window": "backend",
                "command": "./venv/bin/python .engine/src/main.py",
                "port": 5001,
            },
            "dashboard": {
                "window": "dashboard",
                "command": "npm run dev",
                "cwd": "Dashboard",
                "port": 3000,
            },
        }

        if operation == "status":
            result = {}
            for svc_name, svc_info in SERVICES.items():
                svc_status = {"window": svc_info["window"], "port": svc_info["port"]}

                # Check if port is listening
                try:
                    port_check = subprocess.run(
                        ["lsof", "-ti", f":{svc_info['port']}", "-sTCP:LISTEN"],
                        capture_output=True, text=True, timeout=5
                    )
                    pids = port_check.stdout.strip().split('\n')
                    svc_status["running"] = bool(pids[0]) if pids else False
                    svc_status["pid"] = int(pids[0]) if pids and pids[0] else None
                except Exception:
                    svc_status["running"] = False
                    svc_status["pid"] = None

                result[svc_name] = svc_status

            return {"success": True, "services": result}

        elif operation == "restart":
            if not name:
                return {"success": False, "error": "name required for restart (backend or dashboard)"}
            if name not in SERVICES:
                return {"success": False, "error": f"Unknown service: {name}. Use backend or dashboard."}

            svc = SERVICES[name]
            window = svc["window"]

            # Build restart command
            if "cwd" in svc:
                cmd = f"cd {svc['cwd']} && {svc['command']}"
            else:
                cmd = svc["command"]

            # Use respawn-pane for atomic kill + restart
            subprocess.run(
                ["tmux", "respawn-pane", "-k", "-t", f"life:{window}", cmd],
                timeout=5
            )

            # Wait and check if running
            time.sleep(2)
            try:
                port_check = subprocess.run(
                    ["lsof", "-ti", f":{svc['port']}", "-sTCP:LISTEN"],
                    capture_output=True, text=True, timeout=5
                )
                new_pid = port_check.stdout.strip().split('\n')[0] if port_check.stdout.strip() else None
            except Exception:
                new_pid = None

            return {
                "success": True,
                "service": name,
                "window": window,
                "new_pid": int(new_pid) if new_pid else None,
                "message": f"{name} restarted via respawn-pane"
            }

        elif operation == "logs":
            if not name:
                return {"success": False, "error": "name required for logs (backend or dashboard)"}
            if name not in SERVICES:
                return {"success": False, "error": f"Unknown service: {name}. Use backend or dashboard."}

            window = SERVICES[name]["window"]

            result = subprocess.run(
                ["tmux", "capture-pane", "-p", "-t", f"life:{window}", "-S", f"-{lines}"],
                capture_output=True, text=True, timeout=5
            )

            if result.returncode != 0:
                return {"success": False, "error": f"Failed to capture logs: {result.stderr.strip()}"}

            return {
                "success": True,
                "service": name,
                "lines": lines,
                "logs": result.stdout
            }

        elif operation == "mcp":
            # Validate Life MCP server compiles and has expected tools
            # This is a "fake restart" - just validates, then tells model to reset
            try:
                validation_code = '''
import sys
sys.path.insert(0, ".engine/src")
from life_mcp.server import mcp

tools = []
if hasattr(mcp, "_tool_manager"):
    tools.extend(mcp._tool_manager._tools.keys())
if hasattr(mcp, "_mounted_servers"):
    for ms in mcp._mounted_servers:
        if hasattr(ms.server, "_tool_manager"):
            tools.extend(ms.server._tool_manager._tools.keys())

print(len(tools))
for t in sorted(tools):
    print(t)
'''
                result = subprocess.run(
                    [sys.executable, "-c", validation_code],
                    capture_output=True, text=True, timeout=30,
                    cwd=REPO_ROOT
                )

                if result.returncode != 0:
                    return {
                        "success": False,
                        "error": f"MCP server failed to compile: {result.stderr.strip()}"
                    }

                lines_out = result.stdout.strip().split('\n')
                tool_count = int(lines_out[0]) if lines_out else 0
                tools_list = lines_out[1:] if len(lines_out) > 1 else []

                return {
                    "success": True,
                    "valid": True,
                    "tool_count": tool_count,
                    "tools": tools_list,
                    "message": "MCP server is valid. Call reset() to reload with new MCP tools."
                }

            except subprocess.TimeoutExpired:
                return {"success": False, "error": "MCP validation timed out"}
            except Exception as e:
                return {"success": False, "error": f"MCP validation failed: {str(e)}"}

        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use status, restart, logs, or mcp."}

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timeout during operation"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# MISSION TOOL
# =============================================================================

# Initialize missions service for MCP access
from apps.missions.mcp import mission as _mission_tool, set_service as set_missions_service
from apps.missions.service import MissionsService
from services.storage import SystemStorage
from config import settings

_missions_storage = SystemStorage(settings.db_path)
_missions_service = MissionsService(_missions_storage)
set_missions_service(_missions_service)

@mcp.tool()
def mission(
    operation: str,
    slug: str = None,
    name: str = None,
    description: str = None,
    prompt_file: str = None,
    prompt_inline: str = None,
    schedule_type: str = None,
    schedule_cron: str = None,
    schedule_time: str = None,
    schedule_days: list = None,
    trigger_type: str = None,
    trigger_config: dict = None,
    timeout_minutes: int = None,
    role: str = None,
    mode: str = None,
    source: str = None,
    enabled_only: bool = False,
    limit: int = 20,
) -> Dict[str, Any]:
    """Manage scheduled and triggered missions.

    Operations: list, get, create, update, enable, disable, run_now, history, running

    Examples:
        mission("list")  # List all missions
        mission("get", slug="memory-consolidation")  # Get specific mission
        mission("run_now", slug="morning-prep")  # Run immediately
        mission("disable", slug="dream-mode")  # Disable (not protected)
        mission("create", slug="weekly-review", name="Weekly Review",
                schedule_type="cron", schedule_cron="0 10 * * 0",
                prompt_file="Workspace/working/weekly-review.md")
    """
    return _mission_tool(
        operation=operation,
        slug=slug,
        name=name,
        description=description,
        prompt_file=prompt_file,
        prompt_inline=prompt_inline,
        schedule_type=schedule_type,
        schedule_cron=schedule_cron,
        schedule_time=schedule_time,
        schedule_days=schedule_days,
        trigger_type=trigger_type,
        trigger_config=trigger_config,
        timeout_minutes=timeout_minutes,
        role=role,
        mode=mode,
        source=source,
        enabled_only=enabled_only,
        limit=limit,
    )
