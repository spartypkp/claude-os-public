#!/usr/bin/env python3
"""Force spawn Chief in tmux with proper env vars and prompt injection.

Usage:
    python .engine/src/adapters/cli/spawn_chief.py [--force]

Options:
    --force    Kill existing Claude in chief window first

This is the canonical way to start Chief. It:
1. Ensures tmux 'life' session exists
2. Ensures 'chief' window exists
3. Sets required env vars (CLAUDE_SESSION_ID, CLAUDE_SESSION_ROLE, etc.)
4. Starts Claude with correct flags
5. Injects the Chief role prompt
"""

import argparse
import os
import sys
from pathlib import Path

# Setup paths - must happen before imports
# __file__ = .engine/src/adapters/cli/spawn_chief.py
# parents: [0]=cli, [1]=adapters, [2]=src, [3]=.engine, [4]=repo_root
REPO_ROOT = Path(__file__).resolve().parents[4]
SRC_DIR = REPO_ROOT / ".engine" / "src"
sys.path.insert(0, str(SRC_DIR))
os.chdir(REPO_ROOT)  # Ensure we're in the right directory

from modules.sessions import SessionService


def main():
    parser = argparse.ArgumentParser(description='Spawn Chief in tmux')
    parser.add_argument('--force', action='store_true', help='Kill existing Claude first')
    parser.add_argument('--handoff', type=str, help='Path to handoff document')
    args = parser.parse_args()

    print(f"🚀 Spawning Chief...")
    print(f"   Repo: {REPO_ROOT}")

    service = SessionService(repo_root=REPO_ROOT)

    # Check current state
    status = service.get_chief_status()
    print(f"   tmux session: {'✓' if status['session_exists'] else '✗'}")
    print(f"   chief window: {'✓' if status['window_exists'] else '✗'}")
    print(f"   claude running: {'✓' if status['claude_running'] else '✗'}")

    if status['claude_running'] and not args.force:
        print("\n⚠️  Claude already running in chief window.")
        print("   Use --force to kill and respawn.")
        return 1

    if args.force:
        print("\n🔄 Force reset - killing existing Claude and respawning...")
        result = service.reset_chief(handoff_path=args.handoff)
    else:
        print("\n🆕 Spawning new Chief...")
        result = service.spawn_chief(handoff_path=args.handoff)

    if result.success:
        print(f"\n✅ Chief spawned successfully!")
        print(f"   Session ID: {result.session_id}")
        print(f"   Window: {result.window_name}")
        print(f"   Conversation: {result.conversation_id}")
        print(f"\n   Attach: tmux attach -t life:chief")
        return 0
    else:
        print(f"\n❌ Failed to spawn Chief: {result.error}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
