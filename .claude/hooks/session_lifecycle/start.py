"""SessionStart handler - Register session + load context."""

import os
import sys
from datetime import datetime
from pathlib import Path

from . import (
    repo_root, get_db, get_session_id, now_iso
)


def _timestamp() -> str:
    """Generate ISO timestamp for system messages."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def handle(input_data: dict):
    """Register session in DB and load context files."""
    session_id = get_session_id(input_data)

    if session_id:
        register_session(input_data, session_id)

    # Load context (prints to stdout for Claude)
    load_and_print_context(input_data, session_id)

    sys.exit(0)


def should_skip_registration(tmux_pane: str) -> bool:
    """Check if this session should skip DB registration.

    Some temporary windows (like usage-check) spawn Claude briefly
    and shouldn't pollute the sessions table.
    """
    import subprocess

    # Patterns that should skip registration
    skip_patterns = ['usage-check']

    try:
        # Get window name for this pane
        result = subprocess.run(
            ['tmux', 'display-message', '-t', tmux_pane, '-p', '#{window_name}'],
            capture_output=True,
            text=True,
            timeout=2
        )

        if result.returncode != 0:
            return False

        window_name = result.stdout.strip()

        for pattern in skip_patterns:
            if window_name.startswith(pattern):
                return True

        return False

    except Exception:
        return False


def register_session(input_data: dict, session_id: str):
    """Register session in database."""
    try:
        transcript_path = input_data.get('transcript_path')
        cwd = input_data.get('cwd')
        tmux_pane = os.environ.get('TMUX_PANE')

        # Skip registration for temporary utility windows (e.g., usage-check)
        if tmux_pane and should_skip_registration(tmux_pane):
            return

        # Extract Claude Code's full sessionId from transcript path
        # Transcript path format: ~/.claude/projects/{hash}/{session-uuid}.jsonl
        claude_session_id = None
        if transcript_path:
            from pathlib import Path
            claude_session_id = Path(transcript_path).stem  # UUID without .jsonl

        # RESILIENCE: End any stale sessions claiming this pane
        if tmux_pane:
            cleanup_stale_sessions_on_pane(tmux_pane, session_id)

        # Session taxonomy
        role = os.environ.get('CLAUDE_SESSION_ROLE')
        mode = os.environ.get('CLAUDE_SESSION_MODE')
        description = os.environ.get('CLAUDE_SESSION_DESCRIPTION')
        
        # Conversation tracking (Jan 2026)
        conversation_id = os.environ.get('CLAUDE_CONVERSATION_ID')
        parent_session_id = os.environ.get('CLAUDE_PARENT_SESSION_ID')
        spec_path = os.environ.get('SPEC_PATH')

        # Legacy env vars (backward compat)
        session_type = os.environ.get('CLAUDE_SESSION_TYPE', 'interactive')
        session_subtype = os.environ.get('CLAUDE_SESSION_SUBTYPE')
        mission_execution_id = os.environ.get('MISSION_EXECUTION_ID')

        # Map legacy to new if needed
        if not mode:
            mode = session_type if session_type in ('interactive', 'mission') else 'interactive'
        if not role:
            if session_subtype:
                role = 'chief' if session_subtype == 'main' else session_subtype
            else:
                role = 'chief'

        # Update legacy vars for backward compat
        if not session_type or session_type == 'interactive':
            session_type = 'mission' if mode == 'mission' else 'interactive'
        if not session_subtype:
            session_subtype = role

        # Generate conversation_id if missing (for manual spawns)
        if not conversation_id and role == 'chief':
            # Eternal conversation for Chief - provides continuity across days
            conversation_id = "chief"

        # Register in database
        storage = get_db()
        now = now_iso()

        storage.execute("""
            INSERT INTO sessions (
                session_id, role, mode, session_type, session_subtype,
                mission_execution_id, description,
                conversation_id, parent_session_id, spec_path,
                started_at, last_seen_at, transcript_path, claude_session_id, cwd, current_state,
                tmux_pane, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                ended_at = NULL,
                end_reason = NULL,
                current_state = 'idle',
                transcript_path = excluded.transcript_path,
                claude_session_id = excluded.claude_session_id,
                cwd = excluded.cwd,
                tmux_pane = excluded.tmux_pane,
                role = COALESCE(excluded.role, sessions.role),
                mode = COALESCE(excluded.mode, sessions.mode),
                session_type = excluded.session_type,
                session_subtype = COALESCE(excluded.session_subtype, sessions.session_subtype),
                mission_execution_id = COALESCE(excluded.mission_execution_id, sessions.mission_execution_id),
                description = COALESCE(excluded.description, sessions.description),
                conversation_id = COALESCE(excluded.conversation_id, sessions.conversation_id),
                parent_session_id = COALESCE(excluded.parent_session_id, sessions.parent_session_id),
                spec_path = COALESCE(excluded.spec_path, sessions.spec_path),
                updated_at = excluded.updated_at
        """, (
            session_id, role, mode, session_type, session_subtype,
            mission_execution_id, description, conversation_id, parent_session_id, spec_path,
            now, now, transcript_path, claude_session_id, cwd, tmux_pane, now, now
        ))

        # Link mission if applicable
        if mission_execution_id:
            storage.execute("""
                UPDATE missions SET session_id = ? WHERE id = ?
            """, (session_id, mission_execution_id))

        storage.close()

    except Exception as e:
        print(f"Session register error: {e}", file=sys.stderr)


def cleanup_stale_sessions_on_pane(tmux_pane: str, current_session_id: str):
    """End any active sessions that claim this pane (except current)."""
    try:
        storage = get_db()
        now = now_iso()

        storage.execute("""
            UPDATE sessions
            SET ended_at = ?, end_reason = 'pane_reused', current_state = 'ended', updated_at = ?
            WHERE tmux_pane = ?
              AND session_id != ?
              AND ended_at IS NULL
        """, (now, now, tmux_pane, current_session_id))

        storage.close()

    except Exception as e:
        print(f"Warning: Failed to cleanup stale sessions: {e}", file=sys.stderr)


def load_and_print_context(input_data: dict, session_id: str):
    """Load context files and print to stdout for Claude."""
    try:
        cwd = Path(input_data.get('cwd', repo_root))
        role = os.environ.get('CLAUDE_SESSION_ROLE', 'chief')

        # Core files (everyone gets these)
        core_files = [
            ("TODAY.MD (daily memory)", cwd / "Desktop/TODAY.md"),
            ("MEMORY.MD (weekly/medium-term)", cwd / "Desktop/MEMORY.md"),
            ("SYSTEM-INDEX.MD (complete file)", cwd / "Desktop/SYSTEM-INDEX.md"),
        ]

        # Load extra files declared by role
        extra_files = load_role_extras(role, input_data, cwd)

        # Combine
        all_files = core_files + extra_files

        # Format output
        sections = [
            f"[{_timestamp()}] [CLAUDE OS SYS: INFO]: Session context loaded",
            "",
            "Core memory files loaded automatically:",
        ]

        # List files loaded
        for label, path in all_files:
            sections.append(f"- {label}")

        sections.append("")
        sections.append("Full content follows:")
        sections.append("")

        # Load and print all files
        for label, path in all_files:
            content = read_full_file(path)
            if content:
                sections.append(f"## {label}")
                sections.append("")
                sections.append(content)
                sections.append("")

        print("\n".join(sections))

    except Exception as e:
        print(f"⚠️ Session context auto-load failed: {e}", file=sys.stderr)
        print("ℹ️ Fallback: Read SYSTEM-INDEX.md, today.md, memory.md manually")


def load_role_extras(role: str, input_data: dict, cwd: Path) -> list:
    """Load extra files declared in role frontmatter.

    Returns list of (label, path) tuples.
    """
    try:
        import yaml

        role_file = repo_root / ".claude" / "roles" / f"{role}.md"
        if not role_file.exists():
            return []

        # Parse frontmatter
        content = role_file.read_text()
        if not content.startswith("---"):
            return []

        # Extract frontmatter block
        parts = content.split("---", 2)
        if len(parts) < 3:
            return []

        frontmatter = yaml.safe_load(parts[1])
        if not frontmatter:
            return []

        auto_include = frontmatter.get('auto_include', [])

        if not auto_include:
            return []

        # Resolve paths
        files = []
        project_path = input_data.get('project_path') or os.environ.get('PROJECT_PATH')

        for path_template in auto_include:
            # Substitute ${PROJECT_PATH}
            if "${PROJECT_PATH}" in path_template:
                if not project_path:
                    continue  # Skip if no project path
                path_str = path_template.replace("${PROJECT_PATH}", project_path)
            else:
                path_str = path_template

            # Handle globs
            if "**" in path_str or "*" in path_str:
                matches = list(repo_root.glob(path_str))
                for match in matches[:3]:  # Max 3 per glob
                    try:
                        label = str(match.relative_to(repo_root))
                    except ValueError:
                        label = match.name
                    files.append((label, match))
            else:
                path = repo_root / path_str if not Path(path_str).is_absolute() else Path(path_str)
                if path.exists():
                    try:
                        label = str(path.relative_to(repo_root))
                    except ValueError:
                        label = path.name
                    files.append((label, path))

        return files

    except Exception as e:
        print(f"Warning: Failed to load role extras: {e}", file=sys.stderr)
        return []


def read_full_file(path):
    """Read entire file contents."""
    try:
        if not path.exists():
            return None
        return path.read_text().strip()
    except Exception as e:
        print(f"Warning: Failed to read {path.name}: {e}", file=sys.stderr)
        return None
