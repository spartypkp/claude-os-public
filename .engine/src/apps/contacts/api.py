"""Contacts API - HTTP routes for contact management.

Direct-read pattern: reads from Apple Contacts, Claude extensions in local DB.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from utils.event_bus import emit_contact_created, emit_contact_updated, emit_contact_deleted

router = APIRouter()

# Service will be injected by the plugin
_service = None


def set_service(service):
    """Set the contacts service (called by plugin)."""
    global _service
    _service = service


def get_service():
    """Get the contacts service."""
    if _service is None:
        raise RuntimeError("ContactsService not initialized")
    return _service


# === Request/Response Models ===

class ContactCreate(BaseModel):
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


class ContactUpdate(BaseModel):
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


class ContactResponse(BaseModel):
    id: str
    name: str
    phone: Optional[str]
    email: Optional[str]
    company: Optional[str]
    role: Optional[str]
    location: Optional[str]
    description: Optional[str]
    relationship: Optional[str]
    context_notes: Optional[str]
    value_exchange: Optional[str]
    notes: Optional[str]
    pinned: bool
    tags: List[str]
    last_contact_date: Optional[str]
    created_at: str
    updated_at: str


class ContactListItem(BaseModel):
    id: str
    name: str
    phone: Optional[str]
    description: Optional[str]
    pinned: bool
    tags: List[str]


# === Routes ===

@router.get("", response_model=List[ContactListItem])
async def list_contacts(
    search: Optional[str] = Query(None, description="Search query"),
    pinned: Optional[bool] = Query(None, description="Filter by pinned status"),
    relationship: Optional[str] = Query(None, description="Filter by relationship"),
    limit: int = Query(20, ge=1, le=10000),
):
    """List contacts with optional filters."""
    service = get_service()

    if search:
        contacts = service.search(search, limit=limit)
    elif pinned:
        contacts = service.list_pinned(limit=limit)
    elif relationship:
        contacts = service.list_by_relationship(relationship, limit=limit)
    else:
        # Default: all contacts
        contacts = service.list(limit=limit)

    return [
        ContactListItem(
            id=c.id[:8],
            name=c.name,
            phone=c.phone,
            description=c.description,
            pinned=c.pinned,
            tags=list(c.tags),
        )
        for c in contacts
    ]


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(contact_id: str):
    """Get a specific contact by ID (supports short IDs)."""
    service = get_service()

    # Get by ID (supports both full and short IDs)
    contact = service.get(contact_id)

    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    return ContactResponse(
        id=contact.id,
        name=contact.name,
        phone=contact.phone,
        email=contact.email,
        company=contact.company,
        role=contact.role,
        location=contact.location,
        description=contact.description,
        relationship=contact.relationship,
        context_notes=contact.context_notes,
        value_exchange=contact.value_exchange,
        notes=contact.notes,
        pinned=contact.pinned,
        tags=list(contact.tags),
        last_contact_date=contact.last_contact_date,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


@router.post("", response_model=ContactResponse, status_code=201)
async def create_contact(data: ContactCreate):
    """Create a new contact."""
    service = get_service()
    
    try:
        contact = service.create(
            name=data.name,
            phone=data.phone,
            email=data.email,
            company=data.company,
            role=data.role,
            location=data.location,
            description=data.description,
            relationship=data.relationship,
            context_notes=data.context_notes,
            value_exchange=data.value_exchange,
            notes=data.notes,
            pinned=data.pinned,
            tags=data.tags,
        )

        # Emit event for Dashboard real-time update
        await emit_contact_created(
            contact_id=contact.id,
            name=contact.name,
        )

        return ContactResponse(
            id=contact.id,
            name=contact.name,
            phone=contact.phone,
            email=contact.email,
            company=contact.company,
            role=contact.role,
            location=contact.location,
            description=contact.description,
            relationship=contact.relationship,
            context_notes=contact.context_notes,
            value_exchange=contact.value_exchange,
            notes=contact.notes,
            pinned=contact.pinned,
            tags=list(contact.tags),
            last_contact_date=contact.last_contact_date,
            created_at=contact.created_at,
            updated_at=contact.updated_at,
        )
    except Exception as e:
        if "UNIQUE constraint failed: contacts.phone" in str(e):
            raise HTTPException(status_code=400, detail="Phone number already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{contact_id}", response_model=ContactResponse)
async def update_contact(contact_id: str, data: ContactUpdate):
    """Update an existing contact."""
    service = get_service()
    
    # Find by short ID or full ID
    existing = service.find(contact_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    try:
        contact = service.update(
            contact_id=existing.id,
            name=data.name,
            phone=data.phone,
            email=data.email,
            company=data.company,
            role=data.role,
            location=data.location,
            description=data.description,
            relationship=data.relationship,
            context_notes=data.context_notes,
            value_exchange=data.value_exchange,
            notes=data.notes,
            pinned=data.pinned,
            tags=data.tags,
        )

        # Emit event for Dashboard real-time update
        await emit_contact_updated(
            contact_id=contact.id,
        )

        return ContactResponse(
            id=contact.id,
            name=contact.name,
            phone=contact.phone,
            email=contact.email,
            company=contact.company,
            role=contact.role,
            location=contact.location,
            description=contact.description,
            relationship=contact.relationship,
            context_notes=contact.context_notes,
            value_exchange=contact.value_exchange,
            notes=contact.notes,
            pinned=contact.pinned,
            tags=list(contact.tags),
            last_contact_date=contact.last_contact_date,
            created_at=contact.created_at,
            updated_at=contact.updated_at,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(contact_id: str):
    """Delete a contact."""
    service = get_service()

    # Find by short ID or full ID
    existing = service.find(contact_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")

    service.delete(existing.id)

    # Emit event for Dashboard real-time update
    await emit_contact_deleted(
        contact_id=existing.id,
    )


@router.get("/tags", response_model=List[str])
async def list_tags():
    """Get all unique contact tags."""
    service = get_service()
    return service.get_all_tags()

