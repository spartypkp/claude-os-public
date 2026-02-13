"""Apple Calendar adapter - Reads from macOS Calendar database.

This adapter reads directly from ~/Library/Calendars/Calendar.sqlitedb
and uses AppleScript for mutations. This provides real-time access to
calendar data that syncs with iCloud, Exchange, and Google via CalDAV.

Direct-read pattern (matching email):
- Data-plane reads from Apple Calendar SQLite (read-only)
- AppleScript for write operations (create/update/delete)
- Configuration passed by CalendarService

Requirements:
- macOS
- Calendar.app configured with at least one account
- Full Disk Access permission for Python process
"""

from __future__ import annotations

import logging
import os
import sqlite3
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from .base import CalendarAdapter
from ..models import (
    CalendarEvent,
    CalendarInfo,
    EventCreate,
    EventUpdate,
    ProviderType,
)

logger = logging.getLogger(__name__)

# macOS Calendar database location
CALENDAR_DB_PATH = os.path.expanduser("~/Library/Calendars/Calendar.sqlitedb")

# Core Data reference date (January 1, 2001 00:00:00 UTC)
CORE_DATA_REFERENCE_UTC = datetime(2001, 1, 1, tzinfo=timezone.utc)


def _core_data_to_datetime(timestamp: Optional[float], all_day: bool = False) -> Optional[datetime]:
    """Convert Core Data timestamp to datetime."""
    if timestamp is None:
        return None
    utc_dt = CORE_DATA_REFERENCE_UTC + timedelta(seconds=timestamp)

    if all_day:
        # For all-day events, use the UTC date directly as local date
        return datetime(utc_dt.year, utc_dt.month, utc_dt.day).astimezone()

    return utc_dt.astimezone()


def _datetime_to_core_data(dt: datetime) -> float:
    """Convert datetime to Core Data timestamp."""
    if dt.tzinfo is None:
        dt = dt.astimezone()
    utc_dt = dt.astimezone(timezone.utc)
    return (utc_dt - CORE_DATA_REFERENCE_UTC).total_seconds()


def _run_applescript(script: str, timeout: int = 10) -> str:
    """Run an AppleScript and return the result."""
    try:
        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True,
            text=True,
            timeout=timeout
        )
        if result.returncode != 0:
            logger.error(f"AppleScript error: {result.stderr}")
            return ""
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        logger.error(f"AppleScript timed out after {timeout}s")
        return ""
    except FileNotFoundError:
        logger.error("osascript not found - this only works on macOS")
        return ""
    except Exception as e:
        logger.error(f"AppleScript execution failed: {e}")
        return ""


def _run_applescript_async(script: str) -> bool:
    """Run an AppleScript in fire-and-forget mode (non-blocking).

    Returns True if the command was successfully spawned, False if spawn failed.
    Does not wait for completion or capture output.
    """
    try:
        subprocess.Popen(
            ['osascript', '-e', script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )
        return True
    except FileNotFoundError:
        logger.error("osascript not found - this only works on macOS")
        return False
    except Exception as e:
        logger.error(f"Failed to spawn AppleScript process: {e}")
        return False


class AppleCalendarAdapter(CalendarAdapter):
    """Adapter for macOS Calendar.app.

    Reads from the Calendar SQLite database for fast access,
    uses AppleScript for creating/updating events.
    """

    def __init__(
        self,
        preferred_only: bool = False,
        preferred_calendars: Optional[List[str]] = None,
        aliases: Optional[Dict[str, str]] = None,
        default_calendar: Optional[str] = None,
    ):
        """Initialize Apple Calendar adapter.

        Args:
            preferred_only: If True, filter to preferred_calendars only.
            preferred_calendars: List of calendar names to prefer.
            aliases: Calendar name aliases (e.g., {"gmail": "Personal"}).
            default_calendar: Default calendar name to use.
        """
        self._preferred_only = preferred_only
        self._preferred_calendars = preferred_calendars or []
        self._aliases = aliases or {}
        self._default_calendar = default_calendar or "Calendar"
        self._conn: Optional[sqlite3.Connection] = None

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.APPLE

    @property
    def display_name(self) -> str:
        return "Apple Calendar"

    def _get_db_connection(self) -> Optional[sqlite3.Connection]:
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

    def _resolve_calendar_name(self, calendar_id: Optional[str]) -> str:
        """Resolve a Calendar UUID, name, or alias to a calendar name.

        Supports:
        - Calendar UUID (e.g., "ABC-123-DEF")
        - Calendar name (e.g., "Calendar", "Personal")
        - Friendly aliases (e.g., "Exchange", "Personal", "Gmail", "Work")
        """
        if not calendar_id:
            return self._default_calendar

        # Check aliases first (case-insensitive)
        alias_result = self._aliases.get(calendar_id.lower())
        if alias_result:
            return alias_result

        # Try database lookup for UUID or exact name match
        conn = self._get_db_connection()
        if not conn:
            return calendar_id
        try:
            row = conn.execute(
                "SELECT title FROM Calendar WHERE UUID = ? OR title = ? LIMIT 1",
                (calendar_id, calendar_id),
            ).fetchone()
            return row["title"] if row else calendar_id
        except Exception:
            return calendar_id
        finally:
            conn.close()

    def is_available(self) -> bool:
        """Check if Apple Calendar is available."""
        return os.path.exists(CALENDAR_DB_PATH)

    def get_calendars(self) -> List[CalendarInfo]:
        """Get list of available calendars."""
        conn = self._get_db_connection()
        if not conn:
            return []

        try:
            query = """
                SELECT
                    ROWID as id,
                    title,
                    UUID,
                    color
                FROM Calendar
                WHERE title IS NOT NULL
                ORDER BY title
            """

            cursor = conn.execute(query)
            calendars = []

            for row in cursor.fetchall():
                name = row["title"]

                # Filter to preferred if enabled
                if self._preferred_only and name not in self._preferred_calendars:
                    continue

                calendars.append(CalendarInfo(
                    id=row["UUID"] or str(row["id"]),
                    name=name,
                    color=row["color"],
                    provider=ProviderType.APPLE,
                ))

            return calendars

        except Exception as e:
            logger.error(f"Error listing calendars: {e}")
            return []
        finally:
            conn.close()

    def get_events(
        self,
        calendar_id: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[CalendarEvent]:
        """Get events from Apple Calendar."""
        conn = self._get_db_connection()
        if not conn:
            return []

        try:
            # Default date range
            if start is None:
                start = datetime.now() - timedelta(hours=1)
            if end is None:
                end = datetime.now() + timedelta(days=7)

            start_ts = _datetime_to_core_data(start)
            end_ts = _datetime_to_core_data(end)

            # Build query
            params: List[Any] = [start_ts, end_ts]
            calendar_clause = ""
            if calendar_id:
                # Resolve aliases (e.g., "gmail" -> "Personal", "exchange" -> "Calendar")
                resolved_name = self._resolve_calendar_name(calendar_id)
                # Match by UUID, ROWID, or calendar title
                calendar_clause = " AND (c.UUID = ? OR c.ROWID = ? OR c.title = ?)"
                params.extend([calendar_id, calendar_id, resolved_name])

            params.append(limit)

            query = f"""
                SELECT
                    ci.summary,
                    ci.start_date,
                    ci.end_date,
                    l.title as location,
                    ci.all_day,
                    c.title as calendar_name,
                    c.UUID as calendar_id,
                    ci.UUID as id,
                    ci.description,
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

                cal_name = row["calendar_name"]

                # Filter to preferred calendars
                if self._preferred_only and cal_name and cal_name not in self._preferred_calendars:
                    continue

                if start_dt and end_dt:
                    events.append(CalendarEvent(
                        id=row["id"],
                        summary=row["summary"],
                        start=start_dt,
                        end=end_dt,
                        all_day=is_all_day,
                        location=row["location"],
                        description=row["description"],
                        calendar_id=row["calendar_id"],
                        calendar_name=cal_name,
                        provider=ProviderType.APPLE,
                        organizer_email=row["organizer_email"],
                        organizer_name=row["organizer_name"],
                    ))

            return events

        except Exception as e:
            logger.error(f"Error querying events: {e}")
            return []
        finally:
            conn.close()

    def get_event(self, event_id: str, calendar_id: Optional[str] = None) -> Optional[CalendarEvent]:
        """Get a single event by ID."""
        conn = self._get_db_connection()
        if not conn:
            return None

        try:
            query = """
                SELECT
                    ci.summary,
                    ci.start_date,
                    ci.end_date,
                    l.title as location,
                    ci.all_day,
                    c.title as calendar_name,
                    c.UUID as calendar_id,
                    ci.UUID as id,
                    ci.description,
                    p.email as organizer_email,
                    COALESCE(i.display_name, p.email) as organizer_name
                FROM CalendarItem ci
                LEFT JOIN Calendar c ON ci.calendar_id = c.ROWID
                LEFT JOIN Location l ON ci.location_id = l.ROWID
                LEFT JOIN Participant p ON ci.ROWID = p.owner_id AND p.role = 0
                LEFT JOIN Identity i ON p.identity_id = i.ROWID
                WHERE ci.UUID = ?
                LIMIT 1
            """

            cursor = conn.execute(query, [event_id])
            row = cursor.fetchone()

            if not row:
                return None

            is_all_day = bool(row["all_day"])
            start_dt = _core_data_to_datetime(row["start_date"], all_day=is_all_day)
            end_dt = _core_data_to_datetime(row["end_date"], all_day=is_all_day)

            if not start_dt or not end_dt:
                return None

            return CalendarEvent(
                id=row["id"],
                summary=row["summary"],
                start=start_dt,
                end=end_dt,
                all_day=is_all_day,
                location=row["location"],
                description=row["description"],
                calendar_id=row["calendar_id"],
                calendar_name=row["calendar_name"],
                provider=ProviderType.APPLE,
                organizer_email=row["organizer_email"],
                organizer_name=row["organizer_name"],
            )

        except Exception as e:
            logger.error(f"Error getting event: {e}")
            return None
        finally:
            conn.close()

    def create_event(self, event: EventCreate) -> Optional[CalendarEvent]:
        """Create a new event via AppleScript."""
        try:
            start_dt = event.start
            end_dt = event.end
            if start_dt.tzinfo is not None:
                start_dt = start_dt.astimezone()
            if end_dt.tzinfo is not None:
                end_dt = end_dt.astimezone()

            # Format dates for AppleScript
            start_str = start_dt.strftime('%B %d, %Y at %I:%M:%S %p')
            end_str = end_dt.strftime('%B %d, %Y at %I:%M:%S %p')

            # Escape strings for AppleScript
            title_escaped = event.summary.replace('"', '\\"')
            location_escaped = (event.location or '').replace('"', '\\"')
            description_escaped = (event.description or '').replace('"', '\\"')

            # Default calendar if not specified
            calendar_name = self._resolve_calendar_name(event.calendar_id)

            # Build AppleScript
            script = f'''
tell application "Calendar"
    tell calendar "{calendar_name}"
        set newEvent to make new event with properties {{summary:"{title_escaped}", start date:date "{start_str}", end date:date "{end_str}"'''

            if event.location:
                script += f', location:"{location_escaped}"'
            if event.description:
                script += f', description:"{description_escaped}"'
            if event.all_day:
                script += ', allday event:true'

            script += '''}
        return uid of newEvent
    end tell
end tell'''

            event_uid = _run_applescript(script)

            if event_uid:
                logger.info(f"Created event: {event.summary} -> {event_uid}")
                # Fetch the created event
                return self.get_event(event_uid)

            return None

        except Exception as e:
            logger.error(f"Failed to create event: {e}")
            return None

    def update_event(
        self,
        event_id: str,
        update: EventUpdate,
        calendar_id: Optional[str] = None,
    ) -> Optional[CalendarEvent]:
        """Update an existing event via AppleScript."""
        try:
            # Build property updates
            props = []

            if update.summary is not None:
                props.append(f'set summary of foundEvent to "{update.summary.replace(chr(34), chr(92)+chr(34))}"')

            if update.start is not None:
                start_str = update.start.strftime('%B %d, %Y at %I:%M:%S %p')
                props.append(f'set start date of foundEvent to date "{start_str}"')

            if update.end is not None:
                end_str = update.end.strftime('%B %d, %Y at %I:%M:%S %p')
                props.append(f'set end date of foundEvent to date "{end_str}"')

            if update.location is not None:
                props.append(f'set location of foundEvent to "{update.location.replace(chr(34), chr(92)+chr(34))}"')

            if update.description is not None:
                props.append(f'set description of foundEvent to "{update.description.replace(chr(34), chr(92)+chr(34))}"')

            if update.all_day is not None:
                props.append(f'set allday event of foundEvent to {str(update.all_day).lower()}')

            if update.calendar_id is not None:
                target_calendar = self._resolve_calendar_name(update.calendar_id)
                props.append(f'move foundEvent to calendar "{target_calendar}"')

            if not props:
                return self.get_event(event_id)

            props_script = "\n        ".join(props)

            script = f'''
tell application "Calendar"
    set foundEvent to missing value
    repeat with cal in calendars
        try
            set foundEvent to first event of cal whose uid is "{event_id}"
            exit repeat
        end try
    end repeat

    if foundEvent is not missing value then
        {props_script}
        return "success"
    else
        return "not_found"
    end if
end tell'''

            result = _run_applescript(script)

            if result == "success":
                return self.get_event(event_id)

            return None

        except Exception as e:
            logger.error(f"Failed to update event: {e}")
            return None

    def delete_event(self, event_id: str, calendar_id: Optional[str] = None) -> bool:
        """Delete an event via AppleScript (fire-and-forget).

        Returns True if the delete command was successfully fired.
        Does not wait for completion - the event will be deleted asynchronously.
        """
        try:
            # Use filter-based approach with try-catch per calendar (fast, no iteration)
            # Pattern from move_event (api.py:190-207)
            script = f'''
tell application "Calendar"
    repeat with cal in calendars
        try
            set foundEvent to first event of cal whose id is "{event_id}"
            delete foundEvent
            return "success"
        end try
    end repeat
    return "not_found"
end tell'''

            # Fire and forget - return immediately without waiting
            return _run_applescript_async(script)

        except Exception as e:
            logger.error(f"Failed to delete event: {e}")
            return False

    def search_events(
        self,
        query: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 20,
    ) -> List[CalendarEvent]:
        """Search for events by summary."""
        conn = self._get_db_connection()
        if not conn:
            return []

        try:
            # Default date range (broader for search)
            if start is None:
                start = datetime.now() - timedelta(days=30)
            if end is None:
                end = datetime.now() + timedelta(days=365)

            start_ts = _datetime_to_core_data(start)
            end_ts = _datetime_to_core_data(end)

            search_pattern = f"%{query}%"

            sql = """
                SELECT
                    ci.summary,
                    ci.start_date,
                    ci.end_date,
                    l.title as location,
                    ci.all_day,
                    c.title as calendar_name,
                    c.UUID as calendar_id,
                    ci.UUID as id,
                    ci.description
                FROM CalendarItem ci
                LEFT JOIN Calendar c ON ci.calendar_id = c.ROWID
                LEFT JOIN Location l ON ci.location_id = l.ROWID
                WHERE ci.start_date >= ?
                  AND ci.start_date <= ?
                  AND ci.summary LIKE ?
                ORDER BY ci.start_date
                LIMIT ?
            """

            cursor = conn.execute(sql, [start_ts, end_ts, search_pattern, limit])
            events = []

            for row in cursor.fetchall():
                is_all_day = bool(row["all_day"])
                start_dt = _core_data_to_datetime(row["start_date"], all_day=is_all_day)
                end_dt = _core_data_to_datetime(row["end_date"], all_day=is_all_day)

                cal_name = row["calendar_name"]

                if self._preferred_only and cal_name and cal_name not in self._preferred_calendars:
                    continue

                if start_dt and end_dt:
                    events.append(CalendarEvent(
                        id=row["id"],
                        summary=row["summary"],
                        start=start_dt,
                        end=end_dt,
                        all_day=is_all_day,
                        location=row["location"],
                        description=row["description"],
                        calendar_id=row["calendar_id"],
                        calendar_name=cal_name,
                        provider=ProviderType.APPLE,
                    ))

            return events

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
        finally:
            conn.close()

    def test_connection(self) -> tuple[bool, str]:
        """Test connection to Apple Calendar."""
        if not os.path.exists(CALENDAR_DB_PATH):
            return False, "Calendar database not found. Is Calendar.app configured?"

        calendars = self.get_calendars()
        if not calendars:
            return True, "Calendar.app accessible but no calendars found"

        return True, f"Connected to Calendar.app with {len(calendars)} calendar(s)"
