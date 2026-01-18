#!/usr/bin/env python3
"""
Session Manager - Unified session lifecycle management.

Single source of truth for all session operations:
- Spawning sessions (all types)
- Querying session state
- State updates (heartbeat, status, activity)
- Ending sessions
- Handoff orchestration
- Cleanup operations

Usage:
    from services import SessionManager

    manager = SessionManager()
    result = manager.spawn("builder", "interactive", description="Refactor API")
    manager.heartbeat(result.session_id)
    manager.end(result.session_id, reason="exit")
"""

import json
import os
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Repository paths
# __file__ = .engine/src/services/sessions.py
# parents[3] = services/ -> src/ -> .engine/ -> REPO_ROOT
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))

from services.storage import SystemStorage
from utils.events import emit_event
from utils.tmux import send_keys, send_text, inject_message

CLAUDE_DIR = REPO_ROOT / ".claude"
DB_PATH = REPO_ROOT / ".engine" / "data" / "db" / "system.db"
SESSIONS_DIR = REPO_ROOT / "Desktop" / "sessions"
TMUX_SESSION = "life"

# Model configuration
MODEL_SETTING_PREFIX = "model_"
DEFAULT_MODELS = {
    "chief": "opus",
    "builder": "sonnet",
    "deep-work": "sonnet",
    "project": "sonnet",
    "idea": "sonnet",
    "worker": "sonnet",
}


def get_model_for_role(role: str) -> Optional[str]:
    """Get the configured model for a role.
    
    Checks the settings database for a custom model, falls back to defaults.
    Returns None if the default should be used (no --model flag needed).
    
    Args:
        role: Session role (chief, system, focus, project, idea, worker)
        
    Returns:
        Model alias/name to pass to --model flag, or None for default
    """
    import sqlite3
    
    # Normalize role for lookup (mission sessions map to their role)
    lookup_role = role if role in DEFAULT_MODELS else "worker"
    
    key = f"{MODEL_SETTING_PREFIX}{lookup_role}"
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return row["value"]
        # Return default for the role
        return DEFAULT_MODELS.get(lookup_role)
    except Exception:
        return DEFAULT_MODELS.get(lookup_role)


def get_session_folder(session_id: str) -> Path:
    """Get the session folder path for a given session ID.

    Session folders live at Desktop/sessions/{session_id[:8]}/
    Workers go under workers/ subdirectory.

    Creates the folder structure if it doesn't exist.
    """
    short_id = session_id[:8] if len(session_id) > 8 else session_id
    folder = SESSIONS_DIR / short_id
    return folder


def get_session_workers_folder(session_id: str) -> Path:
    """Get the workers folder for a session.

    Workers go in Desktop/sessions/{session_id[:8]}/workers/
    Creates the folder structure if it doesn't exist.
    """
    folder = get_session_folder(session_id) / "workers"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


@dataclass
class SpawnResult:
    """Result of spawning a session."""
    success: bool
    session_id: Optional[str] = None
    window_name: Optional[str] = None
    conversation_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class Session:
    """Session data model."""
    session_id: str
    role: str
    mode: str

    started_at: str
    last_seen_at: str
    ended_at: Optional[str]
    end_reason: Optional[str]

    description: Optional[str]
    status_text: Optional[str]
    current_state: str

    tmux_pane: Optional[str]
    transcript_path: Optional[str]
    cwd: Optional[str]

    mission_execution_id: Optional[str] = None

    @property
    def is_active(self) -> bool:
        return self.ended_at is None

    @classmethod
    def from_row(cls, row) -> "Session":
        """Create Session from database row."""
        return cls(
            session_id=row["session_id"],
            role=row["role"] or "chief",
            mode=row["mode"] or "interactive",
            started_at=row["started_at"],
            last_seen_at=row["last_seen_at"],
            ended_at=row["ended_at"],
            end_reason=row["end_reason"],
            description=row["description"],
            status_text=row["status_text"],
            current_state=row["current_state"] or "idle",
            tmux_pane=row["tmux_pane"],
            transcript_path=row["transcript_path"],
            cwd=row["cwd"],
            mission_execution_id=row["mission_execution_id"],
        )


class SessionManager:
    """Unified session lifecycle manager.

    Single source of truth for:
    - Spawning sessions (all types)
    - Querying session state
    - State updates (heartbeat, status, activity)
    - Ending sessions gracefully
    - Handoff orchestration
    - Cleanup operations
    """

    def __init__(self, db_path: Path = None, repo_root: Path = None):
        self.repo_root = repo_root or REPO_ROOT
        self.db_path = db_path or DB_PATH
        self.claude_dir = self.repo_root / ".claude"

    def _get_db(self) -> SystemStorage:
        """Get a database connection."""
        return SystemStorage(self.db_path)

    def _now(self) -> str:
        """Get current UTC timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()

    # =========================================================================
    # SPAWN
    # =========================================================================

    def spawn(
        self,
        role: str,
        mode: str = "interactive",
        *,
        window_name: Optional[str] = None,
        description: Optional[str] = None,
        project_path: Optional[str] = None,
        handoff_path: Optional[str] = None,
        handoff_content: Optional[str] = None,
        handoff_reason: Optional[str] = None,
        mission_id: Optional[str] = None,
        mission_execution_id: Optional[str] = None,
        wait_for_ready: bool = True,
        initial_task: Optional[str] = None,
        conversation_id: Optional[str] = None,
        parent_session_id: Optional[str] = None,
    ) -> SpawnResult:
        """
        Spawn a new Claude session in tmux.

        This is THE way to create sessions. All other code calls this.

        Args:
            role: Session role (chief, system, project, focus, or mission name)
            mode: Session mode (interactive, background, mission)
            window_name: Tmux window name. Auto-generated if not provided.
                        Use stable name like "chief" for persistent windows.
            description: Optional description of session purpose
            project_path: Target project path (for project role)
            handoff_path: Path to handoff document (triggers handoff injection)
            handoff_content: Inline handoff content (alternative to handoff_path)
            handoff_reason: Reason for handoff (context_low, chief_cycle, etc.)
            mission_id: Short mission ID (for mission mode)
            mission_execution_id: Full execution UUID (for mission tracking)
            wait_for_ready: Wait for Claude to be ready before returning
            initial_task: Optional task message to inject after role/mode.
                         Used by Chief to delegate work to other sessions.
            conversation_id: Conversation ID to inherit (for handoff continuity).
                            If not provided, generates new conversation_id.
            parent_session_id: Previous session ID for lineage tracking (handoff).

        Returns:
            SpawnResult with session_id and window_name on success
        """
        window_created = False

        try:
            # Generate session ID
            session_id = uuid.uuid4().hex[:8]
            
            # Generate conversation_id if not inheriting (Jan 2026)
            if conversation_id is None:
                if role == "chief":
                    # Eternal conversation for Chief - provides continuity across days
                    # Overnight missions appear in morning, workers always belong to Chief
                    conversation_id = "chief"
                else:
                    # Unique conversation per specialist task
                    conversation_id = f"{role}-{uuid.uuid4().hex[:8]}"

            # Determine window name
            if window_name is None:
                window_name = f"{role}-{session_id}"

            # Ensure tmux session exists
            self._ensure_tmux_session()

            # Check if window already exists
            if self._window_exists(window_name):
                # For stable windows (like chief), check if Claude is running
                if self._is_claude_running(window_name):
                    return SpawnResult(
                        success=False,
                        error=f"Claude already running in window '{window_name}'"
                    )
                # Window exists but Claude not running - reuse it
            else:
                # Create new window
                self._create_window(window_name)
                window_created = True

            # Start Claude in the window
            self._start_claude_in_window(
                window_name=window_name,
                session_id=session_id,
                role=role,
                mode=mode,
                description=description,
                mission_execution_id=mission_execution_id,
                conversation_id=conversation_id,
                parent_session_id=parent_session_id,
            )

            # Wait for Claude to be ready
            if wait_for_ready:
                ready = self._wait_for_claude(window_name, timeout=30)
                if not ready:
                    raise TimeoutError("Claude did not become ready in time")

            # Build and inject the initial prompt
            prompt = self._build_prompt(
                role=role,
                mode=mode,
                description=description,
                project_path=project_path,
                handoff_path=handoff_path,
                handoff_content=handoff_content,
                handoff_reason=handoff_reason,
                mission_id=mission_id,
                conversation_id=conversation_id,
            )

            # If initial_task provided, append to prompt (avoids waiting for response)
            if initial_task:
                prompt = prompt + "\n\n" + initial_task

            self._inject_prompt(window_name, prompt)

            # Emit session/started event (old system for timeline)
            emit_event(
                "session",
                "started",
                actor=session_id,
                data={
                    "role": role,
                    "mode": mode,
                    "window": window_name,
                    "description": description,
                }
            )

            # Jan 2026: Event emission moved to API endpoint (after thread completes)
            # to avoid race condition where refetch happens before DB write is visible

            return SpawnResult(
                success=True,
                session_id=session_id,
                window_name=window_name,
                conversation_id=conversation_id,
            )

        except Exception as e:
            # Rollback: kill window if we created it
            if window_created:
                try:
                    self._kill_window(window_name)
                except:
                    pass
            return SpawnResult(success=False, error=str(e))

    # =========================================================================
    # QUERY
    # =========================================================================

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT * FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            if row:
                return Session.from_row(row)
            return None
        finally:
            db.close()

    def get_active_sessions(self) -> list[Session]:
        """Get all sessions where ended_at IS NULL."""
        db = self._get_db()
        try:
            rows = db.fetchall(
                "SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC"
            )
            return [Session.from_row(row) for row in rows]
        finally:
            db.close()

    def find_session_by_pane(self, tmux_pane: str) -> Optional[Session]:
        """Find active session in a tmux pane."""
        db = self._get_db()
        try:
            row = db.fetchone(
                "SELECT * FROM sessions WHERE tmux_pane = ? AND ended_at IS NULL",
                (tmux_pane,)
            )
            if row:
                return Session.from_row(row)
            return None
        finally:
            db.close()

    def get_current_session(self) -> Optional[Session]:
        """Get session for current process (via env vars or pane lookup)."""
        # Try env var first (preferred)
        session_id = os.environ.get("CLAUDE_SESSION_ID")
        if session_id:
            return self.get_session(session_id)

        # Fallback to TMUX_PANE lookup
        tmux_pane = os.environ.get("TMUX_PANE")
        if tmux_pane:
            return self.find_session_by_pane(tmux_pane)

        return None

    # =========================================================================
    # STATE UPDATES
    # =========================================================================

    def heartbeat(self, session_id: str) -> bool:
        """Update last_seen_at timestamp."""
        db = self._get_db()
        try:
            db.execute(
                "UPDATE sessions SET last_seen_at = ?, updated_at = ? WHERE session_id = ?",
                (self._now(), self._now(), session_id)
            )
            return True
        except Exception:
            return False
        finally:
            db.close()

    def set_status(self, session_id: str, status_text: str) -> bool:
        """Set session status_text."""
        db = self._get_db()
        try:
            db.execute(
                "UPDATE sessions SET status_text = ?, updated_at = ? WHERE session_id = ?",
                (status_text, self._now(), session_id)
            )
            return True
        except Exception:
            return False
        finally:
            db.close()

    def set_state(self, session_id: str, state: str) -> bool:
        """Set current_state (idle, active, tool_active, ended)."""
        db = self._get_db()
        try:
            db.execute(
                "UPDATE sessions SET current_state = ?, updated_at = ? WHERE session_id = ?",
                (state, self._now(), session_id)
            )

            # Emit SSE event for real-time UI updates
            self._emit_state_change(session_id, state)

            return True
        except Exception:
            return False
        finally:
            db.close()

    def _emit_state_change(self, session_id: str, state: str) -> None:
        """Emit session state change event to SSE subscribers.

        Handles async event emission from sync context using asyncio patterns.
        """
        import asyncio
        from utils.event_bus import emit_session_state

        try:
            # Try to get running event loop (FastAPI context)
            loop = asyncio.get_running_loop()
            asyncio.create_task(emit_session_state(session_id, state))
        except RuntimeError:
            # No running loop - try to schedule on existing loop
            try:
                loop = asyncio.get_event_loop()
                asyncio.run_coroutine_threadsafe(
                    emit_session_state(session_id, state),
                    loop
                )
            except Exception:
                pass  # Best effort - don't fail session updates if SSE fails

    def append_activity(self, session_id: str, event: dict) -> bool:
        """Append event to live_output JSONL.

        Note: The sessions table doesn't have live_output column yet.
        This is a placeholder for future implementation.
        """
        # TODO: Add live_output column to sessions table or use separate activity table
        return True

    # =========================================================================
    # END
    # =========================================================================

    def end(
        self,
        session_id: str,
        reason: str = "exit",
        close_tmux: bool = True,
    ) -> bool:
        """End a session gracefully.

        1. Check if already ended (idempotent)
        2. Mark ended_at in DB
        3. Optionally close tmux window
        
        NOTE: Does NOT directly update mission_executions. Missions track via
        conversation_id which persists across session resets. Mission completion
        is determined by whether ANY session in the conversation is still active.
        See cleanup_orphan_mission_executions() for that logic.
        """
        # Check if session exists and isn't already ended
        session = self.get_session(session_id)
        if session is None:
            return False
        if session.ended_at is not None:
            return True  # Already ended, idempotent success

        # Mark as ended in DB
        db = self._get_db()
        try:
            now = self._now()
            db.execute("""
                UPDATE sessions
                SET ended_at = ?, end_reason = ?, current_state = 'ended', updated_at = ?
                WHERE session_id = ?
            """, (now, reason, now, session_id))
        finally:
            db.close()

        # Emit session/ended event (old system for timeline)
        emit_event(
            "session",
            "ended",
            actor=session_id,
            data={
                "role": session.role,
                "mode": session.mode,
                "reason": reason,
            }
        )

        # NOTE: SSE event emission removed here (Jan 2026)
        # SessionManager runs in various contexts (MCP tools, hooks, CLI) that
        # don't share an event loop with the FastAPI backend. For SSE events:
        # - API endpoints: use `await event_bus.publish()` directly
        # - MCP tools: use HTTP POST to /api/system/sessions/notify-event
        # The caller is responsible for emitting SSE events if needed.

        # Optionally close tmux window/pane
        if close_tmux and session.tmux_pane:
            try:
                subprocess.run(
                    ["tmux", "kill-pane", "-t", session.tmux_pane],
                    capture_output=True
                )
            except:
                pass  # Pane might already be gone

        return True

    def cleanup_orphans(self, max_age_hours: int = 2) -> int:
        """Find and end orphaned sessions.

        Orphan = no heartbeat in max_age_hours AND tmux pane doesn't exist.
        Returns count of cleaned sessions.
        """
        db = self._get_db()
        cleaned = 0

        try:
            # Find potentially orphaned sessions
            rows = db.fetchall("""
                SELECT session_id, tmux_pane, last_seen_at
                FROM sessions
                WHERE ended_at IS NULL
            """)

            now = datetime.now(timezone.utc)

            for row in rows:
                session_id = row["session_id"]
                tmux_pane = row["tmux_pane"]
                last_seen = row["last_seen_at"]

                # Parse last_seen timestamp
                try:
                    if last_seen:
                        # Handle both ISO format variants
                        last_seen = last_seen.replace("Z", "+00:00")
                        if "+" not in last_seen and last_seen.count(":") < 3:
                            last_seen += "+00:00"
                        last_seen_dt = datetime.fromisoformat(last_seen)
                        age_hours = (now - last_seen_dt).total_seconds() / 3600
                    else:
                        age_hours = float("inf")
                except:
                    age_hours = float("inf")

                # Skip if recently active
                if age_hours < max_age_hours:
                    continue

                # Check if tmux pane still exists
                pane_exists = False
                if tmux_pane:
                    result = subprocess.run(
                        ["tmux", "has-session", "-t", tmux_pane.split(":")[0]],
                        capture_output=True
                    )
                    if result.returncode == 0:
                        # Session exists, check pane
                        result = subprocess.run(
                            ["tmux", "list-panes", "-t", tmux_pane, "-F", "#{pane_id}"],
                            capture_output=True
                        )
                        pane_exists = result.returncode == 0

                # If pane doesn't exist and old enough, clean up
                if not pane_exists:
                    self.end(session_id, reason="orphan_cleanup", close_tmux=False)
                    cleaned += 1

        finally:
            db.close()

        return cleaned

    def cleanup_orphan_mission_executions(self) -> int:
        """Find and complete orphaned mission executions.
        
        A mission execution is orphaned if:
        - status = 'running'
        - AND no active session exists with that mission_execution_id
        
        This handles cases where:
        - Mission session was killed externally
        - System crashed during mission
        - Session ended without proper cleanup
        
        Returns count of cleaned executions.
        """
        db = self._get_db()
        cleaned = 0
        now = self._now()
        
        try:
            # Find running mission executions with no active session
            orphaned = db.fetchall("""
                SELECT me.id, me.mission_slug, me.session_id
                FROM mission_executions me
                LEFT JOIN sessions s ON s.mission_execution_id = me.id
                    AND s.ended_at IS NULL
                WHERE me.status = 'running'
                AND s.session_id IS NULL
            """)
            
            for row in orphaned:
                exec_id = row["id"]
                
                # Check if there's a most recent session that had this execution
                last_session = db.fetchone("""
                    SELECT end_reason FROM sessions 
                    WHERE mission_execution_id = ?
                    ORDER BY ended_at DESC
                    LIMIT 1
                """, (exec_id,))
                
                # Determine final status based on how session ended
                if last_session:
                    reason = last_session["end_reason"]
                    if reason == "exit":
                        status = "completed"
                    elif reason == "timeout":
                        status = "timeout"
                    elif reason in ("crash", "error"):
                        status = "failed"
                    else:
                        status = "cancelled"
                else:
                    # No session found at all - must have failed to start
                    status = "failed"
                
                # Update the mission execution
                db.execute("""
                    UPDATE mission_executions
                    SET status = ?, ended_at = ?
                    WHERE id = ?
                """, (status, now, exec_id))
                
                cleaned += 1
                
        finally:
            db.close()
        
        return cleaned

    # =========================================================================
    # HANDOFF
    # =========================================================================

    def handoff(
        self,
        session_id: str,
        handoff_path: str,
        reason: str = "context_low",
    ) -> SpawnResult:
        """End current session and spawn replacement.

        1. Get current session info
        2. Create handoff record in DB
        3. End old session (marks DB, kills pane)
        4. Spawn new session with same role/mode
        5. Update handoff record with result
        """
        now = self._now()

        # 1. Get current session info
        session = self.get_session(session_id)
        if not session:
            return SpawnResult(success=False, error="Session not found")

        # 2. Create handoff record
        handoff_id = str(uuid.uuid4())
        db = self._get_db()
        try:
            db.execute("""
                INSERT INTO handoffs
                (id, session_id, role, mode, tmux_pane, handoff_path, reason,
                 status, requested_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'executing', ?, ?, ?)
            """, (
                handoff_id, session_id, session.role, session.mode,
                session.tmux_pane, handoff_path, reason, now, now, now
            ))
        finally:
            db.close()

        # 3. End old session
        self.end(session_id, reason="handoff", close_tmux=True)

        # Brief pause to let tmux clean up
        time.sleep(0.5)

        # 4. Spawn replacement
        # For chief, use stable "chief" window name
        window_name = "chief" if session.role == "chief" else None

        # Get conversation_id to inherit (must query before spawn)
        db2 = self._get_db()
        try:
            row = db2.fetchone(
                "SELECT conversation_id FROM sessions WHERE session_id = ?",
                (session_id,)
            )
            inherited_conversation_id = row["conversation_id"] if row else None
        finally:
            db2.close()

        result = self.spawn(
            role=session.role,
            mode=session.mode,
            window_name=window_name,
            handoff_path=handoff_path,
            handoff_reason=reason,
            # Inherit tracking IDs across resets!
            mission_execution_id=session.mission_execution_id,
            conversation_id=inherited_conversation_id,
            parent_session_id=session_id,
        )

        # 5. Update handoff record
        db = self._get_db()
        try:
            if result.success:
                db.execute("""
                    UPDATE handoffs
                    SET status = 'complete', completed_at = ?, new_session_id = ?, updated_at = ?
                    WHERE id = ?
                """, (self._now(), result.session_id, self._now(), handoff_id))
            else:
                db.execute("""
                    UPDATE handoffs
                    SET status = 'failed', error = ?, updated_at = ?
                    WHERE id = ?
                """, (result.error, self._now(), handoff_id))
        finally:
            db.close()

        return result

    # =========================================================================
    # MESSAGING
    # =========================================================================

    def send_message(self, session_id: str, message: str) -> bool:
        """Send a message to a session via tmux."""
        session = self.get_session(session_id)
        if not session or not session.tmux_pane:
            return False

        return inject_message(session.tmux_pane, message, source="Dashboard")

    def focus(self, session_id: str) -> bool:
        """Switch tmux to session's window."""
        session = self.get_session(session_id)
        if not session or not session.tmux_pane:
            return False

        try:
            # Extract window name from pane identifier
            # Pane format is usually "life:window.pane" or "%N"
            pane = session.tmux_pane
            if ":" in pane:
                window = pane.split(":")[1].split(".")[0]
            else:
                window = pane

            subprocess.run(
                ["tmux", "select-window", "-t", f"{TMUX_SESSION}:{window}"],
                check=True
            )
            return True
        except:
            return False

    # =========================================================================
    # CHIEF-SPECIFIC OPERATIONS
    # =========================================================================

    # Message templates for Chief
    CHIEF_MESSAGE_TEMPLATES = {
        "wake": """[WAKE:{wake_type}]
Time: {time} ({minutes_since_last}m since last wake)
{event_alert}
WILL'S STATE:
- Active window: {active_window}
- Idle: {idle_minutes}m
{activity_summary}

WORKERS:
{worker_summary}

SCHEDULE:
{schedule}

SESSIONS:
{sessions}""",

        "drop": """[DROP] {message}

No response needed. File this and continue what you were doing.""",

        "bug": """[BUG] {message}

Add to TODAY.md Open Loops with bug tag. Brief acknowledgment.""",

        "idea": """[IDEA] {message}

Capture to Claude/ideas.md or appropriate place. Brief acknowledgment.""",

        "dump": """[BRAIN-DUMP]
{message}

Rapid capture mode. File each item silently. Say "Done." when complete.""",

        "say": "{message}",
    }

    def get_chief_status(self) -> dict:
        """Check if Chief is running. Returns status dict."""
        tmux_exists = self._tmux_session_exists()
        window_exists = self._window_exists("chief") if tmux_exists else False
        claude_running = self._is_claude_running("chief") if window_exists else False

        return {
            "session_exists": tmux_exists,
            "window_exists": window_exists,
            "claude_running": claude_running,
            "active_window": self._get_active_window() if tmux_exists else "unknown",
        }

    def _tmux_session_exists(self) -> bool:
        """Check if the life tmux session exists."""
        result = subprocess.run(
            ["tmux", "has-session", "-t", TMUX_SESSION],
            capture_output=True
        )
        return result.returncode == 0

    def _get_active_window(self) -> str:
        """Get the currently active tmux window name."""
        result = subprocess.run(
            ["tmux", "display-message", "-t", TMUX_SESSION, "-p", "#{window_name}"],
            capture_output=True,
            text=True
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"

    def _get_all_windows(self) -> str:
        """Get comma-separated list of all window names."""
        result = subprocess.run(
            ["tmux", "list-windows", "-t", TMUX_SESSION, "-F", "#W"],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            return ""
        return ", ".join(result.stdout.strip().split("\n"))

    def _get_schedule_snippet(self) -> str:
        """Extract today's schedule from TODAY.md."""
        import re
        today_md = self.repo_root / "Desktop" / "TODAY.md"
        if not today_md.exists():
            return "(no schedule found)"

        content = today_md.read_text()
        match = re.search(r"### Today's Schedule\n(.*?)(?=\n###|\n<!-- END|\Z)", content, re.DOTALL)
        if not match:
            return "(no schedule found)"

        schedule = match.group(1).strip()
        lines = schedule.split("\n")[:5]
        return "\n".join(lines)

    def _get_activity_summary(self, since_minutes: int = 15) -> tuple[str, float]:
        """Get activity summary for wake message.

        Returns:
            tuple of (formatted_string, idle_minutes):
            - formatted_string: app breakdown for display
            - idle_minutes: total idle time in minutes (for enriched context)
        """
        db = self._get_db()
        try:
            rows = db.fetchall("""
                SELECT frontmost_app, idle_seconds
                FROM activity_log
                WHERE timestamp > datetime('now', ? || ' minutes')
                ORDER BY timestamp ASC
            """, (f"-{since_minutes}",))
        finally:
            db.close()

        if not rows:
            return ("(no activity data - backend may need restart)", 0.0)

        # Aggregate by app (30 second samples)
        app_seconds = {}
        idle_samples = 0
        sample_interval = 30

        for row in rows:
            app = row["frontmost_app"] or "Unknown"
            idle = row["idle_seconds"] or 0

            if app not in app_seconds:
                app_seconds[app] = 0
            app_seconds[app] += sample_interval

            if idle > 120:  # >2 min since last input = idle
                idle_samples += 1

        # Convert to minutes and format
        app_minutes = {app: round(secs / 60, 1) for app, secs in app_seconds.items()}
        app_minutes = dict(sorted(app_minutes.items(), key=lambda x: x[1], reverse=True))

        idle_minutes = round(idle_samples * sample_interval / 60, 1)

        # Format output - app breakdown only (idle shown separately now)
        lines = []
        for app, mins in list(app_minutes.items())[:5]:  # Top 5 apps
            lines.append(f"- {app}: {mins} min")

        summary = "\n".join(lines) if lines else "(no activity)"
        return (summary, idle_minutes)

    def _get_sessions_summary(self) -> str:
        """Get active sessions summary for wake message."""
        sessions = self.get_active_sessions()
        if not sessions:
            return "(no active sessions)"

        lines = []
        for s in sessions:
            status = s.status_text or "(no status)"
            # Truncate long status
            if len(status) > 40:
                status = status[:37] + "..."
            lines.append(f"- {s.role}-{s.session_id[:8]}: {status}")

        return "\n".join(lines)

    def _get_worker_summary(self) -> str:
        """Get worker summary for wake message.

        Returns formatted string with pending/running/completed-unacked counts.
        Workers table uses status values: pending, running, complete, complete, etc.
        """
        db = self._get_db()
        try:
            # Get counts by status category
            rows = db.fetchall("""
                SELECT
                    CASE
                        WHEN status = 'pending' THEN 'pending'
                        WHEN status = 'running' THEN 'running'
                        WHEN status = 'complete' THEN 'unacked'
                        WHEN status = 'failed' THEN 'failed'
                        ELSE 'other'
                    END as category,
                    COUNT(*) as count
                FROM workers
                WHERE status IN ('pending', 'running', 'complete', 'failed')
                GROUP BY category
            """)

            counts = {row["category"]: row["count"] for row in rows}

        finally:
            db.close()

        pending = counts.get("pending", 0)
        running = counts.get("running", 0)
        unacked = counts.get("unacked", 0)
        failed = counts.get("failed", 0)

        if pending == 0 and running == 0 and unacked == 0 and failed == 0:
            return "None active"

        parts = []
        if running > 0:
            parts.append(f"{running} running")
        if pending > 0:
            parts.append(f"{pending} pending")
        if unacked > 0:
            parts.append(f"{unacked} complete (unacked)")
        if failed > 0:
            parts.append(f"{failed} failed (unacked)")

        return ", ".join(parts) if parts else "None active"

    def send_to_chief(self, message_type: str, message: str = "", **kwargs) -> bool:
        """Send a formatted message to Chief.

        Args:
            message_type: One of 'wake', 'drop', 'bug', 'idea', 'dump', 'say'
            message: Message content (not needed for 'wake')
            **kwargs: Additional context for wake messages:
                - wake_type: Type of wake (HEARTBEAT, PRE_EVENT, POST_EVENT, WORKER, etc.)
                - minutes_since_last: Minutes since last wake
                - event_title: For calendar wakes, the event that triggered the wake

        Returns:
            True if message was sent successfully
        """
        if not self._window_exists("chief"):
            return False
        if not self._is_claude_running("chief"):
            return False

        # Build the formatted message
        if message_type == "wake":
            from datetime import datetime

            # Get activity summary (returns tuple now)
            activity_summary, idle_minutes = self._get_activity_summary(since_minutes=15)

            # Build event alert section for calendar-triggered wakes
            wake_type = kwargs.get("wake_type", "HEARTBEAT")
            event_title = kwargs.get("event_title")
            event_alert = ""
            if wake_type == "PRE_EVENT" and event_title:
                event_alert = f"\n⏰ UPCOMING: \"{event_title}\" starting in 5-10 minutes!\n"
            elif wake_type == "POST_EVENT" and event_title:
                event_alert = f"\n✅ JUST ENDED: \"{event_title}\" - How did it go?\n"

            context = {
                "time": datetime.now().strftime("%H:%M"),
                "active_window": self._get_active_window(),
                "schedule": self._get_schedule_snippet(),
                "activity_summary": activity_summary,
                "idle_minutes": round(idle_minutes, 1),
                "sessions": self._get_sessions_summary(),
                "worker_summary": self._get_worker_summary(),
                "event_alert": event_alert,
                # Defaults that can be overridden by kwargs
                "wake_type": wake_type,
                "minutes_since_last": kwargs.get("minutes_since_last", "?"),
            }
            formatted = self.CHIEF_MESSAGE_TEMPLATES["wake"].format(**context)
        elif message_type in self.CHIEF_MESSAGE_TEMPLATES:
            formatted = self.CHIEF_MESSAGE_TEMPLATES[message_type].format(message=message)
        else:
            formatted = message

        # Send via tmux
        target = f"{TMUX_SESSION}:chief"
        return inject_message(target, formatted, delay=0.2)

    def spawn_chief(self, handoff_path: Optional[str] = None) -> "SpawnResult":
        """Convenience method to spawn Chief with standard settings."""
        return self.spawn(
            role="chief",
            mode="interactive",
            window_name="chief",
            handoff_path=handoff_path,
            handoff_reason="chief_respawn" if handoff_path else None,
        )

    def reset_chief(self) -> SpawnResult:
        """Force reset Chief - kill current Claude and spawn fresh.

        Use when Chief is out of context or unresponsive and can't
        do a proper session_handoff.
        """
        target = f"{TMUX_SESSION}:chief"

        # 1. Kill current Claude process in chief window
        if self._window_exists("chief"):
            subprocess.run(
                ["tmux", "send-keys", "-t", target, "C-c"],
                capture_output=True
            )
            time.sleep(1.5)  # Wait for process to die

            # Send another Ctrl-C in case first didn't work
            subprocess.run(
                ["tmux", "send-keys", "-t", target, "C-c"],
                capture_output=True
            )
            time.sleep(0.5)

        # 2. Mark old chief session as ended in DB
        db = self._get_db()
        try:
            db.execute("""
                UPDATE sessions
                SET ended_at = ?, end_reason = 'force_reset', current_state = 'ended'
                WHERE role = 'chief' AND ended_at IS NULL
            """, (self._now(),))
        finally:
            db.close()

        # 3. Spawn fresh Chief
        return self.spawn_chief()

    def force_handoff(self, session_id: str) -> bool:
        """Inject a handoff warning into a session.

        Sends a system message telling Claude to perform a handoff immediately.
        Use when a session is running low on context or needs to be cycled.

        Returns True if message was sent successfully.
        """
        session = self.get_session(session_id)
        if not session or not session.tmux_pane:
            return False

        if session.ended_at is not None:
            return False

        message = """[SYSTEM WARNING - FORCE HANDOFF REQUESTED]

User has requested you perform an immediate session handoff.

Your context may be running low or a fresh session is needed.

**Action required:**
1. Write handoff notes to Workspace/working/ (or TODAY.md if you're Chief)
2. Call session_handoff() with the handoff path
3. If you have in-flight workers, wait for them or note their status

Do this NOW before continuing any other work."""

        return inject_message(session.tmux_pane, message, delay=0.2)

    # =========================================================================
    # TMUX HELPERS
    # =========================================================================

    def _ensure_tmux_session(self):
        """Ensure the life tmux session exists."""
        result = subprocess.run(
            ["tmux", "has-session", "-t", TMUX_SESSION],
            capture_output=True
        )
        if result.returncode != 0:
            subprocess.run([
                "tmux", "new-session", "-d", "-s", TMUX_SESSION,
                "-c", str(self.repo_root)
            ], check=True)

    def _window_exists(self, window_name: str) -> bool:
        """Check if a tmux window exists."""
        result = subprocess.run(
            ["tmux", "list-windows", "-t", TMUX_SESSION, "-F", "#{window_name}"],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            return False
        windows = result.stdout.strip().split("\n")
        return window_name in windows

    def _is_claude_running(self, window_name: str) -> bool:
        """Check if Claude is running in a window."""
        target = f"{TMUX_SESSION}:{window_name}"

        # Check pane command
        result = subprocess.run(
            ["tmux", "display-message", "-t", target, "-p", "#{pane_current_command}"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            cmd = result.stdout.strip().lower()
            if "claude" in cmd or "node" in cmd:
                return True

        # Check pane content for Claude indicators
        result = subprocess.run(
            ["tmux", "capture-pane", "-t", target, "-p"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            content = result.stdout
            last_lines = content.split("\n")[-5:]
            if any(">" in line for line in last_lines):
                return True

        return False

    def _create_window(self, window_name: str):
        """Create a new tmux window and wait for shell to be ready.

        Uses -d flag to prevent automatic focus switching. This is critical:
        without -d, tmux switches focus to the new window, and if user is
        typing in another window (e.g., Chief), his keystrokes interleave
        with the commands we send to the new window, corrupting both.
        """
        subprocess.run([
            "tmux", "new-window",
            "-d",  # Don't switch focus - prevents typing corruption
            "-t", TMUX_SESSION,
            "-n", window_name,
            "-c", str(self.repo_root)
        ], check=True)

        # Wait for shell to be ready (look for prompt)
        target = f"{TMUX_SESSION}:{window_name}"
        for _ in range(10):  # 2 seconds max
            time.sleep(0.2)
            result = subprocess.run(
                ["tmux", "capture-pane", "-t", target, "-p"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                content = result.stdout.strip()
                # Shell is ready when we see a prompt (ends with $ or %)
                if content and (content.endswith("$") or content.endswith("%") or "%" in content.split("\n")[-1]):
                    time.sleep(0.2)  # Extra moment
                    return
        # If we timeout, continue anyway with a small delay
        time.sleep(0.5)

    def _kill_window(self, window_name: str):
        """Kill a tmux window."""
        subprocess.run([
            "tmux", "kill-window",
            "-t", f"{TMUX_SESSION}:{window_name}"
        ], capture_output=True)

    def _start_claude_in_window(
        self,
        window_name: str,
        session_id: str,
        role: str,
        mode: str,
        description: Optional[str] = None,
        mission_execution_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        parent_session_id: Optional[str] = None,
    ):
        """Start Claude in an existing window."""
        target = f"{TMUX_SESSION}:{window_name}"

        # Build environment export command
        env_vars = [
            f"CLAUDE_SESSION_ID={session_id}",
            f"CLAUDE_SESSION_ROLE={role}",
            f"CLAUDE_SESSION_MODE={mode}",
        ]
        if description:
            # Escape quotes in description
            safe_desc = description.replace('"', '\\"')
            env_vars.append(f'CLAUDE_SESSION_DESCRIPTION="{safe_desc}"')
        if mission_execution_id:
            env_vars.append(f"MISSION_EXECUTION_ID={mission_execution_id}")
        if mode == "mission":
            env_vars.append("CLAUDE_SESSION_TYPE=mission")
        # Conversation tracking (Jan 2026)
        if conversation_id:
            env_vars.append(f"CLAUDE_CONVERSATION_ID={conversation_id}")
        if parent_session_id:
            env_vars.append(f"CLAUDE_PARENT_SESSION_ID={parent_session_id}")

        # Path resolution (Jan 2026) - prevent relative path bugs after cd
        env_vars.append(f"PROJECT_ROOT={REPO_ROOT}")
        # WORKSPACE only for specialist modes (preparation, implementation, verification)
        if mode in ("preparation", "implementation", "verification") and conversation_id:
            workspace_path = REPO_ROOT / "Desktop" / "working" / conversation_id
            env_vars.append(f"WORKSPACE={workspace_path}")

        env_cmd = "export " + " ".join(env_vars)

        # Send environment setup
        send_text(target, env_cmd, delay=0.3)

        # Start Claude with explicit session ID to bypass resume/picker UI
        # NOTE: Claude Code requires a full UUID for --session-id, not our short 8-char ID
        # Generate a fresh full UUID just for Claude Code's session management
        claude_session_uuid = str(uuid.uuid4())
        
        # Build Claude command with optional model flag
        cmd_parts = [
            "claude",
            "--dangerously-skip-permissions",
            f"--session-id {claude_session_uuid}",
        ]
        
        # Add model flag if configured
        model = get_model_for_role(role)
        if model:
            cmd_parts.append(f"--model {model}")
        
        send_text(target, " ".join(cmd_parts))

    def _wait_for_claude(self, window_name: str, timeout: int = 30) -> bool:
        """Wait for Claude to be ready for input."""
        target = f"{TMUX_SESSION}:{window_name}"
        waited = 0
        poll_interval = 0.5

        while waited < timeout:
            time.sleep(poll_interval)
            waited += poll_interval

            result = subprocess.run(
                ["tmux", "capture-pane", "-t", target, "-p"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                content = result.stdout
                # Claude is ready when we see the input prompt
                if ">" in content or "Claude Code" in content:
                    time.sleep(0.5)  # Extra moment to fully initialize
                    return True

        return False

    def _wait_for_response_complete(self, window_name: str, timeout: int = 60) -> bool:
        """Wait for Claude to finish processing a message and be ready for the next.

        After sending a message, Claude processes it and then shows the `>` prompt
        when ready for the next message. This method waits for that state.

        Different from _wait_for_claude: this waits for a RESPONSE to complete,
        not just for Claude to be initially ready.

        TWO-PHASE DETECTION:
        1. First, wait for Claude to START processing (prompt disappears from input)
        2. Then, wait for Claude to FINISH processing (prompt reappears + stable)

        This prevents false positives where we detect the prompt before Claude
        even started processing the message.
        """
        target = f"{TMUX_SESSION}:{window_name}"
        poll_interval = 0.5  # Faster polling for phase 1

        def has_input_prompt(content: str) -> bool:
            """Check if Claude Code's input prompt is visible.

            The input line looks like: "> [text]    ↵ send"
            We check the LAST line specifically since that's where the input prompt is.
            """
            lines = content.strip().split("\n")
            if not lines:
                return False
            # The input prompt is on the very last line with actual content
            # Look at last few lines to handle terminal padding
            for line in reversed(lines[-5:]):
                line = line.strip()
                if not line:
                    continue
                # The actual Claude Code input line has "↵" near the end
                if "↵" in line:
                    return True
                # If we hit a content line without ↵, no prompt visible
                break
            return False

        # PHASE 1: Wait for Claude to START processing (prompt disappears)
        # This ensures we don't false-detect the prompt before processing begins
        waited = 0
        prompt_gone_count = 0

        while waited < timeout / 2:  # Use half timeout for phase 1
            time.sleep(poll_interval)
            waited += poll_interval

            result = subprocess.run(
                ["tmux", "capture-pane", "-t", target, "-p"],
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                continue

            content = result.stdout

            if not has_input_prompt(content):
                prompt_gone_count += 1
                # Require 2 consecutive checks without prompt to confirm processing started
                if prompt_gone_count >= 2:
                    break
            else:
                prompt_gone_count = 0

        # If we never saw the prompt disappear, Claude might have already finished
        # (very fast response) - continue to phase 2

        # PHASE 2: Wait for Claude to FINISH processing (prompt reappears + stable)
        last_content = ""
        stable_count = 0
        poll_interval = 1.0  # Slower polling for stability check

        while waited < timeout:
            time.sleep(poll_interval)
            waited += poll_interval

            result = subprocess.run(
                ["tmux", "capture-pane", "-t", target, "-p"],
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                continue

            content = result.stdout

            # Check if Claude is ready for input (prompt visible)
            prompt_visible = has_input_prompt(content)

            # Check for stability - content hasn't changed
            if content == last_content:
                stable_count += 1
            else:
                stable_count = 0
                last_content = content

            # Ready when we see prompt AND content is stable for 2+ seconds
            if prompt_visible and stable_count >= 2:
                time.sleep(0.5)  # Extra moment to ensure ready
                return True

        return False

    def _build_prompt(
        self,
        role: str,
        mode: str,
        description: Optional[str] = None,
        project_path: Optional[str] = None,
        handoff_path: Optional[str] = None,
        handoff_content: Optional[str] = None,
        handoff_reason: Optional[str] = None,
        mission_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
    ) -> str:
        """Build the initial prompt to inject."""
        parts = []

        # Load role content (files already contain <session-role> tags)
        role_content = self._load_role_content(role, mode)
        parts.append(role_content)

        # Load mode content (files already contain <session-mode> tags)
        mode_content = self._load_mode_content(role, mode)
        parts.append(f"\n\n{mode_content}")

        # Add description if provided
        if description:
            parts.append(f"\n\n<session-description>\n{description}\n</session-description>")

        # Add workspace context for specialist modes (preparation, implementation, verification)
        if conversation_id and mode in ("preparation", "implementation", "verification"):
            workspace_abs = REPO_ROOT / "Desktop" / "working" / conversation_id
            parts.append(f"""

<specialist-workspace>
## Your Workspace

**Conversation ID:** {conversation_id}
**Workspace Path:** {workspace_abs}/

All your files are here:
- `{workspace_abs}/spec.md` — Original requirements from Chief
- `{workspace_abs}/plan.md` — Technical plan (created in preparation, read in implementation)
- `{workspace_abs}/progress.md` — Iteration history and verification feedback

**Start by reading the files in your workspace.**
</specialist-workspace>""")

        # Add project context if provided
        if project_path:
            project_name = Path(project_path).name
            parts.append(f"""

<target-project>
## Target Project: {project_name}

**Path:** {project_path}

This session is focused on the project at the path above. Start by loading project context:

1. Check for CLAUDE.md: `{project_path}/CLAUDE.md`
2. Check for specs: `{project_path}/specs/` or `{project_path}/LIFE-SPEC.md`
3. Understand the tech stack (package.json, requirements.txt, etc.)

Use absolute paths when working with project files.
</target-project>""")

        # Add handoff message if this is a handoff spawn
        if handoff_path:
            reason_text = handoff_reason or "context_low"
            parts.append(f"""

[AUTO-HANDOFF]
Previous session handed off to you.
Reason: {reason_text}
Handoff document: {handoff_path}

Read the handoff document and continue where they left off.
After reading, DELETE the handoff file (handoffs are ephemeral, sprints are persistent).
""")
        elif handoff_content:
            # Inline handoff content (used for mission execution handoffs)
            reason_text = handoff_reason or "mission_execution"
            parts.append(f"""

[AUTO-HANDOFF]
Previous session handed off to you.
Reason: {reason_text}

{handoff_content}
""")

        # Add mission context if this is a mission
        if mission_id and mode == "mission":
            parts.append(f"""

<mission-context>
You are executing Mission ID: {mission_id}
This is autonomous mode - user is not available for questions.

**BEFORE EXITING:**
1. Call: mcp__life__mission_complete("{mission_id}", "completed", "brief summary")
2. Wait for success
3. Then type /exit
</mission-context>""")

        return "\n".join(parts)

    def _load_role_content(self, role: str, mode: str) -> str:
        """Load role content from .claude/roles/{role}/role.md or .claude/missions/."""
        if mode == "mission":
            # For missions, role is the mission name
            mission_file = self.claude_dir / "missions" / f"{role}.md"
            if mission_file.exists():
                return mission_file.read_text()
            return f"# Mission: {role}\n\nMission file not found."

        # Regular role
        role_file = self.claude_dir / "roles" / role / "role.md"
        if role_file.exists():
            return role_file.read_text()

        # Fallback to chief
        fallback = self.claude_dir / "roles" / "chief" / "role.md"
        if fallback.exists():
            return f"<!-- Role '{role}' not found, using chief -->\n\n" + fallback.read_text()

        return f"<!-- Role file not found: {role} -->"

    def _load_mode_content(self, role: str, mode: str) -> str:
        """Load mode content from .claude/roles/{role}/{mode}.md.

        Role-specific modes live alongside role.md in each role's directory.
        E.g., .claude/roles/builder/interactive.md, .claude/roles/builder/preparation.md
        """
        # Role-specific mode file
        mode_file = self.claude_dir / "roles" / role / f"{mode}.md"
        if mode_file.exists():
            return mode_file.read_text()

        return f"<!-- Mode file not found: {role}/{mode} -->"

    def _inject_prompt(self, window_name: str, prompt: str):
        """Inject the initial prompt into the Claude session."""
        from services.messaging import get_messaging
        messaging = get_messaging(self.db_path)
        messaging.send_initial_prompt(window_name, prompt)


# =============================================================================
# CLI INTERFACE
# =============================================================================

def main():
    """CLI for SessionManager operations."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Session Manager - Unified session lifecycle management.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # spawn command
    spawn_parser = subparsers.add_parser("spawn", help="Spawn a new session")
    spawn_parser.add_argument("role", default="chief", nargs="?", help="Session role")
    spawn_parser.add_argument("mode", default="interactive", nargs="?", help="Session mode")
    spawn_parser.add_argument("--window", "-w", help="Tmux window name")
    spawn_parser.add_argument("--description", "-d", help="Session description")
    spawn_parser.add_argument("--project", "-p", help="Project path")
    spawn_parser.add_argument("--handoff", help="Handoff document path")
    spawn_parser.add_argument("--handoff-reason", default="context_low", help="Handoff reason")
    spawn_parser.add_argument("--mission-id", help="Mission ID")

    # end command
    end_parser = subparsers.add_parser("end", help="End a session")
    end_parser.add_argument("session_id", help="Session ID to end")
    end_parser.add_argument("--reason", default="exit", help="End reason")
    end_parser.add_argument("--keep-tmux", action="store_true", help="Don't close tmux pane")

    # cleanup command
    cleanup_parser = subparsers.add_parser("cleanup", help="Cleanup orphaned sessions")
    cleanup_parser.add_argument("--max-age", type=int, default=2, help="Max age in hours")

    # list command
    list_parser = subparsers.add_parser("list", help="List active sessions")

    # Chief-specific commands
    subparsers.add_parser("chief-spawn", help="Spawn Chief in persistent window")
    subparsers.add_parser("chief-reset", help="Force reset Chief (kill + respawn)")
    subparsers.add_parser("chief-status", help="Check if Chief is running (JSON)")
    subparsers.add_parser("chief-wake", help="Send [WAKE] to Chief")

    # Force handoff command
    force_handoff_parser = subparsers.add_parser("force-handoff", help="Inject handoff warning into a session")
    force_handoff_parser.add_argument("session_id", help="Session ID to send handoff warning to")

    for cmd in ["chief-drop", "chief-bug", "chief-idea", "chief-dump", "chief-say"]:
        p = subparsers.add_parser(cmd, help=f"Send message to Chief")
        p.add_argument("message", nargs="?", help="Message content")

    args = parser.parse_args()

    manager = SessionManager()

    if args.command == "spawn":
        result = manager.spawn(
            role=args.role,
            mode=args.mode,
            window_name=args.window,
            description=args.description,
            project_path=args.project,
            handoff_path=args.handoff,
            handoff_reason=args.handoff_reason,
            mission_id=args.mission_id,
        )
        if result.success:
            print(f"Spawned: {result.window_name} (session_id: {result.session_id})")
            return 0
        else:
            print(f"Failed: {result.error}", file=sys.stderr)
            return 1

    elif args.command == "end":
        success = manager.end(
            session_id=args.session_id,
            reason=args.reason,
            close_tmux=not args.keep_tmux,
        )
        if success:
            print(f"Ended session: {args.session_id}")
            return 0
        else:
            print(f"Failed to end session: {args.session_id}", file=sys.stderr)
            return 1

    elif args.command == "cleanup":
        count = manager.cleanup_orphans(max_age_hours=args.max_age)
        print(f"Cleaned up {count} orphaned sessions")
        return 0

    elif args.command == "list":
        sessions = manager.get_active_sessions()
        if not sessions:
            print("No active sessions")
        else:
            for s in sessions:
                print(f"{s.session_id}: {s.role}/{s.mode} - {s.status_text or '(no status)'}")
        return 0

    # Force handoff command
    elif args.command == "force-handoff":
        if manager.force_handoff(args.session_id):
            print(f"Handoff warning sent to session: {args.session_id}")
            return 0
        else:
            print(f"Failed to send handoff warning to: {args.session_id}", file=sys.stderr)
            return 1

    # Chief commands
    elif args.command == "chief-spawn":
        # Check for handoff file
        handoff_file = REPO_ROOT / "Desktop" / "handoffs" / "chief.md"
        handoff_path = None
        if handoff_file.exists():
            handoff_path = str(handoff_file.relative_to(REPO_ROOT))
            print(f"Found handoff file: {handoff_path}")

        result = manager.spawn_chief(handoff_path=handoff_path)
        if result.success:
            # Clear handoff file after successful spawn
            if handoff_path and handoff_file.exists():
                handoff_file.unlink()
                print("Handoff file cleared.")
            print(f"Chief spawned: {result.window_name} (session {result.session_id})")
            return 0
        else:
            print(f"Failed: {result.error}", file=sys.stderr)
            return 1

    elif args.command == "chief-reset":
        print("Force resetting Chief...")
        result = manager.reset_chief()
        if result.success:
            print(f"Chief reset complete: {result.window_name} (session {result.session_id})")
            return 0
        else:
            print(f"Failed: {result.error}", file=sys.stderr)
            return 1

    elif args.command == "chief-status":
        import json
        status = manager.get_chief_status()
        print(json.dumps(status, indent=2))
        return 0

    elif args.command == "chief-wake":
        if manager.send_to_chief("wake"):
            print("Wake sent.")
            return 0
        print("Failed to send wake", file=sys.stderr)
        return 1

    elif args.command and args.command.startswith("chief-"):
        # Handle chief-drop, chief-bug, chief-idea, chief-dump, chief-say
        msg_type = args.command.replace("chief-", "")
        if not args.message:
            print("Error: message required", file=sys.stderr)
            return 1
        if manager.send_to_chief(msg_type, args.message):
            print(f"{msg_type.capitalize()} sent.")
            return 0
        print(f"Failed to send {msg_type}", file=sys.stderr)
        return 1

    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
