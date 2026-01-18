#!/usr/bin/env python3
"""Quick recovery after terminal reset or unexpected exit.

Usage: python .engine/src/cli/recover.py

This script:
1. Checks if tmux 'life' session exists
2. Checks if Chief window exists
3. Checks backend/dashboard status
4. Cleans up orphan sessions in the database
5. Provides clear next steps

Safe to run any time - it only fixes things that need fixing.
"""

import subprocess
import sqlite3
import sys
from pathlib import Path
from datetime import datetime, timezone

# Calculate repo root from script location
REPO_ROOT = Path(__file__).resolve().parents[3]


def check_tmux():
    """Check tmux session and Chief window status."""
    print("\n📦 tmux Status")
    print("-" * 30)

    # Check if life session exists
    result = subprocess.run(["tmux", "has-session", "-t", "life"], capture_output=True)
    if result.returncode != 0:
        print("❌ tmux 'life' session: NOT RUNNING")
        print("   → Create it: tmux new -s life")
        return False

    print("✅ tmux 'life' session: RUNNING")

    # Check for windows
    result = subprocess.run(
        ["tmux", "list-windows", "-t", "life", "-F", "#{window_name}"],
        capture_output=True, text=True
    )
    windows = result.stdout.strip().split('\n') if result.stdout.strip() else []

    if 'chief' in windows:
        print("✅ Chief window: EXISTS")

        # Check if Claude is actually running in Chief
        result = subprocess.run(
            ["tmux", "display-message", "-t", "life:chief", "-p", "#{pane_current_command}"],
            capture_output=True, text=True
        )
        cmd = result.stdout.strip()
        if 'claude' in cmd.lower() or 'node' in cmd.lower():
            print("✅ Claude in Chief: RUNNING")
        else:
            print("⚠️  Claude in Chief: NOT RUNNING")
            print("   → In Chief window, run: claude --dangerously-skip-permissions")
    else:
        print("⚠️  Chief window: MISSING")
        print("   → Run: python .engine/src/cli/chief.py spawn")

    if len(windows) > 1:
        other_windows = [w for w in windows if w != 'chief']
        print(f"ℹ️  Other windows: {', '.join(other_windows)}")

    return True


def check_services():
    """Check backend and dashboard status."""
    print("\n🔧 Services Status")
    print("-" * 30)

    services_py = REPO_ROOT / ".engine/src/cli/services.py"
    python_path = REPO_ROOT / "venv/bin/python"

    if not services_py.exists():
        print("⚠️  services.py not found")
        return

    result = subprocess.run(
        [str(python_path), str(services_py), "status"],
        capture_output=True, text=True
    )

    # Parse and summarize output
    for line in result.stdout.split('\n'):
        if 'RUNNING' in line:
            print(f"✅ {line.strip()}")
        elif 'STOPPED' in line:
            print(f"⚠️  {line.strip()}")
            print("   → Run: python .engine/src/cli/services.py start-all")
        elif 'PORT IN USE' in line:
            print(f"ℹ️  {line.strip()}")


def cleanup_orphan_sessions():
    """Clean up sessions that are stale (no heartbeat in 30+ minutes)."""
    from datetime import timedelta

    print("\n🧹 Session Cleanup")
    print("-" * 30)

    db_path = REPO_ROOT / ".engine/data/db/system.db"
    if not db_path.exists():
        print("⚠️  Database not found")
        return

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    # Calculate cutoff time in ISO8601 format (matching DB format)
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()

    # Find orphan sessions
    cursor = conn.execute("""
        SELECT session_id, role, mode, last_seen_at
        FROM sessions
        WHERE ended_at IS NULL
          AND last_seen_at < ?
        ORDER BY last_seen_at DESC
    """, (cutoff,))
    orphans = cursor.fetchall()

    if not orphans:
        print("✅ No orphan sessions found")
        conn.close()
        return

    print(f"⚠️  Found {len(orphans)} orphan session(s):")
    for orphan in orphans:
        print(f"   • {orphan['session_id'][:8]} ({orphan['role']}/{orphan['mode']}) - last seen: {orphan['last_seen_at']}")

    # Clean them up
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        UPDATE sessions
        SET ended_at = ?, end_reason = 'recovery_cleanup', current_state = 'ended', updated_at = ?
        WHERE ended_at IS NULL
          AND last_seen_at < ?
    """, (now, now, cutoff))
    conn.commit()
    conn.close()

    print(f"✅ Cleaned up {len(orphans)} orphan session(s)")


def show_next_steps():
    """Show summary and next steps."""
    print("\n" + "=" * 40)
    print("📌 Quick Commands")
    print("=" * 40)
    print("Attach to tmux:     tmux attach -t life")
    print("Full reset:         python .engine/src/cli/tmux_reset.py")
    print("Start services:     python .engine/src/cli/services.py start-all")
    print("Check status:       python .engine/src/cli/services.py status")
    print()


def main():
    print("🔧 Life System Recovery")
    print("=" * 40)
    print(f"Repo: {REPO_ROOT}")

    check_tmux()
    check_services()
    cleanup_orphan_sessions()
    show_next_steps()

    return 0


if __name__ == "__main__":
    sys.exit(main())
