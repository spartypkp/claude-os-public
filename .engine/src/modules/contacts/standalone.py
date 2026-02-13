"""Standalone contacts repository - For systems without Apple Contacts.

This repository manages contacts entirely in SQLite, independent of
Apple Contacts integration. Used by MCP tools for portable contact management.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .models import normalize_phone


class StandaloneContactsRepository:
    """Repository for standalone contact management.

    All contact data stored in SQLite 'contacts' table.
    No Apple Contacts dependency.
    """

    def __init__(self, storage):
        """Initialize with storage backend.

        Args:
            storage: SystemStorage instance for database access
        """
        self.storage = storage

    def _now(self) -> str:
        """Get current UTC timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()

    # === Search Operations ===

    def search(self, query: str, limit: int = 20) -> List[dict]:
        """Search contacts by name, phone, email, company, description, or notes.

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of contact dicts
        """
        search_term = f"%{query}%"
        rows = self.storage.fetchall("""
            SELECT DISTINCT id, name, phone, description, pinned
            FROM contacts
            WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?
               OR company LIKE ? OR description LIKE ? OR notes LIKE ?
            ORDER BY pinned DESC, name
            LIMIT ?
        """, (search_term, search_term, search_term, search_term, search_term, search_term, limit))
        return [dict(row) for row in rows]

    def find(self, identifier: str) -> Optional[dict]:
        """Find a contact by ID prefix, name, or phone.

        Args:
            identifier: ID prefix, name, or phone number

        Returns:
            Contact dict or None
        """
        # Try by ID prefix
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE id LIKE ?",
            (f"{identifier}%",)
        )
        if row:
            return dict(row)

        # Try by exact name
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)",
            (identifier,)
        )
        if row:
            return dict(row)

        # Try by phone
        normalized = normalize_phone(identifier)
        if normalized:
            row = self.storage.fetchone(
                "SELECT * FROM contacts WHERE phone = ?",
                (normalized,)
            )
            if row:
                return dict(row)

        # Fuzzy name match
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE LOWER(name) LIKE LOWER(?) ORDER BY pinned DESC, name LIMIT 1",
            (f"%{identifier}%",)
        )
        if row:
            return dict(row)

        return None

    def get(self, contact_id: str) -> Optional[dict]:
        """Get a contact by full ID.

        Args:
            contact_id: Full contact UUID

        Returns:
            Contact dict or None
        """
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE id = ?",
            (contact_id,)
        )
        return dict(row) if row else None

    # === CRUD Operations ===

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
    ) -> dict:
        """Create a new contact.

        Args:
            name: Display name (required)
            phone: Phone number (auto-normalized)
            email: Email address
            company: Company/organization
            role: Job title/role
            location: Location
            description: One-liner description
            relationship: Relationship type
            context_notes: Context notes
            value_exchange: Value exchange notes
            notes: General notes
            pinned: Pin status

        Returns:
            Created contact dict with id
        """
        contact_id = str(uuid.uuid4())
        now = self._now()
        normalized_phone = normalize_phone(phone) if phone else None

        self.storage.execute("""
            INSERT INTO contacts (
                id, name, phone, email, company, role, location,
                description, relationship, context_notes, value_exchange, notes,
                pinned, source, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
        """, (
            contact_id, name, normalized_phone, email, company, role, location,
            description, relationship, context_notes, value_exchange, notes,
            1 if pinned else 0, now, now
        ))

        return {
            "id": contact_id,
            "name": name,
            "phone": normalized_phone,
            "email": email,
            "company": company,
            "role": role,
            "location": location,
            "description": description,
            "relationship": relationship,
            "context_notes": context_notes,
            "value_exchange": value_exchange,
            "notes": notes,
            "pinned": pinned,
            "created_at": now,
            "updated_at": now,
        }

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
    ) -> bool:
        """Update a contact (replace semantics).

        Args:
            contact_id: Contact UUID
            All other args: Fields to update (None = no change)

        Returns:
            True if updated, False if not found
        """
        updates = []
        values = []

        field_mapping = {
            "name": name,
            "phone": normalize_phone(phone) if phone else None,
            "email": email,
            "company": company,
            "role": role,
            "location": location,
            "description": description,
            "relationship": relationship,
            "context_notes": context_notes,
            "value_exchange": value_exchange,
            "notes": notes,
        }

        for field, value in field_mapping.items():
            if value is not None:
                updates.append(f"{field} = ?")
                values.append(value)

        if pinned is not None:
            updates.append("pinned = ?")
            values.append(1 if pinned else 0)

        if not updates:
            return True  # Nothing to update

        updates.append("updated_at = ?")
        values.append(self._now())
        values.append(contact_id)

        sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
        self.storage.execute(sql, values)
        return True

    def enrich(
        self,
        contact_id: str,
        current: dict,
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
    ) -> int:
        """Enrich a contact (additive semantics).

        Fill empty fields, append to text fields.

        Args:
            contact_id: Contact UUID
            current: Current contact data
            All other args: Fields to enrich

        Returns:
            Number of fields updated
        """
        updates = []
        values = []

        # Fill empty fields only
        fill_fields = {
            "name": name,
            "phone": normalize_phone(phone) if phone else None,
            "email": email,
            "company": company,
            "role": role,
            "location": location,
            "description": description,
            "relationship": relationship,
        }
        for field, value in fill_fields.items():
            if value is not None and not current.get(field):
                updates.append(f"{field} = ?")
                values.append(value)

        # Append to text fields
        append_fields = {
            "context_notes": context_notes,
            "value_exchange": value_exchange,
            "notes": notes,
        }
        for field, value in append_fields.items():
            if value is not None:
                existing = current.get(field) or ""
                combined = f"{existing}\n\n{value}" if existing else value
                updates.append(f"{field} = ?")
                values.append(combined)

        if pinned is not None:
            updates.append("pinned = ?")
            values.append(1 if pinned else 0)

        fields_count = len(updates)

        if updates:
            updates.append("updated_at = ?")
            values.append(self._now())
            values.append(contact_id)
            sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
            self.storage.execute(sql, values)

        return fields_count

    def delete(self, contact_id: str) -> bool:
        """Delete a contact.

        Args:
            contact_id: Contact UUID

        Returns:
            True if deleted
        """
        self.storage.execute("DELETE FROM contact_tags WHERE contact_id = ?", (contact_id,))
        self.storage.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        return True

    # === Tag Operations ===

    def get_tags(self, contact_id: str) -> List[str]:
        """Get all tags for a contact."""
        rows = self.storage.fetchall(
            "SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag",
            (contact_id,)
        )
        return [row["tag"] for row in rows]

    def replace_tags(self, contact_id: str, tags: List[str]) -> None:
        """Replace all tags for a contact."""
        self.storage.execute("DELETE FROM contact_tags WHERE contact_id = ?", (contact_id,))
        for tag in tags:
            self.storage.execute(
                "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                (contact_id, tag)
            )

    def merge_tags(self, contact_id: str, tags: List[str]) -> int:
        """Merge tags (add new ones, keep existing)."""
        existing = set(self.get_tags(contact_id))
        added = 0
        for tag in tags:
            if tag not in existing:
                self.storage.execute(
                    "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                    (contact_id, tag)
                )
                added += 1
        return added

    # === List Operations ===

    def list_pinned(self, limit: int = 20) -> List[dict]:
        """List pinned contacts."""
        rows = self.storage.fetchall("""
            SELECT id, name, phone, description, pinned, relationship, last_contact_date
            FROM contacts
            WHERE pinned = 1
            ORDER BY name
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in rows]

    def list_by_relationship(self, relationship: str, limit: int = 20) -> List[dict]:
        """List contacts by relationship type."""
        rows = self.storage.fetchall("""
            SELECT id, name, phone, description, pinned, relationship, last_contact_date
            FROM contacts
            WHERE relationship = ?
            ORDER BY pinned DESC, name
            LIMIT ?
        """, (relationship, limit))
        return [dict(row) for row in rows]

    def list_recent(self, threshold: str, limit: int = 20) -> List[dict]:
        """List recently contacted people."""
        rows = self.storage.fetchall("""
            SELECT id, name, phone, description, pinned, relationship, last_contact_date
            FROM contacts
            WHERE last_contact_date >= ?
            ORDER BY last_contact_date DESC
            LIMIT ?
        """, (threshold, limit))
        return [dict(row) for row in rows]

    # === Merge Operation ===

    def merge(self, source_id: str, target_id: str, source: dict, target: dict) -> dict:
        """Merge source contact into target, delete source.

        Args:
            source_id: Source contact UUID
            target_id: Target contact UUID
            source: Source contact data
            target: Target contact data

        Returns:
            Merge summary
        """
        updates = []
        values = []

        # Fill empty fields from source
        fill_fields = ["email", "company", "role", "location", "description", "relationship"]
        for field in fill_fields:
            if not target.get(field) and source.get(field):
                updates.append(f"{field} = ?")
                values.append(source[field])

        # Append text fields
        append_fields = ["context_notes", "value_exchange", "notes"]
        for field in append_fields:
            target_val = target.get(field) or ""
            source_val = source.get(field) or ""
            if source_val:
                combined = f"{target_val}\n\n{source_val}" if target_val else source_val
                updates.append(f"{field} = ?")
                values.append(combined)

        # Merge tags
        source_tags = set(self.get_tags(source_id))
        target_tags = set(self.get_tags(target_id))
        new_tags = source_tags - target_tags
        for tag in new_tags:
            self.storage.execute(
                "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                (target_id, tag)
            )

        # Update target
        if updates:
            updates.append("updated_at = ?")
            values.append(self._now())
            values.append(target_id)
            sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
            self.storage.execute(sql, values)

        # Delete source
        self.delete(source_id)

        return {
            "fields_merged": len(updates) - 1 if updates else 0,  # Exclude updated_at
            "tags_merged": len(new_tags),
        }
