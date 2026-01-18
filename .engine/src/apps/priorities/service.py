"""Priorities service - Business logic for priority management."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional


@dataclass(frozen=True)
class Priority:
    """Priority data."""
    id: str
    date: str
    content: str
    level: str  # critical, medium, low
    completed: bool
    completed_at: Optional[str]
    position: int
    created_at: str
    updated_at: str


class PrioritiesService:
    """Priority management service.
    
    Provides CRUD operations for priorities stored in SQLite.
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
    
    def _today(self) -> str:
        """Get today's date in YYYY-MM-DD format."""
        return datetime.now().strftime("%Y-%m-%d")
    
    # === CRUD Operations ===
    
    def create(
        self,
        content: str,
        level: str = "medium",
        date: Optional[str] = None,
    ) -> Priority:
        """Create a new priority.
        
        Args:
            content: Priority text
            level: Priority level (critical, medium, low)
            date: Target date (defaults to today)
            
        Returns:
            Created Priority instance
        """
        if level not in ('critical', 'medium', 'low'):
            raise ValueError(f"Invalid level '{level}'. Must be critical, medium, or low.")
        
        priority_id = str(uuid.uuid4())[:8]
        target_date = date or self._today()
        now = self._now()
        
        # Get next position for this date+level
        cursor = self.storage.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM priorities WHERE date = ? AND level = ?",
            (target_date, level)
        )
        position = cursor.fetchone()[0]
        
        self.storage.execute("""
            INSERT INTO priorities (id, date, content, level, completed, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        """, (priority_id, target_date, content, level, position, now, now))
        
        return Priority(
            id=priority_id,
            date=target_date,
            content=content,
            level=level,
            completed=False,
            completed_at=None,
            position=position,
            created_at=now,
            updated_at=now,
        )
    
    def get(self, priority_id: str) -> Optional[Priority]:
        """Get a priority by ID.
        
        Args:
            priority_id: Priority ID
            
        Returns:
            Priority instance or None if not found
        """
        row = self.storage.fetchone(
            "SELECT * FROM priorities WHERE id = ?",
            (priority_id,)
        )
        
        if not row:
            return None
        
        return self._row_to_priority(row)
    
    def update(
        self,
        priority_id: str,
        content: Optional[str] = None,
        level: Optional[str] = None,
        completed: Optional[bool] = None,
    ) -> Optional[Priority]:
        """Update a priority.
        
        Args:
            priority_id: Priority ID
            content: New content
            level: New level
            completed: Completion status
            
        Returns:
            Updated Priority or None if not found
        """
        existing = self.get(priority_id)
        if not existing:
            return None
        
        if level is not None and level not in ('critical', 'medium', 'low'):
            raise ValueError(f"Invalid level '{level}'. Must be critical, medium, or low.")
        
        updates = []
        values = []
        now = self._now()
        
        if content is not None:
            updates.append("content = ?")
            values.append(content)
        
        if level is not None:
            updates.append("level = ?")
            values.append(level)
            # Reset position when level changes
            cursor = self.storage.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM priorities WHERE date = ? AND level = ?",
                (existing.date, level)
            )
            new_position = cursor.fetchone()[0]
            updates.append("position = ?")
            values.append(new_position)
        
        if completed is not None:
            updates.append("completed = ?")
            values.append(1 if completed else 0)
            if completed:
                updates.append("completed_at = ?")
                values.append(now)
            else:
                updates.append("completed_at = NULL")
        
        if not updates:
            return existing
        
        updates.append("updated_at = ?")
        values.append(now)
        values.append(priority_id)
        
        sql = f"UPDATE priorities SET {', '.join(updates)} WHERE id = ?"
        self.storage.execute(sql, values)
        
        return self.get(priority_id)
    
    def delete(self, priority_id: str) -> bool:
        """Delete a priority.
        
        Args:
            priority_id: Priority ID
            
        Returns:
            True if deleted, False if not found
        """
        cursor = self.storage.execute(
            "DELETE FROM priorities WHERE id = ?",
            (priority_id,)
        )
        return cursor.rowcount > 0
    
    def complete(self, priority_id: str) -> Optional[Priority]:
        """Mark a priority as completed.
        
        Args:
            priority_id: Priority ID
            
        Returns:
            Updated Priority or None if not found
        """
        return self.update(priority_id, completed=True)
    
    # === Query Operations ===
    
    def list_by_date(
        self,
        date: Optional[str] = None,
        include_completed: bool = False,
    ) -> Dict[str, List[Priority]]:
        """List priorities for a date, grouped by level.
        
        Args:
            date: Target date (defaults to today)
            include_completed: Include completed priorities
            
        Returns:
            Dict with levels as keys, lists of priorities as values
        """
        target_date = date or self._today()
        
        sql = """
            SELECT * FROM priorities
            WHERE date = ?
        """
        params = [target_date]
        
        if not include_completed:
            sql += " AND completed = 0"
        
        sql += " ORDER BY level, position"
        
        rows = self.storage.fetchall(sql, params)
        
        # Group by level
        priorities = {"critical": [], "medium": [], "low": []}
        for row in rows:
            p = self._row_to_priority(row)
            priorities[p.level].append(p)
        
        return priorities
    
    def list_all(
        self,
        date: Optional[str] = None,
        include_completed: bool = False,
    ) -> List[Priority]:
        """List all priorities for a date as flat list.
        
        Args:
            date: Target date (defaults to today)
            include_completed: Include completed priorities
            
        Returns:
            List of priorities
        """
        grouped = self.list_by_date(date, include_completed)
        return grouped["critical"] + grouped["medium"] + grouped["low"]
    
    # === Internal Helpers ===
    
    def _row_to_priority(self, row) -> Priority:
        """Convert database row to Priority."""
        return Priority(
            id=row["id"],
            date=row["date"],
            content=row["content"],
            level=row["level"],
            completed=bool(row["completed"]),
            completed_at=row["completed_at"],
            position=row["position"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

