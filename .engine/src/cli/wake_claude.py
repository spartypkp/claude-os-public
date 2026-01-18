#!/usr/bin/env python3
"""
Wake up a Claude session running in tmux.

Thin CLI wrapper around MessagingService for manual testing and debugging.
Production usage goes through MessagingService directly.

Usage:
    python wake_claude.py --conversation <conversation_id>
    python wake_claude.py --list
"""

import argparse
import sys
from pathlib import Path

# Setup paths for imports
repo_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(repo_root / ".engine" / "src"))

from services.messaging import get_messaging
from services.storage import SystemStorage


def list_active_conversations():
    """List active conversations for debugging."""
    db_path = repo_root / ".engine/data/db/system.db"
    storage = SystemStorage(db_path)

    results = storage.fetchall("""
        SELECT
            conversation_id,
            session_id,
            tmux_pane,
            role,
            mode,
            current_state
        FROM sessions
        WHERE ended_at IS NULL AND tmux_pane IS NOT NULL
        ORDER BY started_at DESC
    """)

    storage.close()

    if not results:
        print("No active conversations found")
        return

    print("Active conversations:")
    for r in results:
        conv_id = r['conversation_id'][:8] if r['conversation_id'] else 'none'
        sess_id = r['session_id'][:8]
        print(f"  conv={conv_id} session={sess_id} pane={r['tmux_pane']} role={r['role']} state={r['current_state']}")


def main():
    parser = argparse.ArgumentParser(description='Wake up a Claude conversation in tmux')
    parser.add_argument('--conversation', help='Conversation ID to wake')
    parser.add_argument('--message', default="Test wakeup", help='Custom message')
    parser.add_argument('--list', action='store_true', help='List active conversations')

    args = parser.parse_args()

    if args.list:
        list_active_conversations()
        return

    if args.conversation:
        db_path = repo_root / ".engine/data/db/system.db"
        messaging = get_messaging(db_path)
        success = messaging.wake_conversation(args.conversation, args.message)

        if success:
            print(f"Wake message sent to conversation {args.conversation[:8]}")
            sys.exit(0)
        else:
            print(f"Failed to wake conversation {args.conversation[:8]}", file=sys.stderr)
            sys.exit(1)

    parser.print_help()
    sys.exit(1)


if __name__ == '__main__':
    main()
