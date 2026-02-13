"""Local contacts adapter - SQLite-backed storage.

This adapter stores contacts in Claude OS's local database.
It's always available and serves as:
1. Offline-first storage
2. Cache for external providers
3. Storage for Claude OS-specific metadata (relationship, context_notes, etc.)

The local adapter extends external contacts with Claude's context.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from core.storage import SystemStorage

from .base import (
    ContactsAdapter,
    ContactInfo,
    ContactCreate,
    ContactUpdate,
    ProviderType,
)

logger = logging.getLogger(__name__)


class LocalContactsAdapter(ContactsAdapter):
    """Adapter for local SQLite-backed contacts storage.
    
    This adapter is always available and provides:
    - Offline-first contact storage
    - Claude OS extensions (relationship, context_notes, tags, pinned)
    - Fast local search
    """
    
    def __init__(self, storage: SystemStorage):
        """Initialize local adapter with storage backend."""
        self.storage = storage
    
    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.LOCAL
    
    @property
    def display_name(self) -> str:
        return "Local Contacts"
    
    def is_available(self) -> bool:
        """Local storage is always available."""
        return True
    
    def get_contacts(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ContactInfo]:
        """Get all contacts from local storage."""
        query = """
            SELECT * FROM contacts
            ORDER BY pinned DESC, name ASC
            LIMIT ? OFFSET ?
        """
        
        rows = self.storage.fetchall(query, (limit, offset))
        contacts = []
        
        for row in rows:
            contact = self._row_to_contact(row)
            if contact:
                contacts.append(contact)
        
        return contacts
    
    def _row_to_contact(self, row: dict) -> Optional[ContactInfo]:
        """Convert database row to ContactInfo."""
        try:
            contact_id = row['id']
            
            # Get tags
            tags_query = "SELECT tag FROM contact_tags WHERE contact_id = ?"
            tag_rows = self.storage.fetchall(tags_query, (contact_id,))
            tags = [r['tag'] for r in tag_rows]
            
            # Parse phone/email from single fields (legacy format)
            phones = []
            if row.get('phone'):
                phones = [{'type': 'mobile', 'value': row['phone']}]
            
            emails = []
            if row.get('email'):
                emails = [{'type': 'work', 'value': row['email']}]
            
            return ContactInfo(
                id=contact_id,
                name=row['name'],
                provider=ProviderType.LOCAL,
                phones=phones,
                emails=emails,
                company=row.get('company'),
                job_title=row.get('role'),  # 'role' maps to job_title
                notes=row.get('notes'),
                relationship=row.get('relationship'),
                context_notes=row.get('context_notes'),
                tags=tags,
                pinned=bool(row.get('pinned', 0)),
                created_at=datetime.fromisoformat(row['created_at']) if row.get('created_at') else None,
                updated_at=datetime.fromisoformat(row['updated_at']) if row.get('updated_at') else None,
            )
        except Exception as e:
            logger.warning(f"Failed to parse contact row: {e}")
            return None
    
    def get_contact(self, contact_id: str) -> Optional[ContactInfo]:
        """Get a single contact by ID."""
        query = "SELECT * FROM contacts WHERE id = ?"
        row = self.storage.fetchone(query, (contact_id,))
        
        if row:
            return self._row_to_contact(row)
        return None
    
    def search_contacts(
        self,
        query: str,
        limit: int = 20,
    ) -> List[ContactInfo]:
        """Search contacts by name, phone, or email."""
        search_term = f"%{query}%"
        
        sql = """
            SELECT * FROM contacts
            WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?
            ORDER BY pinned DESC, name ASC
            LIMIT ?
        """
        
        rows = self.storage.fetchall(sql, (search_term, search_term, search_term, limit))
        contacts = []
        
        for row in rows:
            contact = self._row_to_contact(row)
            if contact:
                contacts.append(contact)
        
        return contacts
    
    def create_contact(self, contact: ContactCreate) -> Optional[ContactInfo]:
        """Create a new contact in local storage."""
        contact_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        
        # Get primary phone/email for single-field storage
        phone = contact.phones[0]['value'] if contact.phones else None
        email = contact.emails[0]['value'] if contact.emails else None
        
        with self.storage.transaction() as cursor:
            cursor.execute(
                """
                INSERT INTO contacts (
                    id, name, phone, email, company, role, notes,
                    relationship, context_notes, pinned, source, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
                """,
                (
                    contact_id,
                    contact.name,
                    phone,
                    email,
                    contact.company,
                    contact.job_title,  # stored as 'role'
                    contact.notes,
                    contact.relationship,
                    contact.context_notes,
                    1 if contact.pinned else 0,
                    now,
                    now,
                ),
            )
            
            # Insert tags
            for tag in contact.tags:
                cursor.execute(
                    "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                    (contact_id, tag),
                )
        
        logger.info(f"Created local contact: {contact.name} -> {contact_id}")
        return self.get_contact(contact_id)
    
    def update_contact(
        self,
        contact_id: str,
        update: ContactUpdate,
    ) -> Optional[ContactInfo]:
        """Update a contact in local storage."""
        # Build SET clause dynamically
        set_parts = []
        params = []
        
        if update.name is not None:
            set_parts.append("name = ?")
            params.append(update.name)
        
        if update.phones is not None:
            phone = update.phones[0]['value'] if update.phones else None
            set_parts.append("phone = ?")
            params.append(phone)
        
        if update.emails is not None:
            email = update.emails[0]['value'] if update.emails else None
            set_parts.append("email = ?")
            params.append(email)
        
        if update.company is not None:
            set_parts.append("company = ?")
            params.append(update.company)
        
        if update.job_title is not None:
            set_parts.append("role = ?")  # stored as 'role'
            params.append(update.job_title)
        
        if update.notes is not None:
            set_parts.append("notes = ?")
            params.append(update.notes)
        
        if update.relationship is not None:
            set_parts.append("relationship = ?")
            params.append(update.relationship)
        
        if update.context_notes is not None:
            set_parts.append("context_notes = ?")
            params.append(update.context_notes)
        
        if update.pinned is not None:
            set_parts.append("pinned = ?")
            params.append(1 if update.pinned else 0)
        
        if not set_parts:
            return self.get_contact(contact_id)
        
        now = datetime.now(timezone.utc).isoformat()
        set_parts.append("updated_at = ?")
        params.append(now)
        
        params.append(contact_id)
        
        query = f"UPDATE contacts SET {', '.join(set_parts)} WHERE id = ?"
        
        with self.storage.transaction() as cursor:
            cursor.execute(query, params)
            
            # Update tags if provided
            if update.tags is not None:
                cursor.execute("DELETE FROM contact_tags WHERE contact_id = ?", (contact_id,))
                for tag in update.tags:
                    cursor.execute(
                        "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                        (contact_id, tag),
                    )
        
        return self.get_contact(contact_id)
    
    def delete_contact(self, contact_id: str) -> bool:
        """Delete a contact from local storage."""
        with self.storage.transaction() as cursor:
            cursor.execute("DELETE FROM contact_tags WHERE contact_id = ?", (contact_id,))
            cursor.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        
        logger.info(f"Deleted local contact: {contact_id}")
        return True
    
    def get_contacts_by_tag(self, tag: str, limit: int = 100) -> List[ContactInfo]:
        """Get contacts with a specific tag."""
        query = """
            SELECT c.* FROM contacts c
            JOIN contact_tags t ON c.id = t.contact_id
            WHERE t.tag = ?
            ORDER BY c.pinned DESC, c.name ASC
            LIMIT ?
        """
        
        rows = self.storage.fetchall(query, (tag, limit))
        return [self._row_to_contact(row) for row in rows if self._row_to_contact(row)]
    
    def get_pinned_contacts(self, limit: int = 20) -> List[ContactInfo]:
        """Get pinned contacts."""
        query = """
            SELECT * FROM contacts
            WHERE pinned = 1
            ORDER BY name ASC
            LIMIT ?
        """
        
        rows = self.storage.fetchall(query, (limit,))
        return [self._row_to_contact(row) for row in rows if self._row_to_contact(row)]
    
    def get_all_tags(self) -> List[str]:
        """Get all unique tags."""
        query = "SELECT DISTINCT tag FROM contact_tags ORDER BY tag"
        rows = self.storage.fetchall(query)
        return [row['tag'] for row in rows]
    
    def merge_external_contact(
        self,
        external: ContactInfo,
        preserve_claude_extensions: bool = True,
    ) -> ContactInfo:
        """Merge an external contact into local storage.
        
        This is used when syncing from external providers.
        If the contact exists, update it while preserving Claude-specific fields.
        """
        # Check if contact exists by external_id
        existing = None
        if external.external_id:
            query = "SELECT * FROM contacts WHERE id = ?"
            row = self.storage.fetchone(query, (external.external_id,))
            if row:
                existing = self._row_to_contact(row)
        
        if existing and preserve_claude_extensions:
            # Preserve Claude extensions from existing
            update = ContactUpdate(
                name=external.name,
                first_name=external.first_name,
                last_name=external.last_name,
                phones=external.phones,
                emails=external.emails,
                company=external.company,
                job_title=external.job_title,
                notes=external.notes,
                # Keep existing Claude extensions
                relationship=existing.relationship,
                context_notes=existing.context_notes,
                tags=existing.tags,
                pinned=existing.pinned,
            )
            return self.update_contact(existing.id, update)
        else:
            # Create new
            create = ContactCreate(
                name=external.name,
                first_name=external.first_name,
                last_name=external.last_name,
                phones=external.phones,
                emails=external.emails,
                company=external.company,
                job_title=external.job_title,
                notes=external.notes,
            )
            # Use external_id as our id for consistency
            contact_id = external.external_id or str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            
            phone = create.phones[0]['value'] if create.phones else None
            email = create.emails[0]['value'] if create.emails else None
            
            with self.storage.transaction() as cursor:
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO contacts (
                        id, name, phone, email, company, role, notes,
                        source, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'sync', ?, ?)
                    """,
                    (
                        contact_id,
                        create.name,
                        phone,
                        email,
                        create.company,
                        create.job_title,
                        create.notes,
                        now,
                        now,
                    ),
                )
            
            return self.get_contact(contact_id)
    
    def test_connection(self) -> tuple[bool, str]:
        """Local storage is always available."""
        return True, "Local storage connected"

