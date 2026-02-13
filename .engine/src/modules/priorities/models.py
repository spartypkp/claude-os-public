"""Priority domain models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


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
