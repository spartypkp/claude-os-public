"""Watch for incoming iMessages and inject into Chief's tmux pane.

Polls chat.db every few seconds, checks for new messages from
whitelisted senders, and injects them as [iMessage HH:MM] tagged
messages into the chief tmux pane.

Run in a background tmux window:
    python -m workers.imessage_watcher
"""

import logging
import os
import sqlite3
import time
from pathlib import Path

# Add parent to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.tmux import inject_message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [iMessage] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# Config
CHAT_DB = Path.home() / "Library" / "Messages" / "chat.db"
TMUX_TARGET = "life:chief"
POLL_INTERVAL = 5  # seconds

# Whitelisted senders — only these trigger injection
WHITELIST = set()  # Add phone numbers or emails to enable iMessage injection


def get_max_rowid() -> int:
    conn = sqlite3.connect(f"file:{CHAT_DB}?mode=ro", uri=True)
    try:
        cur = conn.execute("SELECT MAX(ROWID) FROM message")
        row = cur.fetchone()
        return row[0] or 0
    finally:
        conn.close()


def get_new_messages(since_rowid: int) -> list:
    conn = sqlite3.connect(f"file:{CHAT_DB}?mode=ro", uri=True)
    try:
        cur = conn.execute("""
            SELECT m.ROWID, m.text, h.id as sender
            FROM message m
            JOIN handle h ON m.handle_id = h.ROWID
            WHERE m.ROWID > ?
              AND m.is_from_me = 0
              AND m.text IS NOT NULL
            ORDER BY m.ROWID ASC
        """, (since_rowid,))
        return cur.fetchall()
    finally:
        conn.close()


def format_for_injection(sender: str, text: str) -> str:
    """Format message body for tmux injection. Source tag added by inject_message."""
    display = text.replace('\n', ' ').strip()
    if len(display) > 300:
        display = display[:300] + "..."
    return f"{sender}: {display}"


def main():
    last_rowid = get_max_rowid()
    log.info(f"Started. Watching from ROWID {last_rowid}")
    log.info(f"Whitelist: {WHITELIST}")
    log.info(f"Target: {TMUX_TARGET}, polling every {POLL_INTERVAL}s")

    while True:
        time.sleep(POLL_INTERVAL)
        try:
            messages = get_new_messages(last_rowid)
            for rowid, text, sender in messages:
                last_rowid = rowid
                if sender in WHITELIST:
                    body = format_for_injection(sender, text)
                    inject_message(TMUX_TARGET, body, source="iMessage")
                    log.info(f"Injected from {sender}: {text[:80]}")
        except sqlite3.OperationalError as e:
            # DB locked momentarily — normal, retry next cycle
            log.debug(f"DB busy: {e}")
        except Exception as e:
            log.error(f"Error: {e}")


if __name__ == "__main__":
    main()
