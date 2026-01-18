#!/usr/bin/env python3
"""
Consolidated tool tracking and validation hook.

Handles:
- PreToolUse: Validate (security, comms) + Track (emit tool_start)
- PostToolUse: Track (emit tool_result)

Validation runs FIRST. If it blocks, tracking is skipped.

Philosophy:
- This is a LAST LINE OF DEFENSE, not the only defense
- Claude runs with --dangerously-skip-permissions by design
- Git tracking provides recovery for in-repo deletions
- Block only truly catastrophic, unrecoverable operations
- ALLOW normal project work, even destructive operations within repo

Consolidated from: session_tool_tracker.py, pre_tool_validator.py
"""

import json
import os
import re
import sys
import sqlite3
import hashlib
from pathlib import Path
from datetime import datetime, timezone

# Setup paths
REPO_ROOT = Path(__file__).parent.parent.parent
DB_PATH = REPO_ROOT / ".engine/data/db/system.db"
COMMS_LOG_PATH = REPO_ROOT / ".engine/data/logs/comms.log"

sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))

from services.storage import SystemStorage


# =============================================================================
# DANGEROUS BASH COMMANDS (non-rm patterns)
# =============================================================================

DANGEROUS_BASH_PATTERNS = [
    # Catastrophic filesystem operations (NOT rm - handled separately)
    (r">\s*/dev/sd[a-z]", "Direct write to block device"),
    (r"dd\s+.*of=/dev/sd[a-z]", "dd to block device"),
    (r"mkfs\.", "Filesystem formatting command"),
    (r":()\s*{\s*:\|\:&\s*}\s*;", "Fork bomb"),

    # KILL COMMANDS - Can kill Chrome, Cursor, other apps. Use services.py instead.
    (r"\bpkill\b", "pkill can kill Chrome/Cursor - use services.py instead"),
    (r"\bkillall\b", "killall can kill Chrome/Cursor - use services.py instead"),
    (r"lsof.*\|\s*xargs\s+kill", "lsof|xargs kill can kill Chrome - use services.py instead"),
    (r"kill\s+\$\(", "kill $(pgrep) pattern matching is unsafe - use services.py instead"),

    # Privilege escalation
    (r"\bsudo\b", "sudo requires interactive auth - use explicit permission"),
    (r"\bsu\s+-?\s*$", "su to root"),
    (r"\bdoas\b", "doas privilege escalation"),

    # Dangerous pipe patterns
    (r"curl\s+.*\|\s*(ba)?sh", "Piping curl to shell is dangerous"),
    (r"wget\s+.*\|\s*(ba)?sh", "Piping wget to shell is dangerous"),

    # System modification via redirect
    (r">\s*/etc/passwd", "Overwriting passwd file"),
    (r">\s*/etc/shadow", "Overwriting shadow file"),

    # History/audit evasion
    (r"history\s+-c", "Clearing bash history"),
    (r"shred\s+.*\.bash_history", "Shredding bash history"),
    (r"unset\s+HISTFILE", "Disabling history"),
]


# =============================================================================
# SYSTEM PATHS (outside project)
# =============================================================================

SYSTEM_PATH_PREFIXES = [
    "/etc/",
    "/usr/",
    "/bin/",
    "/sbin/",
    "/var/",
    "/boot/",
    "/root/",
    "/lib",
    "/opt/",
    "/System/",        # macOS
    "/Library/",       # macOS system library
    "/Applications/",  # macOS system Applications folder
]


# =============================================================================
# PROTECTED PATHS (for Write/Edit operations)
# =============================================================================

PROTECTED_PATH_PATTERNS = [
    # Secrets and credentials (regardless of location)
    (r"\.env$", "Environment file with secrets"),
    (r"\.env\.", "Environment file variant"),
    (r"/\.ssh/", "SSH directory"),
    (r"id_rsa", "SSH private key"),
    (r"id_ed25519", "SSH private key"),
    (r"\.pem$", "Certificate/key file"),
    (r"\.key$", "Key file"),
    (r"credentials", "Credentials file"),
    (r"secrets?\.", "Secrets file"),
    (r"\.aws/", "AWS credentials directory"),
    (r"\.gnupg/", "GPG directory"),
    (r"\.netrc", "Network credentials"),

    # Package manager locks (use proper commands instead)
    (r"package-lock\.json$", "NPM lock file - use npm commands"),
    (r"yarn\.lock$", "Yarn lock file - use yarn commands"),
    (r"Gemfile\.lock$", "Ruby lock file - use bundle commands"),
    (r"poetry\.lock$", "Poetry lock file - use poetry commands"),
]


# =============================================================================
# MAIN DISPATCHER
# =============================================================================

def main():
    try:
        # Read hook input
        input_data = json.load(sys.stdin)
        hook_event = input_data.get("hook_event_name", "")
        tool_name = input_data.get("tool_name", "")
        tool_input = input_data.get("tool_input", {})

        if hook_event == "PreToolUse":
            # Step 1: Validate (may block)
            blocked = handle_validation(tool_name, tool_input)
            if blocked:
                return  # Validation blocked, skip tracking

            # Step 2: Track tool start
            handle_tracking_start(input_data, tool_name, tool_input)

        elif hook_event == "PostToolUse":
            # Track tool result
            handle_tracking_result(input_data, tool_name)

        sys.exit(0)

    except json.JSONDecodeError as e:
        print(f"Tool tracking: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"Tool tracking hook error: {e}", file=sys.stderr)
        sys.exit(0)


# =============================================================================
# VALIDATION
# =============================================================================

def handle_validation(tool_name: str, tool_input: dict) -> bool:
    """Validate tool call. Returns True if blocked."""

    # Check Bash commands
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        is_dangerous, reason = check_bash_command(command)
        if is_dangerous:
            print_deny_response(reason)
            return True

    # Check Write operations
    elif tool_name == "Write":
        file_path = tool_input.get("file_path", "")
        is_protected, reason = check_protected_path(file_path)
        if is_protected:
            print_deny_response(f"Protected path: {reason}")
            return True

    # Check Edit operations
    elif tool_name == "Edit":
        file_path = tool_input.get("file_path", "")
        is_protected, reason = check_protected_path(file_path)
        if is_protected:
            print_deny_response(f"Protected path: {reason}")
            return True

    # Check Apple MCP communication tools
    elif tool_name.startswith("mcp__apple__"):
        is_allowed, reason = check_comms_permission(tool_name, tool_input)
        if not is_allowed:
            print_deny_response(reason)
            return True

    return False


def check_bash_command(command: str) -> tuple[bool, str]:
    """Check if a bash command is dangerous."""

    # Check non-rm dangerous patterns first
    for pattern, reason in DANGEROUS_BASH_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return True, reason

    # Special handling for rm commands
    if re.search(r'\brm\b', command):
        return check_rm_command(command)

    return False, ""


def check_rm_command(command: str) -> tuple[bool, str]:
    """
    Check if an rm command is dangerous.

    Philosophy:
    - Within project directory: ALLOW (git tracked, recoverable)
    - Outside project but in safe locations: ALLOW
    - Catastrophic patterns: BLOCK
    - System paths: BLOCK
    """
    project_dir = os.environ.get('CLAUDE_PROJECT_DIR', '')

    # Catastrophic patterns - ALWAYS block
    catastrophic = [
        (r"rm\s+(-[rf]+\s+)*/$", "rm / is catastrophic"),
        (r"rm\s+(-[rf]+\s+)*/\s*$", "rm / is catastrophic"),
        (r"rm\s+(-[rf]+\s+)*/\*", "rm /* removes root contents"),
        (r"rm\s+(-[rf]+\s+)*~\s*$", "rm ~ removes entire home directory"),
        (r"rm\s+(-[rf]+\s+)*~/\*", "rm ~/* removes home contents"),
        (r"rm\s+(-[rf]+\s+)*\.\.\s", "rm .. traverses to parent"),
        (r"rm\s+(-[rf]+\s+)*\.\.$", "rm .. traverses to parent"),
    ]

    for pattern, reason in catastrophic:
        if re.search(pattern, command):
            return True, reason

    # Extract paths from the rm command
    paths = extract_paths_from_rm(command)

    for path in paths:
        # Expand and resolve to absolute
        expanded = os.path.expanduser(path)

        # Handle relative paths - resolve against project dir or cwd
        if not os.path.isabs(expanded):
            if project_dir:
                abs_path = os.path.normpath(os.path.join(project_dir, expanded))
            else:
                abs_path = os.path.abspath(expanded)
        else:
            abs_path = os.path.normpath(expanded)

        # ALLOW: Paths within project directory (git tracked)
        if project_dir and abs_path.startswith(os.path.normpath(project_dir)):
            continue

        # BLOCK: System paths outside project
        if is_system_path(abs_path):
            return True, f"rm targeting system path outside project: {path}"

        # BLOCK: Home directory root
        home = os.path.expanduser("~")
        if abs_path == home or abs_path == home + "/":
            return True, "rm targeting home directory root"

    return False, ""


def extract_paths_from_rm(command: str) -> list[str]:
    """
    Extract file paths from an rm command.
    Simple heuristic - not a full shell parser.
    """
    paths = []

    # Remove the 'rm' command and common flags
    # This is a simplification - real shell parsing is complex
    parts = command.split()

    skip_next = False
    for i, part in enumerate(parts):
        if skip_next:
            skip_next = False
            continue

        # Skip 'rm' itself
        if part == 'rm':
            continue

        # Skip flags (start with -)
        if part.startswith('-'):
            # Some flags take arguments (rare for rm, but be safe)
            continue

        # Skip common command separators
        if part in ['&&', '||', ';', '|']:
            # Rest of command might be different command
            break

        # This looks like a path
        paths.append(part)

    return paths


def is_system_path(abs_path: str) -> bool:
    """Check if a path is a system path that should be protected."""
    for prefix in SYSTEM_PATH_PREFIXES:
        if abs_path.startswith(prefix):
            return True

    # Also protect paths that look like they're in other users' directories
    # But allow /Users/<current_user>/
    current_user = os.environ.get('USER', '')
    if abs_path.startswith('/Users/') and current_user:
        # Allow /Users/<current_user>/...
        if abs_path.startswith(f'/Users/{current_user}/'):
            return False
        # Block /Users/<other_user>/...
        return True

    return False


def check_protected_path(file_path: str) -> tuple[bool, str]:
    """Check if a file path is protected (for Write/Edit)."""
    for pattern, reason in PROTECTED_PATH_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            return True, reason
    return False, ""


def check_comms_permission(tool_name: str, tool_input: dict) -> tuple[bool, str]:
    """Check if communication is allowed based on mode and contact permissions."""
    mode = os.environ.get('CLAUDE_SESSION_MODE', 'interactive')

    # Rule 1: No comms for non-interactive modes
    if mode != 'interactive':
        return False, f"External communication not allowed in {mode} mode."

    operation = tool_input.get('operation', '')

    # Handle messages tool
    if tool_name == 'mcp__apple__messages':
        # BLOCK ALL MESSAGE SENDING - Claude cannot send texts
        # Draft texts in conversation for the user to copy/send manually
        # Exception: contacts with claude_direct tag (temporarily enabled when needed)
        if operation in ('send', 'schedule'):
            return False, "Message sending/scheduling is disabled. Draft the message for the user to send manually."

        # Reading still requires consent
        phone = tool_input.get('phone_number', '')
        if operation in ('read', 'unread') and phone:
            tags = get_contact_tags(phone)
            if 'claude_direct' not in tags:
                return False, f"Contact {phone} has not consented to message reading."

    # Handle mail tool
    elif tool_name == 'mcp__apple__mail':
        # BLOCK ALL EMAIL SENDING via MCP - Claude cannot send emails directly
        # Use AppleScript draft creation instead (opens Mail.app for review)
        if operation == 'send':
            return False, "Email sending via MCP is disabled. Use AppleScript to create drafts in Mail.app."

    return True, ""


def get_contact_tags(phone_or_email: str) -> list[str]:
    """Get tags for a contact from the database."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT ct.tag FROM contact_tags ct
            JOIN contacts c ON ct.contact_id = c.id
            WHERE c.phone = ? OR c.email = ?
        """, (phone_or_email, phone_or_email))
        rows = cursor.fetchall()
        conn.close()
        return [row[0] for row in rows]
    except Exception as e:
        print(f"Warning: Failed to get contact tags: {e}", file=sys.stderr)
        return []


def log_communication(tool: str, recipient: str, content_summary: str):
    """Log external communication to comms.log."""
    try:
        COMMS_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).isoformat()
        session_id = os.environ.get('CLAUDE_SESSION_ID', 'unknown')
        role = os.environ.get('CLAUDE_SESSION_ROLE', 'unknown')
        content_hash = hashlib.sha256(content_summary.encode()).hexdigest()[:12]
        summary = content_summary[:100].replace('\n', ' ')
        if len(content_summary) > 100:
            summary += '...'
        log_entry = f"[{timestamp}] [{session_id}] [{role}] [{tool}] [{recipient}] [{content_hash}] {summary}\n"
        with open(COMMS_LOG_PATH, 'a') as f:
            f.write(log_entry)
    except Exception as e:
        print(f"Warning: Failed to log communication: {e}", file=sys.stderr)


def print_deny_response(reason: str):
    """Print JSON response that denies the tool call."""
    response = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": f"🛡️ Security block: {reason}"
        }
    }
    print(json.dumps(response))


# =============================================================================
# TRACKING
# =============================================================================

def handle_tracking_start(input_data: dict, tool_name: str, tool_input: dict):
    """Update session state for PreToolUse (sidebar shows spinning cog)."""
    session_id = os.environ.get('CLAUDE_SESSION_ID')
    if not session_id:
        return

    # Update session state to 'tool_active' so sidebar shows spinning cog
    update_session_state(session_id, 'tool_active')


def handle_tracking_result(input_data: dict, tool_name: str):
    """Update session state for PostToolUse (tool finished, Claude processing)."""
    session_id = os.environ.get('CLAUDE_SESSION_ID')
    if not session_id:
        return

    # Tool finished, Claude is still processing - go back to 'active'
    # (stop.py will set to 'idle' when response completes)
    update_session_state(session_id, 'active')


def update_session_state(session_id: str, state: str):
    """Update session current_state in database and emit SSE event."""
    try:
        storage = SystemStorage(DB_PATH)
        now = datetime.now(timezone.utc).isoformat()
        storage.execute("""
            UPDATE sessions
            SET current_state = ?, last_seen_at = ?, updated_at = ?
            WHERE session_id = ?
        """, (state, now, now, session_id))
        storage.close()

        # Emit SSE event for real-time UI updates
        emit_session_state_event(session_id, state)
    except Exception as e:
        print(f"Warning: Failed to update session state: {e}", file=sys.stderr)


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


if __name__ == '__main__':
    main()
