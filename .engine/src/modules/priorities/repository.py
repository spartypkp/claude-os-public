"""Priorities repository - Database access layer."""

from __future__ import annotations

from typing import Dict, List, Optional

from .models import Priority


class PrioritiesRepository:
    """Repository for priority data access.

    Handles all SQL queries for the priorities domain.
    """

    def __init__(self, storage):
        """Initialize with storage backend.

        Args:
            storage: SystemStorage instance for database access
        """
        self.storage = storage

    def create(
        self,
        priority_id: str,
        date: str,
        content: str,
        level: str,
        position: int,
        created_at: str,
        updated_at: str,
    ) -> None:
        """Insert a new priority into the database.

        Args:
            priority_id: Unique priority ID
            date: Target date (YYYY-MM-DD)
            content: Priority text
            level: Priority level (critical, medium, low)
            position: Position within level
            created_at: Creation timestamp
            updated_at: Update timestamp
        """
        self.storage.execute("""
            INSERT INTO priorities (id, date, content, level, completed, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        """, (priority_id, date, content, level, position, created_at, updated_at))

    def get_by_id(self, priority_id: str) -> Optional[dict]:
        """Fetch a priority by ID.

        Args:
            priority_id: Priority ID

        Returns:
            Database row as dict or None if not found
        """
        return self.storage.fetchone(
            "SELECT * FROM priorities WHERE id = ?",
            (priority_id,)
        )

    def get_next_position(self, date: str, level: str) -> int:
        """Get the next position number for a date+level combination.

        Args:
            date: Target date
            level: Priority level

        Returns:
            Next available position number
        """
        cursor = self.storage.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM priorities WHERE date = ? AND level = ?",
            (date, level)
        )
        return cursor.fetchone()[0]

    def update(
        self,
        priority_id: str,
        updates: List[str],
        values: List,
    ) -> None:
        """Update a priority with arbitrary fields.

        Args:
            priority_id: Priority ID
            updates: List of SET clauses (e.g., ["content = ?", "level = ?"])
            values: List of values (should end with priority_id)
        """
        sql = f"UPDATE priorities SET {', '.join(updates)} WHERE id = ?"
        self.storage.execute(sql, values)

    def delete(self, priority_id: str) -> int:
        """Delete a priority.

        Args:
            priority_id: Priority ID

        Returns:
            Number of rows deleted
        """
        cursor = self.storage.execute(
            "DELETE FROM priorities WHERE id = ?",
            (priority_id,)
        )
        return cursor.rowcount

    def fetch_by_date(
        self,
        date: str,
        include_completed: bool = False,
    ) -> List[dict]:
        """Fetch all priorities for a date.

        Args:
            date: Target date (YYYY-MM-DD)
            include_completed: Include completed priorities

        Returns:
            List of database rows as dicts
        """
        sql = """
            SELECT * FROM priorities
            WHERE date = ?
        """
        params = [date]

        if not include_completed:
            sql += " AND completed = 0"

        sql += " ORDER BY level, position"

        return self.storage.fetchall(sql, params)
