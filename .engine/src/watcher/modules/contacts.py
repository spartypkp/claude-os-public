"""Contacts module syncs iMessage data and generates contact markdown files."""

from __future__ import annotations

import subprocess
import sqlite3
from datetime import timedelta
from pathlib import Path

from ..context import WatcherContext
from ..events import WatchedEvent
from ..module import WatcherModule
from ..scheduler import Scheduler


class ContactsModule(WatcherModule):
    name = "contacts"
    patterns = [".engine/data/db/system.db*", "Desktop/contacts/*.md"]

    def __init__(self):
        self.ctx: WatcherContext | None = None
        self.scheduler: Scheduler | None = None

    def initialize(self, ctx: WatcherContext) -> None:
        self.ctx = ctx
        self.scheduler = Scheduler()

        # Start iMessage sync ticker
        self._schedule_imessage_sync()

    def initial_sync(self, ctx: WatcherContext) -> None:
        # Sync iMessage data on startup
        self._sync_imessage()

    def handle(self, event: WatchedEvent, ctx: WatcherContext) -> None:
        # No-op: iMessage sync happens on schedule, not on file changes
        pass

    def shutdown(self, ctx: WatcherContext) -> None:
        if self.scheduler:
            self.scheduler.cancel_all()
            self.scheduler = None

    def _schedule_imessage_sync(self) -> None:
        """Schedule recurring iMessage sync every 5 minutes."""
        if not self.scheduler or not self.ctx:
            return

        def _tick():
            self._sync_imessage()
            self._schedule_imessage_sync()

        # Run iMessage sync every 5 minutes
        self.scheduler.schedule_in(timedelta(minutes=5), _tick)

    def _sync_imessage(self) -> None:
        """Sync iMessage data for all contacts with phone numbers."""
        if not self.ctx:
            return

        try:
            # Direct iMessage sync via Python (avoids subprocess overhead)
            imessage_db = Path.home() / "Library" / "Messages" / "chat.db"
            if not imessage_db.exists():
                return

            # Connect to iMessage database (read-only)
            imessage_conn = sqlite3.connect(f"file:{imessage_db}?mode=ro", uri=True)
            imessage_conn.row_factory = sqlite3.Row

            # Get all contacts with phone numbers
            contacts = self.ctx.storage.fetchall(
                "SELECT id, phone FROM contacts WHERE phone IS NOT NULL"
            )

            for contact in contacts:
                phone = contact["phone"]

                # Query iMessage DB for this phone number
                query = """
                    SELECT
                        COUNT(DISTINCT m.ROWID) as message_count,
                        MAX(m.date) as last_message_date
                    FROM message m
                    INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                    INNER JOIN chat c ON cmj.chat_id = c.ROWID
                    INNER JOIN handle h ON m.handle_id = h.ROWID OR c.chat_identifier = h.id
                    WHERE h.id = ?
                """

                try:
                    cursor = imessage_conn.execute(query, (phone,))
                    row = cursor.fetchone()

                    if row and row["message_count"] > 0:
                        message_count = row["message_count"]

                        # Convert iMessage timestamp
                        imessage_timestamp = row["last_message_date"]
                        if imessage_timestamp:
                            # nanoseconds since 2001-01-01 → ISO8601
                            from datetime import datetime, timezone
                            timestamp_seconds = imessage_timestamp / 1_000_000_000.0
                            unix_timestamp = timestamp_seconds + 978307200
                            last_contact_date = datetime.fromtimestamp(
                                unix_timestamp, tz=timezone.utc
                            ).isoformat()
                        else:
                            last_contact_date = None

                        # Update contact in database
                        self.ctx.storage.execute("""
                            UPDATE contacts
                            SET
                                last_contact_date = ?,
                                imessage_count = ?,
                                updated_at = datetime('now')
                            WHERE id = ?
                        """, (last_contact_date, message_count, contact["id"]))
                except Exception:
                    # Skip contacts that fail (e.g., malformed phone numbers)
                    continue

            imessage_conn.close()

        except Exception:
            # Silently fail if iMessage DB is inaccessible
            pass
