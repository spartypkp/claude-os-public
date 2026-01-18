"""CalDAV adapter - Generic CalDAV server integration.

CalDAV is a standard protocol for calendar access supported by many providers:
- Fastmail
- ProtonMail (via ProtonMail Bridge)
- NextCloud
- Synology Calendar
- iCloud (although Apple adapter is preferred on macOS)
- Yahoo Calendar
- Any CalDAV-compatible server

Requirements:
- caldav Python package: pip install caldav

Config:
    {
        "url": "https://caldav.example.com/calendars/user@example.com/",
        "username": "user@example.com",
        "password": "app-password-or-regular-password"
    }

Provider-specific URLs:
- Fastmail: https://caldav.fastmail.com/dav/calendars/user/{username}/
- iCloud: https://caldav.icloud.com/{dsid}/calendars/
- NextCloud: https://your-nextcloud.com/remote.php/dav/calendars/{username}/
"""

from __future__ import annotations

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

# Known CalDAV provider presets
CALDAV_PRESETS = {
    'fastmail': {
        'name': 'Fastmail',
        'url_template': 'https://caldav.fastmail.com/dav/calendars/user/{username}/',
    },
    'nextcloud': {
        'name': 'NextCloud',
        'url_template': 'https://{host}/remote.php/dav/calendars/{username}/',
    },
    'synology': {
        'name': 'Synology Calendar',
        'url_template': 'http://{host}:5000/caldav/{username}/',
    },
    'yahoo': {
        'name': 'Yahoo Calendar',
        'url_template': 'https://caldav.calendar.yahoo.com/dav/{username}/Calendar/',
    },
    'zoho': {
        'name': 'Zoho Calendar',
        'url_template': 'https://calendar.zoho.com/caldav/{username}/',
    },
}


class CalDAVAdapter(CalendarAdapter):
    """CalDAV protocol adapter for generic calendar servers.
    
    Works with any CalDAV-compatible server.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize CalDAV adapter.
        
        Args:
            config: Dictionary with 'url', 'username', 'password'.
        """
        self._config = config or {}
        self._client = None
        self._principal = None
    
    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.CALDAV
    
    @property
    def display_name(self) -> str:
        return "CalDAV"
    
    def _get_client(self):
        """Get or create CalDAV client."""
        if self._client is not None:
            return self._client
        
        try:
            import caldav
            
            url = self._config.get('url')
            username = self._config.get('username')
            password = self._config.get('password')
            
            if not all([url, username, password]):
                logger.warning("CalDAV credentials not configured")
                return None
            
            self._client = caldav.DAVClient(
                url=url,
                username=username,
                password=password,
            )
            
            self._principal = self._client.principal()
            return self._client
            
        except ImportError:
            logger.error("caldav package not installed. Run: pip install caldav")
            return None
        except Exception as e:
            logger.error(f"Failed to connect to CalDAV server: {e}")
            return None
    
    def is_available(self) -> bool:
        """Check if CalDAV is configured and accessible."""
        client = self._get_client()
        if not client:
            return False
        
        try:
            self._principal.calendars()
            return True
        except Exception as e:
            logger.warning(f"CalDAV not available: {e}")
            return False
    
    def get_calendars(self) -> List[CalendarInfo]:
        """Get list of calendars from CalDAV server."""
        client = self._get_client()
        if not client:
            return []
        
        try:
            calendars = []
            for cal in self._principal.calendars():
                calendars.append(CalendarInfo(
                    id=str(cal.url),
                    name=cal.name or str(cal.url).split('/')[-2],
                    provider=ProviderType.CALDAV,
                    writable=True,
                ))
            return calendars
            
        except Exception as e:
            logger.error(f"Failed to get calendars: {e}")
            return []
    
    def _get_calendar(self, calendar_id: Optional[str] = None):
        """Get a specific calendar by ID or the first available."""
        client = self._get_client()
        if not client:
            return None
        
        try:
            calendars = self._principal.calendars()
            if not calendars:
                return None
            
            if calendar_id:
                for cal in calendars:
                    if str(cal.url) == calendar_id or cal.name == calendar_id:
                        return cal
            
            return calendars[0]
            
        except Exception as e:
            logger.error(f"Failed to get calendar: {e}")
            return None
    
    def get_events(
        self,
        calendar_id: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[CalendarEvent]:
        """Get events from CalDAV calendar."""
        cal = self._get_calendar(calendar_id)
        if not cal:
            return []
        
        try:
            # Default date range
            if start is None:
                start = datetime.now() - timedelta(hours=1)
            if end is None:
                end = datetime.now() + timedelta(days=7)
            
            events_result = cal.date_search(start=start, end=end, expand=True)
            events = []
            
            for event in events_result[:limit]:
                parsed = self._parse_event(event, str(cal.url))
                if parsed:
                    events.append(parsed)
            
            return events
            
        except Exception as e:
            logger.error(f"Failed to get events: {e}")
            return []
    
    def _parse_event(self, event, calendar_id: str) -> Optional[CalendarEvent]:
        """Parse a caldav event into CalendarEvent."""
        try:
            import icalendar
            
            vcal = icalendar.Calendar.from_ical(event.data)
            for component in vcal.walk():
                if component.name == 'VEVENT':
                    dtstart = component.get('dtstart')
                    dtend = component.get('dtend')
                    
                    if not dtstart:
                        continue
                    
                    start_val = dtstart.dt
                    end_val = dtend.dt if dtend else start_val
                    
                    # Check if all-day event
                    all_day = not hasattr(start_val, 'hour')
                    
                    if all_day:
                        start = datetime.combine(start_val, datetime.min.time())
                        end = datetime.combine(end_val, datetime.min.time())
                    else:
                        start = start_val if hasattr(start_val, 'astimezone') else datetime.combine(start_val, datetime.min.time())
                        end = end_val if hasattr(end_val, 'astimezone') else datetime.combine(end_val, datetime.min.time())
                    
                    return CalendarEvent(
                        id=str(component.get('uid', uuid4())),
                        summary=str(component.get('summary', '(No title)')),
                        start=start,
                        end=end,
                        all_day=all_day,
                        location=str(component.get('location', '')) or None,
                        description=str(component.get('description', '')) or None,
                        calendar_id=calendar_id,
                        provider=ProviderType.CALDAV,
                        organizer_email=str(component.get('organizer', '')) or None,
                        status=str(component.get('status', 'CONFIRMED')).lower(),
                    )
            
            return None
            
        except Exception as e:
            logger.warning(f"Failed to parse event: {e}")
            return None
    
    def get_event(self, event_id: str, calendar_id: Optional[str] = None) -> Optional[CalendarEvent]:
        """Get a single event by UID."""
        cal = self._get_calendar(calendar_id)
        if not cal:
            return None
        
        try:
            # Search through all events (CalDAV doesn't have direct UID lookup)
            events = cal.events()
            for event in events:
                parsed = self._parse_event(event, str(cal.url))
                if parsed and parsed.id == event_id:
                    return parsed
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get event: {e}")
            return None
    
    def create_event(self, event: EventCreate) -> Optional[CalendarEvent]:
        """Create a new event."""
        cal = self._get_calendar(event.calendar_id)
        if not cal:
            return None
        
        try:
            import icalendar
            
            vcal = icalendar.Calendar()
            vcal.add('prodid', '-//Claude OS Calendar//claude-os.local//')
            vcal.add('version', '2.0')
            
            vevent = icalendar.Event()
            uid = str(uuid4())
            vevent.add('uid', uid)
            vevent.add('summary', event.summary)
            vevent.add('dtstamp', datetime.now())
            
            if event.all_day:
                vevent.add('dtstart', event.start.date())
                vevent.add('dtend', event.end.date())
            else:
                vevent.add('dtstart', event.start)
                vevent.add('dtend', event.end)
            
            if event.location:
                vevent.add('location', event.location)
            if event.description:
                vevent.add('description', event.description)
            if event.recurrence_rule:
                vevent.add('rrule', icalendar.vRecur.from_ical(event.recurrence_rule))
            
            vcal.add_component(vevent)
            
            cal.save_event(vcal.to_ical().decode())
            
            # Return the created event
            return CalendarEvent(
                id=uid,
                summary=event.summary,
                start=event.start,
                end=event.end,
                all_day=event.all_day,
                location=event.location,
                description=event.description,
                calendar_id=str(cal.url),
                provider=ProviderType.CALDAV,
            )
            
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
        cal = self._get_calendar(calendar_id)
        if not cal:
            return None
        
        try:
            import icalendar
            
            # Find the event
            events = cal.events()
            target_event = None
            
            for event in events:
                vcal = icalendar.Calendar.from_ical(event.data)
                for component in vcal.walk():
                    if component.name == 'VEVENT' and str(component.get('uid')) == event_id:
                        target_event = event
                        break
            
            if not target_event:
                return None
            
            # Parse and update
            vcal = icalendar.Calendar.from_ical(target_event.data)
            
            for component in vcal.walk():
                if component.name == 'VEVENT':
                    if update.summary is not None:
                        component['summary'] = update.summary
                    if update.location is not None:
                        component['location'] = update.location
                    if update.description is not None:
                        component['description'] = update.description
                    if update.start is not None:
                        if update.all_day:
                            component['dtstart'] = icalendar.vDate(update.start.date())
                        else:
                            component['dtstart'] = icalendar.vDatetime(update.start)
                    if update.end is not None:
                        if update.all_day:
                            component['dtend'] = icalendar.vDate(update.end.date())
                        else:
                            component['dtend'] = icalendar.vDatetime(update.end)
            
            target_event.save()
            
            return self.get_event(event_id, calendar_id)
            
        except Exception as e:
            logger.error(f"Failed to update event: {e}")
            return None
    
    def delete_event(self, event_id: str, calendar_id: Optional[str] = None) -> bool:
        """Delete an event."""
        cal = self._get_calendar(calendar_id)
        if not cal:
            return False
        
        try:
            import icalendar
            
            events = cal.events()
            for event in events:
                vcal = icalendar.Calendar.from_ical(event.data)
                for component in vcal.walk():
                    if component.name == 'VEVENT' and str(component.get('uid')) == event_id:
                        event.delete()
                        return True
            
            return False
            
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
        # CalDAV doesn't have native text search, so we fetch and filter
        events = self.get_events(start=start, end=end, limit=limit * 5)
        
        query_lower = query.lower()
        results = []
        
        for event in events:
            if query_lower in event.summary.lower():
                results.append(event)
                if len(results) >= limit:
                    break
            elif event.description and query_lower in event.description.lower():
                results.append(event)
                if len(results) >= limit:
                    break
        
        return results
    
    def test_connection(self) -> tuple[bool, str]:
        """Test CalDAV connection."""
        if not self._config:
            return False, "CalDAV not configured. Add server URL and credentials in Settings."
        
        client = self._get_client()
        if not client:
            return False, "Failed to connect to CalDAV server. Check URL and credentials."
        
        try:
            calendars = self._principal.calendars()
            count = len(calendars)
            return True, f"Connected to CalDAV server with {count} calendar(s)"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"


def get_preset_url(preset: str, **kwargs) -> Optional[str]:
    """Get CalDAV URL from a preset template.
    
    Args:
        preset: Preset name (fastmail, nextcloud, etc.)
        **kwargs: Template variables (username, host, etc.)
    
    Returns:
        Formatted URL or None if preset not found.
    """
    if preset not in CALDAV_PRESETS:
        return None
    
    template = CALDAV_PRESETS[preset]['url_template']
    try:
        return template.format(**kwargs)
    except KeyError as e:
        logger.error(f"Missing template variable: {e}")
        return None

