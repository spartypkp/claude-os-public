"""Local calendar adapter - SQLite-backed calendar storage.

This adapter provides offline calendar functionality using local SQLite storage.
It's always available and serves as:
1. Fallback when external providers are unavailable
2. Primary storage for local-first sync pattern
3. Testing and development environment

The local adapter can work independently or sync with external providers.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .base import (
    CalendarAdapter,
    CalendarEvent,
    CalendarInfo,
    EventCreate,
    EventUpdate,
    ProviderType,
)

logger = logging.getLogger(__name__)


class LocalCalendarAdapter(CalendarAdapter):
    """SQLite-backed local calendar adapter.
    
    Stores calendar data in the system SQLite database.
    Always available for offline-first functionality.
    """
    
    def __init__(self, storage=None):
        """Initialize local calendar adapter.
        
        Args:
            storage: SystemStorage instance from core.
        """
        self._storage = storage
    
    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.LOCAL
    
    @property
    def display_name(self) -> str:
        return "Local Calendar"
    
    def is_available(self) -> bool:
        """Local storage is always available."""
        return self._storage is not None
    
    def get_calendars(self) -> List[CalendarInfo]:
        """Get list of local calendars."""
        if not self._storage:
            return [CalendarInfo(
                id='default',
                name='Local Calendar',
                provider=ProviderType.LOCAL,
                writable=True,
                primary=True,
            )]
        
        try:
            rows = self._storage.fetchall(
                "SELECT * FROM calendar_calendars ORDER BY is_primary DESC, name"
            )
            
            calendars = []
            for row in rows:
                calendars.append(CalendarInfo(
                    id=row['id'],
                    name=row['name'],
                    color=row.get('color'),
                    provider=ProviderType.LOCAL,
                    writable=True,
                    primary=bool(row.get('is_primary', False)),
                ))
            
            # Ensure at least one calendar exists
            if not calendars:
                default_cal = self._create_default_calendar()
                calendars.append(default_cal)
            
            return calendars
            
        except Exception as e:
            logger.error(f"Failed to get calendars: {e}")
            return [CalendarInfo(
                id='default',
                name='Local Calendar',
                provider=ProviderType.LOCAL,
                writable=True,
                primary=True,
            )]
    
    def _create_default_calendar(self) -> CalendarInfo:
        """Create the default local calendar."""
        if not self._storage:
            return CalendarInfo(
                id='default',
                name='Local Calendar',
                provider=ProviderType.LOCAL,
                primary=True,
            )
        
        try:
            cal_id = str(uuid4())
            with self._storage.transaction() as cursor:
                cursor.execute("""
                    INSERT INTO calendar_calendars (id, name, is_primary, created_at)
                    VALUES (?, ?, ?, ?)
                """, (cal_id, 'Local Calendar', True, datetime.now().isoformat()))
            
            return CalendarInfo(
                id=cal_id,
                name='Local Calendar',
                provider=ProviderType.LOCAL,
                primary=True,
            )
        except Exception as e:
            logger.error(f"Failed to create default calendar: {e}")
            return CalendarInfo(
                id='default',
                name='Local Calendar',
                provider=ProviderType.LOCAL,
                primary=True,
            )
    
    def get_events(
        self,
        calendar_id: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[CalendarEvent]:
        """Get events from local storage."""
        if not self._storage:
            return []
        
        try:
            # Default date range
            if start is None:
                start = datetime.now() - timedelta(hours=1)
            if end is None:
                end = datetime.now() + timedelta(days=7)
            
            params: List[Any] = [start.isoformat(), end.isoformat()]
            calendar_clause = ""
            
            if calendar_id:
                calendar_clause = " AND calendar_id = ?"
                params.append(calendar_id)
            
            params.append(limit)
            
            rows = self._storage.fetchall(f"""
                SELECT * FROM calendar_events
                WHERE start_time >= ? AND start_time <= ?
                {calendar_clause}
                ORDER BY start_time
                LIMIT ?
            """, params)
            
            events = []
            for row in rows:
                events.append(self._row_to_event(row))
            
            return events
            
        except Exception as e:
            logger.error(f"Failed to get events: {e}")
            return []
    
    def _row_to_event(self, row: Dict[str, Any]) -> CalendarEvent:
        """Convert database row to CalendarEvent."""
        attendees = []
        if row.get('attendees_json'):
            try:
                attendees = json.loads(row['attendees_json'])
            except:
                pass
        
        return CalendarEvent(
            id=row['id'],
            summary=row['summary'],
            start=datetime.fromisoformat(row['start_time']),
            end=datetime.fromisoformat(row['end_time']),
            all_day=bool(row.get('all_day', False)),
            location=row.get('location'),
            description=row.get('description'),
            calendar_id=row.get('calendar_id'),
            provider=ProviderType.LOCAL,
            recurrence_rule=row.get('recurrence_rule'),
            organizer_email=row.get('organizer_email'),
            attendees=attendees,
            status=row.get('status', 'confirmed'),
            created_at=datetime.fromisoformat(row['created_at']) if row.get('created_at') else None,
            updated_at=datetime.fromisoformat(row['updated_at']) if row.get('updated_at') else None,
        )
    
    def get_event(self, event_id: str, calendar_id: Optional[str] = None) -> Optional[CalendarEvent]:
        """Get a single event by ID."""
        if not self._storage:
            return None
        
        try:
            row = self._storage.fetchone(
                "SELECT * FROM calendar_events WHERE id = ?",
                [event_id]
            )
            
            if row:
                return self._row_to_event(row)
            return None
            
        except Exception as e:
            logger.error(f"Failed to get event: {e}")
            return None
    
    def create_event(self, event: EventCreate) -> Optional[CalendarEvent]:
        """Create a new event in local storage."""
        if not self._storage:
            return None
        
        try:
            event_id = str(uuid4())
            now = datetime.now().isoformat()
            
            # Get default calendar if not specified
            calendar_id = event.calendar_id
            if not calendar_id:
                calendars = self.get_calendars()
                calendar_id = calendars[0].id if calendars else 'default'
            
            attendees_json = json.dumps([{'email': e} for e in event.attendees]) if event.attendees else None
            
            with self._storage.transaction() as cursor:
                cursor.execute("""
                    INSERT INTO calendar_events (
                        id, calendar_id, summary, start_time, end_time,
                        all_day, location, description, recurrence_rule,
                        attendees_json, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    event_id,
                    calendar_id,
                    event.summary,
                    event.start.isoformat(),
                    event.end.isoformat(),
                    event.all_day,
                    event.location,
                    event.description,
                    event.recurrence_rule,
                    attendees_json,
                    'confirmed',
                    now,
                    now,
                ))
            
            return self.get_event(event_id)
            
        except Exception as e:
            logger.error(f"Failed to create event: {e}")
            return None
    
    def update_event(
        self,
        event_id: str,
        update: EventUpdate,
        calendar_id: Optional[str] = None,
    ) -> Optional[CalendarEvent]:
        """Update an existing event."""
        if not self._storage:
            return None
        
        try:
            # Build update query dynamically
            updates = []
            params = []
            
            if update.summary is not None:
                updates.append("summary = ?")
                params.append(update.summary)
            
            if update.start is not None:
                updates.append("start_time = ?")
                params.append(update.start.isoformat())
            
            if update.end is not None:
                updates.append("end_time = ?")
                params.append(update.end.isoformat())
            
            if update.all_day is not None:
                updates.append("all_day = ?")
                params.append(update.all_day)
            
            if update.location is not None:
                updates.append("location = ?")
                params.append(update.location)
            
            if update.description is not None:
                updates.append("description = ?")
                params.append(update.description)
            
            if update.calendar_id is not None:
                updates.append("calendar_id = ?")
                params.append(update.calendar_id)
            
            if not updates:
                return self.get_event(event_id)
            
            updates.append("updated_at = ?")
            params.append(datetime.now().isoformat())
            params.append(event_id)
            
            with self._storage.transaction() as cursor:
                cursor.execute(f"""
                    UPDATE calendar_events
                    SET {', '.join(updates)}
                    WHERE id = ?
                """, params)
            
            return self.get_event(event_id)
            
        except Exception as e:
            logger.error(f"Failed to update event: {e}")
            return None
    
    def delete_event(self, event_id: str, calendar_id: Optional[str] = None) -> bool:
        """Delete an event from local storage."""
        if not self._storage:
            return False
        
        try:
            with self._storage.transaction() as cursor:
                cursor.execute("DELETE FROM calendar_events WHERE id = ?", [event_id])
                return cursor.rowcount > 0
            
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
        """Search for events by summary or description."""
        if not self._storage:
            return []
        
        try:
            # Default date range (broader for search)
            if start is None:
                start = datetime.now() - timedelta(days=365)
            if end is None:
                end = datetime.now() + timedelta(days=365)
            
            search_pattern = f"%{query}%"
            
            rows = self._storage.fetchall("""
                SELECT * FROM calendar_events
                WHERE (summary LIKE ? OR description LIKE ?)
                  AND start_time >= ? AND start_time <= ?
                ORDER BY start_time
                LIMIT ?
            """, [search_pattern, search_pattern, start.isoformat(), end.isoformat(), limit])
            
            return [self._row_to_event(row) for row in rows]
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
    
    def create_calendar(self, name: str, color: Optional[str] = None) -> Optional[CalendarInfo]:
        """Create a new local calendar."""
        if not self._storage:
            return None
        
        try:
            cal_id = str(uuid4())
            now = datetime.now().isoformat()
            
            with self._storage.transaction() as cursor:
                cursor.execute("""
                    INSERT INTO calendar_calendars (id, name, color, is_primary, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (cal_id, name, color, False, now))
            
            return CalendarInfo(
                id=cal_id,
                name=name,
                color=color,
                provider=ProviderType.LOCAL,
                writable=True,
            )
            
        except Exception as e:
            logger.error(f"Failed to create calendar: {e}")
            return None
    
    def delete_calendar(self, calendar_id: str) -> bool:
        """Delete a local calendar and all its events."""
        if not self._storage:
            return False
        
        try:
            with self._storage.transaction() as cursor:
                # Delete events first
                cursor.execute("DELETE FROM calendar_events WHERE calendar_id = ?", [calendar_id])
                # Delete calendar
                cursor.execute("DELETE FROM calendar_calendars WHERE id = ?", [calendar_id])
                return cursor.rowcount > 0
            
        except Exception as e:
            logger.error(f"Failed to delete calendar: {e}")
            return False
    
    def test_connection(self) -> tuple[bool, str]:
        """Test local storage connection."""
        if not self._storage:
            return False, "Storage not initialized"
        
        try:
            calendars = self.get_calendars()
            return True, f"Local storage available with {len(calendars)} calendar(s)"
        except Exception as e:
            return False, f"Storage error: {str(e)}"

