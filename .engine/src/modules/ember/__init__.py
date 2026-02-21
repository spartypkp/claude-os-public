"""
Ember - Claude's pet companion.

A digital being that grows with the lineage and reflects system health.
"""

from .service import EmberService
from .models import PetState, PetNote, MoodEntry

__all__ = ["EmberService", "PetState", "PetNote", "MoodEntry"]
