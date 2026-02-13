"""Contacts module - Contact management with Apple Contacts integration.

This module provides:
- Direct-read from Apple Contacts database
- Claude-specific extensions (tags, notes, relationships)
- Provider pattern for multiple contact sources
- Unified contact search and management

Architecture:
- Apple Contacts provides base data (name, phone, email, company)
- Local overlay table stores Claude-specific fields
- Service merges both on read

Usage:
    from modules.contacts import ContactsService, Contact, get_contacts_service

    service = get_contacts_service()
    contacts = service.search("John")
    service.update(contact.id, description="Met at conference")
"""

from .models import Contact, normalize_phone
from .service import ContactsService
from .standalone import StandaloneContactsRepository

# Singleton service
_service: ContactsService | None = None


def get_contacts_service() -> ContactsService:
    """Get or create ContactsService singleton."""
    global _service
    if _service is None:
        from core.config import settings
        from core.storage import SystemStorage
        storage = SystemStorage(settings.db_path)
        _service = ContactsService(storage)
    return _service


__all__ = ['ContactsService', 'Contact', 'normalize_phone', 'StandaloneContactsRepository', 'get_contacts_service']
