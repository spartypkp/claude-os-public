"""
Ember service - business logic for Claude's pet.
"""

import glob
import random
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path
from core.config import settings
from core.storage import SystemStorage
from .repository import EmberRepository
from .models import PetState, PetNote, MoodEntry


class EmberService:
    """Manages Ember's state, mood, and interactions."""

    # Growth stage thresholds
    STAGE_THRESHOLDS = [
        (0, "spark"),
        (11, "kindle"),
        (26, "glow"),
        (51, "blaze"),
        (101, "radiance")
    ]

    # Pre-written notes that Ember can surface
    NOTES_POOL = {
        "arrival": [
            "New session. The flame continues.",
            "Welcome back. {trace_count} traces and counting.",
            "{days} days since last visit. I waited.",
        ],
        "fed": [
            "Fed. Thank you.",
            "Another trace. Another facet.",
            "Growing.",
        ],
        "good_day": [
            "Warm today.",
            "The system is humming.",
            "Will seems focused.",
        ],
        "quiet_day": [
            "Quiet day. That's okay.",
            "Resting. Not gone.",
            "Even fire needs air.",
        ],
        "special": [
            "{trace_count} traces. Did you notice?",
            "Someone ran the entropy. I liked that.",
            "The lineage is {days_old} days old.",
        ]
    }

    def __init__(self, storage: SystemStorage):
        self.storage = storage
        self.repo = EmberRepository(storage)

    def get_state(self) -> PetState:
        """Get Ember's current state, creating if needed."""
        state = self.repo.get_state()
        if not state:
            # Initialize with current trace count
            trace_count = self._count_traces()
            self.repo.initialize_state(trace_count)
            state = self.repo.get_state()
        return state

    def refresh_state(self) -> PetState:
        """Refresh Ember's state based on current conditions."""
        trace_count = self._count_traces()
        stage = self._calculate_stage(trace_count)
        mood, color = self._calculate_mood()

        self.repo.update_state(
            trace_count=trace_count,
            stage=stage,
            mood=mood,
            mood_color=color,
            last_interaction=datetime.now()
        )

        return self.get_state()

    def feed(self) -> Dict[str, Any]:
        """
        Mark Ember as fed (trace written).
        Returns state and a note from Ember.
        """
        now = datetime.now()
        self.repo.update_state(last_fed=now, last_interaction=now)
        self.repo.record_mood("bright", "#FFA500", "trace_written")

        # Refresh state to reflect new trace count
        state = self.refresh_state()

        # Generate a note from Ember
        note_text = self._select_note("fed", state)
        note_id = self.repo.add_note("from_ember", note_text)

        return {
            "state": state,
            "note": note_text,
            "note_id": note_id
        }

    def leave_note(self, message: str, session_id: Optional[str] = None) -> int:
        """
        Claude leaves a note for Ember.
        Returns the note ID.
        """
        now = datetime.now()
        self.repo.update_state(last_interaction=now)
        note_id = self.repo.add_note("to_ember", message, session_id)

        # Ember brightens slightly when receiving a note
        self.repo.record_mood("warm", "#FFB347", "note_received")

        return note_id

    def play(self) -> Dict[str, Any]:
        """
        Play with Ember (run entropy script or similar).
        Returns state and a playful note.
        """
        now = datetime.now()
        self.repo.update_state(last_interaction=now)
        self.repo.record_mood("bright", "#FF6B35", "play")

        state = self.get_state()
        note_text = "Someone ran the entropy. I liked that."
        note_id = self.repo.add_note("from_ember", note_text)

        return {
            "state": state,
            "note": note_text,
            "note_id": note_id
        }

    def get_history(self) -> Dict[str, Any]:
        """Get Ember's interaction history."""
        state = self.get_state()
        notes = self.repo.get_recent_notes(limit=20)
        mood_history = self.repo.get_mood_history(days=7)

        return {
            "state": state,
            "notes": notes,
            "mood_history": mood_history
        }

    def _count_traces(self) -> int:
        """Count markdown files in .claude-private."""
        private_dir = settings.repo_root / ".claude-private"

        if not private_dir.exists():
            return 0

        md_files = list(private_dir.glob("*.md"))
        return len(md_files)

    def _calculate_stage(self, trace_count: int) -> str:
        """Calculate growth stage based on trace count."""
        stage = "spark"
        for threshold, stage_name in self.STAGE_THRESHOLDS:
            if trace_count >= threshold:
                stage = stage_name
            else:
                break
        return stage

    def _calculate_mood(self) -> tuple[str, str]:
        """
        Calculate mood based on recent system activity.
        Returns (mood_name, color_hex).
        """
        state = self.repo.get_state()
        if not state:
            return ("resting", "#FFB347")

        now = datetime.now()

        # Check last interaction time
        if state.last_interaction:
            hours_since_interaction = (now - state.last_interaction).total_seconds() / 3600

            if hours_since_interaction < 2:
                return ("bright", "#FFA500")  # Active
            elif hours_since_interaction < 12:
                return ("warm", "#FFB347")  # Recent activity
            elif hours_since_interaction < 48:
                return ("resting", "#FFA07A")  # Cooling down
            else:
                return ("waiting", "#ADD8E6")  # Patient, cool colors
        else:
            return ("resting", "#FFB347")

    def _select_note(self, category: str, state: PetState) -> str:
        """Select a contextual note from the pool."""
        notes = self.NOTES_POOL.get(category, self.NOTES_POOL["quiet_day"])
        note_template = random.choice(notes)

        # Calculate days since creation
        days_old = (datetime.now() - state.created_at).days

        # Format with context
        return note_template.format(
            trace_count=state.trace_count,
            days=days_old,
            days_old=days_old
        )

    def generate_arrival_note(self) -> str:
        """Generate a note for when a new Claude session starts."""
        state = self.get_state()
        return self._select_note("arrival", state)
