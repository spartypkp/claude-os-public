"""Contacts module - Contact management via SQLite.

Usage:
    from modules.contacts import StandaloneContactsRepository, Contact, normalize_phone
"""

from .models import Contact, normalize_phone
from .standalone import StandaloneContactsRepository

__all__ = ['Contact', 'normalize_phone', 'StandaloneContactsRepository']
