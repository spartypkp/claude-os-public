"""Apple Messages adapter - Reads from macOS Messages database.

This adapter reads directly from ~/Library/Messages/chat.db
and uses AppleScript for sending messages.

Direct-read pattern (matching calendar/email):
- Data-plane reads from Apple Messages SQLite (read-only)
- AppleScript for write operations (send)
- Configuration loaded from .engine/config/core_apps/messages.yaml

Requirements:
- macOS
- Messages.app configured with iMessage account
- Full Disk Access permission for Python process
"""

from __future__ import annotations

import logging
import os
import plistlib
import sqlite3
import subprocess
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from .base import (
    MessagesAdapter,
    Message,
    Conversation,
    ProviderType,
)

logger = logging.getLogger(__name__)

# macOS Messages database location
MESSAGES_DB_PATH = os.path.expanduser("~/Library/Messages/chat.db")

# Apple's Core Data epoch (January 1, 2001 00:00:00 UTC)
# Messages uses nanoseconds since this date
APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)
NANOSECONDS_PER_SECOND = 1_000_000_000


def _apple_time_to_datetime(apple_time: Optional[int]) -> Optional[datetime]:
    """Convert Apple Messages timestamp (nanoseconds since 2001) to datetime."""
    if apple_time is None or apple_time == 0:
        return None
    try:
        seconds = apple_time / NANOSECONDS_PER_SECOND
        return APPLE_EPOCH + timedelta(seconds=seconds)
    except Exception:
        return None


def _extract_text_from_attributed_body(attributed_body: Optional[bytes]) -> Optional[str]:
    """Extract plain text from NSAttributedString binary archive.

    When Messages.app stores rich text or certain special messages,
    the text is stored in the attributedBody field as a serialized
    NSKeyedArchiver NSAttributedString instead of the plain text field.

    This uses a simple heuristic: find strings in the binary data that
    look like readable text. This works because Messages embeds the plain
    text content somewhere in the archive structure.
    """
    if not attributed_body:
        return None

    try:
        # First try: standard plistlib (works for simple cases)
        try:
            plist = plistlib.loads(attributed_body)

            if isinstance(plist, dict):
                # Try common keys
                if 'NSString' in plist:
                    return plist['NSString']

                # Sometimes it's nested under $objects
                if '$objects' in plist and isinstance(plist['$objects'], list):
                    # Look for the longest string that's not a key name
                    candidates = []
                    for obj in plist['$objects']:
                        if isinstance(obj, str) and obj and obj not in ('NS.string', '$null', 'NSMutableString'):
                            if not obj.startswith('NS') and len(obj) > 3:
                                candidates.append(obj)

                    if candidates:
                        # Return the longest candidate (likely the actual message)
                        return max(candidates, key=len)

            if isinstance(plist, str):
                return plist
        except:
            pass

        # Fallback: Extract readable strings from binary data
        # NSKeyedArchiver stores text as UTF-8 with length prefix
        # The message text appears in parts that contain 'NSString' followed by the actual text
        decoded = attributed_body.decode('utf-8', errors='ignore')

        # Split on null bytes
        parts = decoded.split('\x00')

        for part in parts:
            # Look for parts that contain both 'NSString' and actual content
            if 'NSString' in part:
                # Extract text after 'NSString' marker
                # Format is usually: 'NSString' + control chars + actual text
                idx = part.find('NSString')
                if idx >= 0:
                    # Get everything after NSString
                    after = part[idx + len('NSString'):]
                    # Remove control characters and trim
                    cleaned = ''.join(c for c in after if c.isprintable() or c in '\n\r\t')
                    cleaned = cleaned.strip()

                    # If we got something substantial, that's likely our message
                    if len(cleaned) >= 3:
                        # Remove leading junk (often starts with + or other control chars)
                        cleaned = cleaned.lstrip('+')

                        # Remove trailing junk (class names, metadata, etc.)
                        # The pattern is usually: actual_text + 'iI' or 'rniI' + class names
                        for end_marker in ['iI', 'rniI', 'NSDictionary', 'NSNumber', 'NSValue', 'NSData']:
                            if end_marker in cleaned:
                                cleaned = cleaned[:cleaned.index(end_marker)].strip()

                        # Final cleanup: strip again after removals
                        cleaned = cleaned.strip()

                        if cleaned and len(cleaned) >= 1:
                            return cleaned

    except Exception as e:
        logger.debug(f"Failed to extract text from attributedBody: {e}")

    return None


def _run_applescript(script: str, timeout: int = 10) -> tuple[bool, str]:
    """Run an AppleScript and return success status and output/error."""
    try:
        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        if result.returncode != 0:
            return False, result.stderr.strip()
        return True, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return False, f"AppleScript timed out after {timeout}s"
    except FileNotFoundError:
        return False, "osascript not found - this only works on macOS"
    except Exception as e:
        return False, str(e)


class AppleMessagesAdapter(MessagesAdapter):
    """Adapter for macOS Messages.app.

    Reads from the Messages SQLite database for fast access,
    uses AppleScript for sending messages.
    """

    def __init__(self):
        """Initialize Apple Messages adapter."""
        self._conn: Optional[sqlite3.Connection] = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.APPLE

    @property
    def display_name(self) -> str:
        return "Apple Messages"

    def _get_db_connection(self) -> Optional[sqlite3.Connection]:
        """Get a read-only connection to the Messages database."""
        try:
            if not os.path.exists(MESSAGES_DB_PATH):
                logger.error(f"Messages database not found at {MESSAGES_DB_PATH}")
                return None
            # Open in read-only mode
            conn = sqlite3.connect(f"file:{MESSAGES_DB_PATH}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            return conn
        except Exception as e:
            logger.error(f"Failed to connect to Messages database: {e}")
            return None

    def is_available(self) -> bool:
        """Check if Apple Messages is available."""
        return os.path.exists(MESSAGES_DB_PATH)

    def get_conversations(
        self,
        limit: int = 50,
        include_archived: bool = False,
    ) -> List[Conversation]:
        """Get list of conversations ordered by most recent."""
        conn = self._get_db_connection()
        if not conn:
            return []

        try:
            # Query for conversations with their latest message
            query = """
                SELECT
                    c.ROWID as chat_id,
                    c.guid as chat_guid,
                    c.chat_identifier,
                    c.display_name,
                    c.service_name,
                    c.is_archived,
                    (SELECT COUNT(*) FROM chat_handle_join WHERE chat_id = c.ROWID) as participant_count,
                    (
                        SELECT m.text
                        FROM message m
                        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                        WHERE cmj.chat_id = c.ROWID
                        ORDER BY m.date DESC
                        LIMIT 1
                    ) as last_message_text,
                    (
                        SELECT m.attributedBody
                        FROM message m
                        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                        WHERE cmj.chat_id = c.ROWID
                        ORDER BY m.date DESC
                        LIMIT 1
                    ) as last_message_attributed_body,
                    (
                        SELECT m.date
                        FROM message m
                        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                        WHERE cmj.chat_id = c.ROWID
                        ORDER BY m.date DESC
                        LIMIT 1
                    ) as last_message_date,
                    (
                        SELECT COUNT(*)
                        FROM message m
                        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                        WHERE cmj.chat_id = c.ROWID
                        AND m.is_read = 0
                        AND m.is_from_me = 0
                    ) as unread_count
                FROM chat c
                WHERE 1=1
            """

            if not include_archived:
                query += " AND c.is_archived = 0"

            query += """
                ORDER BY last_message_date DESC
                LIMIT ?
            """

            cursor = conn.execute(query, (limit,))
            conversations = []

            for row in cursor.fetchall():
                # Get participants for this chat
                participants = self._get_chat_participants(conn, row['chat_id'])

                # Extract last message text
                last_msg_text = row['last_message_text']
                if not last_msg_text:
                    last_msg_text = _extract_text_from_attributed_body(row['last_message_attributed_body'])

                conversations.append(Conversation(
                    id=row['chat_guid'],
                    display_name=row['display_name'] or row['chat_identifier'],
                    participants=participants,
                    service=row['service_name'] or 'iMessage',
                    last_message_date=_apple_time_to_datetime(row['last_message_date']),
                    last_message_text=last_msg_text,
                    unread_count=row['unread_count'] or 0,
                    is_group=row['participant_count'] > 1,
                    provider=ProviderType.APPLE,
                ))

            return conversations

        except Exception as e:
            logger.error(f"Error getting conversations: {e}")
            return []
        finally:
            conn.close()

    def _get_chat_participants(self, conn: sqlite3.Connection, chat_id: int) -> List[str]:
        """Get participant handle IDs for a chat."""
        try:
            cursor = conn.execute("""
                SELECT h.id
                FROM handle h
                JOIN chat_handle_join chj ON h.ROWID = chj.handle_id
                WHERE chj.chat_id = ?
            """, (chat_id,))
            return [row['id'] for row in cursor.fetchall()]
        except Exception:
            return []

    def get_messages(
        self,
        handle_id: Optional[str] = None,
        chat_id: Optional[str] = None,
        limit: int = 50,
        before: Optional[datetime] = None,
    ) -> List[Message]:
        """Get messages for a conversation."""
        conn = self._get_db_connection()
        if not conn:
            return []

        try:
            params = []
            where_clauses = []

            # Filter by handle (phone/email)
            if handle_id:
                where_clauses.append("""
                    (h.id = ? OR h.id LIKE ?)
                """)
                # Handle both formats: +14155551234 and 14155551234
                clean_handle = handle_id.lstrip('+')
                params.extend([handle_id, f"%{clean_handle}"])

            # Filter by chat GUID
            if chat_id:
                where_clauses.append("c.guid = ?")
                params.append(chat_id)

            # Filter by date
            if before:
                # Convert to Apple timestamp (nanoseconds)
                apple_time = int((before - APPLE_EPOCH).total_seconds() * NANOSECONDS_PER_SECOND)
                where_clauses.append("m.date < ?")
                params.append(apple_time)

            where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
            params.append(limit)

            query = f"""
                SELECT DISTINCT
                    m.ROWID as message_id,
                    m.guid,
                    m.text,
                    m.attributedBody,
                    m.date,
                    m.is_from_me,
                    m.is_read,
                    m.cache_has_attachments,
                    m.reply_to_guid,
                    m.service,
                    h.id as handle_id,
                    c.guid as chat_guid
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                LEFT JOIN chat c ON cmj.chat_id = c.ROWID
                WHERE {where_clause}
                ORDER BY m.date DESC
                LIMIT ?
            """

            cursor = conn.execute(query, params)
            messages = []

            for row in cursor.fetchall():
                msg_date = _apple_time_to_datetime(row['date'])
                if not msg_date:
                    continue

                # Extract text from either text field or attributedBody
                text = row['text']
                if not text:
                    text = _extract_text_from_attributed_body(row['attributedBody'])

                messages.append(Message(
                    id=row['guid'],
                    text=text,
                    date=msg_date,
                    is_from_me=bool(row['is_from_me']),
                    is_read=bool(row['is_read']),
                    handle_id=row['handle_id'] or '',
                    service=row['service'] or 'iMessage',
                    chat_id=row['chat_guid'],
                    has_attachments=bool(row['cache_has_attachments']),
                    reply_to_guid=row['reply_to_guid'],
                    provider=ProviderType.APPLE,
                ))

            # Return in chronological order (oldest first)
            return list(reversed(messages))

        except Exception as e:
            logger.error(f"Error getting messages: {e}")
            return []
        finally:
            conn.close()

    def get_unread_messages(self, limit: int = 50) -> List[Message]:
        """Get unread messages across all conversations."""
        conn = self._get_db_connection()
        if not conn:
            return []

        try:
            query = """
                SELECT
                    m.ROWID as message_id,
                    m.guid,
                    m.text,
                    m.attributedBody,
                    m.date,
                    m.is_from_me,
                    m.is_read,
                    m.cache_has_attachments,
                    m.reply_to_guid,
                    m.service,
                    h.id as handle_id,
                    c.guid as chat_guid,
                    c.display_name as chat_name
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                LEFT JOIN chat c ON cmj.chat_id = c.ROWID
                WHERE m.is_read = 0
                  AND m.is_from_me = 0
                  AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
                ORDER BY m.date DESC
                LIMIT ?
            """

            cursor = conn.execute(query, (limit,))
            messages = []

            for row in cursor.fetchall():
                msg_date = _apple_time_to_datetime(row['date'])
                if not msg_date:
                    continue

                # Extract text from either text field or attributedBody
                text = row['text']
                if not text:
                    text = _extract_text_from_attributed_body(row['attributedBody'])

                messages.append(Message(
                    id=row['guid'],
                    text=text,
                    date=msg_date,
                    is_from_me=False,
                    is_read=False,
                    handle_id=row['handle_id'] or '',
                    service=row['service'] or 'iMessage',
                    chat_id=row['chat_guid'],
                    has_attachments=bool(row['cache_has_attachments']),
                    reply_to_guid=row['reply_to_guid'],
                    provider=ProviderType.APPLE,
                ))

            return messages

        except Exception as e:
            logger.error(f"Error getting unread messages: {e}")
            return []
        finally:
            conn.close()

    def search_messages(
        self,
        query: str,
        limit: int = 50,
    ) -> List[Message]:
        """Search messages by text content."""
        conn = self._get_db_connection()
        if not conn:
            return []

        try:
            search_pattern = f"%{query}%"

            sql = """
                SELECT
                    m.ROWID as message_id,
                    m.guid,
                    m.text,
                    m.attributedBody,
                    m.date,
                    m.is_from_me,
                    m.is_read,
                    m.cache_has_attachments,
                    m.service,
                    h.id as handle_id,
                    c.guid as chat_guid
                FROM message m
                LEFT JOIN handle h ON m.handle_id = h.ROWID
                LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
                LEFT JOIN chat c ON cmj.chat_id = c.ROWID
                WHERE m.text LIKE ?
                ORDER BY m.date DESC
                LIMIT ?
            """

            cursor = conn.execute(sql, (search_pattern, limit))
            messages = []

            for row in cursor.fetchall():
                msg_date = _apple_time_to_datetime(row['date'])
                if not msg_date:
                    continue

                # Extract text from either text field or attributedBody
                text = row['text']
                if not text:
                    text = _extract_text_from_attributed_body(row['attributedBody'])

                messages.append(Message(
                    id=row['guid'],
                    text=text,
                    date=msg_date,
                    is_from_me=bool(row['is_from_me']),
                    is_read=bool(row['is_read']),
                    handle_id=row['handle_id'] or '',
                    service=row['service'] or 'iMessage',
                    chat_id=row['chat_guid'],
                    has_attachments=bool(row['cache_has_attachments']),
                    provider=ProviderType.APPLE,
                ))

            return messages

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
        finally:
            conn.close()

    def send_message(self, recipient: str, text: str) -> bool:
        """Send a message via AppleScript."""
        try:
            # Escape the text for AppleScript
            text_escaped = text.replace('\\', '\\\\').replace('"', '\\"')
            recipient_escaped = recipient.replace('"', '\\"')

            script = f'''
tell application "Messages"
    set targetService to 1st account whose service type is iMessage
    set targetBuddy to participant "{recipient_escaped}" of targetService
    send "{text_escaped}" to targetBuddy
end tell
'''

            success, output = _run_applescript(script)
            if success:
                logger.info(f"Message sent to {recipient}")
                return True
            else:
                logger.error(f"Failed to send message: {output}")
                return False

        except Exception as e:
            logger.error(f"Error sending message: {e}")
            return False

    def mark_read(self, message_id: str) -> bool:
        """Mark a message as read.

        Note: Direct database modification is not recommended.
        Messages.app should handle this automatically when viewed.
        This is a no-op for safety.
        """
        logger.warning("mark_read is not implemented - Messages.app handles this")
        return False

    def test_connection(self) -> tuple[bool, str]:
        """Test connection to Apple Messages."""
        if not os.path.exists(MESSAGES_DB_PATH):
            return False, "Messages database not found. Is Messages.app configured?"

        conn = self._get_db_connection()
        if not conn:
            return False, "Cannot connect to Messages database"

        try:
            cursor = conn.execute("SELECT COUNT(*) as cnt FROM message")
            row = cursor.fetchone()
            count = row['cnt'] if row else 0
            return True, f"Connected to Messages with {count:,} messages"
        except Exception as e:
            return False, f"Database query failed: {e}"
        finally:
            conn.close()
