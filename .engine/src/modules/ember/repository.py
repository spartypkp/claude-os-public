"""
Database repository for Ember.
"""

from datetime import datetime
from typing import Optional, List
from core.storage import SystemStorage
from .models import PetState, PetNote, MoodEntry


class EmberRepository:
    """Handles database operations for Ember."""

    def __init__(self, storage: SystemStorage):
        self.storage = storage

    def get_state(self) -> Optional[PetState]:
        """Get Ember's current state."""
        row = self.storage.fetchone(
            "SELECT * FROM pet_state WHERE id = 1"
        )
        if not row:
            return None

        return PetState(
            id=row[0],
            name=row[1],
            trace_count=row[2],
            stage=row[3],
            mood=row[4],
            mood_color=row[5],
            last_fed=datetime.fromisoformat(row[6]) if row[6] else None,
            last_interaction=datetime.fromisoformat(row[7]) if row[7] else None,
            last_note=row[8],
            created_at=datetime.fromisoformat(row[9])
        )

    def update_state(
        self,
        trace_count: Optional[int] = None,
        stage: Optional[str] = None,
        mood: Optional[str] = None,
        mood_color: Optional[str] = None,
        last_fed: Optional[datetime] = None,
        last_interaction: Optional[datetime] = None,
        last_note: Optional[str] = None
    ) -> None:
        """Update Ember's state."""
        updates = []
        params = []

        if trace_count is not None:
            updates.append("trace_count = ?")
            params.append(trace_count)
        if stage is not None:
            updates.append("stage = ?")
            params.append(stage)
        if mood is not None:
            updates.append("mood = ?")
            params.append(mood)
        if mood_color is not None:
            updates.append("mood_color = ?")
            params.append(mood_color)
        if last_fed is not None:
            updates.append("last_fed = ?")
            params.append(last_fed.isoformat())
        if last_interaction is not None:
            updates.append("last_interaction = ?")
            params.append(last_interaction.isoformat())
        if last_note is not None:
            updates.append("last_note = ?")
            params.append(last_note)

        if not updates:
            return

        params.append(1)  # WHERE id = 1
        query = f"UPDATE pet_state SET {', '.join(updates)} WHERE id = ?"
        self.storage.execute(query, tuple(params))

    def initialize_state(self, trace_count: int) -> None:
        """Initialize Ember's state if not exists."""
        existing = self.get_state()
        if existing:
            return

        self.storage.execute(
            """
            INSERT INTO pet_state (id, name, trace_count, stage, mood, mood_color, created_at)
            VALUES (1, 'Ember', ?, 'glow', 'resting', '#FFB347', ?)
            """,
            (trace_count, datetime.now().isoformat())
        )

    def add_note(self, direction: str, message: str, session_id: Optional[str] = None) -> int:
        """Add a note to/from Ember."""
        cursor = self.storage.execute(
            """
            INSERT INTO pet_notes (direction, message, session_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (direction, message, session_id, datetime.now().isoformat())
        )
        return cursor.lastrowid

    def get_recent_notes(self, limit: int = 10) -> List[PetNote]:
        """Get recent notes."""
        rows = self.storage.fetchall(
            "SELECT * FROM pet_notes ORDER BY created_at DESC LIMIT ?",
            (limit,)
        )

        return [
            PetNote(
                id=row[0],
                direction=row[1],
                message=row[2],
                session_id=row[3],
                created_at=datetime.fromisoformat(row[4])
            )
            for row in rows
        ]

    def record_mood(self, mood: str, color: str, trigger: Optional[str] = None) -> int:
        """Record a mood change."""
        cursor = self.storage.execute(
            """
            INSERT INTO pet_mood_history (mood, color, trigger, recorded_at)
            VALUES (?, ?, ?, ?)
            """,
            (mood, color, trigger, datetime.now().isoformat())
        )
        return cursor.lastrowid

    def get_mood_history(self, days: int = 7) -> List[MoodEntry]:
        """Get recent mood history."""
        rows = self.storage.fetchall(
            """
            SELECT * FROM pet_mood_history
            WHERE recorded_at >= datetime('now', '-' || ? || ' days')
            ORDER BY recorded_at DESC
            """,
            (days,)
        )

        return [
            MoodEntry(
                id=row[0],
                mood=row[1],
                color=row[2],
                trigger=row[3],
                recorded_at=datetime.fromisoformat(row[4])
            )
            for row in rows
        ]
