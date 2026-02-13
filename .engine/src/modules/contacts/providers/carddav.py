"""CardDAV adapter - Generic protocol for contacts sync.

CardDAV is a standard protocol used by many providers:
- Fastmail, Google (via CardDAV), iCloud, Nextcloud, Synology, etc.

This adapter allows Claude OS to sync contacts with any CardDAV server.

Requirements:
- Server URL
- Username  
- Password (or app-specific password)

Library: Uses vobject for vCard parsing, requests for HTTP
"""

from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from xml.etree import ElementTree as ET

from .base import (
    ContactsAdapter,
    ContactInfo,
    ContactCreate,
    ContactUpdate,
    ProviderType,
)

logger = logging.getLogger(__name__)

# CardDAV XML namespaces
NAMESPACES = {
    'D': 'DAV:',
    'C': 'urn:ietf:params:xml:ns:carddav',
}


class CardDAVAdapter(ContactsAdapter):
    """Adapter for CardDAV-compatible servers.
    
    Supports any server implementing CardDAV:
    - Fastmail: https://carddav.fastmail.com/dav/addressbooks/user/EMAIL/Default
    - Google: https://www.googleapis.com/carddav/v1/principals/EMAIL/lists/default
    - iCloud: https://contacts.icloud.com
    - Nextcloud: https://SERVER/remote.php/dav/addressbooks/users/USER/contacts/
    """
    
    def __init__(
        self,
        url: str,
        username: str,
        password: str,
        name: Optional[str] = None,
    ):
        """Initialize CardDAV adapter.
        
        Args:
            url: CardDAV server URL (addressbook collection)
            username: Account username (usually email)
            password: Account password or app-specific password
            name: Display name for this provider
        """
        self.url = url.rstrip('/')
        self.username = username
        self.password = password
        self._name = name or f"CardDAV ({username})"
        self._contacts_cache: List[ContactInfo] = []
        self._cache_time: Optional[datetime] = None
    
    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.CARDDAV
    
    @property
    def display_name(self) -> str:
        return self._name
    
    def _auth_header(self) -> Dict[str, str]:
        """Get authorization header."""
        auth = base64.b64encode(f"{self.username}:{self.password}".encode()).decode()
        return {
            'Authorization': f'Basic {auth}',
            'Content-Type': 'application/xml; charset=utf-8',
        }
    
    def is_available(self) -> bool:
        """Check if this adapter is configured."""
        return bool(self.url and self.username and self.password)
    
    def _request(
        self,
        method: str,
        url: str,
        data: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Optional[str]:
        """Make an HTTP request to the CardDAV server."""
        try:
            import requests
            
            hdrs = self._auth_header()
            if headers:
                hdrs.update(headers)
            
            response = requests.request(
                method,
                url,
                data=data,
                headers=hdrs,
                timeout=30,
            )
            
            if response.status_code in (200, 201, 204, 207):
                return response.text
            else:
                logger.error(f"CardDAV request failed: {response.status_code} {response.text[:200]}")
                return None
                
        except ImportError:
            logger.error("requests library not installed. Run: pip install requests")
            return None
        except Exception as e:
            logger.error(f"CardDAV request error: {e}")
            return None
    
    def _propfind(self, depth: str = '1') -> Optional[str]:
        """PROPFIND request to list contacts."""
        xml_body = '''<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav">
    <D:prop>
        <D:getetag/>
        <C:address-data/>
    </D:prop>
</D:propfind>'''
        
        return self._request(
            'PROPFIND',
            self.url,
            data=xml_body,
            headers={'Depth': depth},
        )
    
    def _parse_vcard(self, vcard_text: str) -> Optional[ContactInfo]:
        """Parse a vCard string into ContactInfo."""
        try:
            import vobject
            
            vcard = vobject.readOne(vcard_text)
            
            # Get basic info
            uid = getattr(vcard, 'uid', None)
            uid = uid.value if uid else str(uuid.uuid4())
            
            # Name
            fn = getattr(vcard, 'fn', None)
            name = fn.value if fn else ''
            
            n = getattr(vcard, 'n', None)
            first_name = n.value.given if n else None
            last_name = n.value.family if n else None
            
            if not name and (first_name or last_name):
                name = f"{first_name or ''} {last_name or ''}".strip()
            
            # Organization
            org = getattr(vcard, 'org', None)
            company = org.value[0] if org and org.value else None
            
            title = getattr(vcard, 'title', None)
            job_title = title.value if title else None
            
            # Phone numbers
            phones = []
            for tel in vcard.contents.get('tel', []):
                phone_type = 'other'
                if hasattr(tel, 'params') and 'TYPE' in tel.params:
                    types = tel.params['TYPE']
                    if isinstance(types, list):
                        phone_type = types[0].lower() if types else 'other'
                    else:
                        phone_type = types.lower()
                phones.append({'type': phone_type, 'value': tel.value})
            
            # Emails
            emails = []
            for email in vcard.contents.get('email', []):
                email_type = 'other'
                if hasattr(email, 'params') and 'TYPE' in email.params:
                    types = email.params['TYPE']
                    if isinstance(types, list):
                        email_type = types[0].lower() if types else 'other'
                    else:
                        email_type = types.lower()
                emails.append({'type': email_type, 'value': email.value})
            
            # Addresses
            addresses = []
            for adr in vcard.contents.get('adr', []):
                addr = {}
                if adr.value.street:
                    addr['street'] = adr.value.street
                if adr.value.city:
                    addr['city'] = adr.value.city
                if adr.value.region:
                    addr['state'] = adr.value.region
                if adr.value.code:
                    addr['zip'] = adr.value.code
                if adr.value.country:
                    addr['country'] = adr.value.country
                if hasattr(adr, 'params') and 'TYPE' in adr.params:
                    types = adr.params['TYPE']
                    addr['type'] = types[0].lower() if isinstance(types, list) else types.lower()
                if addr:
                    addresses.append(addr)
            
            # Notes
            note = getattr(vcard, 'note', None)
            notes = note.value if note else None
            
            # Birthday
            bday = getattr(vcard, 'bday', None)
            birthday = bday.value if bday else None
            
            return ContactInfo(
                id=uid,
                name=name or 'Unknown',
                provider=ProviderType.CARDDAV,
                first_name=first_name,
                last_name=last_name,
                phones=phones,
                emails=emails,
                company=company,
                job_title=job_title,
                addresses=addresses,
                notes=notes,
                birthday=str(birthday) if birthday else None,
                external_id=uid,
            )
            
        except ImportError:
            logger.error("vobject library not installed. Run: pip install vobject")
            return None
        except Exception as e:
            logger.warning(f"Failed to parse vCard: {e}")
            return None
    
    def _contact_to_vcard(self, contact: ContactCreate) -> str:
        """Convert ContactCreate to vCard format."""
        try:
            import vobject
            
            vcard = vobject.vCard()
            
            # UID
            uid = vcard.add('uid')
            uid.value = str(uuid.uuid4())
            
            # Full name
            fn = vcard.add('fn')
            fn.value = contact.name
            
            # Structured name
            n = vcard.add('n')
            first = contact.first_name or (contact.name.split()[0] if contact.name else '')
            last = contact.last_name or (' '.join(contact.name.split()[1:]) if contact.name else '')
            n.value = vobject.vcard.Name(given=first, family=last)
            
            # Organization
            if contact.company:
                org = vcard.add('org')
                org.value = [contact.company]
            
            if contact.job_title:
                title = vcard.add('title')
                title.value = contact.job_title
            
            # Phones
            for phone in contact.phones:
                tel = vcard.add('tel')
                tel.value = phone.get('value', '')
                tel.type_param = phone.get('type', 'other').upper()
            
            # Emails
            for email in contact.emails:
                em = vcard.add('email')
                em.value = email.get('value', '')
                em.type_param = email.get('type', 'other').upper()
            
            # Notes
            if contact.notes:
                note = vcard.add('note')
                note.value = contact.notes
            
            return vcard.serialize()
            
        except ImportError:
            # Fallback to manual vCard generation
            lines = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                f'UID:{uuid.uuid4()}',
                f'FN:{contact.name}',
            ]
            
            first = contact.first_name or (contact.name.split()[0] if contact.name else '')
            last = contact.last_name or ''
            lines.append(f'N:{last};{first};;;')
            
            if contact.company:
                lines.append(f'ORG:{contact.company}')
            
            if contact.job_title:
                lines.append(f'TITLE:{contact.job_title}')
            
            for phone in contact.phones:
                ptype = phone.get('type', 'OTHER').upper()
                lines.append(f'TEL;TYPE={ptype}:{phone.get("value", "")}')
            
            for email in contact.emails:
                etype = email.get('type', 'OTHER').upper()
                lines.append(f'EMAIL;TYPE={etype}:{email.get("value", "")}')
            
            if contact.notes:
                lines.append(f'NOTE:{contact.notes}')
            
            lines.append('END:VCARD')
            return '\r\n'.join(lines)
    
    def get_contacts(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ContactInfo]:
        """Get all contacts from CardDAV server."""
        response = self._propfind()
        if not response:
            return []
        
        try:
            # Parse the MultiStatus response
            root = ET.fromstring(response)
            contacts = []
            
            for response_elem in root.findall('.//D:response', NAMESPACES):
                # Get vCard data
                address_data = response_elem.find('.//C:address-data', NAMESPACES)
                if address_data is not None and address_data.text:
                    contact = self._parse_vcard(address_data.text)
                    if contact:
                        contacts.append(contact)
            
            # Apply offset and limit
            return contacts[offset:offset + limit]
            
        except Exception as e:
            logger.error(f"Failed to parse CardDAV response: {e}")
            return []
    
    def get_contact(self, contact_id: str) -> Optional[ContactInfo]:
        """Get a single contact by ID."""
        # CardDAV doesn't have a direct get-by-id, so we search
        contacts = self.get_contacts(limit=500)
        return next((c for c in contacts if c.id == contact_id), None)
    
    def search_contacts(
        self,
        query: str,
        limit: int = 20,
    ) -> List[ContactInfo]:
        """Search contacts by name, phone, or email."""
        contacts = self.get_contacts(limit=500)
        query_lower = query.lower()
        
        results = []
        for contact in contacts:
            if query_lower in contact.name.lower():
                results.append(contact)
                continue
            
            for phone in contact.phones:
                if query in phone.get('value', ''):
                    results.append(contact)
                    break
            
            for email in contact.emails:
                if query_lower in email.get('value', '').lower():
                    results.append(contact)
                    break
        
        return results[:limit]
    
    def create_contact(self, contact: ContactCreate) -> Optional[ContactInfo]:
        """Create a new contact on the CardDAV server."""
        vcard = self._contact_to_vcard(contact)
        uid = str(uuid.uuid4())
        contact_url = f"{self.url}/{uid}.vcf"
        
        response = self._request(
            'PUT',
            contact_url,
            data=vcard,
            headers={'Content-Type': 'text/vcard; charset=utf-8'},
        )
        
        if response is not None:
            # Fetch the created contact
            return self.get_contact(uid)
        return None
    
    def update_contact(
        self,
        contact_id: str,
        update: ContactUpdate,
    ) -> Optional[ContactInfo]:
        """Update a contact on the CardDAV server."""
        # Get existing contact
        existing = self.get_contact(contact_id)
        if not existing:
            return None
        
        # Merge updates
        create_data = ContactCreate(
            name=update.name or existing.name,
            first_name=update.first_name if update.first_name is not None else existing.first_name,
            last_name=update.last_name if update.last_name is not None else existing.last_name,
            phones=update.phones if update.phones is not None else existing.phones,
            emails=update.emails if update.emails is not None else existing.emails,
            company=update.company if update.company is not None else existing.company,
            job_title=update.job_title if update.job_title is not None else existing.job_title,
            notes=update.notes if update.notes is not None else existing.notes,
        )
        
        vcard = self._contact_to_vcard(create_data)
        contact_url = f"{self.url}/{contact_id}.vcf"
        
        response = self._request(
            'PUT',
            contact_url,
            data=vcard,
            headers={'Content-Type': 'text/vcard; charset=utf-8'},
        )
        
        if response is not None:
            return self.get_contact(contact_id)
        return None
    
    def delete_contact(self, contact_id: str) -> bool:
        """Delete a contact from the CardDAV server."""
        contact_url = f"{self.url}/{contact_id}.vcf"
        
        response = self._request('DELETE', contact_url)
        return response is not None
    
    def test_connection(self) -> tuple[bool, str]:
        """Test connection to CardDAV server."""
        if not self.is_available():
            return False, "Missing URL, username, or password"
        
        response = self._propfind(depth='0')
        if response:
            return True, f"Connected to {self.url}"
        return False, "Failed to connect to CardDAV server"

