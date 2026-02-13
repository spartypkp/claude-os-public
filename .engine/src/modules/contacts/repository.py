"""Contacts repository - Database access for contact extensions.

Handles SQL queries for the contacts_extensions table.
Apple Contacts data comes from providers; this manages Claude-specific overlays.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


class ContactsRepository:
    """Repository for contact extension data access.

    Handles all SQL queries for contacts_extensions and contacts_tags tables.
    """

    def __init__(self, storage):
        """Initialize with storage backend.

        Args:
            storage: SystemStorage instance for database access
        """
        self.storage = storage

    # === Extension CRUD ===

    def get_extension(self, apple_contact_id: str) -> Optional[dict]:
        """Fetch extension data for a contact.

        Args:
            apple_contact_id: Apple Contacts UUID

        Returns:
            Extension row as dict or None
        """
        return self.storage.fetchone(
            "SELECT * FROM contacts_extensions WHERE apple_contact_id = ?",
            (apple_contact_id,)
        )

    def create_extension(
        self,
        apple_contact_id: str,
        description: Optional[str],
        relationship: Optional[str],
        context_notes: Optional[str],
        value_exchange: Optional[str],
        notes: Optional[str],
        pinned: bool,
        last_contact_date: Optional[str],
        created_at: str,
        updated_at: str,
    ) -> None:
        """Create extension data for a contact.

        Args:
            apple_contact_id: Apple Contacts UUID
            description: One-liner description
            relationship: Relationship type
            context_notes: Context notes
            value_exchange: Value exchange notes
            notes: General notes
            pinned: Pin status
            last_contact_date: Last contact date
            created_at: Creation timestamp
            updated_at: Update timestamp
        """
        self.storage.execute("""
            INSERT INTO contacts_extensions (
                apple_contact_id, description, relationship, context_notes,
                value_exchange, notes, pinned, last_contact_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            apple_contact_id, description, relationship, context_notes,
            value_exchange, notes, 1 if pinned else 0, last_contact_date,
            created_at, updated_at
        ))

    def update_extension(
        self,
        apple_contact_id: str,
        updates: List[str],
        values: List[Any],
    ) -> None:
        """Update extension data for a contact.

        Args:
            apple_contact_id: Apple Contacts UUID
            updates: List of SET clauses
            values: List of values (should end with apple_contact_id)
        """
        sql = f"UPDATE contacts_extensions SET {', '.join(updates)} WHERE apple_contact_id = ?"
        self.storage.execute(sql, values)

    def delete_extension(self, apple_contact_id: str) -> None:
        """Delete extension data for a contact.

        Args:
            apple_contact_id: Apple Contacts UUID
        """
        self.storage.execute(
            "DELETE FROM contacts_extensions WHERE apple_contact_id = ?",
            (apple_contact_id,)
        )

    # === Tag Management ===

    def get_tags(self, apple_contact_id: str) -> List[str]:
        """Get all tags for a contact.

        Args:
            apple_contact_id: Apple Contacts UUID

        Returns:
            List of tag names
        """
        rows = self.storage.fetchall(
            "SELECT tag FROM contacts_tags WHERE apple_contact_id = ? ORDER BY tag",
            (apple_contact_id,)
        )
        return [row['tag'] for row in rows]

    def add_tag(self, apple_contact_id: str, tag: str) -> None:
        """Add a tag to a contact.

        Args:
            apple_contact_id: Apple Contacts UUID
            tag: Tag name
        """
        self.storage.execute(
            "INSERT OR IGNORE INTO contacts_tags (apple_contact_id, tag) VALUES (?, ?)",
            (apple_contact_id, tag)
        )

    def remove_tag(self, apple_contact_id: str, tag: str) -> None:
        """Remove a tag from a contact.

        Args:
            apple_contact_id: Apple Contacts UUID
            tag: Tag name
        """
        self.storage.execute(
            "DELETE FROM contacts_tags WHERE apple_contact_id = ? AND tag = ?",
            (apple_contact_id, tag)
        )

    def clear_tags(self, apple_contact_id: str) -> None:
        """Remove all tags from a contact.

        Args:
            apple_contact_id: Apple Contacts UUID
        """
        self.storage.execute(
            "DELETE FROM contacts_tags WHERE apple_contact_id = ?",
            (apple_contact_id,)
        )

    def replace_tags(self, apple_contact_id: str, tags: List[str]) -> None:
        """Replace all tags for a contact.

        Args:
            apple_contact_id: Apple Contacts UUID
            tags: New list of tags
        """
        self.clear_tags(apple_contact_id)
        for tag in tags:
            self.add_tag(apple_contact_id, tag)

    # === Query Operations ===

    def fetch_pinned(self, limit: int) -> List[dict]:
        """Fetch pinned contacts.

        Args:
            limit: Maximum number of contacts

        Returns:
            List of extension rows
        """
        return self.storage.fetchall("""
            SELECT apple_contact_id FROM contacts_extensions
            WHERE pinned = 1
            ORDER BY updated_at DESC
            LIMIT ?
        """, (limit,))

    def fetch_by_relationship(self, relationship: str, limit: int) -> List[dict]:
        """Fetch contacts by relationship type.

        Args:
            relationship: Relationship type
            limit: Maximum number of contacts

        Returns:
            List of extension rows
        """
        return self.storage.fetchall("""
            SELECT apple_contact_id FROM contacts_extensions
            WHERE relationship = ?
            ORDER BY updated_at DESC
            LIMIT ?
        """, (relationship, limit))

    def fetch_recent(self, threshold: str, limit: int) -> List[dict]:
        """Fetch recently contacted people.

        Args:
            threshold: ISO timestamp threshold
            limit: Maximum number of contacts

        Returns:
            List of extension rows
        """
        return self.storage.fetchall("""
            SELECT apple_contact_id FROM contacts_extensions
            WHERE last_contact_date >= ?
            ORDER BY last_contact_date DESC
            LIMIT ?
        """, (threshold, limit))

    def fetch_all_with_extensions(self) -> List[dict]:
        """Fetch all contacts that have extension data.

        Returns:
            List of extension rows
        """
        return self.storage.fetchall(
            "SELECT * FROM contacts_extensions ORDER BY updated_at DESC",
            ()
        )
