"""Contacts API - REST endpoints for Dashboard.

Uses ContactsService to read from Apple Contacts + extensions.
"""
import asyncio
import logging
from typing import List, Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from . import get_contacts_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["contacts"])


class CreateContactRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    relationship: Optional[str] = None
    context_notes: Optional[str] = None
    value_exchange: Optional[str] = None
    notes: Optional[str] = None
    pinned: bool = False
    tags: Optional[List[str]] = None


class UpdateContactRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    relationship: Optional[str] = None
    context_notes: Optional[str] = None
    value_exchange: Optional[str] = None
    notes: Optional[str] = None
    pinned: Optional[bool] = None
    tags: Optional[List[str]] = None


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking service calls in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


def contact_to_dict(contact) -> dict:
    """Convert Contact model to API response dict."""
    return {
        'id': contact.id,
        'name': contact.name,
        'phone': contact.phone,
        'email': contact.email,
        'company': contact.company,
        'role': contact.role,
        'location': contact.location,
        'description': contact.description,
        'relationship': contact.relationship,
        'context_notes': contact.context_notes,
        'value_exchange': contact.value_exchange,
        'notes': contact.notes,
        'pinned': contact.pinned,
        'tags': list(contact.tags) if contact.tags else [],
        'last_contact_date': contact.last_contact_date,
        'created_at': contact.created_at or '',
        'updated_at': contact.updated_at or '',
    }


@router.get("")
async def contacts_list(
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=10000),
):
    """List contacts from Apple Contacts.

    Args:
        search: Optional search query
        limit: Max results (default 100)
    """
    service = get_contacts_service()

    if search:
        contacts = await _run_blocking(service.search, search, limit=limit)
    else:
        # Get all contacts (search with empty returns all)
        contacts = await _run_blocking(service.search, "", limit=limit)

    return [contact_to_dict(c) for c in contacts]


@router.get("/{contact_id}")
async def contact_detail(contact_id: str):
    """Get a single contact by ID."""
    contact_id = unquote(contact_id)
    service = get_contacts_service()

    contact = await _run_blocking(service.get, contact_id)
    if not contact:
        # Try finding by name
        contact = await _run_blocking(service.find, contact_id)

    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    return contact_to_dict(contact)


@router.post("", status_code=201)
async def create_contact(request: CreateContactRequest):
    """Create a new contact."""
    service = get_contacts_service()

    try:
        contact = await _run_blocking(
            service.create,
            name=request.name,
            phone=request.phone,
            email=request.email,
            company=request.company,
            role=request.role,
            location=request.location,
            description=request.description,
            relationship=request.relationship,
            context_notes=request.context_notes,
            value_exchange=request.value_exchange,
            notes=request.notes,
            pinned=request.pinned,
            tags=request.tags,
        )
        return contact_to_dict(contact)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{contact_id}")
async def update_contact(contact_id: str, request: UpdateContactRequest):
    """Update an existing contact (partial update)."""
    contact_id = unquote(contact_id)
    service = get_contacts_service()

    # Only pass non-None fields
    kwargs = {k: v for k, v in request.model_dump().items() if v is not None}
    if not kwargs:
        raise HTTPException(status_code=400, detail="No fields to update")

    contact = await _run_blocking(service.update, contact_id, **kwargs)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    return contact_to_dict(contact)
