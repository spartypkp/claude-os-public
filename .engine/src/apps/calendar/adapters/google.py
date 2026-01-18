"""Google Calendar adapter - Google Calendar API integration.

This adapter uses the Google Calendar API for full-featured access:
- Multiple calendars per account
- Full event CRUD
- Recurring events
- Attendees and notifications

Requirements:
- Google Cloud project with Calendar API enabled
- OAuth2 credentials (client_id, client_secret)
- User authorization (refresh_token)

Setup:
1. Create project at https://console.cloud.google.com
2. Enable Google Calendar API
3. Create OAuth2 credentials (Desktop app)
4. Run authorization flow to get refresh_token
5. Store credentials in calendar_accounts table
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .base import (
    CalendarAdapter,
    CalendarEvent,
    CalendarInfo,
    EventCreate,
    EventUpdate,
    ProviderType,
)

logger = logging.getLogger(__name__)

# Google Calendar API scopes
SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
]


class GoogleCalendarAdapter(CalendarAdapter):
    """Google Calendar API adapter.
    
    Provides full Google Calendar integration.
    
    Config required in calendar_accounts:
        {
            "client_id": "your-client-id.apps.googleusercontent.com",
            "client_secret": "your-client-secret",
            "refresh_token": "user-refresh-token"
        }
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize Google Calendar adapter.
        
        Args:
            config: OAuth2 credentials dict.
        """
        self._config = config or {}
        self._service = None
        self._credentials = None
    
    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.GOOGLE
    
    @property
    def display_name(self) -> str:
        return "Google Calendar"
    
    def _get_service(self):
        """Get or create Google Calendar API service."""
        if self._service is not None:
            return self._service
        
        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
            
            if not all(k in self._config for k in ['client_id', 'client_secret', 'refresh_token']):
                logger.warning("Google Calendar credentials not configured")
                return None
            
            self._credentials = Credentials(
                token=None,
                refresh_token=self._config['refresh_token'],
                token_uri='https://oauth2.googleapis.com/token',
                client_id=self._config['client_id'],
                client_secret=self._config['client_secret'],
                scopes=SCOPES,
            )
            
            self._service = build('calendar', 'v3', credentials=self._credentials)
            return self._service
            
        except ImportError:
            logger.error("google-api-python-client not installed. Run: pip install google-api-python-client google-auth")
            return None
        except Exception as e:
            logger.error(f"Failed to initialize Google Calendar service: {e}")
            return None
    
    def is_available(self) -> bool:
        """Check if Google Calendar is configured and accessible."""
        service = self._get_service()
        if not service:
            return False
        
        try:
            service.calendarList().list(maxResults=1).execute()
            return True
        except Exception as e:
            logger.warning(f"Google Calendar not available: {e}")
            return False
    
    def get_calendars(self) -> List[CalendarInfo]:
        """Get list of calendars."""
        service = self._get_service()
        if not service:
            return []
        
        try:
            results = service.calendarList().list().execute()
            items = results.get('items', [])
            
            calendars = []
            for item in items:
                calendars.append(CalendarInfo(
                    id=item['id'],
                    name=item.get('summary', item['id']),
                    color=item.get('backgroundColor'),
                    provider=ProviderType.GOOGLE,
                    writable=item.get('accessRole') in ['owner', 'writer'],
                    primary=item.get('primary', False),
                ))
            
            return calendars
            
        except Exception as e:
            logger.error(f"Failed to get calendars: {e}")
            return []
    
    def get_events(
        self,
        calendar_id: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[CalendarEvent]:
        """Get events from Google Calendar."""
        service = self._get_service()
        if not service:
            return []
        
        try:
            # Default date range
            if start is None:
                start = datetime.now(timezone.utc)
            if end is None:
                end = start.replace(day=start.day + 7)
            
            # Format times for Google API
            time_min = start.isoformat() if start.tzinfo else start.astimezone().isoformat()
            time_max = end.isoformat() if end.tzinfo else end.astimezone().isoformat()
            
            cal_id = calendar_id or 'primary'
            
            results = service.events().list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=limit,
                singleEvents=True,
                orderBy='startTime',
            ).execute()
            
            items = results.get('items', [])
            events = []
            
            for item in items:
                event = self._parse_event(item, cal_id)
                if event:
                    events.append(event)
            
            return events
            
        except Exception as e:
            logger.error(f"Failed to get events: {e}")
            return []
    
    def _parse_event(self, item: Dict[str, Any], calendar_id: str) -> Optional[CalendarEvent]:
        """Parse a Google Calendar event into CalendarEvent."""
        try:
            # Parse start/end
            start_data = item.get('start', {})
            end_data = item.get('end', {})
            
            all_day = 'date' in start_data
            
            if all_day:
                start = datetime.fromisoformat(start_data['date'])
                end = datetime.fromisoformat(end_data['date'])
            else:
                start = datetime.fromisoformat(start_data.get('dateTime', ''))
                end = datetime.fromisoformat(end_data.get('dateTime', ''))
            
            # Parse organizer
            organizer = item.get('organizer', {})
            
            # Parse attendees
            attendees = []
            for att in item.get('attendees', []):
                attendees.append({
                    'email': att.get('email'),
                    'name': att.get('displayName'),
                    'response': att.get('responseStatus'),
                })
            
            return CalendarEvent(
                id=item['id'],
                summary=item.get('summary', '(No title)'),
                start=start,
                end=end,
                all_day=all_day,
                location=item.get('location'),
                description=item.get('description'),
                calendar_id=calendar_id,
                provider=ProviderType.GOOGLE,
                organizer_email=organizer.get('email'),
                organizer_name=organizer.get('displayName'),
                attendees=attendees,
                status=item.get('status', 'confirmed'),
                recurrence_rule=item.get('recurrence', [None])[0] if item.get('recurrence') else None,
                recurring_event_id=item.get('recurringEventId'),
                etag=item.get('etag'),
            )
            
        except Exception as e:
            logger.warning(f"Failed to parse event: {e}")
            return None
    
    def get_event(self, event_id: str, calendar_id: Optional[str] = None) -> Optional[CalendarEvent]:
        """Get a single event by ID."""
        service = self._get_service()
        if not service:
            return None
        
        try:
            cal_id = calendar_id or 'primary'
            item = service.events().get(calendarId=cal_id, eventId=event_id).execute()
            return self._parse_event(item, cal_id)
            
        except Exception as e:
            logger.error(f"Failed to get event: {e}")
            return None
    
    def create_event(self, event: EventCreate) -> Optional[CalendarEvent]:
        """Create a new event."""
        service = self._get_service()
        if not service:
            return None
        
        try:
            cal_id = event.calendar_id or 'primary'
            
            # Build event body
            body: Dict[str, Any] = {
                'summary': event.summary,
            }
            
            if event.all_day:
                body['start'] = {'date': event.start.strftime('%Y-%m-%d')}
                body['end'] = {'date': event.end.strftime('%Y-%m-%d')}
            else:
                body['start'] = {'dateTime': event.start.isoformat()}
                body['end'] = {'dateTime': event.end.isoformat()}
            
            if event.location:
                body['location'] = event.location
            if event.description:
                body['description'] = event.description
            if event.recurrence_rule:
                body['recurrence'] = [event.recurrence_rule]
            if event.attendees:
                body['attendees'] = [{'email': e} for e in event.attendees]
            
            result = service.events().insert(calendarId=cal_id, body=body).execute()
            return self._parse_event(result, cal_id)
            
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
        service = self._get_service()
        if not service:
            return None
        
        try:
            cal_id = calendar_id or 'primary'
            
            # Get existing event
            existing = service.events().get(calendarId=cal_id, eventId=event_id).execute()
            
            # Apply updates
            if update.summary is not None:
                existing['summary'] = update.summary
            if update.location is not None:
                existing['location'] = update.location
            if update.description is not None:
                existing['description'] = update.description
            
            if update.start is not None:
                if update.all_day:
                    existing['start'] = {'date': update.start.strftime('%Y-%m-%d')}
                else:
                    existing['start'] = {'dateTime': update.start.isoformat()}
            
            if update.end is not None:
                if update.all_day:
                    existing['end'] = {'date': update.end.strftime('%Y-%m-%d')}
                else:
                    existing['end'] = {'dateTime': update.end.isoformat()}
            
            result = service.events().update(
                calendarId=cal_id,
                eventId=event_id,
                body=existing
            ).execute()
            
            return self._parse_event(result, cal_id)
            
        except Exception as e:
            logger.error(f"Failed to update event: {e}")
            return None
    
    def delete_event(self, event_id: str, calendar_id: Optional[str] = None) -> bool:
        """Delete an event."""
        service = self._get_service()
        if not service:
            return False
        
        try:
            cal_id = calendar_id or 'primary'
            service.events().delete(calendarId=cal_id, eventId=event_id).execute()
            return True
            
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
        """Search for events."""
        service = self._get_service()
        if not service:
            return []
        
        try:
            # Default date range
            if start is None:
                start = datetime.now(timezone.utc).replace(month=1, day=1)
            if end is None:
                end = datetime.now(timezone.utc).replace(month=12, day=31)
            
            time_min = start.isoformat() if start.tzinfo else start.astimezone().isoformat()
            time_max = end.isoformat() if end.tzinfo else end.astimezone().isoformat()
            
            results = service.events().list(
                calendarId='primary',
                timeMin=time_min,
                timeMax=time_max,
                maxResults=limit,
                singleEvents=True,
                orderBy='startTime',
                q=query,
            ).execute()
            
            items = results.get('items', [])
            return [e for e in (self._parse_event(i, 'primary') for i in items) if e]
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
    
    def test_connection(self) -> tuple[bool, str]:
        """Test Google Calendar connection."""
        if not self._config:
            return False, "Google Calendar not configured. Add OAuth2 credentials in Settings."
        
        service = self._get_service()
        if not service:
            return False, "Failed to initialize Google Calendar service. Check credentials."
        
        try:
            result = service.calendarList().get(calendarId='primary').execute()
            email = result.get('summary', 'unknown')
            return True, f"Connected as {email}"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"


# === OAuth2 Helper for Initial Setup ===

def get_authorization_url(client_id: str, redirect_uri: str = 'urn:ietf:wg:oauth:2.0:oob') -> str:
    """Get the OAuth2 authorization URL for user consent."""
    from urllib.parse import urlencode
    
    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent',
    }
    
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def exchange_code_for_tokens(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str = 'urn:ietf:wg:oauth:2.0:oob'
) -> Dict[str, str]:
    """Exchange authorization code for tokens."""
    import requests
    
    response = requests.post('https://oauth2.googleapis.com/token', data={
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    })
    
    return response.json()

