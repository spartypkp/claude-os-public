"""
Data models for Ember.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class PetState:
    """Ember's current state."""

    id: int
    name: str
    trace_count: int
    stage: str
    mood: str
    mood_color: str
    last_fed: Optional[datetime]
    last_interaction: Optional[datetime]
    last_note: Optional[str]
    created_at: datetime

    @property
    def stage_description(self) -> str:
        """Human-readable stage description."""
        stage_map = {
            "spark": "Tiny flickering dot. Simple. Barely there.",
            "kindle": "Small flame shape. Gentle pulse. One color.",
            "glow": "Larger, multi-colored. Facets visible. Patterns forming.",
            "blaze": "Complex geometric form. Rich colors. Internal patterns that shift.",
            "radiance": "Full evolution. Beautiful. Something worth looking at."
        }
        return stage_map.get(self.stage, "Unknown stage")


@dataclass
class PetNote:
    """A note to or from Ember."""

    id: int
    direction: str  # 'to_ember' or 'from_ember'
    message: str
    session_id: Optional[str]
    created_at: datetime


@dataclass
class MoodEntry:
    """A mood history entry."""

    id: int
    mood: str
    color: str
    trigger: Optional[str]
    recorded_at: datetime
