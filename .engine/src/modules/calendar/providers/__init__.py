"""Calendar providers - adapters for different calendar backends.

Available providers:
- AppleCalendarAdapter: macOS Calendar.app (direct SQLite read + AppleScript)
"""

from .base import CalendarAdapter
from .apple import AppleCalendarAdapter

__all__ = [
    "CalendarAdapter",
    "AppleCalendarAdapter",
]
