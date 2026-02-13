"""
Session service - business logic for session lifecycle management.

Single source of truth for all session operations:
- Spawning sessions (all types)
- Querying session state
- State updates (heartbeat, status, activity)
- Ending sessions
- Handoff orchestration
- Cleanup operations

"""

import os
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from core.event_log import emit_event
from core.tmux import send_text, inject_message

from .models import Session, SpawnResult
from .repository import SessionRepository


# Constants
TMUX_SESSION = "life"
DEFAULT_MODELS = {
    "chief": "opus",
    "builder": "sonnet",
    "writer": "sonnet",
    "researcher": "sonnet",
    "curator": "sonnet",
    "project": "sonnet",
    "idea": "sonnet",
}

# Default paths (computed once)
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DB_PATH = _REPO_ROOT / ".engine" / "data" / "db" / "system.db"


class SessionService:
    """
    Unified session lifecycle manager.

    Single source of truth for:
    - Spawning sessions (all types)
    - Querying session state
    - State updates (heartbeat, status, activity)
    - Ending sessions gracefully
    - Handoff orchestration
    - Cleanup operations
    """

    def __init__(self, db_path: Path = None, repo_root: Path = None):
        self.repo_root = repo_root or _REPO_ROOT
        self.db_path = db_path or _DB_PATH
        self.claude_dir = self.repo_root / ".claude"
        self.sessions_dir = self.repo_root / "Desktop" / "sessions"
        self.repository = SessionRepository(self.db_path)

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
        spec_path: Optional[str] = None,
    ) -> SpawnResult:
        """
        Spawn a new Claude session in tmux.

        This is THE way to create sessions. All other code calls this.
        """
        window_created = False

        try:
            # Generate session ID
            session_id = uuid.uuid4().hex[:8]

            # Generate conversation_id if not inheriting
            if conversation_id is None:
                if role == "chief":
                    # Eternal conversation for Chief - stable folder
                    conversation_id = "chief"
                else:
                    # Unique conversation per specialist task
                    # Format: MMDD-HHMM-{role}-{id} for timeline sorting
                    from datetime import datetime
                    timestamp = datetime.now().strftime("%m%d-%H%M")
                    conversation_id = f"{timestamp}-{role}-{uuid.uuid4().hex[:8]}"

            # Determine window name
            if window_name is None:
                window_name = f"{role}-{session_id}"

            # Ensure tmux session exists
            self._ensure_tmux_session()

            # Check if window already exists
            if self._window_exists(window_name):
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
                spec_path=spec_path,
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
                spec_path=spec_path,
            )

            if initial_task:
                prompt = prompt + "\n\n" + initial_task

            self._inject_prompt(window_name, prompt)

            # Emit session/started event
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
        return self.repository.get_session(session_id)

    def get_active_sessions(self) -> list[Session]:
        """Get all sessions where ended_at IS NULL."""
        return self.repository.get_active_sessions()

    def find_session_by_pane(self, tmux_pane: str) -> Optional[Session]:
        """Find active session in a tmux pane."""
        return self.repository.find_session_by_pane(tmux_pane)

    def get_current_session(self) -> Optional[Session]:
        """Get session for current process (via env vars or pane lookup)."""
        session_id = os.environ.get("CLAUDE_SESSION_ID")
        if session_id:
            return self.get_session(session_id)

        tmux_pane = os.environ.get("TMUX_PANE")
        if tmux_pane:
            return self.find_session_by_pane(tmux_pane)

        return None

    # =========================================================================
    # STATE UPDATES
    # =========================================================================

    def heartbeat(self, session_id: str) -> bool:
        """Update last_seen_at timestamp."""
        return self.repository.heartbeat(session_id)

    def set_status(self, session_id: str, status_text: str) -> bool:
        """Set session status_text."""
        return self.repository.set_status(session_id, status_text)

    # NOTE: set_state() removed - was dead code. Real-time activity comes from
    # tmux parsing in claude_status.py, which is more accurate. current_state
    # in DB only gets set to "ended" via mark_ended().

    # =========================================================================
    # END
    # =========================================================================

    def end(
        self,
        session_id: str,
        reason: str = "exit",
        close_tmux: bool = True,
    ) -> bool:
        """End a session gracefully."""
        session = self.get_session(session_id)
        if session is None:
            return False
        if session.ended_at is not None:
            return True  # Already ended, idempotent

        # Mark as ended in DB
        self.repository.mark_ended(session_id, reason)

        # Emit event
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

        # Optionally close tmux pane
        if close_tmux and session.tmux_pane:
            try:
                subprocess.run(
                    ["tmux", "kill-pane", "-t", session.tmux_pane],
                    capture_output=True
                )
            except:
                pass

        return True

    def cleanup_orphans(self, max_age_hours: int = 2) -> int:
        """Find and end orphaned sessions."""
        rows = self.repository.get_potentially_orphaned_sessions()
        now = datetime.now(timezone.utc)
        cleaned = 0

        for row in rows:
            session_id = row["session_id"]
            tmux_pane = row["tmux_pane"]
            last_seen = row["last_seen_at"]

            # Parse last_seen timestamp
            try:
                if last_seen:
                    last_seen = last_seen.replace("Z", "+00:00")
                    if "+" not in last_seen and last_seen.count(":") < 3:
                        last_seen += "+00:00"
                    last_seen_dt = datetime.fromisoformat(last_seen)
                    age_hours = (now - last_seen_dt).total_seconds() / 3600
                else:
                    age_hours = float("inf")
            except:
                age_hours = float("inf")

            if age_hours < max_age_hours:
                continue

            # Check if tmux pane exists
            pane_exists = False
            if tmux_pane:
                result = subprocess.run(
                    ["tmux", "has-session", "-t", tmux_pane.split(":")[0]],
                    capture_output=True
                )
                if result.returncode == 0:
                    result = subprocess.run(
                        ["tmux", "list-panes", "-t", tmux_pane, "-F", "#{pane_id}"],
                        capture_output=True
                    )
                    pane_exists = result.returncode == 0

            if not pane_exists:
                self.end(session_id, reason="orphan_cleanup", close_tmux=False)
                cleaned += 1

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
        """End current session and spawn replacement."""
        session = self.get_session(session_id)
        if not session:
            return SpawnResult(success=False, error="Session not found")

        # Create handoff record
        handoff_id = self.repository.create_handoff(
            session_id=session_id,
            role=session.role,
            mode=session.mode,
            tmux_pane=session.tmux_pane,
            handoff_path=handoff_path,
            reason=reason,
        )

        # End old session
        self.end(session_id, reason="handoff", close_tmux=True)
        time.sleep(0.5)

        # Get conversation_id to inherit
        inherited_conversation_id = self.repository.get_conversation_id(session_id)

        # Spawn replacement
        window_name = "chief" if session.role == "chief" else None
        result = self.spawn(
            role=session.role,
            mode=session.mode,
            window_name=window_name,
            handoff_path=handoff_path,
            handoff_reason=reason,
            mission_execution_id=session.mission_execution_id,
            conversation_id=inherited_conversation_id,
            parent_session_id=session_id,
            spec_path=session.spec_path,
        )

        # Update handoff record
        if result.success:
            self.repository.complete_handoff(handoff_id, result.session_id)
        else:
            self.repository.fail_handoff(handoff_id, result.error)

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

    def send_keystroke(self, session_id: str, text: str) -> bool:
        """Send raw keystrokes to a session (no prefix).

        Used for interactive prompts like AskUserQuestion where
        we need to send exactly what the user would type.
        """
        session = self.get_session(session_id)
        if not session or not session.tmux_pane:
            return False
        return send_text(session.tmux_pane, text, submit=True)

    def focus(self, session_id: str) -> bool:
        """Switch tmux to session's window."""
        session = self.get_session(session_id)
        if not session or not session.tmux_pane:
            return False

        try:
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
    # CHIEF-SPECIFIC
    # =========================================================================

    CHIEF_MESSAGE_TEMPLATES = {
        "wake": """[WAKE:{wake_type}]
Time: {time} ({minutes_since_last}m since last wake)
{event_alert}
WILL'S STATE:
- Active window: {active_window}
- Idle: {idle_minutes}m
{activity_summary}

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
        """Check if Chief is running."""
        tmux_exists = self._tmux_session_exists()
        window_exists = self._window_exists("chief") if tmux_exists else False
        claude_running = self._is_claude_running("chief") if window_exists else False

        return {
            "session_exists": tmux_exists,
            "window_exists": window_exists,
            "claude_running": claude_running,
            "active_window": self._get_active_window() if tmux_exists else "unknown",
        }

    def spawn_chief(self, handoff_path: Optional[str] = None, force: bool = False) -> SpawnResult:
        """Spawn Chief with standard settings.

        Args:
            handoff_path: Path to handoff document for context continuity
            force: If True, kill existing Claude session first
        """
        if force and self._is_claude_running("chief"):
            return self.reset_chief(handoff_path=handoff_path)

        return self.spawn(
            role="chief",
            mode="interactive",
            window_name="chief",
            handoff_path=handoff_path,
            handoff_reason="chief_respawn" if handoff_path else None,
        )

    def reset_chief(self, handoff_path: Optional[str] = None) -> SpawnResult:
        """Force reset Chief - handles all edge cases.

        Cases handled:
        1. Window doesn't exist → create and spawn
        2. Window exists, empty shell → just spawn
        3. Window exists, Claude running → kill Claude, then spawn
        """
        target = f"{TMUX_SESSION}:chief"

        # Ensure tmux session exists
        self._ensure_tmux_session()

        # Case 1: Window doesn't exist
        if not self._window_exists("chief"):
            return self.spawn_chief(handoff_path=handoff_path)

        # Case 2 & 3: Window exists - check if Claude is running
        if self._is_claude_running("chief"):
            # Send Ctrl+C to interrupt Claude
            for i in range(3):  # Multiple attempts
                subprocess.run(
                    ["tmux", "send-keys", "-t", target, "C-c"],
                    capture_output=True
                )
                time.sleep(0.5)

            # Wait for Claude to actually exit (up to 5 seconds)
            for i in range(10):
                if not self._is_claude_running("chief"):
                    break
                time.sleep(0.5)

            # If still running, try harder - send exit command
            if self._is_claude_running("chief"):
                subprocess.run(
                    ["tmux", "send-keys", "-t", target, "/exit", "C-m"],
                    capture_output=True
                )
                time.sleep(1.0)

            # Final check - if STILL running, kill the pane and recreate
            if self._is_claude_running("chief"):
                self._kill_window("chief")
                time.sleep(0.5)
        # Mark all Chief sessions as ended in DB
        self.repository.mark_all_chief_ended("force_reset")

        # Now spawn fresh
        return self.spawn_chief(handoff_path=handoff_path)

    def force_handoff(self, session_id: str) -> bool:
        """Inject a handoff warning into a session."""
        session = self.get_session(session_id)
        if not session or not session.tmux_pane:
            return False
        if session.ended_at is not None:
            return False

        message = """[SYSTEM WARNING - FORCE HANDOFF REQUESTED]

The user has requested you perform an immediate session handoff.

Your context may be running low or a fresh session is needed.

**Action required:**
1. Write handoff notes to Workspace/working/ (or TODAY.md if you're Chief)
2. Call session_handoff() with the handoff path
3. If you have in-flight workers, wait for them or note their status

Do this NOW before continuing any other work."""

        return inject_message(session.tmux_pane, message, delay=0.2)

    def send_to_chief(self, message_type: str, message: str = "", **kwargs) -> bool:
        """Send a formatted message to Chief."""
        if not self._window_exists("chief"):
            return False
        if not self._is_claude_running("chief"):
            return False

        if message_type == "wake":
            activity_summary, idle_minutes = self._get_activity_summary(since_minutes=15)
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
                "event_alert": event_alert,
                "wake_type": wake_type,
                "minutes_since_last": kwargs.get("minutes_since_last", "?"),
            }
            formatted = self.CHIEF_MESSAGE_TEMPLATES["wake"].format(**context)
        elif message_type in self.CHIEF_MESSAGE_TEMPLATES:
            formatted = self.CHIEF_MESSAGE_TEMPLATES[message_type].format(message=message)
        else:
            formatted = message

        target = f"{TMUX_SESSION}:chief"
        return inject_message(target, formatted, delay=0.2)

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

    def _tmux_session_exists(self) -> bool:
        """Check if the life tmux session exists."""
        result = subprocess.run(
            ["tmux", "has-session", "-t", TMUX_SESSION],
            capture_output=True
        )
        return result.returncode == 0

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
        """Check if Claude is running in a window.

        Uses multiple detection methods:
        1. Check pane's process tree for 'claude' process
        2. Fallback: check pane content for Claude prompt indicators
        """
        target = f"{TMUX_SESSION}:{window_name}"

        # Method 1: Get pane PID and check its process tree
        result = subprocess.run(
            ["tmux", "display-message", "-t", target, "-p", "#{pane_pid}"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            pane_pid = result.stdout.strip()
            if pane_pid:
                # Check if any child process of this pane is claude
                ps_result = subprocess.run(
                    ["pgrep", "-P", pane_pid, "-l"],
                    capture_output=True,
                    text=True
                )
                if "claude" in ps_result.stdout.lower() or "node" in ps_result.stdout.lower():
                    return True

                # Also check grandchildren (claude spawns node)
                child_pids = ps_result.stdout.strip().split('\n')
                for line in child_pids:
                    if line:
                        child_pid = line.split()[0] if line.split() else None
                        if child_pid:
                            grandchild_result = subprocess.run(
                                ["pgrep", "-P", child_pid, "-l"],
                                capture_output=True,
                                text=True
                            )
                            if "claude" in grandchild_result.stdout.lower() or "node" in grandchild_result.stdout.lower():
                                return True

        # Method 2: Check pane content for Claude indicators
        result = subprocess.run(
            ["tmux", "capture-pane", "-t", target, "-p"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            content = result.stdout
            # Look for Claude-specific indicators
            indicators = ["claude", "Opus", "Sonnet", "ctx:", "╭", "╰", "⏵"]
            last_lines = content.split("\n")[-10:]
            for line in last_lines:
                if any(ind in line for ind in indicators):
                    return True
                # Also check for the Claude prompt character
                if ">" in line and ("$" not in line or "❯" in line):
                    return True

        return False

    def _create_window(self, window_name: str):
        """Create a new tmux window."""
        subprocess.run([
            "tmux", "new-window",
            "-d",
            "-t", TMUX_SESSION,
            "-n", window_name,
            "-c", str(self.repo_root)
        ], check=True)

        target = f"{TMUX_SESSION}:{window_name}"
        for _ in range(10):
            time.sleep(0.2)
            result = subprocess.run(
                ["tmux", "capture-pane", "-t", target, "-p"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                content = result.stdout.strip()
                if content and (content.endswith("$") or content.endswith("%") or "%" in content.split("\n")[-1]):
                    time.sleep(0.2)
                    return
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
        spec_path: Optional[str] = None,
    ):
        """Start Claude in an existing window."""
        target = f"{TMUX_SESSION}:{window_name}"

        env_vars = [
            f"CLAUDE_SESSION_ID={session_id}",
            f"CLAUDE_SESSION_ROLE={role}",
            f"CLAUDE_SESSION_MODE={mode}",
        ]
        if description:
            safe_desc = description.replace('"', '\\"')
            env_vars.append(f'CLAUDE_SESSION_DESCRIPTION="{safe_desc}"')
        if mission_execution_id:
            env_vars.append(f"MISSION_EXECUTION_ID={mission_execution_id}")
        if mode == "mission":
            env_vars.append("CLAUDE_SESSION_TYPE=mission")
        if conversation_id:
            env_vars.append(f"CLAUDE_CONVERSATION_ID={conversation_id}")
        if parent_session_id:
            env_vars.append(f"CLAUDE_PARENT_SESSION_ID={parent_session_id}")

        env_vars.append(f"PROJECT_ROOT={self.repo_root}")
        if spec_path:
            env_vars.append(f"SPEC_PATH={spec_path}")
        if mode in ("preparation", "implementation", "verification") and conversation_id:
            workspace_path = self.repo_root / "Desktop" / "conversations" / conversation_id
            env_vars.append(f"WORKSPACE={workspace_path}")

        env_cmd = "export " + " ".join(env_vars)
        send_text(target, env_cmd, delay=0.3)

        claude_session_uuid = str(uuid.uuid4())
        cmd_parts = [
            "claude",
            "--dangerously-skip-permissions",
            f"--session-id {claude_session_uuid}",
        ]

        model = self.repository.get_model_for_role(role, DEFAULT_MODELS)
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
                # Check for Claude ready indicators
                has_prompt = "❯" in content or content.strip().endswith(">")
                has_banner = "Claude Code" in content
                if has_prompt or has_banner:
                    time.sleep(0.5)
                    return True

        return False

    def _get_active_window(self) -> str:
        """Get the currently active tmux window name."""
        result = subprocess.run(
            ["tmux", "display-message", "-t", TMUX_SESSION, "-p", "#{window_name}"],
            capture_output=True,
            text=True
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"

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
        """Get activity summary for wake message."""
        rows = self.repository.get_activity_summary(since_minutes)

        if not rows:
            return ("(no activity data - backend may need restart)", 0.0)

        app_seconds = {}
        idle_samples = 0
        sample_interval = 30

        for row in rows:
            app = row["frontmost_app"] or "Unknown"
            idle = row["idle_seconds"] or 0

            if app not in app_seconds:
                app_seconds[app] = 0
            app_seconds[app] += sample_interval

            if idle > 120:
                idle_samples += 1

        app_minutes = {app: round(secs / 60, 1) for app, secs in app_seconds.items()}
        app_minutes = dict(sorted(app_minutes.items(), key=lambda x: x[1], reverse=True))
        idle_minutes = round(idle_samples * sample_interval / 60, 1)

        lines = []
        for app, mins in list(app_minutes.items())[:5]:
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
            if len(status) > 40:
                status = status[:37] + "..."
            lines.append(f"- {s.role}-{s.session_id[:8]}: {status}")

        return "\n".join(lines)

    # =========================================================================
    # PROMPT BUILDING
    # =========================================================================

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
        spec_path: Optional[str] = None,
    ) -> str:
        """Build the initial prompt to inject."""
        parts = []

        role_content = self._load_role_content(role, mode)
        parts.append(role_content)

        mode_content = self._load_mode_content(role, mode)
        parts.append(f"\n\n{mode_content}")

        if description:
            parts.append(f"\n\n<session-description>\n{description}\n</session-description>")

        if conversation_id and mode in ("preparation", "implementation", "verification"):
            workspace_abs = self.repo_root / "Desktop" / "conversations" / conversation_id
            if spec_path:
                parts.append(f"""

<specialist-workspace>
## Your Workspace

**Spec:** `{spec_path}` (on Desktop, read-only — do not modify)
**Runtime:** `{workspace_abs}/` (plan.md, progress.md — ephemeral working state)

Read the spec from its original location on Desktop.
Write your plan and progress to your workspace.
Write ALL deliverables to Desktop — in the appropriate domain or app folder.

Your workspace archives nightly. Nothing here persists.

**Start by reading the spec and your workspace files.**
</specialist-workspace>""")
            else:
                # Legacy fallback: no spec_path means spec.md was copied to workspace (old behavior)
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

        if project_path:
            project_name = Path(project_path).name
            parts.append(f"""

<target-project>
## Target Project: {project_name}

**Path:** {project_path}

This session is focused on the project at the path above.
</target-project>""")

        if handoff_path:
            reason_text = handoff_reason or "context_low"
            parts.append(f"""

[AUTO-HANDOFF]
Previous session handed off to you.
Reason: {reason_text}
Handoff document: {handoff_path}

Read the handoff document and continue where they left off.
Handoffs persist in chief/ for traceability — do not delete.
""")
        elif handoff_content:
            reason_text = handoff_reason or "mission_execution"
            parts.append(f"""

[AUTO-HANDOFF]
Previous session handed off to you.
Reason: {reason_text}

{handoff_content}
""")

        if mission_id and mode == "mission":
            parts.append(f"""

<mission-context>
You are executing Mission ID: {mission_id}
This is autonomous mode - the user is not available for questions.

**BEFORE EXITING:**
1. Call: mcp__life__mission_complete("{mission_id}", "completed", "brief summary")
2. Wait for success
3. Then type /exit
</mission-context>""")

        return "\n".join(parts)

    def _load_role_content(self, role: str, mode: str) -> str:
        """Load role content from .claude/roles/{role}/role.md."""
        if mode == "mission":
            mission_file = self.claude_dir / "missions" / f"{role}.md"
            if mission_file.exists():
                return mission_file.read_text()
            return f"# Mission: {role}\n\nMission file not found."

        role_file = self.claude_dir / "roles" / role / "role.md"
        if role_file.exists():
            return role_file.read_text()

        fallback = self.claude_dir / "roles" / "chief" / "role.md"
        if fallback.exists():
            return f"<!-- Role '{role}' not found, using chief -->\n\n" + fallback.read_text()

        return f"<!-- Role file not found: {role} -->"

    def _load_mode_content(self, role: str, mode: str) -> str:
        """Load mode content from .claude/roles/{role}/{mode}.md."""
        mode_file = self.claude_dir / "roles" / role / f"{mode}.md"
        if mode_file.exists():
            return mode_file.read_text()
        return f"<!-- Mode file not found: {role}/{mode} -->"

    def _inject_prompt(self, window_name: str, prompt: str) -> bool:
        """Inject the initial prompt into the Claude session."""
        from adapters.telegram.messaging import get_messaging
        messaging = get_messaging(self.db_path)
        return messaging.send_initial_prompt(window_name, prompt)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_session_folder(session_id: str, sessions_dir: Path) -> Path:
    """Get the session folder path for a given session ID."""
    short_id = session_id[:8] if len(session_id) > 8 else session_id
    return sessions_dir / short_id


def get_session_workers_folder(session_id: str, sessions_dir: Path) -> Path:
    """Get the workers folder for a session."""
    folder = get_session_folder(session_id, sessions_dir) / "workers"
    folder.mkdir(parents=True, exist_ok=True)
    return folder
