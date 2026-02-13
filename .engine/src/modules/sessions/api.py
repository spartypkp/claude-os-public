"""Sessions API - REST endpoints for session management.

Combines:
- Session lifecycle (spawn, end, focus, interrupt)
- Claude status monitoring (context %, activity)
- Transcript streaming (SSE)
- Activity stream (unified SSE endpoint)
- Chief-specific operations (spawn, reset, message types)
- Conversation history across session resets
"""
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import settings
from core.events import event_bus
from core.activity_stream import (
    stream_unified_activity,
    get_history_with_status,
    ActivityStreamConfig,
)
from core.conversation_stream import stream_conversation

from . import SessionService, get_session_service
from .repository import SessionRepository
from .transcript import (
    get_transcript_path_for_session,
    get_all_events,
    stream_transcript,
)

router = APIRouter(tags=["sessions"])

# Paths
REPO_ROOT = Path(settings.repo_root) if hasattr(settings, 'repo_root') else Path(__file__).resolve().parents[4]
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"
HANDOFF_FILE = REPO_ROOT / "Desktop" / "handoffs" / "chief.md"


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

def get_manager() -> SessionService:
    """Get a SessionService instance."""
    return get_session_service()


def get_repository() -> SessionRepository:
    """Get a SessionRepository instance."""
    return SessionRepository(settings.db_path)


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


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB or filesystem operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


# ============================================
# Session spawn & CRUD routes
# ============================================

@router.post("/spawn")
async def spawn_session(req: SpawnSessionRequest):
    """Spawn a new Claude session in a tmux window.

    Args (JSON body):
        role: Session role (chief, builder, project, focus, idea, interviewer)
        mode: Session mode (interactive, background)
        description: Optional description of what this session is for
        project_path: Path to target project directory (for project role)

    Returns:
        session_id: The spawned session ID
        window_name: The tmux window name
    """
    import asyncio

    try:
        manager = get_manager()

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
# Activity endpoint (sessions)
# MUST come before /{session_id} routes to avoid route collision
# ============================================

@router.get("/activity")
async def get_claude_activity():
    """Get Claude sessions (active + recent ended)."""
    result = {
        "sessions": [],
    }

    try:
        repo = get_repository()
        sessions = await _run_blocking(repo.get_sessions_for_activity)

        for session in sessions:
            result["sessions"].append({
                "session_id": session["session_id"],
                "role": session["role"] or "chief",
                "mode": session["mode"] or "interactive",
                "session_type": session["session_type"] or "interactive",
                "session_subtype": session["session_subtype"],
                "mission_execution_id": session["mission_execution_id"],
                "conversation_id": session["conversation_id"],
                "parent_session_id": session["parent_session_id"],
                "started_at": session["started_at"],
                "last_seen_at": session["last_seen_at"],
                "ended_at": session["ended_at"],
                "current_state": session["current_state"],
                "last_tool": None,
                "cwd": session["cwd"],
                "tmux_pane": session["tmux_pane"],
                "description": session["description"],
                "status_text": session["status_text"],
            })

    except Exception as e:
        result["error"] = str(e)

    return result


# ============================================
# Chief-specific routes
# MUST come before /{session_id} routes to avoid route collision
# ============================================

@router.post("/chief/spawn")
async def spawn_chief():
    """Spawn Chief in persistent tmux window."""
    manager = get_manager()

    handoff_path = None
    if HANDOFF_FILE.exists():
        handoff_path = str(HANDOFF_FILE.relative_to(REPO_ROOT))

    result = manager.spawn_chief(handoff_path=handoff_path)

    if result.success:
        if handoff_path and HANDOFF_FILE.exists():
            HANDOFF_FILE.unlink()
        return {"success": True, "message": f"Chief spawned: {result.window_name}"}
    else:
        return {"success": False, "error": result.error}


@router.post("/chief/reset")
async def reset_chief():
    """Force reset Chief - kill current Claude and spawn fresh.

    Use when Chief is out of context or unresponsive and can't
    do a proper session_handoff.
    """
    manager = get_manager()
    result = manager.reset_chief()

    if result.success:
        return {
            "success": True,
            "message": "Chief reset complete",
            "session_id": result.session_id,
            "window_name": result.window_name
        }
    else:
        return {"success": False, "error": result.error}


@router.get("/chief/status")
async def chief_status():
    """Check if Chief is running."""
    manager = get_manager()
    return manager.get_chief_status()


@router.post("/chief/wake")
async def wake_chief():
    """Send [WAKE] message to Chief with context."""
    manager = get_manager()
    if manager.send_to_chief("wake"):
        return {"success": True, "message": "Wake sent"}
    return {"success": False, "error": "Failed to send wake - Chief may not be running"}


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
    """
    try:
        repo = get_repository()
        total_session_count = await _run_blocking(repo.count_conversation_sessions, conversation_id)

        # Get sessions based on pagination parameters
        before_started_at = None
        if before_session:
            before_started_at = await _run_blocking(repo.get_session_started_at, before_session)
            if not before_started_at:
                before_session = None

        if before_session and before_started_at:
            sessions = await _run_blocking(
                repo.get_conversation_sessions,
                conversation_id,
                before_started_at=before_started_at,
                limit=limit_sessions or 5,
            )
        elif limit_sessions:
            sessions = await _run_blocking(
                repo.get_conversation_sessions,
                conversation_id,
                limit=limit_sessions,
            )
        elif hours:
            sessions = await _run_blocking(
                repo.get_conversation_sessions,
                conversation_id,
                hours=hours,
            )
        else:
            sessions = await _run_blocking(repo.get_conversation_sessions, conversation_id)

        if not sessions and total_session_count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No sessions found for conversation: {conversation_id}"
            )

        sessions = list(reversed(sessions))

        has_earlier = len(sessions) < total_session_count
        earliest_session_id = sessions[0]["session_id"] if sessions else None

        all_events = []
        session_count = 0
        prev_session = None

        for session in sessions:
            transcript_path = session["transcript_path"]
            if not transcript_path:
                prev_session = session
                continue

            path = Path(transcript_path)
            if not path.exists():
                prev_session = session
                continue

            session_count += 1

            if all_events:
                # Determine boundary type from previous session's end_reason and mode change
                prev_mode = prev_session["mode"] if prev_session else None
                curr_mode = session.get("mode")
                prev_end_reason = prev_session["end_reason"] if prev_session else None

                # Summarizer sessions are handoff generation — special boundary type
                if curr_mode == "summarizer":
                    boundary_type = "summarizer"
                elif prev_mode == "summarizer":
                    # Session after summarizer = the fresh session picking up from handoff
                    # This is a reset boundary (the summarizer was the handoff mechanism)
                    boundary_type = "reset"
                elif prev_mode and curr_mode and prev_mode != curr_mode:
                    boundary_type = "mode_transition"
                else:
                    boundary_type = "reset"

                all_events.append({
                    "type": "session_boundary",
                    "timestamp": session["started_at"],
                    "uuid": f"boundary-{session['session_id']}",
                    "session_id": session["session_id"],
                    "role": session["role"],
                    "mode": curr_mode,
                    "prev_mode": prev_mode,
                    "started_at": session["started_at"],
                    "ended_at": session["ended_at"],
                    "boundary_type": boundary_type,
                    "end_reason": prev_end_reason,
                    "session_number": session_count,
                    "is_reset": boundary_type == "reset",  # backwards compat
                })

            events = await _run_blocking(get_all_events, path, include_thinking=include_thinking)

            for event in events:
                event["session_id"] = session["session_id"]

            all_events.extend(events)
            prev_session = session

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


@router.get("/conversation/{conversation_id}/stream")
async def stream_conversation_events(
    conversation_id: str,
    include_thinking: bool = True,
    after_uuid: Optional[str] = None,
):
    """Stream real-time events for a conversation (SSE).

    This is the primary real-time endpoint. Handles session transitions
    internally - frontend connects once and never reconnects.

    When the active session changes (reset, mode transition), emits a
    session_boundary event and continues streaming from the new session.

    Event types:
    - connected: Initial connection established
    - transcript: Chat events
    - activity: Real-time activity (thinking, task, elapsed time)
    - context_warning: Context usage warning
    - tasks: Task list updates
    - session_meta: Model and cost info
    - session_boundary: Session changed (reset, mode transition)
    - conversation_ended: No active session
    """
    from fastapi.responses import StreamingResponse

    repo = get_repository()

    # Verify conversation exists
    info = await _run_blocking(repo.get_conversation_info, conversation_id)
    if not info:
        raise HTTPException(
            status_code=404,
            detail=f"Conversation not found: {conversation_id}"
        )

    async def get_active_session():
        """Callback to get current active session."""
        return await _run_blocking(repo.get_active_session_for_conversation, conversation_id)

    async def event_generator():
        """Generate SSE events."""
        try:
            async for event in stream_conversation(
                conversation_id=conversation_id,
                get_active_session=get_active_session,
                include_thinking=include_thinking,
                after_uuid=after_uuid,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/conversation/{conversation_id}/end")
async def end_conversation(conversation_id: str):
    """End ALL active sessions in a conversation.

    This is the primary close endpoint called from the UI.
    Handles multiple active sessions (e.g. orphaned from failed mode transitions)
    and sessions that are already ended gracefully.
    """
    import subprocess

    try:
        repo = get_repository()
        active_sessions = await _run_blocking(repo.get_active_sessions_for_conversation, conversation_id)

        ended_count = 0
        tmux_killed = 0

        for session_row in active_sessions:
            sid = session_row["session_id"]
            await _run_blocking(repo.mark_ended, sid, "manual")
            await event_bus.publish("session.ended", {"session_id": sid})
            ended_count += 1

            # Kill tmux window
            role = session_row.get("role") or "claude"
            window_name = f"{role}-{sid}"
            try:
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda wn=window_name: subprocess.run(
                        ["tmux", "kill-window", "-t", f"life:{wn}"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                )
                if result.returncode == 0:
                    tmux_killed += 1
            except Exception:
                pass

        return {
            "success": True,
            "conversation_id": conversation_id,
            "sessions_ended": ended_count,
            "tmux_windows_killed": tmux_killed,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/conversation/{conversation_id}/status")
async def get_conversation_status(conversation_id: str):
    """Get current status of a conversation.

    Returns conversation metadata and active session info.
    """
    repo = get_repository()
    info = await _run_blocking(repo.get_conversation_info, conversation_id)
    if not info:
        raise HTTPException(
            status_code=404,
            detail=f"Conversation not found: {conversation_id}"
        )

    active_session = await _run_blocking(repo.get_active_session_for_conversation, conversation_id)

    return {
        "conversation_id": conversation_id,
        "role": info["role"],
        "mode": info["mode"],
        "session_count": info["session_count"],
        "first_started_at": info["first_started_at"],
        "last_started_at": info["last_started_at"],
        "active_session": active_session,
        "is_active": active_session is not None,
    }


# ============================================
# Session-specific routes (parameterized)
# ============================================

@router.post("/{session_id}/focus")
async def focus_session(session_id: str):
    """Focus/switch to a session's tmux window."""
    import subprocess

    try:
        repo = get_repository()
        session = await _run_blocking(repo.get_session, session_id)

        if not session:
            return {"success": False, "error": "Session not found"}

        if session.ended_at:
            return {"success": False, "error": "Session has ended"}

        role = session.role or "claude"
        window_name = f"{role}-{session_id}"

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                ["tmux", "select-window", "-t", f"life:{window_name}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
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

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{session_id}/end")
async def end_session(session_id: str, close_tmux: bool = True):
    """End a session (mark as ended in DB and optionally close tmux window).

    Handles already-ended sessions gracefully — if the session is already ended
    but the user clicked X, their intent is still "make this go away", so we
    still try to kill the tmux window and return success.
    """
    import subprocess

    try:
        repo = get_repository()
        session = await _run_blocking(repo.get_session, session_id)

        if not session:
            return {"success": False, "error": "Session not found"}

        already_ended = session.ended_at is not None
        now = datetime.now(timezone.utc).isoformat()

        if not already_ended:
            await _run_blocking(repo.mark_ended, session_id, "manual")
            await event_bus.publish("session.ended", {"session_id": session_id})

        # Always try to kill tmux window (it may still exist even if session is DB-ended)
        tmux_result = None
        if close_tmux:
            role = session.role or "claude"
            window_name = f"{role}-{session_id}"
            try:
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: subprocess.run(
                        ["tmux", "kill-window", "-t", f"life:{window_name}"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                )
                tmux_result = result.returncode == 0
            except Exception:
                tmux_result = False

        return {
            "success": True,
            "session_id": session_id,
            "ended_at": now,
            "tmux_closed": tmux_result,
            "already_ended": already_ended,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{session_id}/force-handoff")
async def force_handoff_session(session_id: str):
    """Inject a handoff warning message into a session."""
    try:
        manager = get_manager()
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
    from core.tmux import send_keys_async

    try:
        repo = get_repository()
        session = await _run_blocking(repo.get_session, session_id)

        if not session:
            return {"success": False, "error": "Session not found"}

        if session.ended_at:
            return {"success": False, "error": "Session has ended"}

        if not session.tmux_pane:
            return {"success": False, "error": "Session has no tmux pane"}

        try:
            await send_keys_async(session.tmux_pane, "C-c")
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
    """
    import asyncio
    from sse_starlette.sse import EventSourceResponse

    repo = get_repository()
    session = await _run_blocking(repo.get_session_row, session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session["ended_at"]:
        raise HTTPException(status_code=400, detail="Session has ended")

    if not session["transcript_path"]:
        raise HTTPException(status_code=400, detail="No transcript path for session")

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
    but as a single snapshot.
    """
    repo = get_repository()
    session = await _run_blocking(repo.get_session_row, session_id)

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
    """Get session details including metadata."""
    try:
        repo = get_repository()
        session = await _run_blocking(repo.get_session_row, session_id)

        if not session:
            return {"success": False, "error": "Session not found"}

        return {
            "success": True,
            "session": session,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/{session_id}/say")
async def say_to_session(session_id: str, req: SessionMessageRequest):
    """Send a message to a Claude session via tmux injection."""
    import asyncio

    try:
        sanitized_message = sanitize_message(req.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        manager = get_manager()

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
            session = await _run_blocking(manager.get_session, session_id)
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


@router.post("/{session_id}/keystroke")
async def send_keystroke(session_id: str, req: SessionMessageRequest):
    """Send raw keystrokes to a session (no source prefix).

    Used for answering interactive prompts like AskUserQuestion
    where we need to send the exact text the user would type.
    """
    import asyncio

    text = req.message
    if not text:
        raise HTTPException(status_code=400, detail="Empty keystroke")

    try:
        manager = get_manager()

        def do_send():
            return manager.send_keystroke(session_id, text)

        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, do_send)

        if success:
            return {"success": True, "session_id": session_id}
        else:
            session = await _run_blocking(manager.get_session, session_id)
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found")
            elif session.ended_at is not None:
                raise HTTPException(status_code=400, detail="Session has ended")
            elif session.tmux_pane is None:
                raise HTTPException(status_code=400, detail="Session has no tmux pane")
            else:
                raise HTTPException(status_code=500, detail="Failed to send keystroke")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/transcript")
async def stream_session_transcript(
    session_id: str,
    include_thinking: bool = False,
    after_uuid: Optional[str] = None,
):
    """Stream session transcript via Server-Sent Events (SSE)."""
    import asyncio
    from sse_starlette.sse import EventSourceResponse

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
