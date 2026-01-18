#!/usr/bin/env python3
"""Full tmux reset with Claude session preservation.

This script:
1. Captures current state (active sessions, their Claude UUIDs)
2. Kills the tmux session completely
3. Recreates tmux with fresh windows
4. Resumes each Claude session in its proper window

Usage:
    python .engine/src/cli/tmux_reset.py          # Execute (with confirmation)
    python .engine/src/cli/tmux_reset.py --preview  # Preview only

Safety: This kills ALL tmux windows. Claude sessions resume from transcript.
Run from OUTSIDE tmux (e.g., fresh VSCode terminal).
"""

import subprocess
import sqlite3
import sys
import re
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DB_PATH = REPO_ROOT / ".engine/data/db/system.db"
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


def get_model_for_role(role: str) -> str:
    """Get the configured model for a role from database."""
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
        return DEFAULT_MODELS.get(lookup_role, "sonnet")
    except Exception:
        return DEFAULT_MODELS.get(lookup_role, "sonnet")


def get_active_sessions():
    """Get active sessions with their Claude UUIDs.

    Filters out:
    - Sessions marked as ended
    - Sessions with last_seen > 5 minutes ago (stale/orphaned)
    - Duplicate sessions sharing the same transcript (keeps most recent)
    """
    from datetime import datetime, timezone, timedelta

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Calculate cutoff time (5 min ago) in same ISO8601 format as DB
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()

    # Get sessions that are both not-ended AND seen recently (within 5 min)
    cursor = conn.execute("""
        SELECT session_id, role, mode, tmux_pane, transcript_path, last_seen_at
        FROM sessions
        WHERE ended_at IS NULL
          AND last_seen_at > ?
        ORDER BY last_seen_at DESC
    """, (cutoff,))

    sessions = []
    seen_uuids = set()  # Track Claude UUIDs to dedupe

    for row in cursor:
        claude_uuid = None
        if row['transcript_path']:
            # Extract UUID from path like .../5074b681-69fe-4561-b153-1bdcc0612785.jsonl
            match = re.search(r'/([a-f0-9-]{36})\.jsonl$', row['transcript_path'])
            if match:
                claude_uuid = match.group(1)

        # Dedupe by Claude UUID - keep only first (most recent due to ORDER BY)
        if claude_uuid and claude_uuid in seen_uuids:
            continue
        if claude_uuid:
            seen_uuids.add(claude_uuid)

        sessions.append({
            'session_id': row['session_id'],
            'role': row['role'],
            'mode': row['mode'],
            'tmux_pane': row['tmux_pane'],
            'transcript_path': row['transcript_path'],
            'claude_uuid': claude_uuid
        })

    conn.close()
    return sessions


def get_tmux_state():
    """Get current tmux windows."""
    result = subprocess.run(
        ["tmux", "list-windows", "-t", TMUX_SESSION, "-F",
         "#{window_index}|#{window_name}|#{pane_id}|#{pane_current_command}"],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        return []

    windows = []
    for line in result.stdout.strip().split('\n'):
        if line:
            parts = line.split('|')
            windows.append({
                'index': parts[0],
                'name': parts[1],
                'pane': parts[2],
                'command': parts[3] if len(parts) > 3 else ''
            })
    return windows


def preview_reset():
    """Show what would happen without doing it."""
    print("🔍 TMUX RESET PREVIEW")
    print("=" * 50)

    # Current tmux state
    windows = get_tmux_state()
    print("\n📦 Current tmux windows:")
    for w in windows:
        print(f"   {w['index']}: {w['name']} ({w['command']})")

    # Active sessions
    sessions = get_active_sessions()
    print("\n💾 Active sessions in database:")
    for s in sessions:
        uuid_short = s['claude_uuid'][:8] if s['claude_uuid'] else 'N/A'
        print(f"   {s['session_id'][:8]} | {s['role']} | Claude UUID: {uuid_short}...")
        if s['claude_uuid']:
            print(f"      Resume: claude --resume {s['claude_uuid']}")

    # Plan
    resumable = [s for s in sessions if s['claude_uuid']]

    print("\n📋 Reset plan:")
    print("   1. Kill tmux session 'life'")
    print("   2. Create new tmux session 'life'")
    print("   3. Create windows:")
    print("      - Window 1: zsh (caffeinate)")
    for i, s in enumerate(resumable, start=2):
        print(f"      - Window {i}: {s['role']}")
        print(f"        → claude --resume {s['claude_uuid']}")

    print("\n⚠️  To execute: python .engine/src/cli/tmux_reset.py")


def log(msg):
    """Print with timestamp."""
    from datetime import datetime
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{ts}] {msg}")


def execute_reset():
    """Actually perform the reset."""
    print("🔄 EXECUTING TMUX RESET")
    print("=" * 50)

    # 1. Capture all resumable Claude sessions
    log("Querying database for active sessions...")
    sessions = get_active_sessions()
    resumable = [s for s in sessions if s['claude_uuid']]

    print("\n1️⃣  Capturing state...")
    log(f"Found {len(resumable)} resumable Claude session(s)")
    for s in resumable:
        log(f"  • {s['role']}: {s['claude_uuid']}")

    # 2. Kill tmux
    print("\n2️⃣  Killing tmux session 'life'...")
    log("Sending kill-session command...")
    result = subprocess.run(["tmux", "kill-session", "-t", TMUX_SESSION], capture_output=True)
    if result.returncode == 0:
        log("✅ Killed successfully")
    else:
        log(f"⚠️  Session may not have existed (rc={result.returncode})")

    # Wait for clean state
    log("Waiting 1.0s for clean state...")
    time.sleep(1.0)
    log("Wait complete")

    # 3. Create new tmux session with zsh window
    print("\n3️⃣  Creating fresh tmux session...")
    log("Running: tmux new-session -d -s life...")
    subprocess.run([
        "tmux", "new-session", "-d", "-s", TMUX_SESSION,
        "-c", str(REPO_ROOT), "-n", "zsh"
    ], check=True)
    log("✅ Session created")

    log("Waiting 0.5s...")
    time.sleep(0.5)
    log("Wait complete")

    # 4. Start caffeinate in zsh window
    print("\n4️⃣  Starting caffeinate in zsh window...")
    log("Sending: caffeinate -dims")
    subprocess.run([
        "tmux", "send-keys", "-t", f"{TMUX_SESSION}:zsh",
        "caffeinate -dims", "C-m"
    ], check=True)
    log("✅ Caffeinate command sent")

    log("Waiting 0.3s...")
    time.sleep(0.3)
    log("Wait complete")

    # 5. Resume all Claude sessions
    print(f"\n5️⃣  Resuming {len(resumable)} Claude session(s)...")
    for i, s in enumerate(resumable):
        window_name = s['role']
        log(f"Creating window: {window_name}")

        subprocess.run([
            "tmux", "new-window", "-d", "-t", TMUX_SESSION, "-n", window_name,
            "-c", str(REPO_ROOT)
        ], check=True)
        log(f"✅ Window '{window_name}' created")

        log("Waiting 0.3s...")
        time.sleep(0.3)
        log("Wait complete")

        # Build resume command with model flag
        model = get_model_for_role(s['role'])
        cmd = f"claude --dangerously-skip-permissions --resume {s['claude_uuid']} --model {model}"
        log(f"Sending command: {cmd}")
        subprocess.run([
            "tmux", "send-keys", "-t", f"{TMUX_SESSION}:{window_name}",
            cmd, "C-m"
        ], check=True)
        log(f"✅ Command sent to {window_name} (model: {model})")

        # Wait for Claude to start loading before next session
        if i < len(resumable) - 1:
            log("Waiting 3.0s for Claude to initialize...")
            time.sleep(3.0)
            log("Wait complete")

    # Summary
    print("\n" + "=" * 50)
    print("✅ RESET COMPLETE")
    print("")
    print("Attach with: tmux attach -t life")
    print("")
    print("Windows created:")
    print("  1: zsh (caffeinate)")
    for i, s in enumerate(resumable, start=2):
        print(f"  {i}: {s['role']} (Claude resuming)")


def main():
    if "--preview" in sys.argv:
        preview_reset()
        return 0
    else:
        # Default: execute with safety prompt
        print("⚠️  This will KILL the current tmux session and recreate it.")
        print("   All current windows will be destroyed.")
        print("   Claude sessions will resume from their transcripts.")
        print("")
        response = input("Type 'yes' to continue: ")
        if response.lower() != 'yes':
            print("Aborted.")
            return 1

        execute_reset()
        return 0


if __name__ == "__main__":
    sys.exit(main())
