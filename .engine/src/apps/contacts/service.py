"""Contacts service - Business logic for contact management.

Direct-read pattern (matching calendar/email):
- Reads directly from Apple Contacts database
- Claude-specific extensions stored in local overlay table
- Merges Apple data with extensions on read
- AppleScript for write operations to Apple Contacts
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Contact:
    """Contact data for rendering.

    Combines Apple Contacts data with Claude-specific extensions.
    """
    id: str  # Apple ZUNIQUEID (e.g., "UUID:ABPerson")
    name: str
    phone: Optional[str]
    email: Optional[str]
    company: Optional[str]
    role: Optional[str]  # job_title from Apple
    location: Optional[str]
    # Claude-specific extensions (from local DB)
    description: Optional[str]
    relationship: Optional[str]
    context_notes: Optional[str]
    value_exchange: Optional[str]
    notes: Optional[str]
    pinned: bool
    tags: Tuple[str, ...]
    last_contact_date: Optional[str]
    created_at: str
    updated_at: str
    # Provider metadata
    provider: str = "apple"


def normalize_phone(phone: str) -> Optional[str]:
    """Normalize phone number to E.164 format."""
    if not phone:
        return None

    digits = re.sub(r'\D', '', phone)

    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    elif len(digits) > 10:
        return f"+{digits}"

    return phone  # Return as-is if can't normalize


class ContactsService:
    """Contact management service with direct Apple Contacts access.

    Architecture:
    - Direct reads from Apple Contacts database (via adapter)
    - Claude-specific extensions stored in local SQLite
    - Merges data on read
    - AppleScript for writes to Apple Contacts
    """

    def __init__(self, storage):
        """Initialize with storage backend."""
        self.storage = storage
        self._adapter = None
        self._init_adapter()

    def _init_adapter(self):
        """Initialize Apple Contacts adapter."""
        try:
            from .adapters import AppleContactsAdapter
            self._adapter = AppleContactsAdapter()
            if self._adapter.is_available():
                logger.info("Apple Contacts adapter available")
            else:
                logger.warning("Apple Contacts not available")
        except Exception as e:
            logger.error(f"Failed to init Apple Contacts adapter: {e}")

    def _now(self) -> str:
        """Get current UTC timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()

    # === Read Operations (from Apple + Extensions) ===

    def search(self, query: str, limit: int = 20) -> List[Contact]:
        """Search contacts in Apple Contacts."""
        if not self._adapter:
            return []

        # Search Apple Contacts
        apple_contacts = self._adapter.search_contacts(query, limit=limit)

        # Merge with extensions
        return [self._merge_with_extensions(c) for c in apple_contacts]

    def get(self, contact_id: str) -> Optional[Contact]:
        """Get a contact by Apple ID."""
        if not self._adapter:
            return None

        apple_contact = self._adapter.get_contact(contact_id)
        if not apple_contact:
            return None

        return self._merge_with_extensions(apple_contact)

    def find(self, identifier: str) -> Optional[Contact]:
        """Find a contact by name, phone, or short ID."""
        if not self._adapter:
            return None

        # Try search by name/phone/email
        results = self._adapter.search_contacts(identifier, limit=5)

        for contact in results:
            # Exact name match
            if contact.name.lower() == identifier.lower():
                return self._merge_with_extensions(contact)
            # Phone match
            if contact.phones:
                for phone in contact.phones:
                    if identifier in phone.get('value', ''):
                        return self._merge_with_extensions(contact)
            # Email match
            if contact.emails:
                for email in contact.emails:
                    if identifier.lower() in email.get('value', '').lower():
                        return self._merge_with_extensions(contact)

        # If no exact match, return first result
        if results:
            return self._merge_with_extensions(results[0])

        return None

    def list(self, limit: int = 100) -> List[Contact]:
        """List all contacts from Apple Contacts."""
        if not self._adapter:
            return []

        # Get all contacts from Apple
        apple_contacts = self._adapter.get_contacts(limit=limit)

        # Merge with extensions
        return [self._merge_with_extensions(c) for c in apple_contacts]

    def list_pinned(self, limit: int = 20) -> List[Contact]:
        """List pinned contacts."""
        # Query extensions for pinned contacts
        rows = self.storage.fetchall("""
            SELECT apple_contact_id FROM contacts_extensions
            WHERE pinned = 1
            ORDER BY updated_at DESC
            LIMIT ?
        """, (limit,))

        contacts = []
        for row in rows:
            apple_id = row['apple_contact_id']
            apple_contact = self._adapter.get_contact(apple_id) if self._adapter else None
            if apple_contact:
                contacts.append(self._merge_with_extensions(apple_contact))

        return contacts

    def list_by_relationship(self, relationship: str, limit: int = 20) -> List[Contact]:
        """List contacts by relationship type."""
        # Query extensions for relationship
        rows = self.storage.fetchall("""
            SELECT apple_contact_id FROM contacts_extensions
            WHERE relationship = ?
            ORDER BY updated_at DESC
            LIMIT ?
        """, (relationship, limit))

        contacts = []
        for row in rows:
            apple_id = row['apple_contact_id']
            apple_contact = self._adapter.get_contact(apple_id) if self._adapter else None
            if apple_contact:
                contacts.append(self._merge_with_extensions(apple_contact))

        return contacts

    def list_recent(self, days: int = 30, limit: int = 20) -> List[Contact]:
        """List recently contacted people."""
        from datetime import timedelta
        threshold = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        rows = self.storage.fetchall("""
            SELECT apple_contact_id FROM contacts_extensions
            WHERE last_contact_date >= ?
            ORDER BY last_contact_date DESC
            LIMIT ?
        """, (threshold, limit))

        contacts = []
        for row in rows:
            apple_id = row['apple_contact_id']
            apple_contact = self._adapter.get_contact(apple_id) if self._adapter else None
            if apple_contact:
                contacts.append(self._merge_with_extensions(apple_contact))

        return contacts

    # === Write Operations ===

    def create(
        self,
        name: str,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        company: Optional[str] = None,
        role: Optional[str] = None,
        location: Optional[str] = None,
        description: Optional[str] = None,
        relationship: Optional[str] = None,
        context_notes: Optional[str] = None,
        value_exchange: Optional[str] = None,
        notes: Optional[str] = None,
        pinned: bool = False,
        tags: Optional[List[str]] = None,
    ) -> Contact:
        """Create a new contact in Apple Contacts with extensions."""
        if not self._adapter:
            raise RuntimeError("Apple Contacts not available")

        # Create in Apple Contacts via AppleScript
        from .adapters.base import ContactCreate

        phones = []
        if phone:
            phones.append({'type': 'mobile', 'value': normalize_phone(phone) or phone})

        emails = []
        if email:
            emails.append({'type': 'work', 'value': email})

        apple_create = ContactCreate(
            name=name,
            phones=phones,
            emails=emails,
            company=company,
            job_title=role,
            notes=notes,
        )

        apple_contact = self._adapter.create_contact(apple_create)
        if not apple_contact:
            raise RuntimeError("Failed to create contact in Apple Contacts")

        # Store Claude-specific extensions
        now = self._now()
        self.storage.execute("""
            INSERT OR REPLACE INTO contacts_extensions (
                apple_contact_id, description, relationship, context_notes,
                value_exchange, notes, pinned, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            apple_contact.id,
            description,
            relationship,
            context_notes,
            value_exchange,
            notes,  # Duplicate notes in extensions for Claude-specific use
            1 if pinned else 0,
            now,
            now,
        ))

        # Store tags
        if tags:
            for tag in tags:
                self.storage.execute("""
                    INSERT OR IGNORE INTO contacts_extension_tags (apple_contact_id, tag)
                    VALUES (?, ?)
                """, (apple_contact.id, tag))

        return self._merge_with_extensions(apple_contact)

    def update(
        self,
        contact_id: str,
        name: Optional[str] = None,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        company: Optional[str] = None,
        role: Optional[str] = None,
        location: Optional[str] = None,
        description: Optional[str] = None,
        relationship: Optional[str] = None,
        context_notes: Optional[str] = None,
        value_exchange: Optional[str] = None,
        notes: Optional[str] = None,
        pinned: Optional[bool] = None,
        tags: Optional[List[str]] = None,
    ) -> Optional[Contact]:
        """Update a contact.

        Core fields (name, phone, email, company, role) update Apple Contacts.
        Extension fields (description, relationship, etc.) update local overlay.
        """
        if not self._adapter:
            return None

        # Update Apple Contacts if core fields changed
        core_fields_changed = any([name, phone, email, company, role])
        if core_fields_changed:
            from .adapters.base import ContactUpdate

            update = ContactUpdate(
                first_name=name.split()[0] if name else None,
                last_name=' '.join(name.split()[1:]) if name and len(name.split()) > 1 else None,
                company=company,
                job_title=role,
                notes=notes,
            )
            self._adapter.update_contact(contact_id, update)

        # Update extensions
        now = self._now()

        # Ensure extension record exists
        existing = self.storage.fetchone(
            "SELECT 1 FROM contacts_extensions WHERE apple_contact_id = ?",
            (contact_id,)
        )

        if not existing:
            self.storage.execute("""
                INSERT INTO contacts_extensions (apple_contact_id, created_at, updated_at)
                VALUES (?, ?, ?)
            """, (contact_id, now, now))

        # Build update query for extension fields
        updates = []
        values = []

        extension_fields = {
            'description': description,
            'relationship': relationship,
            'context_notes': context_notes,
            'value_exchange': value_exchange,
            'notes': notes,
        }

        for field, value in extension_fields.items():
            if value is not None:
                updates.append(f"{field} = ?")
                values.append(value)

        if pinned is not None:
            updates.append("pinned = ?")
            values.append(1 if pinned else 0)

        if updates:
            updates.append("updated_at = ?")
            values.append(now)
            values.append(contact_id)

            sql = f"UPDATE contacts_extensions SET {', '.join(updates)} WHERE apple_contact_id = ?"
            self.storage.execute(sql, values)

        # Update tags
        if tags is not None:
            self.storage.execute(
                "DELETE FROM contacts_extension_tags WHERE apple_contact_id = ?",
                (contact_id,)
            )
            for tag in tags:
                self.storage.execute("""
                    INSERT OR IGNORE INTO contacts_extension_tags (apple_contact_id, tag)
                    VALUES (?, ?)
                """, (contact_id, tag))

        return self.get(contact_id)

    def delete(self, contact_id: str) -> bool:
        """Delete a contact from Apple Contacts and extensions."""
        if not self._adapter:
            return False

        # Delete from Apple Contacts
        success = self._adapter.delete_contact(contact_id)

        # Delete extensions
        self.storage.execute(
            "DELETE FROM contacts_extensions WHERE apple_contact_id = ?",
            (contact_id,)
        )
        self.storage.execute(
            "DELETE FROM contacts_extension_tags WHERE apple_contact_id = ?",
            (contact_id,)
        )

        return success

    # === Tag Operations ===

    def get_all_tags(self) -> List[str]:
        """Get all unique tags."""
        rows = self.storage.fetchall(
            "SELECT DISTINCT tag FROM contacts_extension_tags ORDER BY tag"
        )
        return [r['tag'] for r in rows]

    # === Provider Operations (simplified) ===

    def get_providers(self) -> List[Dict[str, Any]]:
        """Get status of available providers."""
        providers = []

        # Apple Contacts
        if self._adapter and self._adapter.is_available():
            success, msg = self._adapter.test_connection()
            providers.append({
                'type': 'apple',
                'name': 'Apple Contacts',
                'enabled': True,
                'available': success,
                'error': None if success else msg,
            })
        else:
            providers.append({
                'type': 'apple',
                'name': 'Apple Contacts',
                'enabled': False,
                'available': False,
                'error': 'Not available',
            })

        return providers

    # === Internal Helpers ===

    def _merge_with_extensions(self, apple_contact) -> Contact:
        """Merge Apple Contact with Claude extensions."""
        apple_id = apple_contact.id

        # Get extension data
        ext = self.storage.fetchone(
            "SELECT * FROM contacts_extensions WHERE apple_contact_id = ?",
            (apple_id,)
        )

        # Get tags
        tag_rows = self.storage.fetchall(
            "SELECT tag FROM contacts_extension_tags WHERE apple_contact_id = ? ORDER BY tag",
            (apple_id,)
        )
        tags = tuple(r['tag'] for r in tag_rows)

        # Extract primary phone and email
        phone = None
        if apple_contact.phones:
            phone = apple_contact.phones[0].get('value')

        email = None
        if apple_contact.emails:
            email = apple_contact.emails[0].get('value')

        # Merge data
        now = self._now()
        return Contact(
            id=apple_id,
            name=apple_contact.name,
            phone=phone,
            email=email,
            company=apple_contact.company,
            role=apple_contact.job_title,
            location=None,  # Not in Apple Contacts
            # Extension fields
            description=ext['description'] if ext else None,
            relationship=ext['relationship'] if ext else None,
            context_notes=ext['context_notes'] if ext else None,
            value_exchange=ext['value_exchange'] if ext else None,
            notes=ext['notes'] if ext else apple_contact.notes,
            pinned=bool(ext['pinned']) if ext else False,
            tags=tags,
            last_contact_date=ext['last_contact_date'] if ext else None,
            created_at=ext['created_at'] if ext else now,
            updated_at=ext['updated_at'] if ext else now,
            provider='apple',
        )
