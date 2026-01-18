"""Account discovery service - Discovers accounts from Apple system sources.

Runs on startup to populate the unified accounts table from:
1. Mail.app accounts (AppleScript + Accounts4.sqlite)
2. Calendar.app owner_identity_email
3. AddressBook source directories

Discovery is additive - it won't remove manually configured accounts.
User-set capabilities are preserved; only metadata is updated.
Capabilities are managed through Settings > Accounts UI, not config files.
"""

from __future__ import annotations

import logging
import sqlite3
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

# System paths
ACCOUNTS4_DB = Path.home() / "Library" / "Accounts" / "Accounts4.sqlite"
CALENDAR_DB = Path.home() / "Library" / "Calendars" / "Calendar.sqlitedb"
ADDRESSBOOK_SOURCES = Path.home() / "Library" / "Application Support" / "AddressBook" / "Sources"


@dataclass
class DiscoveredAccount:
    """Account discovered from Apple sources."""
    email: str
    display_name: Optional[str] = None
    account_type: str = "imap"
    discovered_via: str = "unknown"
    apple_account_guid: Optional[str] = None
    mail_account_name: Optional[str] = None
    calendar_owner_email: Optional[str] = None
    addressbook_source_id: Optional[str] = None
    raw_data: Dict[str, Any] = field(default_factory=dict)


class AccountDiscoveryService:
    """Discovers and manages unified accounts."""

    def __init__(self, storage):
        """Initialize with storage backend."""
        self.storage = storage

    def discover_all(self) -> List[DiscoveredAccount]:
        """Run full account discovery from all sources.

        Returns:
            List of discovered accounts, deduplicated by email.
        """
        discovered: Dict[str, DiscoveredAccount] = {}

        # 1. Mail.app accounts (most authoritative for email)
        for acc in self._discover_mail_accounts():
            if acc.email:
                discovered[acc.email.lower()] = acc

        # 2. Accounts4.sqlite (system-level, adds GUIDs)
        for acc in self._discover_accounts4():
            email_key = acc.email.lower() if acc.email else None
            if email_key:
                if email_key in discovered:
                    # Merge GUID info
                    discovered[email_key].apple_account_guid = acc.apple_account_guid
                else:
                    discovered[email_key] = acc

        # 3. Calendar owner_identity_email (may find accounts Mail doesn't know)
        for acc in self._discover_calendar_accounts():
            email_key = acc.email.lower() if acc.email else None
            if email_key:
                if email_key in discovered:
                    discovered[email_key].calendar_owner_email = acc.email
                else:
                    discovered[email_key] = acc

        # 4. AddressBook sources (account UUIDs)
        for acc in self._discover_addressbook_sources():
            # AddressBook sources don't always have emails
            # Try to match by GUID or add as separate entry
            matched = False
            for existing in discovered.values():
                if (existing.apple_account_guid and
                    existing.apple_account_guid == acc.apple_account_guid):
                    existing.addressbook_source_id = acc.addressbook_source_id
                    matched = True
                    break

            if not matched and acc.email:
                discovered[acc.email.lower()] = acc

        return list(discovered.values())

    def _discover_mail_accounts(self) -> List[DiscoveredAccount]:
        """Discover accounts from Mail.app via AppleScript."""
        accounts = []

        try:
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
                logger.warning(f"Mail.app AppleScript failed: {result.stderr}")
                return accounts

            raw_output = result.stdout.strip()
            if not raw_output:
                return accounts

            for entry in raw_output.split(', '):
                parts = entry.split('|')
                if len(parts) >= 2:
                    name = parts[0].strip()
                    email = parts[1].strip()
                    acc_type = parts[2].strip() if len(parts) > 2 else 'unknown'

                    if '@' in email:
                        accounts.append(DiscoveredAccount(
                            email=email,
                            display_name=name,
                            account_type=self._classify_account_type(acc_type, email),
                            discovered_via='mail_app',
                            mail_account_name=name,
                            raw_data={'mail_type': acc_type},
                        ))

        except Exception as e:
            logger.error(f"Failed to discover Mail.app accounts: {e}")

        return accounts

    def _discover_accounts4(self) -> List[DiscoveredAccount]:
        """Discover accounts from ~/Library/Accounts/Accounts4.sqlite."""
        accounts = []

        if not ACCOUNTS4_DB.exists():
            return accounts

        try:
            conn = sqlite3.connect(ACCOUNTS4_DB)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Query for accounts with identifiers (join with ZACCOUNTTYPE for description)
            cursor.execute("""
                SELECT
                    a.ZIDENTIFIER as guid,
                    a.ZACCOUNTDESCRIPTION as description,
                    a.ZUSERNAME as username,
                    t.ZACCOUNTTYPEDESCRIPTION as type_desc
                FROM ZACCOUNT a
                LEFT JOIN ZACCOUNTTYPE t ON a.ZACCOUNTTYPE = t.Z_PK
                WHERE a.ZIDENTIFIER IS NOT NULL
            """)

            for row in cursor.fetchall():
                # Username is often the email
                email = row['username']
                if email and '@' in email:
                    accounts.append(DiscoveredAccount(
                        email=email,
                        display_name=row['description'],
                        account_type=self._classify_account_type(row['type_desc'], email),
                        discovered_via='accounts4',
                        apple_account_guid=row['guid'],
                        raw_data={'type_desc': row['type_desc']},
                    ))

            conn.close()

        except Exception as e:
            logger.error(f"Failed to read Accounts4.sqlite: {e}")

        return accounts

    def _discover_calendar_accounts(self) -> List[DiscoveredAccount]:
        """Discover accounts from Calendar.sqlitedb Calendar table (owner_identity_email)."""
        accounts = []

        if not CALENDAR_DB.exists():
            return accounts

        try:
            conn = sqlite3.connect(CALENDAR_DB)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Get unique owner emails from Calendar table
            # owner_identity_email identifies the account that owns each calendar
            cursor.execute("""
                SELECT DISTINCT
                    c.owner_identity_email as email
                FROM Calendar c
                WHERE c.owner_identity_email IS NOT NULL
                  AND c.owner_identity_email != ''
            """)

            for row in cursor.fetchall():
                email = row['email']
                if email and '@' in email:
                    accounts.append(DiscoveredAccount(
                        email=email,
                        display_name=None,  # Calendar table doesn't have display names
                        account_type=self._classify_account_type(None, email),
                        discovered_via='calendar',
                        calendar_owner_email=email,
                    ))

            conn.close()

        except Exception as e:
            logger.error(f"Failed to read Calendar.sqlitedb: {e}")

        return accounts

    def _discover_addressbook_sources(self) -> List[DiscoveredAccount]:
        """Discover account sources from AddressBook/Sources/."""
        accounts = []

        if not ADDRESSBOOK_SOURCES.exists():
            return accounts

        try:
            for source_dir in ADDRESSBOOK_SOURCES.iterdir():
                if not source_dir.is_dir():
                    continue

                source_id = source_dir.name

                # Try to read metadata
                metadata_path = source_dir / "Metadata.plist"
                # For now, just record the source ID
                # Could parse plist for more info

                accounts.append(DiscoveredAccount(
                    email=None,  # AddressBook sources may not have email
                    display_name=None,
                    account_type='local',
                    discovered_via='addressbook',
                    addressbook_source_id=source_id,
                ))

        except Exception as e:
            logger.error(f"Failed to discover AddressBook sources: {e}")

        return accounts

    def _classify_account_type(
        self,
        raw_type: Optional[str],
        email: Optional[str]
    ) -> str:
        """Classify account type from raw data and email domain."""
        if raw_type:
            raw_lower = raw_type.lower()
            if 'icloud' in raw_lower:
                return 'icloud'
            if 'google' in raw_lower or 'gmail' in raw_lower:
                return 'google'
            if 'exchange' in raw_lower or 'ews' in raw_lower:
                return 'exchange'

        if email:
            email_lower = email.lower()
            if 'gmail.com' in email_lower or 'googlemail.com' in email_lower:
                return 'google'
            if 'icloud.com' in email_lower or 'me.com' in email_lower:
                return 'icloud'
            if 'outlook.com' in email_lower or 'hotmail.com' in email_lower:
                return 'exchange'

        return 'imap'

    def sync_to_database(self, discovered: List[DiscoveredAccount]) -> Dict[str, int]:
        """Sync discovered accounts to the accounts table.

        - Inserts new accounts with default capabilities
        - Updates metadata (GUIDs, names) for existing accounts
        - Preserves user-set capabilities (managed via Settings > Accounts UI)

        Returns:
            Dict with counts: {inserted, updated, unchanged}
        """
        stats = {'inserted': 0, 'updated': 0, 'unchanged': 0}

        # Default capabilities for new accounts (safe defaults)
        defaults = {
            'can_read_email': 1,
            'can_send_email': 0,  # Disabled by default for safety
            'can_draft_email': 1,
            'can_read_calendar': 1,
            'can_create_calendar': 1,
            'can_delete_calendar': 0,  # Disabled by default for safety
            'can_read_contacts': 1,
            'can_modify_contacts': 0,  # Disabled by default for safety
            'can_read_messages': 1,
            'can_send_messages': 0,  # Disabled by default for safety
        }

        for acc in discovered:
            if not acc.email:
                continue

            email_lower = acc.email.lower()

            # Check if account exists
            existing = self.storage.fetchone(
                "SELECT * FROM accounts WHERE lower(email) = ?",
                (email_lower,)
            )

            if existing:
                # Update metadata only (preserve capabilities)
                updates = []
                params = []

                if acc.display_name and not existing['display_name']:
                    updates.append("display_name = ?")
                    params.append(acc.display_name)

                if acc.apple_account_guid and not existing['apple_account_guid']:
                    updates.append("apple_account_guid = ?")
                    params.append(acc.apple_account_guid)

                if acc.mail_account_name and not existing['mail_account_name']:
                    updates.append("mail_account_name = ?")
                    params.append(acc.mail_account_name)

                if acc.calendar_owner_email and not existing['calendar_owner_email']:
                    updates.append("calendar_owner_email = ?")
                    params.append(acc.calendar_owner_email)

                if acc.addressbook_source_id and not existing['addressbook_source_id']:
                    updates.append("addressbook_source_id = ?")
                    params.append(acc.addressbook_source_id)

                # Always update verification timestamp
                updates.append("last_verified_at = ?")
                params.append(datetime.now(timezone.utc).isoformat())

                if updates:
                    params.append(existing['id'])
                    self.storage.execute(
                        f"UPDATE accounts SET {', '.join(updates)}, updated_at = datetime('now') WHERE id = ?",
                        params
                    )
                    stats['updated'] += 1
                else:
                    stats['unchanged'] += 1

            else:
                # Insert new account with defaults
                account_id = str(uuid4())[:8]

                self.storage.execute("""
                    INSERT INTO accounts (
                        id, email, display_name, account_type, discovered_via,
                        can_read_email, can_send_email, can_draft_email,
                        can_read_calendar, can_create_calendar, can_delete_calendar,
                        can_read_contacts, can_modify_contacts,
                        can_read_messages, can_send_messages,
                        is_claude_account, is_primary, is_enabled,
                        apple_account_guid, mail_account_name,
                        calendar_owner_email, addressbook_source_id,
                        discovered_at, last_verified_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                """, (
                    account_id,
                    acc.email,
                    acc.display_name,
                    acc.account_type,
                    acc.discovered_via,
                    defaults['can_read_email'],
                    defaults['can_send_email'],
                    defaults['can_draft_email'],
                    defaults['can_read_calendar'],
                    defaults['can_create_calendar'],
                    defaults['can_delete_calendar'],
                    defaults['can_read_contacts'],
                    defaults['can_modify_contacts'],
                    defaults['can_read_messages'],
                    defaults['can_send_messages'],
                    0,  # is_claude_account - set via UI
                    0,  # is_primary - set via UI
                    1,  # enabled by default
                    acc.apple_account_guid,
                    acc.mail_account_name,
                    acc.calendar_owner_email,
                    acc.addressbook_source_id,
                ))
                stats['inserted'] += 1

        return stats

    def run_discovery(self) -> Dict[str, int]:
        """Full discovery flow: discover -> sync -> return stats."""
        discovered = self.discover_all()
        logger.info(f"Discovered {len(discovered)} accounts from Apple sources")
        return self.sync_to_database(discovered)
