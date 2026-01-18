"""Session management endpoints - spawning, controlling, and streaming Claude sessions."""
import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings

# Jan 2026: Real-time event bus
from utils.event_bus import event_bus

router = APIRouter()

# Base paths
# sessions.py is at .engine/src/api/sessions.py → api → src → .engine → repo_root
REPO_ROOT = Path(settings.repo_root) if hasattr(settings, 'repo_root') else Path(__file__).resolve().parents[3]
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"


# ============================================
# Pydantic models
# ============================================

class SessionMessageRequest(BaseModel):
    """Request body for sending a message to a session."""
    message: str


class SpawnSessionRequest(BaseModel):
    """Request body for spawning a new session."""
    role: str = "chief"
    mode: str = "interactive"
    description: Optional[str] = None
    project_path: Optional[str] = None


class NotifyEventRequest(BaseModel):
    """Request body for emitting SSE events from MCP tools.

    MCP tools run in a separate process and can't directly emit
    events to the SSE subscribers (which live in the FastAPI process).
    This endpoint bridges that gap.
    """
    event_type: str  # e.g., "session.started", "session.ended"
    session_id: str
    data: dict = {}


# ============================================
# Helper functions
# ============================================

def sanitize_message(message: str, max_length: int = 10_000) -> str:
    """Sanitize user message for safe tmux injection.

    Args:
        message: Raw user input
        max_length: Maximum allowed message length (default 10KB)

    Returns:
        Sanitized message safe for tmux injection

    Raises:
        ValueError: If message is empty or too long
    """
    if not message or not message.strip():
        raise ValueError("Message cannot be empty")

    if len(message) > max_length:
        raise ValueError(f"Message too long (max {max_length} chars)")

    # Strip ANSI escape sequences (e.g., color codes)
    message = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', message)

    # Strip other escape sequences (OSC, etc.)
    message = re.sub(r'\x1b\][^\x07]*\x07', '', message)  # OSC sequences
    message = re.sub(r'\x1b[PX^_][^\x1b]*\x1b\\', '', message)  # DCS/PM/APC/SOS

    # Strip control characters (0x00-0x1F) except newline (0x0A) and tab (0x09)
    message = ''.join(
        c for c in message
        if ord(c) >= 32 or c in '\n\t'
    )

    return message.strip()


def capture_pane_content(tmux_pane: str, lines: int = 500) -> str:
    """Capture content from a tmux pane.

    Args:
        tmux_pane: The tmux pane identifier (e.g., "life:chief" or "%5")
        lines: Number of lines to capture from history (default 500)

    Returns:
        Captured pane content as string, or empty string on error
    """
    import subprocess

    try:
        result = subprocess.run(
            ["tmux", "capture-pane", "-p", "-S", f"-{lines}", "-t", tmux_pane],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout
        return ""
    except Exception:
        return ""


# ============================================
# Session CRUD routes
# ============================================

@router.post("/spawn")
async def spawn_session(req: SpawnSessionRequest):
    """Spawn a new Claude session in a tmux window.

    Args (JSON body):
        role: Session role (chief, system, project, focus, idea, interviewer)
        mode: Session mode (interactive, background)
        description: Optional description of what this session is for
        project_path: Path to target project directory (for project role)

    Returns:
        session_id: The spawned session ID
        window_name: The tmux window name
    """
    import asyncio
    import sys
    sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
    from services import SessionManager

    try:
        manager = SessionManager(repo_root=REPO_ROOT)

        # Run spawn in thread to avoid blocking async event loop
        def do_spawn():
            return manager.spawn(
                role=req.role,
                mode=req.mode,
                description=req.description,
                project_path=req.project_path,
            )

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, do_spawn)

        if result.success:
            # Emit event AFTER thread completes to ensure DB write is visible
            # This prevents race condition where cache invalidation happens
            # before the session is queryable from the database
            await event_bus.publish("session.started", {
                "session_id": result.session_id,
                "role": req.role,
                "mode": req.mode,
                "conversation_id": result.conversation_id,
                "window": result.window_name,
                "description": req.description,
            })

            return {
                "success": True,
                "session_id": result.session_id,
                "window_name": result.window_name,
                "role": req.role,
                "mode": req.mode,
                "description": req.description,
                "project_path": req.project_path,
            }
        else:
            return {
                "success": False,
                "error": result.error,
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================
# Event notification endpoint (for MCP tools)
# MUST come before /{session_id} routes to avoid route collision
# ============================================

@router.post("/notify-event")
async def notify_event(req: NotifyEventRequest):
    """Emit an SSE event from MCP tools.

    MCP tools run in Claude Code's process, which is separate from the
    FastAPI backend. They can't directly publish to the event_bus because
    their event_bus instance has no subscribers (subscribers are in this process).

    This endpoint bridges that gap: MCP tools POST here, and we emit the
    event to all SSE subscribers.

    Args (JSON body):
        event_type: Event type (e.g., "session.started", "session.ended")
        session_id: The session ID this event relates to
        data: Additional event data (role, mode, reason, etc.)

    Returns:
        success: True if event was emitted
    """
    try:
        await event_bus.publish(req.event_type, {
            "session_id": req.session_id,
            **req.data
        })
        return {"success": True, "event_type": req.event_type}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================
# Activity endpoint (sessions + missions)
# MUST come before /{session_id} routes to avoid route collision
# ============================================

@router.get("/activity")
async def get_claude_activity():
    """Get Claude sessions (active + recent ended), running missions, and their background workers."""
    result = {
        "sessions": [],
        "missions": [],
    }

    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT session_id, started_at, last_seen_at, ended_at, current_state, cwd, tmux_pane,
                   role, mode, session_type, session_subtype, description, mission_execution_id, status_text,
                   conversation_id, parent_session_id
            FROM sessions
            WHERE (
                ended_at IS NULL
                OR
                (ended_at IS NOT NULL AND date(started_at) = date('now', 'localtime'))
            )
            ORDER BY COALESCE(ended_at, '9999-12-31') DESC, started_at DESC
        """)
        sessions = cursor.fetchall()

        for session in sessions:
            session_id = session["session_id"]

            cursor.execute("""
                SELECT id, task_type, status,
                       json_extract(params_json, '$.instructions') as instructions,
                       created_at, execute_at
                FROM workers
                WHERE spawned_by_session = ?
                AND (
                    status IN ('pending', 'running', 'awaiting_clarification')
                    OR (status LIKE 'complete%' AND status != 'complete')
                    OR (status LIKE 'failed%' AND status != 'failed')
                )
                ORDER BY created_at DESC
                LIMIT 20
            """, (session_id,))
            tasks = cursor.fetchall()

            # NOTE: live_output was removed in Phase 3.1 - last_tool is always None
            last_tool = None

            result["sessions"].append({
                "session_id": session_id,
                "role": session["role"] or "chief",
                "mode": session["mode"] or "interactive",
                "session_type": session["session_type"] or "interactive",
                "session_subtype": session["session_subtype"],
                "mission_execution_id": session["mission_execution_id"],
                "conversation_id": session["conversation_id"],  # Jan 2026
                "parent_session_id": session["parent_session_id"],  # Jan 2026: lineage
                "started_at": session["started_at"],
                "last_seen_at": session["last_seen_at"],
                "ended_at": session["ended_at"],
                "current_state": session["current_state"],
                "last_tool": last_tool,
                "cwd": session["cwd"],
                "tmux_pane": session["tmux_pane"],
                "description": session["description"],
                "status_text": session["status_text"],
                "workers": [
                    {
                        "id": t["id"],
                        "type": t["task_type"],
                        "status": t["status"],
                        "title": (t["instructions"] or "")[:50] + ("..." if t["instructions"] and len(t["instructions"]) > 50 else ""),
                        "created_at": t["created_at"],
                    }
                    for t in tasks
                ]
            })

        # Get running missions from unified mission_executions table
        cursor.execute("""
            SELECT 
                e.id, 
                e.mission_slug,
                m.name as mission_name,
                m.prompt_file, 
                e.started_at, 
                e.status
            FROM mission_executions e
            LEFT JOIN missions m ON e.mission_id = m.id
            WHERE e.status = 'running'
            ORDER BY e.started_at DESC
        """)
        running_missions = cursor.fetchall()

        for mission in running_missions:
            result["missions"].append({
                "id": mission["id"],
                "name": mission["mission_name"] or mission["mission_slug"],
                "type": mission["mission_slug"],
                "prompt_file": mission["prompt_file"],
                "started_at": mission["started_at"],
                "status": mission["status"],
                "workers": []
            })

        conn.close()
    except Exception as e:
        result["error"] = str(e)

    return result


# ============================================
# Conversation routes (must come BEFORE /{session_id} routes!)
# ============================================

@router.get("/conversation/{conversation_id}/transcript/history")
async def get_conversation_transcript_history(
    conversation_id: str,
    include_thinking: bool = False,
    hours: Optional[int] = 24,
    limit_sessions: Optional[int] = None,
    before_session: Optional[str] = None,
):
    """Get combined transcript history for all sessions in a conversation.

    This returns the conversation history across session resets,
    with session boundary markers showing when each session started.

    Jan 2026: conversation_id provides continuity across session resets.

    Args:
        conversation_id: The conversation to fetch history for
        include_thinking: Include Claude's thinking blocks
        hours: Only return sessions from last N hours (default 24, None for all)
        limit_sessions: Only return last N sessions (overrides hours if set)
        before_session: For pagination - return sessions before this session_id

    Returns:
        events: Combined transcript events
        conversation_id: The conversation ID
        session_count: Number of sessions included
        total_session_count: Total sessions in conversation (for pagination)
        has_earlier: Whether there are earlier sessions not included
        earliest_session_id: ID of earliest session included (for "load more")
    """
    from services.transcript import (
        get_transcript_path_for_session,
        get_all_events,
    )

    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # First, get total session count for this conversation
        cursor.execute("""
            SELECT COUNT(*) as total
            FROM sessions
            WHERE conversation_id = ?
        """, (conversation_id,))
        total_session_count = cursor.fetchone()["total"]

        # Build query for sessions based on parameters
        if before_session:
            # Pagination: get sessions before a specific session
            cursor.execute("""
                SELECT started_at FROM sessions WHERE session_id = ?
            """, (before_session,))
            before_row = cursor.fetchone()
            if before_row:
                cursor.execute("""
                    SELECT session_id, role, started_at, ended_at, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    AND started_at < ?
                    ORDER BY started_at DESC
                    LIMIT ?
                """, (conversation_id, before_row["started_at"], limit_sessions or 5))
            else:
                # before_session not found, fall back to default
                before_session = None

        if not before_session:
            if limit_sessions:
                # Get last N sessions
                cursor.execute("""
                    SELECT session_id, role, started_at, ended_at, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    ORDER BY started_at DESC
                    LIMIT ?
                """, (conversation_id, limit_sessions))
            elif hours:
                # Get sessions from last N hours
                cursor.execute("""
                    SELECT session_id, role, started_at, ended_at, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    AND started_at > datetime('now', ? || ' hours')
                    ORDER BY started_at DESC
                """, (conversation_id, f"-{hours}"))
            else:
                # Get all sessions (no limit)
                cursor.execute("""
                    SELECT session_id, role, started_at, ended_at, transcript_path
                    FROM sessions
                    WHERE conversation_id = ?
                    ORDER BY started_at DESC
                """, (conversation_id,))

        sessions = cursor.fetchall()
        conn.close()

        if not sessions and total_session_count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No sessions found for conversation: {conversation_id}"
            )

        # Reverse to chronological order (oldest first)
        sessions = list(reversed(sessions))

        # Calculate if there's earlier history
        has_earlier = len(sessions) < total_session_count
        earliest_session_id = sessions[0]["session_id"] if sessions else None

        all_events = []
        session_count = 0

        for session in sessions:
            transcript_path = session["transcript_path"]
            if not transcript_path:
                continue

            path = Path(transcript_path)
            if not path.exists():
                continue

            session_count += 1

            # Add session boundary marker (except for first session in response)
            if all_events:
                all_events.append({
                    "type": "session_boundary",
                    "timestamp": session["started_at"],
                    "uuid": f"boundary-{session['session_id']}",
                    "session_id": session["session_id"],
                    "role": session["role"],
                    "started_at": session["started_at"],
                    "ended_at": session["ended_at"],
                    "is_reset": True,
                })

            # Get events from this session's transcript
            events = get_all_events(path, include_thinking=include_thinking)

            # Tag each event with session_id for UI grouping
            for event in events:
                event["session_id"] = session["session_id"]

            all_events.extend(events)

        return {
            "events": all_events,
            "conversation_id": conversation_id,
            "session_count": session_count,
            "total_session_count": total_session_count,
            "event_count": len(all_events),
            "has_earlier": has_earlier,
            "earliest_session_id": earliest_session_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Claude Status routes (context %, cost from tmux)
# NOTE: /claude-status/all MUST come before /{session_id}/ routes!
# ============================================

@router.get("/claude-status/all")
async def get_all_claude_statuses():
    """Get Claude Code status for all active sessions.
    
    Scans all tmux panes in the 'life' session and returns status
    for any that have Claude Code running.
    
    Only returns authoritative data:
    - context_warning: True if Claude Code shows "Context low" warning
    - active_task: The "cute message" like "Creating backend..."
    - is_thinking: Whether Claude is actively working
    """
    from services.claude_status import (
        get_all_claude_statuses as get_all,
        should_inject_warning,
        should_force_reset,
        is_claude_active,
    )
    
    try:
        statuses = get_all()
        
        result = {}
        for pane, status in statuses.items():
            result[pane] = {
                **status.to_dict(),
                "inject_warning": should_inject_warning(status),
                "should_force_reset": should_force_reset(status),
                "is_active": is_claude_active(status),
            }
        
        return {
            "status": "ok",
            "panes": result,
            "count": len(result),
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Session-specific routes (parameterized)
# ============================================

@router.get("/{session_id}/claude-status")
async def get_session_claude_status(session_id: str):
    """Get Claude Code status for a session by parsing tmux output.
    
    Returns authoritative signals from Claude Code's native UI:
    - context_warning: True if "Context low" warning is showing
    - active_task: The "cute message" like "Creating backend..."
    - is_thinking: Whether Claude is actively working
    
    We deliberately ignore the custom statusline's ctx:XX% because
    it uses an inaccurate calculation.
    """
    from services.claude_status import (
        get_session_claude_status as get_status,
        should_inject_warning,
        should_force_reset,
        is_claude_active,
    )
    
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT session_id, tmux_pane, ended_at
            FROM sessions
            WHERE session_id = ?
        """, (session_id,))
        
        session = cursor.fetchone()
        conn.close()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session["ended_at"]:
            return {
                "session_id": session_id,
                "status": "ended",
                "error": "Session has ended",
            }
        
        if not session["tmux_pane"]:
            return {
                "session_id": session_id,
                "status": "no_pane",
                "error": "Session has no tmux pane",
            }
        
        status = get_status(session["tmux_pane"])
        
        if status is None:
            return {
                "session_id": session_id,
                "status": "capture_failed",
                "error": "Could not capture tmux pane",
            }
        
        return {
            "session_id": session_id,
            "status": "ok",
            **status.to_dict(),
            "inject_warning": should_inject_warning(status),
            "should_force_reset": should_force_reset(status),
            "is_active": is_claude_active(status),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/focus")
async def focus_session(session_id: str):
    """Focus/switch to a session's tmux window."""
    import subprocess

    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT session_id, role, tmux_pane, ended_at
            FROM sessions
            WHERE session_id = ?
        """, (session_id,))
        session = cursor.fetchone()
        conn.close()

        if not session:
            return {"success": False, "error": "Session not found"}

        if session["ended_at"]:
            return {"success": False, "error": "Session has ended"}

        role = session["role"] or "claude"
        window_name = f"{role}-{session_id}"

        result = subprocess.run(
            ["tmux", "select-window", "-t", f"life:{window_name}"],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode == 0:
            return {
                "success": True,
                "session_id": session_id,
                "window": window_name,
            }
        else:
            return {
                "success": False,
                "error": result.stderr or "Failed to switch window",
            }

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "tmux command timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{session_id}/end")
async def end_session(session_id: str, close_tmux: bool = True):
    """End a session (mark as ended in DB and optionally close tmux window)."""
    import subprocess
    from datetime import timezone

    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT session_id, role, tmux_pane, ended_at
            FROM sessions
            WHERE session_id = ?
        """, (session_id,))
        session = cursor.fetchone()

        if not session:
            conn.close()
            return {"success": False, "error": "Session not found"}

        if session["ended_at"]:
            conn.close()
            return {"success": False, "error": "Session already ended"}

        now = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            UPDATE sessions
            SET ended_at = ?, end_reason = 'manual', current_state = NULL, updated_at = ?
            WHERE session_id = ?
        """, (now, now, session_id))
        conn.commit()
        conn.close()

        # Emit event for Dashboard real-time update (before tmux cleanup)
        # This ensures UI updates even if tmux command fails
        await event_bus.publish("session.ended", {"session_id": session_id})

        tmux_result = None
        if close_tmux:
            role = session["role"] or "claude"
            window_name = f"{role}-{session_id}"
            try:
                result = subprocess.run(
                    ["tmux", "kill-window", "-t", f"life:{window_name}"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                tmux_result = result.returncode == 0
            except Exception:
                tmux_result = False

        return {
            "success": True,
            "session_id": session_id,
            "ended_at": now,
            "tmux_closed": tmux_result,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{session_id}/force-handoff")
async def force_handoff_session(session_id: str):
    """Inject a handoff warning message into a session."""
    try:
        from services import SessionManager

        manager = SessionManager(repo_root=REPO_ROOT)
        success = manager.force_handoff(session_id)

        if success:
            return {
                "success": True,
                "message": f"Handoff warning sent to session {session_id}"
            }
        else:
            return {
                "success": False,
                "error": "Failed to send handoff warning - session may not exist or be ended"
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{session_id}/interrupt")
async def interrupt_session(session_id: str):
    """Send Ctrl+C to interrupt a running Claude session."""
    import subprocess
    import sys
    sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
    from utils.tmux import send_keys

    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT session_id, role, tmux_pane, ended_at
            FROM sessions
            WHERE session_id = ?
        """, (session_id,))
        session = cursor.fetchone()
        conn.close()

        if not session:
            return {"success": False, "error": "Session not found"}

        if session["ended_at"]:
            return {"success": False, "error": "Session has ended"}

        if not session["tmux_pane"]:
            return {"success": False, "error": "Session has no tmux pane"}

        try:
            send_keys(session["tmux_pane"], "C-c")
            return {
                "success": True,
                "session_id": session_id,
                "message": "Interrupt signal sent"
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "tmux command timed out"}
        except subprocess.CalledProcessError as e:
            return {"success": False, "error": f"tmux error: {e.stderr}"}

    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================
# Activity endpoints (MUST be before generic /{session_id})
# ============================================

@router.get("/{session_id}/activity-stream")
async def stream_session_activity(
    session_id: str,
    include_thinking: bool = True,
):
    """
    Unified activity stream via Server-Sent Events (SSE).
    
    Combines multiple data sources into a single stream:
    - transcript: Chat events from JSONL files
    - activity: Real-time Claude status (thinking, active task, elapsed time)
    - context_warning: Context usage warnings from Claude Code
    - tasks: Task list updates from todo files
    - session_meta: Model and cost information
    
    This is the preferred endpoint for the Chat UI as it provides
    everything needed in a single connection.
    """
    import asyncio
    from sse_starlette.sse import EventSourceResponse
    
    from services.activity_stream import (
        stream_unified_activity,
        ActivityStreamConfig,
    )
    
    # Get session from database
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT session_id, transcript_path, tmux_pane, claude_session_id, ended_at
        FROM sessions
        WHERE session_id = ?
    """, (session_id,))
    
    session = cursor.fetchone()
    conn.close()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["ended_at"]:
        raise HTTPException(status_code=400, detail="Session has ended")

    if not session["transcript_path"]:
        raise HTTPException(status_code=400, detail="No transcript path for session")

    # Don't check if file exists - TranscriptWatcher will wait for it to appear
    # This allows connections to brand new sessions before Claude Code creates the transcript
    transcript_path = Path(session["transcript_path"])
    
    config = ActivityStreamConfig(
        session_id=session_id,
        transcript_path=transcript_path,
        tmux_pane=session["tmux_pane"],
        claude_session_id=session["claude_session_id"],
        include_thinking=include_thinking,
    )
    
    async def event_generator():
        try:
            async for event in stream_unified_activity(config):
                event_type = event.get("type", "message")
                yield {
                    "event": event_type,
                    "data": json.dumps(event),
                }
        except asyncio.CancelledError:
            pass
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"type": "error", "message": str(e)}),
            }
    
    return EventSourceResponse(event_generator(), ping=15)


@router.get("/{session_id}/activity-status")
async def get_session_activity_status(session_id: str, include_thinking: bool = True):
    """
    Get current activity status for a session (REST endpoint).
    
    Returns the same data as the activity-stream SSE endpoint,
    but as a single snapshot. Use this for initial load before
    connecting to the SSE stream.
    
    Returns:
        events: Transcript history
        activity: Current Claude activity state
        context_warning: Context warning if present
        tasks: Task list items
        session_meta: Model and cost info
    """
    from services.activity_stream import (
        get_history_with_status,
        ActivityStreamConfig,
    )
    
    # Get session from database
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT session_id, transcript_path, tmux_pane, claude_session_id, ended_at
        FROM sessions
        WHERE session_id = ?
    """, (session_id,))
    
    session = cursor.fetchone()
    conn.close()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript_path = Path(session["transcript_path"]) if session["transcript_path"] else None
    
    config = ActivityStreamConfig(
        session_id=session_id,
        transcript_path=transcript_path or Path("/nonexistent"),
        tmux_pane=session["tmux_pane"],
        claude_session_id=session["claude_session_id"],
        include_thinking=include_thinking,
    )
    
    result = get_history_with_status(config)
    result["session_id"] = session_id
    result["ended_at"] = session["ended_at"]
    
    return result


# ============================================
# Generic session endpoints
# ============================================

@router.get("/{session_id}")
async def get_session(session_id: str):
    """Get session details including metadata and activity stream."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT session_id, role, mode, started_at, last_seen_at, ended_at,
                   end_reason, description, cwd, tmux_pane,
                   session_type, session_subtype, mission_execution_id
            FROM sessions
            WHERE session_id = ?
        """, (session_id,))
        row = cursor.fetchone()

        if not row:
            conn.close()
            return {"success": False, "error": "Session not found"}

        session = dict(row)

        cursor.execute("""
            SELECT id, task_type as type, attention_title as title, status, created_at
            FROM workers
            WHERE spawned_by_session = ?
            ORDER BY created_at DESC
        """, (session_id,))
        workers = [dict(r) for r in cursor.fetchall()]

        conn.close()

        return {
            "success": True,
            "session": session,
            "workers": workers,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/{session_id}/output")
async def get_session_output(session_id: str):
    """Get session's live output stream for real-time activity display."""
    # NOTE: live_output column was removed in Phase 3.1 (transcript-first architecture)
    # This endpoint now returns empty output - use transcript endpoints instead
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT ended_at
            FROM sessions
            WHERE session_id = ?
        """, (session_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return {"success": False, "error": "Session not found"}

        return {
            "success": True,
            "output": "",  # Deprecated: use /transcript endpoint instead
            "is_active": row["ended_at"] is None,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{session_id}/say")
async def say_to_session(session_id: str, req: SessionMessageRequest):
    """Send a message to a Claude session via tmux injection."""
    import asyncio
    import sys
    sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
    from services import SessionManager

    try:
        sanitized_message = sanitize_message(req.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        manager = SessionManager(repo_root=REPO_ROOT)

        def do_send():
            return manager.send_message(session_id, sanitized_message)

        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, do_send)

        if success:
            return {
                "success": True,
                "session_id": session_id,
                "message_length": len(sanitized_message),
            }
        else:
            session = manager.get_session(session_id)
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found")
            elif session.ended_at is not None:
                raise HTTPException(status_code=400, detail="Session has ended")
            elif session.tmux_pane is None:
                raise HTTPException(status_code=400, detail="Session has no tmux pane")
            else:
                raise HTTPException(status_code=500, detail="Failed to send message to session")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SSE Streaming endpoints
# ============================================

@router.get("/{session_id}/stream")
async def stream_session_output_sse(session_id: str):
    """Stream session output via Server-Sent Events (SSE)."""
    import asyncio
    from sse_starlette.sse import EventSourceResponse

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT session_id, role, tmux_pane, ended_at
        FROM sessions
        WHERE session_id = ?
    """, (session_id,))
    session = cursor.fetchone()
    conn.close()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["ended_at"]:
        raise HTTPException(status_code=400, detail="Session has ended")

    if not session["tmux_pane"]:
        raise HTTPException(status_code=400, detail="Session has no tmux pane")

    tmux_pane = session["tmux_pane"]
    role = session["role"] or "session"

    async def event_generator():
        last_content = ""
        last_check_time = datetime.now()

        yield {
            "event": "connected",
            "data": json.dumps({
                "session_id": session_id,
                "role": role,
                "timestamp": datetime.now().isoformat()
            })
        }

        while True:
            try:
                now = datetime.now()
                if (now - last_check_time).total_seconds() >= 5:
                    conn = sqlite3.connect(str(DB_PATH))
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT ended_at FROM sessions WHERE session_id = ?",
                        (session_id,)
                    )
                    row = cursor.fetchone()
                    conn.close()

                    if row and row["ended_at"]:
                        yield {
                            "event": "status",
                            "data": json.dumps({
                                "status": "ended",
                                "ended_at": row["ended_at"]
                            })
                        }
                        break

                    last_check_time = now

                content = capture_pane_content(tmux_pane)

                if content != last_content:
                    if content.startswith(last_content[:100]) and len(content) > len(last_content):
                        new_content = content[len(last_content):]
                    else:
                        new_content = content

                    if new_content.strip():
                        yield {
                            "event": "output",
                            "data": json.dumps({
                                "content": new_content,
                                "timestamp": datetime.now().isoformat(),
                                "total_length": len(content)
                            })
                        }

                    last_content = content

                await asyncio.sleep(0.2)

            except GeneratorExit:
                break
            except Exception as e:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": str(e)})
                }
                break

    return EventSourceResponse(event_generator(), ping=15)


@router.get("/{session_id}/transcript/history")
async def get_session_transcript_history(session_id: str, include_thinking: bool = False):
    """Get full transcript history for a session."""
    from services.transcript import (
        get_transcript_path_for_session,
        get_all_events,
    )

    transcript_path = get_transcript_path_for_session(session_id, DB_PATH)

    if not transcript_path:
        raise HTTPException(
            status_code=404,
            detail="Transcript not found. Session may not exist or transcript_path not recorded."
        )

    events = get_all_events(transcript_path, include_thinking=include_thinking)

    return {
        "events": events,
        "transcript_path": str(transcript_path),
        "event_count": len(events),
    }


@router.get("/{session_id}/transcript")
async def stream_session_transcript(
    session_id: str,
    include_thinking: bool = False,
    after_uuid: Optional[str] = None,
):
    """Stream session transcript via Server-Sent Events (SSE)."""
    import asyncio
    from sse_starlette.sse import EventSourceResponse

    from services.transcript import (
        get_transcript_path_for_session,
        stream_transcript,
    )

    transcript_path = get_transcript_path_for_session(session_id, DB_PATH)

    if not transcript_path:
        raise HTTPException(
            status_code=404,
            detail="Transcript not found. Session may not exist or transcript_path not recorded."
        )

    async def event_generator():
        try:
            async for event in stream_transcript(
                transcript_path,
                include_thinking=include_thinking,
                from_beginning=False,
                after_uuid=after_uuid,
            ):
                yield {
                    "event": event.get("type", "message"),
                    "data": json.dumps(event),
                }
        except asyncio.CancelledError:
            pass
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

    return EventSourceResponse(event_generator(), ping=15)

