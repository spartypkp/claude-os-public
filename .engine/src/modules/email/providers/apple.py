"""Apple Mail adapter - Zero-config email access via Mail.app.

This adapter provides instant email access for macOS users without OAuth setup:
- Reads from Mail.app's local SQLite database (fast)
- Writes via AppleScript (slower, but works)
- Works with ALL accounts configured in Mail.app

Requirements:
- macOS (returns unavailable on other platforms)
- Mail.app configured with at least one account
- Full Disk Access permission for Python process

Design principles:
- Zero config: No OAuth, no credentials, just works
- Read + draft only: No autonomous sending (drafts open in Mail.app)
- Email-based lookup: Uses email addresses, not Mail.app display names

Use cases:
- Non-technical users who don't want OAuth complexity
- Quick inbox checks and searches
- Drafting emails for manual review/send
"""

from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
import sys
import email
import uuid
from urllib.parse import unquote
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..models import DraftMessage, EmailMessage, Mailbox, ProviderType
from .base import EmailAdapter

logger = logging.getLogger(__name__)

# Mail.app database location
MAIL_DB_DIR = os.path.expanduser("~/Library/Mail/V10")  # May vary by macOS version
ENVELOPE_INDEX_DB = "Envelope Index"

# Check for macOS
IS_MACOS = sys.platform == "darwin"


def _find_mail_db() -> Optional[str]:
    """Find the Mail.app envelope index database.
    
    Mail.app stores emails in ~/Library/Mail/V{version}/Envelope Index
    The version number changes with macOS updates.
    """
    base_dir = os.path.expanduser("~/Library/Mail")
    
    if not os.path.exists(base_dir):
        return None
    
    # Find the latest V* directory
    versions = []
    for item in os.listdir(base_dir):
        if item.startswith("V") and item[1:].isdigit():
            versions.append(item)
    
    if not versions:
        return None
    
    # Use latest version
    latest = sorted(versions, key=lambda x: int(x[1:]))[-1]
    db_path = os.path.join(base_dir, latest, ENVELOPE_INDEX_DB)
    db_path_maildata = os.path.join(base_dir, latest, "MailData", ENVELOPE_INDEX_DB)

    if os.path.exists(db_path_maildata):
        return db_path_maildata
    if os.path.exists(db_path):
        return db_path
    
    return None


class AppleMailAdapter(EmailAdapter):
    """Apple Mail adapter using local Mail.app database.
    
    This adapter reads directly from Mail.app's SQLite database for speed,
    and uses AppleScript for write operations (mark read, create draft).
    
    No configuration needed - works with all accounts in Mail.app.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize Apple Mail adapter.
        
        Args:
            config: Optional config (not used - Apple Mail needs no credentials)
        """
        self._config = config or {}
        self._db_path: Optional[str] = None
        self._mail_handler = None
        self._account_aliases_cache: Dict[str, set[str]] = {}
        self._account_name_cache: Dict[str, str] = {}
        self._account_identifier_cache: Dict[str, str] = {}
        self._account_identifier_cache: Dict[str, str] = {}
    
    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.APPLE_MAIL
    
    @property
    def display_name(self) -> str:
        return "Apple Mail"
    
    def _get_db_connection(self) -> Optional[sqlite3.Connection]:
        """Get connection to Mail.app database."""
        if not IS_MACOS:
            logger.debug("Apple Mail adapter only available on macOS")
            return None
        
        if self._db_path is None:
            self._db_path = _find_mail_db()
        
        if not self._db_path:
            logger.warning("Mail.app database not found")
            return None
        
        try:
            conn = sqlite3.connect(
                f"file:{self._db_path}?mode=ro&immutable=1",
                uri=True,
            )
            conn.row_factory = sqlite3.Row
            return conn
        except Exception as e:
            logger.error(f"Failed to connect to Mail.app database: {e}")
            return None
    
    def _get_mail_handler(self):
        """Get pyapple_mcp MailHandler for AppleScript operations."""
        if self._mail_handler is not None:
            return self._mail_handler
        
        try:
            from pyapple_mcp.utils.mail import MailHandler
            self._mail_handler = MailHandler()
            return self._mail_handler
        except ImportError:
            logger.warning("pyapple_mcp not installed - some operations unavailable")
            return None
    
    def is_available(self) -> bool:
        """Check if Apple Mail is available.
        
        Uses AppleScript to check if Mail.app is accessible.
        """
        if not IS_MACOS:
            return False
        
        try:
            import subprocess
            
            # Simple check - can we talk to Mail.app?
            result = subprocess.run(
                ['osascript', '-e', 'tell application "Mail" to return name of first account'],
                capture_output=True,
                text=True,
                timeout=5,
            )
            
            return result.returncode == 0
            
        except Exception:
            return False
    
    def get_accounts(self) -> List[str]:
        """Get list of email accounts from Mail.app.
        
        Returns email addresses (not display names).
        Uses AppleScript which doesn't require Full Disk Access.
        """
        if not IS_MACOS:
            return []
        
        # Use discover_accounts and extract emails
        discovered = self.discover_accounts()
        
        emails = []
        for acc in discovered:
            if acc.get('email'):
                emails.append(acc['email'])
        
        return emails
    
    def discover_accounts(self) -> List[Dict[str, Any]]:
        """Discover all email accounts configured in Mail.app.
        
        This is used during onboarding to show users what accounts are available.
        Uses AppleScript to get account names AND email addresses.
        
        Returns:
            List of dicts with 'email', 'name', 'account_type', 'provider' keys
        """
        if not IS_MACOS:
            return []
        
        try:
            import subprocess
            
            # AppleScript to get account name, email, and type
            script = '''
            tell application "Mail"
                set accountList to {}
                repeat with acc in accounts
                    set accName to name of acc
                    set accEmail to email addresses of acc
                    set accType to account type of acc as string
                    set end of accountList to accName & "|" & accEmail & "|" & accType
                end repeat
                return accountList
            end tell
            '''
            
            result = subprocess.run(
                ['osascript', '-e', script],
                capture_output=True,
                text=True,
                timeout=10,
            )
            
            if result.returncode != 0:
                logger.warning(f"AppleScript failed: {result.stderr}")
                return []
            
            # Parse the result - format: "name|email|type, name|email|type, ..."
            raw_output = result.stdout.strip()
            if not raw_output:
                return []
            
            accounts = []
            for entry in raw_output.split(', '):
                parts = entry.split('|')
                if len(parts) >= 2:
                    name = parts[0].strip()
                    email = parts[1].strip()
                    account_type = parts[2].strip() if len(parts) > 2 else 'unknown'
                    
                    accounts.append({
                        'email': email if '@' in email else None,
                        'name': name,
                        'account_type': account_type,
                        'provider': 'apple_mail',
                        'source': 'mail.app',
                    })
            
            return accounts
            
        except subprocess.TimeoutExpired:
            logger.error("AppleScript timed out discovering accounts")
            return []
        except Exception as e:
            logger.error(f"Failed to discover Mail.app accounts: {e}")
            return []
    
    def get_mailboxes(self, account: Optional[str] = None) -> List[Mailbox]:
        """Get mailboxes from Mail.app (SQLite-backed only)."""
        return self._get_mailboxes_from_db(account)
    
    def get_messages(
        self,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
    ) -> List[EmailMessage]:
        """Get messages from Mail.app (SQLite-backed only)."""
        return self._get_messages_from_db(
            mailbox=mailbox,
            account=account,
            limit=limit,
            offset=offset,
            unread_only=unread_only,
        )

    def get_messages_since(
        self,
        mailbox: str,
        account: Optional[str],
        since_ts: int,
        since_rowid: int,
        limit: int = 200,
    ) -> Tuple[List[EmailMessage], int, int]:
        """Get messages newer than a timestamp/rowid cursor."""
        rows = self._get_messages_since_from_db(
            mailbox=mailbox,
            account=account,
            since_ts=since_ts,
            since_rowid=since_rowid,
            limit=limit,
        )

        if not rows:
            return [], since_ts, since_rowid

        last_row = rows[-1]
        last_ts = int(last_row["date_received"] or since_ts)
        last_rowid = int(last_row["rowid"] or since_rowid)
        messages = self._rows_to_messages(rows, self._get_account_identifier(account), account)
        return messages, last_ts, last_rowid

    def get_flags_since(
        self,
        mailbox: str,
        account: Optional[str],
        since_ts: int,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        """Get message flags for a mailbox since a timestamp."""
        return self._get_flags_since_from_db(
            mailbox=mailbox,
            account=account,
            since_ts=since_ts,
            limit=limit,
        )
    
    def get_message(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> Optional[EmailMessage]:
        """Get a single message with full content (from local .emlx file)."""
        content = self._load_emlx_content(message_id, mailbox, account)
        if content is None:
            return None

        return EmailMessage(
            id=str(message_id),
            subject="",
            sender="",
            sender_name=None,
            recipients=[],
            cc=[],
            bcc=[],
            date_received="",
            date_sent=None,
            is_read=False,
            is_flagged=False,
            mailbox=mailbox,
            account=account or "Apple Mail",
            provider=ProviderType.APPLE_MAIL,
            content=content,
        )

    def get_message_detail(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> Optional[EmailMessage]:
        """Get a single message with metadata + full content."""
        conn = self._get_db_connection()
        if not conn:
            return None

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            conn.close()
            return None

        cursor = conn.cursor()
        # Query by ROWID only - we already know the message exists from the list query
        # Don't filter by mailbox since Gmail messages are in All Mail with labels
        cursor.execute(
            """
            SELECT m.ROWID as rowid,
                   m.message_id,
                   m.document_id,
                   m.date_sent,
                   m.date_received,
                   m.read,
                   m.flagged,
                   m.deleted,
                   mb.url as mailbox_url,
                   subj.subject,
                   summ.summary,
                   addr.address,
                   addr.comment,
                   GROUP_CONCAT(raddr.address) as recipients
            FROM messages m
            LEFT JOIN subjects subj ON subj.ROWID = m.subject
            LEFT JOIN summaries summ ON summ.ROWID = m.summary
            LEFT JOIN addresses addr ON addr.ROWID = m.sender
            LEFT JOIN recipients r ON r.message = m.ROWID
            LEFT JOIN addresses raddr ON raddr.ROWID = r.address
            LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox
            WHERE m.ROWID = ?
              AND mb.url LIKE ?
            GROUP BY m.ROWID
            LIMIT 1
            """,
            (message_id, f"%//{account_identifier}/%"),
        )
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        messages = self._rows_to_messages([row], account_identifier, account)
        if not messages:
            return None

        message = messages[0]
        if mailbox:
            message = EmailMessage(**{**message.__dict__, "mailbox": mailbox})
        content = self._load_emlx_content(message_id, mailbox, account)
        if content is not None:
            message = EmailMessage(
                **{**message.__dict__, "content": content}
            )
        return message
    
    def search(
        self,
        query: str,
        mailbox: Optional[str] = None,
        account: Optional[str] = None,
        limit: int = 20,
    ) -> List[EmailMessage]:
        """Search emails in Mail.app (SQLite-backed only)."""
        return self._search_messages_from_db(
            query=query,
            mailbox=mailbox,
            account=account,
            limit=limit,
        )
    
    def _convert_messages(
        self,
        raw_emails: List[Dict],
        mailbox: str,
        account: Optional[str],
    ) -> List[EmailMessage]:
        """Convert pyapple_mcp email dicts to EmailMessage objects."""
        messages = []
        account_filter = account.lower() if account else None
        account_aliases = self._get_account_aliases() if account_filter else {}
        
        for email in raw_emails:
            try:
                message_account = email.get('account')
                if account_filter and not self._account_matches_filter(
                    account_filter, message_account, account_aliases
                ):
                    continue

                # Parse sender
                sender = email.get('sender', '')
                sender_name = None
                sender_email = sender
                if '<' in sender and '>' in sender:
                    parts = sender.split('<')
                    sender_name = parts[0].strip().strip('"')
                    sender_email = parts[1].replace('>', '').strip()
                
                message_id = email.get('id')
                if message_id is None:
                    message_id = self._stable_message_id(
                        subject=email.get('subject', ''),
                        sender=sender_email,
                        date=email.get('date', ''),
                        mailbox=email.get('mailbox', mailbox),
                    )

                messages.append(EmailMessage(
                    id=str(message_id),
                    subject=email.get('subject', '(no subject)'),
                    sender=sender_email,
                    sender_name=sender_name,
                    recipients=[],
                    cc=[],
                    bcc=[],
                    date_received=email.get('date', ''),
                    date_sent=None,
                    is_read=not email.get('unread', False),
                    is_flagged=email.get('flagged', False),
                    mailbox=email.get('mailbox', mailbox),
                    account=message_account or account or 'Apple Mail',
                    provider=ProviderType.APPLE_MAIL,
                    content=email.get('content'),
                    snippet=email.get('content', '')[:200] if email.get('content') else None,
                ))
            except Exception as e:
                logger.warning(f"Failed to convert message: {e}")
                continue
        
        return messages

    def _stable_message_id(self, subject: str, sender: str, date: str, mailbox: str) -> str:
        """Create a stable fallback ID when Mail.app doesn't provide one."""
        fingerprint = f"{sender}|{subject}|{date}|{mailbox}"
        return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()

    def _get_account_aliases(self) -> Dict[str, set[str]]:
        """Build map of email -> set of account name aliases."""
        if self._account_aliases_cache:
            return self._account_aliases_cache

        aliases: Dict[str, set[str]] = {}
        name_by_email: Dict[str, str] = {}
        try:
            for entry in self.discover_accounts():
                email = entry.get("email")
                name = entry.get("name")
                if not email:
                    continue
                key = email.lower()
                aliases.setdefault(key, set()).add(email.lower())
                if name:
                    aliases[key].add(name.lower())
                    name_by_email[key] = name
        except Exception as e:
            logger.debug(f"Failed to build account alias map: {e}")

        self._account_aliases_cache = aliases
        self._account_name_cache = name_by_email
        return aliases

    def _resolve_account_name(self, account: Optional[str]) -> Optional[str]:
        """Resolve email or name to Mail.app display name for MailHandler."""
        if not account:
            return None

        account_lower = account.lower()
        aliases = self._get_account_aliases()
        if account_lower in aliases:
            return self._account_name_cache.get(account_lower, account)

        return account

    def _get_account_identifier(self, account: Optional[str]) -> Optional[str]:
        """Resolve email or name to system account identifier (GUID)."""
        if not account:
            return None

        account_key = account.lower()
        if account_key in self._account_identifier_cache:
            return self._account_identifier_cache[account_key]

        if self._looks_like_guid(account):
            if self._has_mailboxes_for_identifier(account):
                self._account_identifier_cache[account_key] = account
                return account

        accounts_db = Path.home() / "Library" / "Accounts" / "Accounts4.sqlite"
        if not accounts_db.exists():
            return self._fallback_mailbox_identifier(account_key)

        try:
            conn = sqlite3.connect(accounts_db)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT ZIDENTIFIER, ZACCOUNTDESCRIPTION, ZUSERNAME
                FROM ZACCOUNT
                WHERE lower(ZACCOUNTDESCRIPTION) = ? OR lower(ZUSERNAME) = ?
                """,
                (account_key, account_key),
            )
            rows = cur.fetchall()
            conn.close()

            if not rows:
                return self._fallback_mailbox_identifier(account_key)

            identifier = None
            description_matches = [
                row["ZIDENTIFIER"]
                for row in rows
                if (row["ZACCOUNTDESCRIPTION"] or "").lower() == account_key
            ]
            if len(rows) == 1:
                identifier = rows[0]["ZIDENTIFIER"]
            else:
                # If multiple identifiers exist for the same email/name, pick the one
                # that actually has mailboxes in the Mail.app database.
                mail_conn = self._get_db_connection()
                best_identifier = None
                best_count = -1
                if mail_conn:
                    mail_cur = mail_conn.cursor()
                    for row in rows:
                        candidate = row["ZIDENTIFIER"]
                        mail_cur.execute(
                            "SELECT COUNT(*) FROM mailboxes WHERE url LIKE ?",
                            (f"%//{candidate}/%",),
                        )
                        count = mail_cur.fetchone()[0]
                        if count > best_count:
                            best_identifier = candidate
                            best_count = count
                    mail_conn.close()

                if best_identifier and best_count > 0:
                    identifier = best_identifier
                elif description_matches:
                    identifier = description_matches[0]
                else:
                    identifier = rows[0]["ZIDENTIFIER"]

            if identifier:
                mail_conn = self._get_db_connection()
                has_mailboxes = False
                if mail_conn:
                    mail_cur = mail_conn.cursor()
                    mail_cur.execute(
                        "SELECT COUNT(*) FROM mailboxes WHERE url LIKE ?",
                        (f"%//{identifier}/%",),
                    )
                    has_mailboxes = mail_cur.fetchone()[0] > 0
                    mail_conn.close()

                if not has_mailboxes:
                    identifier = self._fallback_mailbox_identifier(account_key)

            if identifier:
                self._account_identifier_cache[account_key] = identifier

            return identifier
        except Exception as e:
            logger.debug(f"Failed to resolve account identifier: {e}")
            return self._fallback_mailbox_identifier(account_key)

    def _fallback_mailbox_identifier(self, account_key: str) -> Optional[str]:
        """Fallback lookup for accounts not present in Accounts4."""
        mail_conn = self._get_db_connection()
        if not mail_conn:
            return None

        cursor = mail_conn.cursor()
        cursor.execute("SELECT url FROM mailboxes")
        rows = cursor.fetchall()
        mail_conn.close()

        accounts: Dict[str, Dict[str, int]] = {}
        for row in rows:
            url = row["url"]
            if "://" not in url:
                continue
            scheme, rest = url.split("://", 1)
            account_id = rest.split("/", 1)[0]
            accounts.setdefault(scheme, {})
            accounts[scheme][account_id] = accounts[scheme].get(account_id, 0) + 1

        def pick_from_scheme(scheme: Optional[str]) -> Optional[str]:
            if not scheme:
                return None
            candidates = accounts.get(scheme, {})
            if not candidates:
                return None
            return max(candidates.items(), key=lambda item: item[1])[0]

        preferred_scheme = None
        if "gmail" in account_key or "googlemail" in account_key or "google" in account_key:
            preferred_scheme = "imap"
        elif "exchange" in account_key or "ews" in account_key:
            preferred_scheme = "ews"

        identifier = pick_from_scheme(preferred_scheme)
        if not identifier:
            if len(accounts.get("imap", {})) == 1:
                identifier = next(iter(accounts["imap"].keys()))
            elif len(accounts.get("ews", {})) == 1:
                identifier = next(iter(accounts["ews"].keys()))

        if identifier:
            self._account_identifier_cache[account_key] = identifier
        return identifier

    def _looks_like_guid(self, value: str) -> bool:
        try:
            uuid.UUID(str(value))
            return True
        except Exception:
            return False

    def _has_mailboxes_for_identifier(self, identifier: str) -> bool:
        mail_conn = self._get_db_connection()
        if not mail_conn:
            return False
        cursor = mail_conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM mailboxes WHERE url LIKE ?",
            (f"%//{identifier}/%",),
        )
        count = cursor.fetchone()[0]
        mail_conn.close()
        return count > 0

    def _mailbox_name_from_url(self, url: str, account_identifier: str) -> str:
        decoded = unquote(url or "")
        if account_identifier and account_identifier in decoded:
            tail = decoded.split(account_identifier, 1)[1]
            if tail.startswith("/"):
                tail = tail[1:]
        else:
            tail = decoded.split("://", 1)[-1]
            tail = tail.split("/", 1)[-1] if "/" in tail else tail
        return self._normalize_mailbox_name(tail or "INBOX")

    def _normalize_mailbox_name(self, name: str) -> str:
        normalized = name.strip().lower()
        mapping = {
            "inbox": "INBOX",
            "sent": "Sent",
            "sent messages": "Sent",
            "[gmail]/sent mail": "Sent",
            "drafts": "Drafts",
            "[gmail]/drafts": "Drafts",
            "trash": "Trash",
            "deleted messages": "Trash",
            "[gmail]/trash": "Trash",
            "spam": "Spam",
            "junk": "Spam",
            "[gmail]/spam": "Spam",
            "archive": "Archive",
            "[gmail]/all mail": "Archive",
            "all mail": "Archive",
        }
        return mapping.get(normalized, name)

    def _is_gmail_account(self, conn: sqlite3.Connection, account_identifier: str) -> bool:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT 1 FROM mailboxes WHERE url LIKE ? LIMIT 1",
            (f"%//{account_identifier}/%5BGmail%5D/%",),
        )
        return cursor.fetchone() is not None

    def _gmail_label_url(self, account_identifier: str, mailbox: str) -> Optional[str]:
        mailbox_lower = mailbox.lower()
        mapping = {
            "inbox": "INBOX",
            "sent": "%5BGmail%5D/Sent%20Mail",
            "drafts": "%5BGmail%5D/Drafts",
            "trash": "%5BGmail%5D/Trash",
            "spam": "%5BGmail%5D/Spam",
            "junk": "%5BGmail%5D/Spam",
            "archive": "%5BGmail%5D/All%20Mail",
            "all mail": "%5BGmail%5D/All%20Mail",
        }
        label_path = mapping.get(mailbox_lower)
        if not label_path:
            return None
        return f"%//{account_identifier}/{label_path}"

    def _get_mailboxes_from_db(self, account: Optional[str]) -> List[Mailbox]:
        """Read mailboxes directly from Mail.app SQLite."""
        conn = self._get_db_connection()
        if not conn:
            return []

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            conn.close()
            return []

        cursor = conn.cursor()
        if self._is_gmail_account(conn, account_identifier):
            canonical = ["INBOX", "Sent", "Drafts", "Archive", "Trash", "Spam"]
            mailboxes: List[Mailbox] = []
            for name in canonical:
                label_url = self._gmail_label_url(account_identifier, name)
                if not label_url:
                    continue
                cursor.execute(
                    """
                    SELECT COUNT(*) as total_count
                    FROM messages m
                    JOIN server_messages sm ON sm.message = m.ROWID
                    JOIN server_labels sl ON sl.server_message = sm.ROWID
                    JOIN mailboxes lmb ON lmb.ROWID = sl.label
                    WHERE lmb.url LIKE ? AND m.deleted = 0
                    """,
                    (label_url,),
                )
                total = cursor.fetchone()[0]
                cursor.execute(
                    """
                    SELECT COUNT(*) as unread_count
                    FROM messages m
                    JOIN server_messages sm ON sm.message = m.ROWID
                    JOIN server_labels sl ON sl.server_message = sm.ROWID
                    JOIN mailboxes lmb ON lmb.ROWID = sl.label
                    WHERE lmb.url LIKE ? AND m.deleted = 0 AND m.read = 0
                    """,
                    (label_url,),
                )
                unread = cursor.fetchone()[0]
                mailboxes.append(Mailbox(
                    id=name,
                    name=name,
                    account=account or account_identifier,
                    unread_count=unread or 0,
                    total_count=total or 0,
                    provider=ProviderType.APPLE_MAIL,
                ))
            conn.close()
            return mailboxes

        cursor.execute(
            """
            SELECT ROWID, url, total_count, unread_count
            FROM mailboxes
            WHERE url LIKE ?
            """,
            (f"%//{account_identifier}/%",),
        )
        rows = cursor.fetchall()
        conn.close()

        mailboxes: List[Mailbox] = []
        for row in rows:
            name = self._mailbox_name_from_url(row["url"], account_identifier)
            mailboxes.append(Mailbox(
                id=str(row["ROWID"]),
                name=name,
                account=account or account_identifier,
                unread_count=row["unread_count"] or 0,
                total_count=row["total_count"] or 0,
                provider=ProviderType.APPLE_MAIL,
            ))

        return mailboxes

    def _get_messages_from_db(
        self,
        mailbox: str,
        account: Optional[str],
        limit: int,
        offset: int,
        unread_only: bool,
    ) -> List[EmailMessage]:
        conn = self._get_db_connection()
        if not conn:
            return []

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            conn.close()
            return []

        unread_filter = "AND m.read = 0" if unread_only else ""
        cursor = conn.cursor()

        # Gmail accounts: always use label queries (Gmail stores all messages in All Mail with labels)
        is_gmail = self._is_gmail_account(conn, account_identifier)
        use_gmail_labels = is_gmail

        if use_gmail_labels:
            label_url = self._gmail_label_url(account_identifier, mailbox)
            if not label_url:
                conn.close()
                return []
            query = f"""
                SELECT m.ROWID as rowid,
                       m.message_id,
                       m.document_id,
                       m.date_sent,
                       m.date_received,
                       m.read,
                       m.flagged,
                       m.deleted,
                       lmb.url as mailbox_url,
                       subj.subject,
                       summ.summary,
                       addr.address,
                       addr.comment,
                       GROUP_CONCAT(raddr.address) as recipients
                FROM messages m
                LEFT JOIN subjects subj ON subj.ROWID = m.subject
                LEFT JOIN summaries summ ON summ.ROWID = m.summary
                LEFT JOIN addresses addr ON addr.ROWID = m.sender
                LEFT JOIN recipients r ON r.message = m.ROWID
                LEFT JOIN addresses raddr ON raddr.ROWID = r.address
                LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox
                JOIN server_messages sm ON sm.message = m.ROWID
                JOIN server_labels sl ON sl.server_message = sm.ROWID
                JOIN mailboxes lmb ON lmb.ROWID = sl.label
                WHERE lmb.url LIKE ?
                  AND m.deleted = 0
                  {unread_filter}
                GROUP BY m.ROWID
                ORDER BY m.date_received DESC
                LIMIT ? OFFSET ?
            """
            cursor.execute(query, [label_url, limit, offset])
            rows = cursor.fetchall()
            conn.close()
            return self._rows_to_messages(rows, account_identifier, account)

        mailbox_ids = self._get_mailbox_ids(cursor, account_identifier, mailbox)
        if not mailbox_ids:
            conn.close()
            return []

        mailbox_placeholders = ", ".join(["?"] * len(mailbox_ids))

        query = f"""
            SELECT m.ROWID as rowid,
                   m.message_id,
                   m.document_id,
                   m.date_sent,
                   m.date_received,
                   m.read,
                   m.flagged,
                   m.deleted,
                   mb.url as mailbox_url,
                   subj.subject,
                   summ.summary,
                   addr.address,
                   addr.comment,
                   GROUP_CONCAT(raddr.address) as recipients
            FROM messages m
            LEFT JOIN subjects subj ON subj.ROWID = m.subject
            LEFT JOIN summaries summ ON summ.ROWID = m.summary
            LEFT JOIN addresses addr ON addr.ROWID = m.sender
            LEFT JOIN recipients r ON r.message = m.ROWID
            LEFT JOIN addresses raddr ON raddr.ROWID = r.address
            LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox
            WHERE m.mailbox IN ({mailbox_placeholders})
              AND m.deleted = 0
              {unread_filter}
            GROUP BY m.ROWID
            ORDER BY m.date_received DESC
            LIMIT ? OFFSET ?
        """

        cursor.execute(query, mailbox_ids + [limit, offset])
        rows = cursor.fetchall()
        conn.close()

        return self._rows_to_messages(rows, account_identifier, account)

    def _get_messages_since_from_db(
        self,
        mailbox: str,
        account: Optional[str],
        since_ts: int,
        since_rowid: int,
        limit: int,
    ) -> List[sqlite3.Row]:
        conn = self._get_db_connection()
        if not conn:
            return []

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            conn.close()
            return []

        cursor = conn.cursor()
        mailbox_ids = self._get_mailbox_ids(cursor, account_identifier, mailbox)
        if not mailbox_ids:
            conn.close()
            return []

        mailbox_placeholders = ", ".join(["?"] * len(mailbox_ids))

        query = f"""
            SELECT m.ROWID as rowid,
                   m.message_id,
                   m.document_id,
                   m.date_sent,
                   m.date_received,
                   m.read,
                   m.flagged,
                   m.deleted,
                   mb.url as mailbox_url,
                   subj.subject,
                   summ.summary,
                   addr.address,
                   addr.comment,
                   GROUP_CONCAT(raddr.address) as recipients
            FROM messages m
            LEFT JOIN subjects subj ON subj.ROWID = m.subject
            LEFT JOIN summaries summ ON summ.ROWID = m.summary
            LEFT JOIN addresses addr ON addr.ROWID = m.sender
            LEFT JOIN recipients r ON r.message = m.ROWID
            LEFT JOIN addresses raddr ON raddr.ROWID = r.address
            LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox
            WHERE m.mailbox IN ({mailbox_placeholders})
              AND m.deleted = 0
              AND (
                m.date_received > ?
                OR (m.date_received = ? AND m.ROWID > ?)
              )
            GROUP BY m.ROWID
            ORDER BY m.date_received ASC, m.ROWID ASC
            LIMIT ?
        """

        params: List[Any] = mailbox_ids + [since_ts, since_ts, since_rowid, limit]
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return rows

    def _get_flags_since_from_db(
        self,
        mailbox: str,
        account: Optional[str],
        since_ts: int,
        limit: int,
    ) -> List[Dict[str, Any]]:
        conn = self._get_db_connection()
        if not conn:
            return []

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            conn.close()
            return []

        cursor = conn.cursor()
        mailbox_ids = self._get_mailbox_ids(cursor, account_identifier, mailbox)
        if not mailbox_ids:
            conn.close()
            return []

        mailbox_placeholders = ", ".join(["?"] * len(mailbox_ids))

        query = f"""
            SELECT m.ROWID as rowid,
                   m.date_received,
                   m.read,
                   m.flagged,
                   m.deleted,
                   mb.url as mailbox_url
            FROM messages m
            LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox
            WHERE m.mailbox IN ({mailbox_placeholders})
              AND m.date_received >= ?
            ORDER BY m.date_received DESC
            LIMIT ?
        """

        params: List[Any] = mailbox_ids + [since_ts, limit]
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        results: List[Dict[str, Any]] = []
        for row in rows:
            results.append({
                "rowid": row["rowid"],
                "date_received": row["date_received"],
                "read": row["read"],
                "flagged": row["flagged"],
                "deleted": row["deleted"],
                "mailbox_url": row["mailbox_url"],
            })
        return results

    def _search_messages_from_db(
        self,
        query: str,
        mailbox: Optional[str],
        account: Optional[str],
        limit: int,
    ) -> List[EmailMessage]:
        conn = self._get_db_connection()
        if not conn:
            return []

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            conn.close()
            return []

        mailbox_filter = ""
        mailbox_ids: List[int] = []
        if mailbox:
            cursor = conn.cursor()
            if self._is_gmail_account(conn, account_identifier):
                label_url = self._gmail_label_url(account_identifier, mailbox)
                if label_url:
                    mailbox_filter = "AND lmb.url LIKE ?"
                else:
                    conn.close()
                    return []
            else:
                mailbox_ids = self._get_mailbox_ids(cursor, account_identifier, mailbox)

                if mailbox_ids:
                    placeholders = ", ".join(["?"] * len(mailbox_ids))
                    mailbox_filter = f"AND m.mailbox IN ({placeholders})"

        term = f"%{query}%"

        join_labels = ""
        if mailbox_filter.startswith("AND lmb.url"):
            join_labels = """
                JOIN server_messages sm ON sm.message = m.ROWID
                JOIN server_labels sl ON sl.server_message = sm.ROWID
                JOIN mailboxes lmb ON lmb.ROWID = sl.label
            """

        query_sql = f"""
            SELECT m.ROWID as rowid,
                   m.message_id,
                   m.document_id,
                   m.date_sent,
                   m.date_received,
                   m.read,
                   m.flagged,
                   m.deleted,
                   mb.url as mailbox_url,
                   subj.subject,
                   summ.summary,
                   addr.address,
                   addr.comment,
                   GROUP_CONCAT(raddr.address) as recipients
            FROM messages m
            LEFT JOIN subjects subj ON subj.ROWID = m.subject
            LEFT JOIN summaries summ ON summ.ROWID = m.summary
            LEFT JOIN addresses addr ON addr.ROWID = m.sender
            LEFT JOIN recipients r ON r.message = m.ROWID
            LEFT JOIN addresses raddr ON raddr.ROWID = r.address
            LEFT JOIN mailboxes mb ON mb.ROWID = m.mailbox
            {join_labels}
            WHERE m.deleted = 0
              AND (subj.subject LIKE ? OR addr.address LIKE ? OR summ.summary LIKE ?)
              {mailbox_filter}
            GROUP BY m.ROWID
            ORDER BY m.date_received DESC
            LIMIT ?
        """

        params: List[Any] = [term, term, term]
        if mailbox_filter:
            if mailbox_filter.startswith("AND lmb.url"):
                label_url = self._gmail_label_url(account_identifier, mailbox or "")
                if label_url:
                    params.append(label_url)
            else:
                params.extend(mailbox_ids)
        params.append(limit)

        cursor = conn.cursor()
        cursor.execute(query_sql, params)
        rows = cursor.fetchall()
        conn.close()

        return self._rows_to_messages(rows, account_identifier, account)

    def _get_unread_count_from_db(self, mailbox: str, account: Optional[str]) -> Optional[int]:
        conn = self._get_db_connection()
        if not conn:
            return None

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            conn.close()
            return None

        cursor = conn.cursor()
        if self._is_gmail_account(conn, account_identifier):
            label_url = self._gmail_label_url(account_identifier, mailbox)
            if not label_url:
                conn.close()
                return None
            cursor.execute(
                """
                SELECT COUNT(*) as count
                FROM messages m
                JOIN server_messages sm ON sm.message = m.ROWID
                JOIN server_labels sl ON sl.server_message = sm.ROWID
                JOIN mailboxes lmb ON lmb.ROWID = sl.label
                WHERE lmb.url LIKE ? AND m.read = 0 AND m.deleted = 0
                """,
                (label_url,),
            )
            row = cursor.fetchone()
            conn.close()
            return row["count"] if row else 0

        mailbox_ids = self._get_mailbox_ids(cursor, account_identifier, mailbox)
        if not mailbox_ids:
            conn.close()
            return None

        placeholders = ", ".join(["?"] * len(mailbox_ids))
        cursor.execute(
            f"""
            SELECT COUNT(*) as count
            FROM messages
            WHERE mailbox IN ({placeholders}) AND read = 0 AND deleted = 0
            """,
            mailbox_ids,
        )
        row = cursor.fetchone()
        conn.close()
        return row["count"] if row else 0

    def _get_mailbox_ids(
        self,
        cursor: sqlite3.Cursor,
        account_identifier: str,
        mailbox: str,
    ) -> List[int]:
        cursor.execute(
            """
            SELECT ROWID, url
            FROM mailboxes
            WHERE url LIKE ?
            """,
            (f"%//{account_identifier}/%",),
        )
        mailbox_ids: List[int] = []
        mailbox_lower = mailbox.lower()
        for row in cursor.fetchall():
            name = self._mailbox_name_from_url(row["url"], account_identifier).lower()
            if name == mailbox_lower:
                mailbox_ids.append(row["ROWID"])
        return mailbox_ids

    def _rows_to_messages(
        self,
        rows: List[sqlite3.Row],
        account_identifier: str,
        account: Optional[str],
    ) -> List[EmailMessage]:
        messages: List[EmailMessage] = []
        for row in rows:
            message_id = row["rowid"]
            date_received = self._format_timestamp(row["date_received"])
            date_sent = self._format_timestamp(row["date_sent"])
            mailbox = self._mailbox_name_from_url(row["mailbox_url"], account_identifier)
            subject = row["subject"] or "(no subject)"

            messages.append(EmailMessage(
                id=str(message_id),
                subject=subject,
                sender=row["address"] or "",
                sender_name=row["comment"],
                recipients=[r for r in (row["recipients"] or "").split(",") if r],
                cc=[],
                bcc=[],
                date_received=date_received,
                date_sent=date_sent,
                is_read=bool(row["read"]),
                is_flagged=bool(row["flagged"]),
                mailbox=mailbox,
                account=account or "Apple Mail",
                provider=ProviderType.APPLE_MAIL,
                content=None,
                snippet=row["summary"],
            ))

        return messages

    def _format_timestamp(self, timestamp: Optional[int]) -> str:
        if not timestamp:
            return ""
        try:
            # Apple Mail.app uses Cocoa timestamp (seconds since 2001-01-01 00:00:00 UTC)
            # Unix timestamp is seconds since 1970-01-01 00:00:00 UTC
            # Offset: 978307200 seconds (31 years)
            COCOA_TO_UNIX_OFFSET = 978307200
            unix_timestamp = int(timestamp) + COCOA_TO_UNIX_OFFSET
            return datetime.utcfromtimestamp(unix_timestamp).isoformat()
        except Exception:
            return ""

    def _load_emlx_content(
        self,
        message_id: str | int,
        mailbox: str,
        account: Optional[str],
    ) -> Optional[str]:
        """Load message content from a local .emlx file."""
        try:
            rowid = int(message_id)
        except (TypeError, ValueError):
            return None

        account_identifier = self._get_account_identifier(account)
        if not account_identifier:
            return None

        mailbox_path = self._mailbox_path(account_identifier, mailbox)
        storage_dir = self._mailbox_storage_dir(mailbox_path) if mailbox_path else None

        # Gmail fallback: if mailbox has no storage dir, try All Mail
        if not storage_dir:
            mail_conn = self._get_db_connection()
            if mail_conn and self._is_gmail_account(mail_conn, account_identifier):
                mail_conn.close()
                fallback_path = self._mailbox_path(account_identifier, "[Gmail]/All Mail")
                if fallback_path:
                    storage_dir = self._mailbox_storage_dir(fallback_path)
            elif mail_conn:
                mail_conn.close()

        if not storage_dir:
            return None

        candidates = self._emlx_candidates(storage_dir, rowid)
        emlx_path = next((p for p in candidates if p.exists()), None)
        if not emlx_path:
            return None

        raw = emlx_path.read_bytes()
        size_line, _, payload = raw.partition(b"\n")
        # emlx format: first line is message size (may have trailing spaces)
        if size_line.strip().isdigit():
            raw_message = payload
        else:
            raw_message = raw

        msg = email.message_from_bytes(raw_message)
        return self._extract_body(msg)

    def _mailbox_path(self, account_identifier: str, mailbox: str) -> Optional[Path]:
        """Resolve mailbox name to .mbox folder path."""
        base_dir = Path.home() / "Library" / "Mail"
        if not base_dir.exists():
            return None

        versions = [p for p in base_dir.iterdir() if p.is_dir() and p.name.startswith("V") and p.name[1:].isdigit()]
        if not versions:
            return None

        latest = sorted(versions, key=lambda p: int(p.name[1:]))[-1]
        account_root = latest / account_identifier
        if not account_root.exists():
            return None

        parts = mailbox.split("/")
        mailbox_path = account_root
        for part in parts:
            mailbox_path = mailbox_path / f"{part}.mbox"
        return mailbox_path if mailbox_path.exists() else None

    def _mailbox_storage_dir(self, mailbox_path: Path) -> Optional[Path]:
        """Find the mailbox storage GUID folder that contains Data/."""
        for child in mailbox_path.iterdir():
            if child.is_dir() and (child / "Data").exists():
                return child
        return None

    def _emlx_candidates(self, storage_dir: Path, rowid: int) -> List[Path]:
        """Return possible .emlx paths for a given rowid."""
        data_dir = storage_dir / "Data"
        candidates: List[Path] = []

        root_messages = data_dir / "Messages"
        candidates.append(root_messages / f"{rowid}.emlx")
        candidates.append(root_messages / f"{rowid}.partial.emlx")

        shard1 = (rowid // 1000) % 10
        shard2 = (rowid // 10000) % 10
        shard_messages = data_dir / str(shard1) / str(shard2) / "Messages"
        candidates.append(shard_messages / f"{rowid}.emlx")
        candidates.append(shard_messages / f"{rowid}.partial.emlx")

        return candidates

    def _extract_body(self, msg: email.message.Message) -> str:
        """Extract a plain text body from a MIME message.

        Prefers text/plain. Falls back to HTML converted to readable text.
        """
        plain_text = None
        html_text = None

        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                content_disposition = str(part.get("Content-Disposition", ""))

                if "attachment" in content_disposition:
                    continue

                payload = part.get_payload(decode=True)
                if not payload:
                    continue

                try:
                    text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
                except Exception:
                    text = payload.decode("utf-8", errors="replace")

                if content_type == "text/plain" and not plain_text:
                    plain_text = text
                elif content_type == "text/html" and not html_text:
                    html_text = text
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                try:
                    text = payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
                except Exception:
                    text = payload.decode("utf-8", errors="replace")

                content_type = msg.get_content_type()
                if content_type == "text/html":
                    html_text = text
                else:
                    plain_text = text

        # Prefer plain text
        if plain_text:
            import html as html_module
            # Some emails have HTML entities even in text/plain parts
            plain_text = html_module.unescape(plain_text)
            return self._clean_text(plain_text)

        # Convert HTML to readable text
        if html_text:
            return self._html_to_text(html_text)

        return ""

    def _html_to_text(self, html: str) -> str:
        """Convert HTML to readable plain text."""
        import html as html_module
        import re

        text = html

        # Remove style and script blocks entirely
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)

        # Convert common block elements to newlines
        text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</?p[^>]*>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</?div[^>]*>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</?tr[^>]*>', '\n', text, flags=re.IGNORECASE)
        text = re.sub(r'</?li[^>]*>', '\n• ', text, flags=re.IGNORECASE)
        text = re.sub(r'</?h[1-6][^>]*>', '\n', text, flags=re.IGNORECASE)

        # Extract link URLs inline: <a href="url">text</a> -> text (url)
        text = re.sub(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>([^<]*)</a>', r'\2 (\1)', text, flags=re.IGNORECASE)

        # Remove all remaining HTML tags
        text = re.sub(r'<[^>]+>', '', text)

        # Decode HTML entities
        text = html_module.unescape(text)

        # Clean up whitespace
        text = self._clean_text(text)

        return text

    def _clean_text(self, text: str) -> str:
        """Clean up text whitespace."""
        import re

        # Remove invisible Unicode characters (zero-width joiners, BOM, figure spaces, etc.)
        # These come from HTML entities like &#847; &zwnj; that decode to invisible chars
        text = re.sub(r'[\u200b-\u200f\u2028-\u202f\u00ad\ufeff\u034f\u2000-\u200a\u2060-\u206f\u061c\u180e\u2800\u3000\u3164\uffa0]', '', text)

        # Normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')

        # Replace multiple spaces/tabs with single space (but preserve newlines)
        text = re.sub(r'[^\S\n]+', ' ', text)

        # Remove leading/trailing whitespace from each line
        lines = [line.strip() for line in text.split('\n')]

        # Collapse multiple blank lines into max 2
        result = []
        blank_count = 0
        for line in lines:
            if not line:
                blank_count += 1
                if blank_count <= 2:
                    result.append('')
            else:
                blank_count = 0
                result.append(line)

        return '\n'.join(result).strip()

    def _account_matches_filter(
        self,
        account_filter: str,
        message_account: Optional[str],
        account_aliases: Dict[str, set[str]],
    ) -> bool:
        """Return True when message account matches requested account."""
        if not message_account:
            return False

        message_account_lower = message_account.lower()
        if account_filter == message_account_lower:
            return True

        if account_filter in message_account_lower or message_account_lower in account_filter:
            return True

        aliases = account_aliases.get(account_filter, set())
        return message_account_lower in aliases
    
    def create_draft(self, draft: DraftMessage, account: Optional[str] = None) -> bool:
        """Create a draft in Mail.app.

        This opens Mail.app with a compose window for user review.
        Uses AppleScript to create the draft with proper HTML support.
        """
        if not IS_MACOS:
            return False

        try:
            import subprocess

            # Helper to escape strings for AppleScript
            def escape_applescript(s: str) -> str:
                """Escape a string for use in AppleScript.

                AppleScript requires backslash escaping for quotes and backslashes.
                """
                if not s:
                    return ""
                # Escape backslashes first, then quotes
                return s.replace('\\', '\\\\').replace('"', '\\"')

            # Use plain text content
            # Note: AppleScript doesn't support setting HTML content directly
            # HTML tags will be visible as plain text in the draft
            # User can format in Mail.app after opening
            content = draft.content

            # Escape subject and content
            safe_subject = escape_applescript(draft.subject)
            safe_content = escape_applescript(content)

            # Build AppleScript to create draft
            # Note: Mail.app will use the default account
            # User can change it in the compose window if needed
            script_parts = ['tell application "Mail"']
            script_parts.append(f'    set newMessage to make new outgoing message with properties {{subject:"{safe_subject}", visible:true}}')

            # Add recipients
            script_parts.append('    tell newMessage')

            # To recipients
            for addr in draft.to:
                safe_addr = escape_applescript(addr)
                script_parts.append(f'        make new to recipient with properties {{address:"{safe_addr}"}}')

            # CC recipients
            for addr in (draft.cc or []):
                safe_addr = escape_applescript(addr)
                script_parts.append(f'        make new cc recipient with properties {{address:"{safe_addr}"}}')

            # BCC recipients
            for addr in (draft.bcc or []):
                safe_addr = escape_applescript(addr)
                script_parts.append(f'        make new bcc recipient with properties {{address:"{safe_addr}"}}')

            # Set content
            script_parts.append(f'        set content to "{safe_content}"')

            # Add attachments if provided
            if draft.attachments:
                for attachment_path in draft.attachments:
                    # Validate file exists
                    if not Path(attachment_path).exists():
                        logger.warning(f"Attachment not found: {attachment_path}")
                        continue

                    # Convert to POSIX path for AppleScript
                    safe_path = escape_applescript(str(Path(attachment_path).resolve()))
                    script_parts.append(f'        make new attachment with properties {{file name:"{safe_path}"}} at after the last paragraph')

            script_parts.append('    end tell')
            script_parts.append('    activate')
            script_parts.append('end tell')

            script = '\n'.join(script_parts)

            result = subprocess.run(
                ['osascript', '-e', script],
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode == 0:
                logger.info(f"Created draft for: {draft.to}")
                return True
            else:
                logger.error(f"AppleScript error creating draft: {result.stderr}")
                logger.debug(f"Script was: {script}")
                return False

        except subprocess.TimeoutExpired:
            logger.error("AppleScript timed out creating draft")
            return False
        except Exception as e:
            logger.error(f"Failed to create draft: {e}")
            return False
    
    def mark_read(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Mark a message as read.
        
        Note: Requires message to be identifiable by subject/date.
        """
        handler = self._get_mail_handler()
        if not handler:
            return False
        
        # pyapple_mcp mark_read expects different parameters
        # This is a limitation - we can't mark by ID directly
        logger.warning("Apple Mail mark_read by ID not fully supported")
        return False
    
    def mark_flagged(
        self,
        message_id: str,
        flagged: bool,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Set flagged status."""
        logger.warning("Apple Mail flag toggle not supported")
        return False
    
    def delete(
        self,
        message_id: str,
        mailbox: str = "INBOX",
        account: Optional[str] = None,
    ) -> bool:
        """Move to trash."""
        logger.warning("Apple Mail delete not supported via adapter")
        return False
    
    def get_unread_count(self, mailbox: str = "INBOX", account: Optional[str] = None) -> int:
        """Get unread message count."""
        db_count = self._get_unread_count_from_db(mailbox, account)
        return db_count or 0
    
    def test_connection(self) -> tuple[bool, str]:
        """Test Apple Mail connection."""
        if not IS_MACOS:
            return False, "Apple Mail is only available on macOS"
        
        if not self.is_available():
            return False, "Mail.app database not accessible. Check Full Disk Access permission."
        
        accounts = self.get_accounts()
        if accounts:
            return True, f"Connected. Found {len(accounts)} account(s) in Mail.app"
        
        # Try discover as fallback
        discovered = self.discover_accounts()
        if discovered:
            return True, f"Connected. Found {len(discovered)} account(s) in Mail.app"
        
        return True, "Connected to Mail.app (no accounts discovered yet)"


# === Account Discovery Helper ===

def discover_apple_mail_accounts() -> Dict[str, Any]:
    """Discover Apple Mail accounts for onboarding.
    
    Returns:
        Dict with:
        - platform: Current platform
        - available: Whether Apple Mail is available
        - accounts: List of discovered accounts
        - message: Human-readable status message
    """
    if not IS_MACOS:
        return {
            'platform': sys.platform,
            'available': False,
            'accounts': [],
            'message': 'Apple Mail is only available on macOS.',
        }
    
    adapter = AppleMailAdapter()
    
    if not adapter.is_available():
        return {
            'platform': 'macos',
            'available': False,
            'accounts': [],
            'message': 'Mail.app database not accessible. Grant Full Disk Access to use Apple Mail.',
        }
    
    accounts = adapter.discover_accounts()
    
    if accounts:
        return {
            'platform': 'macos',
            'available': True,
            'accounts': accounts,
            'message': f'Found {len(accounts)} account(s) in Mail.app. Ready for zero-config email access.',
        }
    
    return {
        'platform': 'macos',
        'available': True,
        'accounts': [],
        'message': 'Mail.app is available but no accounts configured. Add accounts in Mail.app first.',
    }
