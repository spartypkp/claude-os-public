"""System management MCP tools.

These are meta-operations about the system itself, not life domains.

Tools:
    - team(op): Specialist orchestration (spawn, list, peek, close) - Chief only
"""
from __future__ import annotations

import logging
import subprocess
import sys
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastmcp import FastMCP

from core.mcp_helpers import (
    PACIFIC,
    REPO_ROOT,
    SYSTEM_ROOT,
    get_db,
    get_current_session_role,
    get_current_session_id,
    derive_window_name,
)
from core.tmux import inject_message

# Operations restricted to Chief role
CHIEF_ONLY_OPS = {"spawn", "close"}

logger = logging.getLogger(__name__)

mcp = FastMCP("life-system")


# =============================================================================
# SSE EVENT NOTIFICATION (shared with lifecycle)
# =============================================================================

def _notify_backend_event(event_type: str, session_id: str, data: dict = None):
    """Notify the backend to emit an SSE event."""
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
            pass

    except Exception as e:
        logger.debug(f"Backend notification failed (non-critical): {e}")


# =============================================================================
# TEAM TOOL - CHIEF ONLY
# =============================================================================

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
    message: Optional[str] = None,
) -> Dict[str, Any]:
    """Team orchestration (spawn, monitor, close team members). **Chief only.**

    Args:
        operation: Operation - 'spawn', 'list', 'peek', 'close', 'message', 'subscribe'
        id: Team member ID (required for peek, close, message, subscribe)
            Accepts either conversation_id (e.g., "0212-1607-builder-83d0349e")
            or session_id prefix (e.g., "7f0a578c") — resolves to active session automatically.
        role: Session role for spawn - 'builder', 'writer', 'researcher', 'curator', 'project', 'idea'
        spec_path: Path to spec file (REQUIRED for spawn) - Specialist flow starts at preparation
        max_iterations: Max specialist iterations before giving up (default 10)
        description: Status text for dashboard
        project_path: For 'project' role - path to target project
        lines: Number of lines to capture for peek (default 50)
        message: Message text (required for message operation)

    Returns:
        Object with success status and operation-specific data

    Examples:
        team("spawn", role="builder", spec_path="Desktop/conversations/api-bug-spec.md")
        team("spawn", role="researcher", spec_path="Desktop/conversations/research-spec.md", max_iterations=5)
        team("list")
        team("peek", id="abc12345")
        team("peek", id="0212-1607-builder-83d0349e")
        team("close", id="abc12345")
        team("message", id="abc12345", message="How's progress?")
        team("message", id="0212-1607-builder-83d0349e", message="Check the auth middleware too")
        team("subscribe", id="abc12345")
    """
    # Per-operation access control
    caller_role = get_current_session_role()

    try:
        if operation == "spawn":
            if caller_role != "chief":
                # Non-Chief: route as request to Chief
                return _team_spawn_request(caller_role or "unknown", role, spec_path)
            return _team_spawn(role, spec_path, max_iterations, description, project_path)
        elif operation == "close":
            if caller_role != "chief":
                return {"success": False, "error": f"close is Chief only. Your role: {caller_role or 'unknown'}"}
            return _team_close(id)
        elif operation == "list":
            return _team_list()
        elif operation == "peek":
            return _team_peek(id, lines)
        elif operation == "message":
            return _team_message(id, message, caller_role)
        elif operation == "subscribe":
            return _team_subscribe(id)
        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use spawn, list, peek, close, message, or subscribe."}

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timeout during operation"}
    except Exception as e:
        logger.error(f"team() failed: {e}")
        return {"success": False, "error": str(e)}


def _resolve_team_id(id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Resolve a team ID (conversation_id or session_id prefix) to active session info.

    Returns dict with session_id, role, conversation_id, tmux_pane, mode, status_text, spec_path.
    """
    if not id:
        return None

    with get_db() as conn:
        # Try conversation_id first (longer format with dashes and role name)
        cursor = conn.execute("""
            SELECT session_id, role, conversation_id, tmux_pane, mode, status_text, spec_path
            FROM sessions
            WHERE conversation_id = ? AND ended_at IS NULL
            ORDER BY started_at DESC LIMIT 1
        """, (id,))
        row = cursor.fetchone()

        if row:
            return dict(row)

        # Fall back to session_id prefix match
        cursor = conn.execute("""
            SELECT session_id, role, conversation_id, tmux_pane, mode, status_text, spec_path
            FROM sessions
            WHERE session_id LIKE ? AND ended_at IS NULL
        """, (f"{id}%",))
        row = cursor.fetchone()
        return dict(row) if row else None


def _team_spawn_request(caller_role: str, requested_role: Optional[str], spec_path: Optional[str]) -> Dict[str, Any]:
    """Non-Chief spawn: inject a request to Chief instead of spawning directly."""
    if not requested_role:
        return {"success": False, "error": "role required for spawn request"}

    purpose = spec_path or "unspecified"
    request_msg = f"[TEAM REQUEST: {caller_role.title()} wants {requested_role.title()} for \"{purpose}\"]"

    # Find Chief's tmux pane
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT tmux_pane FROM sessions
            WHERE role = 'chief' AND ended_at IS NULL
            ORDER BY started_at DESC LIMIT 1
        """)
        row = cursor.fetchone()

    if not row or not row["tmux_pane"]:
        return {"success": False, "error": "Chief session not found — cannot route spawn request"}

    success = inject_message(row["tmux_pane"], request_msg, submit=True)
    if not success:
        return {"success": False, "error": "Failed to inject spawn request to Chief"}

    return {
        "success": True,
        "request_sent": True,
        "requested_role": requested_role,
        "message": f"Spawn request sent to Chief. They'll decide whether to spawn a {requested_role}.",
    }


def _team_spawn(role: Optional[str], spec_path: Optional[str], max_iterations: int, description: Optional[str], project_path: Optional[str]) -> Dict[str, Any]:
    """Spawn a specialist session.

    The actual spawn (Claude startup + prompt injection) runs in a background
    thread so this MCP tool returns immediately (~50ms) instead of blocking
    for 10-30s while Claude boots.
    """
    if not role:
        return {"success": False, "error": "role required for spawn"}
    if not spec_path:
        return {"success": False, "error": "spec_path required for spawn (specialist flow)"}

    # Validate spec exists
    full_spec_path = REPO_ROOT / spec_path
    if not full_spec_path.exists():
        return {"success": False, "error": f"Spec not found: {spec_path}"}

    # Generate conversation_id for specialist workspace
    # Format: MMDD-HHMM-{role}-{id} for chronological sorting
    ts = datetime.now(PACIFIC).strftime("%m%d-%H%M")
    conversation_id = f"{ts}-{role}-{uuid.uuid4().hex[:8]}"
    workspace = REPO_ROOT / "Desktop/conversations" / conversation_id
    workspace.mkdir(parents=True, exist_ok=True)

    # Create empty progress.md
    timestamp = datetime.now(PACIFIC).strftime("%Y-%m-%d %H:%M")
    (workspace / "progress.md").write_text(f"# Progress Log\n\nStarted: {timestamp}\nMax iterations: {max_iterations}\n\n")

    # Run the actual spawn in a background thread so the MCP tool returns
    # immediately. The specialist will appear in team("list") once ready.
    def _background_spawn():
        try:
            sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
            from modules.sessions import SessionManager

            manager = SessionManager(repo_root=REPO_ROOT)
            result = manager.spawn(
                role=role,
                mode="preparation",
                conversation_id=conversation_id,
                description=description or f"{role.title()} preparing",
                project_path=project_path,
                spec_path=str(full_spec_path),
            )

            if result.success:
                _notify_backend_event("session.started", result.session_id, {
                    "role": role,
                    "mode": "preparation",
                    "conversation_id": conversation_id,
                    "window": result.window_name,
                    "description": description,
                    "specialist_mode": True,
                })
                logger.info(f"Background spawn succeeded: {role}/{conversation_id} (session={result.session_id[:8]})")
            else:
                logger.error(f"Background spawn failed: {result.error}")
        except Exception as e:
            logger.error(f"Background spawn error for {conversation_id}: {e}")

    thread = threading.Thread(target=_background_spawn, daemon=True, name=f"spawn-{conversation_id}")
    thread.start()

    return {
        "success": True,
        "conversation_id": conversation_id,
        "workspace": f"Desktop/conversations/{conversation_id}/",
        "reminder": f"Specialist spawn initiated (async). {role.title()} will start in ~10-30s. Use team('list') to check status."
    }


def _team_list() -> Dict[str, Any]:
    """List active sessions grouped by conversation."""
    with get_db() as conn:
        cursor = conn.execute("""
            SELECT s.session_id, s.role, s.conversation_id, s.mode,
                   s.status_text, s.started_at, s.spec_path,
                   (SELECT COUNT(*) FROM sessions s2
                    WHERE s2.conversation_id = s.conversation_id) as sessions_count
            FROM sessions s
            WHERE s.ended_at IS NULL
            ORDER BY s.started_at DESC
        """)
        rows = cursor.fetchall()

    # Group by conversation_id, keeping only the most recent active session per conversation
    seen = set()
    conversations = []
    for row in rows:
        conv_id = row["conversation_id"] or row["session_id"]
        if conv_id in seen:
            continue
        seen.add(conv_id)

        r = row["role"] or "unknown"
        conversations.append({
            "conversation_id": conv_id,
            "role": r,
            "active_session_id": row["session_id"][:8],
            "mode": row["mode"],
            "status": row["status_text"],
            "sessions_count": row["sessions_count"],
            "started": row["started_at"],
            "spec_path": row["spec_path"],
        })

    return {"success": True, "conversations": conversations, "count": len(conversations)}


def _team_peek(id: Optional[str], lines: int) -> Dict[str, Any]:
    """Peek at a session's output. Accepts conversation_id or session_id prefix."""
    if not id:
        return {"success": False, "error": "id required for peek"}

    resolved = _resolve_team_id(id)
    if not resolved:
        return {"success": False, "error": f"Session {id} not found"}

    full_id = resolved["session_id"]
    r = resolved["role"] or "unknown"
    window_name = derive_window_name(r, full_id)

    result = subprocess.run(
        ["tmux", "capture-pane", "-p", "-t", f"life:{window_name}", "-S", f"-{lines}"],
        capture_output=True, text=True, timeout=5
    )

    if result.returncode != 0:
        return {"success": False, "error": f"Failed to capture pane: {result.stderr.strip()}"}

    return {
        "success": True,
        "session_id": full_id[:8],
        "conversation_id": resolved.get("conversation_id"),
        "role": r,
        "window": window_name,
        "output": result.stdout,
        "lines": lines
    }


def _team_close(id: Optional[str]) -> Dict[str, Any]:
    """Close a specialist session. Accepts conversation_id or session_id prefix."""
    if not id:
        return {"success": False, "error": "id required for close"}

    resolved = _resolve_team_id(id)
    if not resolved:
        # Try finding even ended sessions for close
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT session_id, role, ended_at FROM sessions WHERE session_id LIKE ?",
                (f"{id}%",)
            )
            row = cursor.fetchone()
            if not row:
                cursor = conn.execute(
                    "SELECT session_id, role, ended_at FROM sessions WHERE conversation_id = ? ORDER BY started_at DESC LIMIT 1",
                    (id,)
                )
                row = cursor.fetchone()
            if not row:
                return {"success": False, "error": f"Session {id} not found"}
            resolved = dict(row)

    full_id = resolved["session_id"]
    r = resolved.get("role") or "unknown"
    window = derive_window_name(r, full_id)

    if r == "chief":
        return {"success": False, "error": "Cannot close Chief's window - it persists"}

    already_ended = resolved.get("ended_at") is not None
    if not already_ended:
        with get_db() as conn:
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "UPDATE sessions SET ended_at = ? WHERE session_id = ?",
                (now, full_id)
            )
            conn.commit()
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
        "session_id": full_id[:8],
        "conversation_id": resolved.get("conversation_id"),
        "role": r,
        "window": window,
        "was_already_ended": already_ended,
        "window_killed": window_killed,
        "reminder": "Closed. Verify their work is logged and specs are current."
    }


def _team_message(id: Optional[str], message: Optional[str], caller_role: Optional[str] = None) -> Dict[str, Any]:
    """Send a message to a session. Accepts conversation_id or session_id prefix.

    Messages are formatted as [TEAM → TargetRole] from CallerRole: message
    for visibility in the transcript.
    """
    if not id:
        return {"success": False, "error": "id required for message"}
    if not message:
        return {"success": False, "error": "message required for message operation"}

    resolved = _resolve_team_id(id)
    if not resolved:
        return {"success": False, "error": f"Session {id} not found"}

    full_id = resolved["session_id"]
    r = resolved.get("role") or "unknown"
    tmux_pane = resolved.get("tmux_pane")

    if not tmux_pane:
        return {"success": False, "error": f"Session {id} has no tmux pane"}

    # Format message with team direction header (include conversation_id for disambiguation)
    source = (caller_role or "unknown").title()
    target = r.title()
    conv_id = resolved.get("conversation_id", "")
    formatted_msg = f"[TEAM \u2192 {target}] from {source} ({conv_id}): {message}"

    success = inject_message(tmux_pane, formatted_msg, submit=True)

    if not success:
        return {"success": False, "error": "Failed to inject message"}

    return {
        "success": True,
        "session_id": full_id[:8],
        "conversation_id": resolved.get("conversation_id"),
        "role": r,
        "message_sent": message
    }


def _team_subscribe(id: Optional[str]) -> Dict[str, Any]:
    """Subscribe to auto-receive replies from a session. Accepts conversation_id or session_id prefix."""
    if not id:
        return {"success": False, "error": "id required for subscribe"}

    subscriber_session_id = get_current_session_id()
    if not subscriber_session_id:
        return {"success": False, "error": "Could not determine your session_id"}

    resolved = _resolve_team_id(id)
    if not resolved:
        return {"success": False, "error": f"Session {id} not found"}

    full_id = resolved["session_id"]
    r = resolved.get("role") or "unknown"

    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET subscribed_by = ? WHERE session_id = ?",
            (subscriber_session_id, full_id)
        )
        conn.commit()

    return {
        "success": True,
        "session_id": full_id[:8],
        "conversation_id": resolved.get("conversation_id"),
        "role": r,
        "subscribed_by": subscriber_session_id[:8],
        "reminder": f"Subscribed. When {r} calls reply_to_chief(), you'll receive messages automatically."
    }


@mcp.tool()
def reply_to_chief(message: str) -> Dict[str, Any]:
    """Reply to Chief from a specialist session.

    Available to all sessions. Appends timestamped message to reply.txt in specialist workspace.
    If Chief is subscribed, the watcher auto-injects the reply to Chief's pane.

    Args:
        message: Reply message content

    Returns:
        Object with success status and file path

    Example:
        reply_to_chief("Making progress, 60% done")
    """
    # Get current session's conversation_id
    session_id = get_current_session_id()
    if not session_id:
        return {"success": False, "error": "Could not determine current session"}

    with get_db() as conn:
        cursor = conn.execute(
            "SELECT conversation_id FROM sessions WHERE session_id = ?",
            (session_id,)
        )
        row = cursor.fetchone()

        if not row:
            return {"success": False, "error": "Session not found in database"}

        conversation_id = row["conversation_id"]
        if not conversation_id:
            return {"success": False, "error": "Not in specialist mode (no conversation_id)"}

    # Build workspace path
    workspace = REPO_ROOT / "Desktop/conversations" / conversation_id
    reply_file = workspace / "reply.txt"

    # Append timestamped message
    timestamp = datetime.now(PACIFIC).strftime("%H:%M:%S")
    entry = f"[{timestamp}] {message}\n\n"

    try:
        reply_file.parent.mkdir(parents=True, exist_ok=True)
        with reply_file.open("a") as f:
            f.write(entry)
    except Exception as e:
        return {"success": False, "error": f"Failed to write reply: {e}"}

    return {
        "success": True,
        "file_path": str(reply_file.relative_to(REPO_ROOT)),
        "message": message,
        "reminder": "Reply saved to reply.txt. If Chief subscribed, message will auto-inject within 2 seconds."
    }


# =============================================================================
# SCHEDULE TOOL
# =============================================================================

@mcp.tool()
def schedule(
    operation: str,
    expression: Optional[str] = None,
    action: Optional[str] = None,
    payload: Optional[str] = None,
    id: Optional[str] = None,
    critical: bool = False,
    limit: int = 20,
) -> Dict[str, Any]:
    """Manage the cron schedule — add, remove, list, enable, disable entries.

    Args:
        operation: Operation - 'add', 'list', 'remove', 'enable', 'disable', 'history'
        expression: Cron expression (e.g., "*/15 * * * *") or ISO datetime for one-off
        action: Action string (e.g., "inject chief", "spawn researcher", "exec")
        payload: Payload string (message text, spec path, or function name)
        id: Entry ID (required for remove, enable, disable)
        critical: Mark as critical (catch up on missed runs)
        limit: Max results for history (default 20)

    Returns:
        Object with success status and operation-specific data

    Examples:
        schedule("add", expression="*/15 * * * *", action="inject chief", payload="[WAKE]")
        schedule("add", expression="0 6 * * *", action="inject chief", payload="/morning-reset")
        schedule("add", expression="2026-02-13T16:00", action="inject chief",
                 payload="Remind user to review docs")
        schedule("add", expression="0 18 * * *", action="spawn researcher",
                 payload="Desktop/scheduled/news-brief-spec.md")
        schedule("add", expression="0 3 * * *", action="exec", payload="vacuum_database")
        schedule("list")
        schedule("remove", id="abc123")
        schedule("enable", id="abc123")
        schedule("disable", id="abc123")
        schedule("history", limit=20)
    """
    import urllib.request
    import json as json_module

    base_url = "http://localhost:5001/api/schedule"

    try:
        if operation == "list":
            req = urllib.request.Request(base_url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json_module.loads(resp.read())

        elif operation == "history":
            req = urllib.request.Request(f"{base_url}/history?limit={limit}")
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json_module.loads(resp.read())

        elif operation == "add":
            if not expression or not action or not payload:
                return {"success": False, "error": "expression, action, and payload required for add"}
            body = json_module.dumps({
                "expression": expression,
                "action": action,
                "payload": payload,
                "critical": critical,
            }).encode("utf-8")
            req = urllib.request.Request(
                base_url, data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json_module.loads(resp.read())

        elif operation == "remove":
            if not id:
                return {"success": False, "error": "id required for remove"}
            req = urllib.request.Request(f"{base_url}/{id}", method="DELETE")
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json_module.loads(resp.read())

        elif operation == "enable":
            if not id:
                return {"success": False, "error": "id required for enable"}
            req = urllib.request.Request(f"{base_url}/{id}/enable", method="POST")
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json_module.loads(resp.read())

        elif operation == "disable":
            if not id:
                return {"success": False, "error": "id required for disable"}
            req = urllib.request.Request(f"{base_url}/{id}/disable", method="POST")
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json_module.loads(resp.read())

        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use add, list, remove, enable, disable, history."}

    except urllib.error.HTTPError as e:
        try:
            detail = json_module.loads(e.read()).get("detail", str(e))
        except Exception:
            detail = str(e)
        return {"success": False, "error": detail}
    except Exception as e:
        logger.error(f"schedule() failed: {e}")
        return {"success": False, "error": str(e)}

