"""Apple Calendar integration - reads directly from macOS Calendar database.

This module reads from ~/Library/Calendars/Calendar.sqlitedb, the same
database that Calendar.app uses. This provides real-time access to calendar
data that syncs with iCloud/Google Calendar.

Note: Requires Full Disk Access permission for the Python process.
"""
import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# macOS Calendar database location
CALENDAR_DB_PATH = os.path.expanduser("~/Library/Calendars/Calendar.sqlitedb")

# Preferred calendars - filter out junk/noise calendars
# Must stay in sync with apps/calendar/adapters/apple.py and life_mcp/apple_filtered.py
# Note: "Calendar" is the Exchange calendar - macOS names it generically
PREFERRED_CALENDARS = ["Personal", "Calendar", "Work", "Home"]

# Calendar name aliases - maps friendly names to actual Apple Calendar names
# This allows using "Exchange" even though the calendar is named "Calendar"
CALENDAR_ALIASES = {
    "exchange": "Calendar",      # Exchange account's calendar
    "personal": "Calendar",      # Alias for personal schedule
    "gmail": "Personal",     # Gmail calendar
    "work": "Work",         # Work calendar
}

# Core Data reference date (January 1, 2001 00:00:00 UTC)
CORE_DATA_REFERENCE_UTC = datetime(2001, 1, 1, tzinfo=timezone.utc)


def _get_db_connection() -> Optional[sqlite3.Connection]:
    """Get a connection to the Apple Calendar database."""
    try:
        if not os.path.exists(CALENDAR_DB_PATH):
            logger.error(f"Calendar database not found at {CALENDAR_DB_PATH}")
            return None
        conn = sqlite3.connect(CALENDAR_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to Calendar database: {e}")
        return None


def _core_data_to_datetime(timestamp: Optional[float], all_day: bool = False) -> Optional[datetime]:
    """Convert Core Data timestamp to local datetime.

    Core Data stores timestamps as seconds since 2001-01-01 00:00:00 UTC.

    For timed events: Convert to UTC-aware datetime, then to local timezone.
    For all-day events: Treat the UTC date as the intended local date (no timezone shift).

    This fixes a bug where all-day events stored as midnight UTC would shift
    to 4 PM the previous day in Pacific time.
    """
    if timestamp is None:
        return None
    utc_dt = CORE_DATA_REFERENCE_UTC + timedelta(seconds=timestamp)

    if all_day:
        # For all-day events, use the UTC date directly as local date at midnight
        # This prevents Dec 25 midnight UTC from becoming Dec 24 4PM PST
        return datetime(utc_dt.year, utc_dt.month, utc_dt.day).astimezone()

    return utc_dt.astimezone()  # Convert to local timezone


def _datetime_to_core_data(dt: datetime) -> float:
    """Convert datetime to Core Data timestamp.

    If datetime is naive, assumes local timezone.
    Converts to UTC before calculating offset from Core Data reference.
    """
    if dt.tzinfo is None:
        # Naive datetime - assume local timezone
        dt = dt.astimezone()
    # Convert to UTC for calculation
    utc_dt = dt.astimezone(timezone.utc)
    return (utc_dt - CORE_DATA_REFERENCE_UTC).total_seconds()


def get_events(
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 50,
    calendar_filter: Optional[str] = None,
    use_preferred: bool = True,
) -> List[Dict[str, Any]]:
    """
    Get calendar events from Apple Calendar.

    Args:
        from_date: Start of date range (default: now - 1 hour)
        to_date: End of date range (default: now + 7 days)
        limit: Maximum number of events to return
        calendar_filter: Optional calendar name to filter by
        use_preferred: If True, only return events from PREFERRED_CALENDARS (default True)

    Returns:
        List of event dictionaries with keys:
        - summary: Event title
        - start_ts: ISO format start time
        - end_ts: ISO format end time
        - location: Event location (may be None)
        - all_day: Boolean for all-day events
        - calendar_name: Name of the calendar
        - id: Event UUID
        - organizer_email: Email of the event organizer (may be None)
        - organizer_name: Display name of the organizer (may be None)
    """
    conn = _get_db_connection()
    if not conn:
        logger.warning("Could not connect to Apple Calendar database")
        return []

    try:
        # Default date range
        if from_date is None:
            from_date = datetime.now() - timedelta(hours=1)
        if to_date is None:
            to_date = datetime.now() + timedelta(days=7)

        # Convert to Core Data timestamps
        start_timestamp = _datetime_to_core_data(from_date)
        end_timestamp = _datetime_to_core_data(to_date)

        # Build query
        params: List[Any] = [start_timestamp, end_timestamp]
        calendar_clause = ""
        if calendar_filter:
            calendar_clause = " AND c.title = ?"
            params.append(calendar_filter)

        params.append(limit)

        # Query includes organizer JOIN (role=0 is organizer)
        query = f"""
            SELECT
                ci.summary,
                ci.start_date,
                ci.end_date,
                l.title as location,
                ci.all_day,
                c.title as calendar_name,
                ci.UUID as id,
                p.email as organizer_email,
                COALESCE(i.display_name, p.email) as organizer_name
            FROM CalendarItem ci
            LEFT JOIN Calendar c ON ci.calendar_id = c.ROWID
            LEFT JOIN Location l ON ci.location_id = l.ROWID
            LEFT JOIN Participant p ON ci.ROWID = p.owner_id AND p.role = 0
            LEFT JOIN Identity i ON p.identity_id = i.ROWID
            WHERE ci.start_date >= ?
              AND ci.start_date <= ?
              AND ci.summary IS NOT NULL
              {calendar_clause}
            GROUP BY ci.ROWID
            ORDER BY ci.start_date
            LIMIT ?
        """

        cursor = conn.execute(query, params)
        events = []

        for row in cursor.fetchall():
            is_all_day = bool(row["all_day"])
            start_dt = _core_data_to_datetime(row["start_date"], all_day=is_all_day)
            end_dt = _core_data_to_datetime(row["end_date"], all_day=is_all_day)

            events.append({
                "summary": row["summary"],
                "start_ts": start_dt.isoformat() if start_dt else None,
                "end_ts": end_dt.isoformat() if end_dt else None,
                "location": row["location"],
                "all_day": bool(row["all_day"]),
                "calendar_name": row["calendar_name"],
                "kind": "calendar",  # For dashboard compatibility
                "id": row["id"],
                "organizer_email": row["organizer_email"],
                "organizer_name": row["organizer_name"],
            })

        # Filter to preferred calendars unless disabled or specific calendar requested
        if use_preferred and not calendar_filter:
            events = [e for e in events if e.get("calendar_name") in PREFERRED_CALENDARS]

        return events

    except Exception as e:
        logger.error(f"Error querying Apple Calendar: {e}")
        return []
    finally:
        conn.close()


def get_calendars() -> List[Dict[str, Any]]:
    """Get list of available calendars."""
    conn = _get_db_connection()
    if not conn:
        return []

    try:
        query = """
            SELECT
                ROWID as id,
                title,
                UUID
            FROM Calendar
            WHERE title IS NOT NULL
            ORDER BY title
        """

        cursor = conn.execute(query)
        return [dict(row) for row in cursor.fetchall()]

    except Exception as e:
        logger.error(f"Error listing calendars: {e}")
        return []
    finally:
        conn.close()
