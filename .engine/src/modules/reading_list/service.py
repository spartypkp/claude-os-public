# === CUSTOM APP PATTERN ===
# service.py contains the business logic for your app.
# It uses get_db() from core.database for all database access.
# Keep this layer focused on data operations — no MCP or HTTP concerns.

"""Reading List service - Business logic for reading list management."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.database import get_db


class ReadingListService:
    """Reading list management service.

    Provides CRUD operations for reading list items stored in SQLite.
    All methods use the shared database connection via get_db().
    """

    VALID_TYPES = ('book', 'article', 'paper', 'other')
    VALID_STATUSES = ('want-to-read', 'reading', 'finished', 'abandoned')

    def _now(self) -> str:
        """Get current UTC timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()

    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Convert a database row to a dictionary with parsed tags."""
        item = dict(row)
        # Parse tags from JSON string back to list
        if item.get("tags"):
            try:
                item["tags"] = json.loads(item["tags"])
            except (json.JSONDecodeError, TypeError):
                item["tags"] = []
        else:
            item["tags"] = []
        return item

    # === CRUD Operations ===

    def add(
        self,
        title: str,
        author: Optional[str] = None,
        type: str = "book",
        tags: Optional[List[str]] = None,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Add a new item to the reading list.

        Args:
            title: Item title (required)
            author: Author name
            type: Item type (book, article, paper, other)
            tags: List of tags for organization
            notes: Optional notes about the item

        Returns:
            Created item as dictionary
        """
        if type not in self.VALID_TYPES:
            raise ValueError(f"Invalid type '{type}'. Must be one of: {', '.join(self.VALID_TYPES)}")

        item_id = str(uuid.uuid4())[:8]
        now = self._now()
        tags_json = json.dumps(tags) if tags else None

        with get_db() as conn:
            conn.execute("""
                INSERT INTO reading_list_items
                    (id, title, author, type, status, notes, tags, added_date)
                VALUES (?, ?, ?, ?, 'want-to-read', ?, ?, ?)
            """, (item_id, title, author, type, notes, tags_json, now))
            conn.commit()

        return {
            "id": item_id,
            "title": title,
            "author": author,
            "type": type,
            "status": "want-to-read",
            "rating": None,
            "notes": notes,
            "tags": tags or [],
            "added_date": now,
            "started_date": None,
            "finished_date": None,
        }

    def update(
        self,
        item_id: str,
        title: Optional[str] = None,
        author: Optional[str] = None,
        status: Optional[str] = None,
        rating: Optional[int] = None,
        notes: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update a reading list item.

        Automatically sets started_date when status changes to 'reading'
        and finished_date when status changes to 'finished'.

        Args:
            item_id: Item ID to update
            title: New title
            author: New author
            status: New status (want-to-read, reading, finished, abandoned)
            rating: Rating 1-5 (typically set when finished)
            notes: Updated notes
            tags: Updated tags list

        Returns:
            Updated item as dictionary, or None if not found
        """
        if status is not None and status not in self.VALID_STATUSES:
            raise ValueError(f"Invalid status '{status}'. Must be one of: {', '.join(self.VALID_STATUSES)}")

        if rating is not None and not (1 <= rating <= 5):
            raise ValueError("Rating must be between 1 and 5")

        with get_db() as conn:
            # Check item exists
            cursor = conn.execute(
                "SELECT * FROM reading_list_items WHERE id = ?", (item_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None

            # Build dynamic UPDATE
            updates = []
            values = []

            if title is not None:
                updates.append("title = ?")
                values.append(title)

            if author is not None:
                updates.append("author = ?")
                values.append(author)

            if status is not None:
                updates.append("status = ?")
                values.append(status)

                # Auto-set date fields based on status transitions
                now = self._now()
                if status == "reading" and not row["started_date"]:
                    updates.append("started_date = ?")
                    values.append(now)
                elif status == "finished":
                    updates.append("finished_date = ?")
                    values.append(now)
                    if not row["started_date"]:
                        updates.append("started_date = ?")
                        values.append(now)

            if rating is not None:
                updates.append("rating = ?")
                values.append(rating)

            if notes is not None:
                updates.append("notes = ?")
                values.append(notes)

            if tags is not None:
                updates.append("tags = ?")
                values.append(json.dumps(tags))

            if not updates:
                return self._row_to_dict(row)

            values.append(item_id)
            sql = f"UPDATE reading_list_items SET {', '.join(updates)} WHERE id = ?"
            conn.execute(sql, tuple(values))
            conn.commit()

            # Fetch updated row
            cursor = conn.execute(
                "SELECT * FROM reading_list_items WHERE id = ?", (item_id,)
            )
            return self._row_to_dict(cursor.fetchone())

    def remove(self, item_id: str) -> bool:
        """Remove an item from the reading list.

        Args:
            item_id: Item ID to remove

        Returns:
            True if deleted, False if not found
        """
        with get_db() as conn:
            cursor = conn.execute(
                "DELETE FROM reading_list_items WHERE id = ?", (item_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

    def get(self, item_id: str) -> Optional[Dict[str, Any]]:
        """Get a single item by ID.

        Args:
            item_id: Item ID

        Returns:
            Item as dictionary, or None if not found
        """
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT * FROM reading_list_items WHERE id = ?", (item_id,)
            )
            row = cursor.fetchone()
            return self._row_to_dict(row) if row else None

    # === Query Operations ===

    def list(
        self,
        status: Optional[str] = None,
        type: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List reading list items with optional filters.

        Args:
            status: Filter by status
            type: Filter by type
            tag: Filter by tag (searches JSON tags array)

        Returns:
            List of items as dictionaries
        """
        sql = "SELECT * FROM reading_list_items WHERE 1=1"
        params: list = []

        if status is not None:
            sql += " AND status = ?"
            params.append(status)

        if type is not None:
            sql += " AND type = ?"
            params.append(type)

        if tag is not None:
            # Search within JSON tags array
            sql += " AND tags LIKE ?"
            params.append(f'%"{tag}"%')

        sql += " ORDER BY added_date DESC"

        with get_db() as conn:
            cursor = conn.execute(sql, params)
            return [self._row_to_dict(row) for row in cursor.fetchall()]

    def stats(self) -> Dict[str, Any]:
        """Get reading statistics.

        Returns:
            Dictionary with counts by status, average rating, and totals
        """
        with get_db() as conn:
            # Count by status
            cursor = conn.execute("""
                SELECT status, COUNT(*) as count
                FROM reading_list_items
                GROUP BY status
            """)
            status_counts = {row["status"]: row["count"] for row in cursor.fetchall()}

            # Average rating (only rated items)
            cursor = conn.execute("""
                SELECT AVG(rating) as avg_rating, COUNT(rating) as rated_count
                FROM reading_list_items
                WHERE rating IS NOT NULL
            """)
            rating_row = cursor.fetchone()

            # Total items
            cursor = conn.execute("SELECT COUNT(*) as total FROM reading_list_items")
            total = cursor.fetchone()["total"]

            return {
                "total": total,
                "by_status": {
                    "want_to_read": status_counts.get("want-to-read", 0),
                    "reading": status_counts.get("reading", 0),
                    "finished": status_counts.get("finished", 0),
                    "abandoned": status_counts.get("abandoned", 0),
                },
                "average_rating": round(rating_row["avg_rating"], 1) if rating_row["avg_rating"] else None,
                "rated_count": rating_row["rated_count"],
            }
