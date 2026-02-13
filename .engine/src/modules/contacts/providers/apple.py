"""Apple Contacts adapter - Reads from macOS Contacts database.

This adapter reads directly from ~/Library/Application Support/AddressBook/
which contains the SQLite databases that Contacts.app uses.

The database structure:
- AddressBook-v22.abcddb - Main contacts database
- Sources/ - Account-specific data

Requirements:
- macOS
- Contacts.app configured with at least one account
- Full Disk Access permission for Python process

Note: This is READ-ONLY. Creating/updating contacts should be done via
AppleScript or the Contacts framework to ensure proper sync.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .base import (
    ContactsAdapter,
    ContactInfo,
    ContactCreate,
    ContactUpdate,
    ContactGroup,
    ProviderType,
)

logger = logging.getLogger(__name__)

# macOS AddressBook database location
ADDRESSBOOK_DIR = os.path.expanduser("~/Library/Application Support/AddressBook")
# Contacts are stored in Sources/{UUID}/AddressBook-v22.abcddb, not the root
SOURCES_DIR = os.path.join(ADDRESSBOOK_DIR, "Sources")

# Core Data reference date (January 1, 2001)
CORE_DATA_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


def _core_data_to_datetime(timestamp: Optional[float]) -> Optional[datetime]:
    """Convert Core Data timestamp to datetime."""
    if timestamp is None:
        return None
    try:
        from datetime import timedelta
        return CORE_DATA_EPOCH + timedelta(seconds=timestamp)
    except:
        return None


class AppleContactsAdapter(ContactsAdapter):
    """Adapter for macOS Contacts.app (AddressBook).

    Reads from the AddressBook SQLite databases in Sources/ for fast access.
    Write operations use AppleScript to ensure proper sync.
    """

    def __init__(self):
        """Initialize Apple Contacts adapter."""
        self._source_dbs: List[str] = []
        self._init_source_dbs()

    def _init_source_dbs(self):
        """Find all source databases."""
        if not os.path.exists(SOURCES_DIR):
            return
        for source_id in os.listdir(SOURCES_DIR):
            db_path = os.path.join(SOURCES_DIR, source_id, "AddressBook-v22.abcddb")
            if os.path.exists(db_path):
                self._source_dbs.append(db_path)

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.APPLE

    @property
    def display_name(self) -> str:
        return "Apple Contacts"

    def _get_db_connection(self, db_path: str) -> Optional[sqlite3.Connection]:
        """Get a connection to a specific AddressBook database."""
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            return conn
        except Exception as e:
            logger.error(f"Failed to connect to {db_path}: {e}")
            return None

    def is_available(self) -> bool:
        """Check if Apple Contacts is available."""
        return len(self._source_dbs) > 0
    
    def get_contacts(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ContactInfo]:
        """Get all contacts from Apple Contacts (across all sources)."""
        all_contacts = []

        for db_path in self._source_dbs:
            conn = self._get_db_connection(db_path)
            if not conn:
                continue

            try:
                # Query contacts with names
                query = """
                    SELECT
                        p.ROWID as row_id,
                        p.ZUNIQUEID as unique_id,
                        p.ZFIRSTNAME as first_name,
                        p.ZLASTNAME as last_name,
                        p.ZNICKNAME as nickname,
                        p.ZORGANIZATION as company,
                        p.ZJOBTITLE as job_title,
                        p.ZDEPARTMENT as department,
                        p.ZBIRTHDAY as birthday,
                        p.ZNOTE as notes,
                        p.ZCREATIONDATE as created,
                        p.ZMODIFICATIONDATE as modified
                    FROM ZABCDRECORD p
                    WHERE p.ZFIRSTNAME IS NOT NULL OR p.ZLASTNAME IS NOT NULL
                       OR p.ZORGANIZATION IS NOT NULL
                    ORDER BY p.ZLASTNAME, p.ZFIRSTNAME
                """

                cursor = conn.execute(query)

                for row in cursor.fetchall():
                    contact = self._build_contact_from_row(conn, row)
                    if contact:
                        all_contacts.append(contact)

            except Exception as e:
                logger.error(f"Error fetching contacts from {db_path}: {e}")
            finally:
                conn.close()

        # Sort and apply limit/offset
        all_contacts.sort(key=lambda c: (c.last_name or '', c.first_name or ''))
        return all_contacts[offset:offset + limit]
    
    def _build_contact_from_row(self, conn: sqlite3.Connection, row) -> Optional[ContactInfo]:
        """Build ContactInfo from database row, fetching related data."""
        try:
            rowid = row['row_id']
            unique_id = row['unique_id']
            
            first_name = row['first_name'] or ''
            last_name = row['last_name'] or ''
            name = f"{first_name} {last_name}".strip()
            
            if not name:
                name = row['company'] or row['nickname'] or 'Unknown'
            
            # Get phone numbers
            phones = self._get_phones(conn, rowid)
            
            # Get emails
            emails = self._get_emails(conn, rowid)
            
            # Get addresses
            addresses = self._get_addresses(conn, rowid)
            
            return ContactInfo(
                id=unique_id,
                name=name,
                provider=ProviderType.APPLE,
                first_name=row['first_name'],
                last_name=row['last_name'],
                nickname=row['nickname'],
                phones=phones,
                emails=emails,
                company=row['company'],
                job_title=row['job_title'],
                department=row['department'],
                addresses=addresses,
                notes=row['notes'],
                birthday=str(row['birthday']) if row['birthday'] else None,
                created_at=_core_data_to_datetime(row['created']),
                updated_at=_core_data_to_datetime(row['modified']),
                external_id=unique_id,
            )
            
        except Exception as e:
            logger.warning(f"Error building contact: {e}")
            return None
    
    def _get_phones(self, conn: sqlite3.Connection, person_rowid: int) -> List[Dict[str, str]]:
        """Get phone numbers for a contact."""
        try:
            query = """
                SELECT ZFULLNUMBER as number, ZLABEL as label
                FROM ZABCDPHONENUMBER
                WHERE ZOWNER = ?
            """
            cursor = conn.execute(query, (person_rowid,))
            phones = []
            for row in cursor.fetchall():
                if row['number']:
                    label = row['label'] or 'other'
                    # Clean up label (e.g., "_$!<Mobile>!$_" -> "mobile")
                    label = label.replace('_$!<', '').replace('>!$_', '').lower()
                    phones.append({
                        'type': label,
                        'value': row['number'],
                    })
            return phones
        except Exception as e:
            logger.debug(f"Error getting phones: {e}")
            return []
    
    def _get_emails(self, conn: sqlite3.Connection, person_rowid: int) -> List[Dict[str, str]]:
        """Get email addresses for a contact."""
        try:
            query = """
                SELECT ZADDRESS as email, ZLABEL as label
                FROM ZABCDEMAILADDRESS
                WHERE ZOWNER = ?
            """
            cursor = conn.execute(query, (person_rowid,))
            emails = []
            for row in cursor.fetchall():
                if row['email']:
                    label = row['label'] or 'other'
                    label = label.replace('_$!<', '').replace('>!$_', '').lower()
                    emails.append({
                        'type': label,
                        'value': row['email'],
                    })
            return emails
        except Exception as e:
            logger.debug(f"Error getting emails: {e}")
            return []
    
    def _get_addresses(self, conn: sqlite3.Connection, person_rowid: int) -> List[Dict[str, str]]:
        """Get addresses for a contact."""
        try:
            query = """
                SELECT 
                    ZSTREET as street,
                    ZCITY as city,
                    ZSTATE as state,
                    ZZIPCODE as zip,
                    ZCOUNTRYNAME as country,
                    ZLABEL as label
                FROM ZABCDPOSTALADDRESS
                WHERE ZOWNER = ?
            """
            cursor = conn.execute(query, (person_rowid,))
            addresses = []
            for row in cursor.fetchall():
                addr = {}
                if row['street']:
                    addr['street'] = row['street']
                if row['city']:
                    addr['city'] = row['city']
                if row['state']:
                    addr['state'] = row['state']
                if row['zip']:
                    addr['zip'] = row['zip']
                if row['country']:
                    addr['country'] = row['country']
                if row['label']:
                    label = row['label'].replace('_$!<', '').replace('>!$_', '').lower()
                    addr['type'] = label
                if addr:
                    addresses.append(addr)
            return addresses
        except Exception as e:
            logger.debug(f"Error getting addresses: {e}")
            return []
    
    def get_contact(self, contact_id: str) -> Optional[ContactInfo]:
        """Get a single contact by ID (searches all source databases).

        Supports both full IDs and short IDs (first 8 characters).
        Full: "E2ACAD1A-2F75-468D-9360-17476CFFE155:ABPerson"
        Short: "E2ACAD1A"
        """
        for db_path in self._source_dbs:
            conn = self._get_db_connection(db_path)
            if not conn:
                continue

            try:
                # Try exact match first
                query = """
                    SELECT
                        p.ROWID as row_id,
                        p.ZUNIQUEID as unique_id,
                        p.ZFIRSTNAME as first_name,
                        p.ZLASTNAME as last_name,
                        p.ZNICKNAME as nickname,
                        p.ZORGANIZATION as company,
                        p.ZJOBTITLE as job_title,
                        p.ZDEPARTMENT as department,
                        p.ZBIRTHDAY as birthday,
                        p.ZNOTE as notes,
                        p.ZCREATIONDATE as created,
                        p.ZMODIFICATIONDATE as modified
                    FROM ZABCDRECORD p
                    WHERE p.ZUNIQUEID = ? OR p.ZUNIQUEID LIKE ?
                    LIMIT 1
                """

                cursor = conn.execute(query, (contact_id, f"{contact_id}%"))
                row = cursor.fetchone()

                if row:
                    return self._build_contact_from_row(conn, row)

            except Exception as e:
                logger.error(f"Error getting contact from {db_path}: {e}")
            finally:
                conn.close()

        return None
    
    def search_contacts(
        self,
        query: str,
        limit: int = 20,
    ) -> List[ContactInfo]:
        """Search contacts by name, phone, or email (across all sources)."""
        all_contacts = []
        search_term = f"%{query}%"

        for db_path in self._source_dbs:
            conn = self._get_db_connection(db_path)
            if not conn:
                continue

            try:
                # Search in person table and related tables
                sql = """
                    SELECT DISTINCT
                        p.ROWID as row_id,
                        p.ZUNIQUEID as unique_id,
                        p.ZFIRSTNAME as first_name,
                        p.ZLASTNAME as last_name,
                        p.ZNICKNAME as nickname,
                        p.ZORGANIZATION as company,
                        p.ZJOBTITLE as job_title,
                        p.ZDEPARTMENT as department,
                        p.ZBIRTHDAY as birthday,
                        p.ZNOTE as notes,
                        p.ZCREATIONDATE as created,
                        p.ZMODIFICATIONDATE as modified
                    FROM ZABCDRECORD p
                    LEFT JOIN ZABCDPHONENUMBER ph ON ph.ZOWNER = p.ROWID
                    LEFT JOIN ZABCDEMAILADDRESS em ON em.ZOWNER = p.ROWID
                    WHERE (p.ZFIRSTNAME IS NOT NULL OR p.ZLASTNAME IS NOT NULL
                           OR p.ZORGANIZATION IS NOT NULL)
                      AND (
                        p.ZFIRSTNAME LIKE ? OR
                        p.ZLASTNAME LIKE ? OR
                        p.ZNICKNAME LIKE ? OR
                        p.ZORGANIZATION LIKE ? OR
                        ph.ZFULLNUMBER LIKE ? OR
                        em.ZADDRESS LIKE ?
                      )
                    ORDER BY p.ZLASTNAME, p.ZFIRSTNAME
                """

                cursor = conn.execute(sql, (
                    search_term, search_term, search_term,
                    search_term, search_term, search_term
                ))

                for row in cursor.fetchall():
                    contact = self._build_contact_from_row(conn, row)
                    if contact:
                        all_contacts.append(contact)

            except Exception as e:
                logger.error(f"Search failed in {db_path}: {e}")
            finally:
                conn.close()

        # Sort and limit
        all_contacts.sort(key=lambda c: (c.last_name or '', c.first_name or ''))
        return all_contacts[:limit]
    
    def create_contact(self, contact: ContactCreate) -> Optional[ContactInfo]:
        """Create a new contact via AppleScript.
        
        Note: Direct database writes would break sync, so we use AppleScript.
        """
        try:
            import subprocess
            
            # Build AppleScript
            first = contact.first_name or contact.name.split()[0] if contact.name else ''
            last = contact.last_name or (' '.join(contact.name.split()[1:]) if contact.name else '')
            
            script = f'''
tell application "Contacts"
    set newPerson to make new person with properties {{first name:"{first}", last name:"{last}"}}
'''
            
            if contact.company:
                script += f'    set organization of newPerson to "{contact.company}"\n'
            
            if contact.job_title:
                script += f'    set job title of newPerson to "{contact.job_title}"\n'
            
            if contact.notes:
                notes_escaped = contact.notes.replace('"', '\\"')
                script += f'    set note of newPerson to "{notes_escaped}"\n'
            
            # Add phones
            for phone in contact.phones:
                phone_val = phone.get('value', '')
                phone_type = phone.get('type', 'other')
                script += f'    make new phone at end of phones of newPerson with properties {{label:"{phone_type}", value:"{phone_val}"}}\n'
            
            # Add emails
            for email in contact.emails:
                email_val = email.get('value', '')
                email_type = email.get('type', 'other')
                script += f'    make new email at end of emails of newPerson with properties {{label:"{email_type}", value:"{email_val}"}}\n'
            
            script += '''    save
    return id of newPerson
end tell'''
            
            result = subprocess.run(
                ['osascript', '-e', script],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                new_id = result.stdout.strip()
                logger.info(f"Created contact: {contact.name} -> {new_id}")
                # Return the created contact
                return self.get_contact(new_id)
            else:
                logger.error(f"AppleScript failed: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to create contact: {e}")
            return None
    
    def update_contact(
        self,
        contact_id: str,
        update: ContactUpdate,
    ) -> Optional[ContactInfo]:
        """Update a contact via AppleScript."""
        try:
            import subprocess
            
            script = f'''
tell application "Contacts"
    set thePerson to first person whose id is "{contact_id}"
'''
            
            if update.first_name is not None:
                script += f'    set first name of thePerson to "{update.first_name}"\n'
            
            if update.last_name is not None:
                script += f'    set last name of thePerson to "{update.last_name}"\n'
            
            if update.company is not None:
                script += f'    set organization of thePerson to "{update.company}"\n'
            
            if update.job_title is not None:
                script += f'    set job title of thePerson to "{update.job_title}"\n'
            
            if update.notes is not None:
                notes_escaped = update.notes.replace('"', '\\"')
                script += f'    set note of thePerson to "{notes_escaped}"\n'
            
            script += '''    save
end tell'''
            
            result = subprocess.run(
                ['osascript', '-e', script],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return self.get_contact(contact_id)
            else:
                logger.error(f"AppleScript failed: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to update contact: {e}")
            return None
    
    def delete_contact(self, contact_id: str) -> bool:
        """Delete a contact via AppleScript."""
        try:
            import subprocess
            
            script = f'''
tell application "Contacts"
    set thePerson to first person whose id is "{contact_id}"
    delete thePerson
    save
end tell'''
            
            result = subprocess.run(
                ['osascript', '-e', script],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            return result.returncode == 0
            
        except Exception as e:
            logger.error(f"Failed to delete contact: {e}")
            return False
    
    def get_groups(self) -> List[ContactGroup]:
        """Get contact groups from Apple Contacts (all sources)."""
        all_groups = []

        for db_path in self._source_dbs:
            conn = self._get_db_connection(db_path)
            if not conn:
                continue

            try:
                query = """
                    SELECT
                        ZUNIQUEID as id,
                        ZNAME as name
                    FROM ZABCDGROUP
                    WHERE ZNAME IS NOT NULL
                    ORDER BY ZNAME
                """

                cursor = conn.execute(query)

                for row in cursor.fetchall():
                    all_groups.append(ContactGroup(
                        id=row['id'],
                        name=row['name'],
                        provider=ProviderType.APPLE,
                    ))

            except Exception as e:
                logger.error(f"Error getting groups from {db_path}: {e}")
            finally:
                conn.close()

        return all_groups

    def test_connection(self) -> tuple[bool, str]:
        """Test connection to Apple Contacts."""
        if not self._source_dbs:
            return False, "No AddressBook source databases found. Is Contacts.app configured?"

        contacts = self.get_contacts(limit=1)
        if contacts:
            return True, f"Connected to Apple Contacts ({len(self._source_dbs)} sources)"

        return True, "Apple Contacts accessible but may be empty"

