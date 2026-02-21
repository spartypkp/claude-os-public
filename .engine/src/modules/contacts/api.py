"""Contacts API - REST endpoints for Dashboard.

Uses StandaloneContactsRepository for all contact operations.
"""
import asyncio
import logging
from typing import List, Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.mcp_helpers import get_services
from .standalone import StandaloneContactsRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["contacts"])


def _get_repo() -> StandaloneContactsRepository:
    """Get a StandaloneContactsRepository instance."""
    services = get_services()
    return StandaloneContactsRepository(services.storage)


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
    current_state: Optional[str] = None
    linkedin_url: Optional[str] = None
    contact_cadence: Optional[int] = None


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking service calls in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


def _contact_dict_to_response(contact: dict) -> dict:
    """Normalize a contact dict for API response."""
    return {
        'id': contact.get('id', ''),
        'name': contact.get('name', ''),
        'phone': contact.get('phone'),
        'email': contact.get('email'),
        'company': contact.get('company'),
        'role': contact.get('role'),
        'location': contact.get('location'),
        'description': contact.get('description'),
        'relationship': contact.get('relationship'),
        'context_notes': contact.get('context_notes'),
        'value_exchange': contact.get('value_exchange'),
        'notes': contact.get('notes'),
        'pinned': bool(contact.get('pinned', False)),
        'tags': [],
        'last_contact_date': contact.get('last_contact_date'),
        'current_state': contact.get('current_state'),
        'linkedin_url': contact.get('linkedin_url'),
        'contact_cadence': contact.get('contact_cadence'),
        'created_at': contact.get('created_at', ''),
        'updated_at': contact.get('updated_at', ''),
    }


@router.get("/stale")
async def contacts_stale(limit: int = Query(50, ge=1, le=500)):
    """Get contacts sorted by relationship staleness.

    Returns contacts with cadence set or pinned, annotated with
    days_since_contact and status (on_track/overdue/way_overdue/no_cadence).
    """
    repo = _get_repo()
    results = await _run_blocking(repo.list_stale, limit)

    # Enrich with tags
    for contact in results:
        contact["tags"] = await _run_blocking(repo.get_tags, contact["id"])
        contact["pinned"] = bool(contact.get("pinned", False))

    return results


@router.get("/graph")
async def contacts_graph(limit: int = Query(200, ge=1, le=1000)):
    """Get social graph data — nodes and edges for visualization.

    Nodes are contacts with at least one connection or pinned status.
    Edges are inferred from shared company and shared tags.
    """
    repo = _get_repo()
    data = await _run_blocking(repo.get_graph_data, limit)
    return data


@router.get("")
async def contacts_list(
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=10000),
):
    """List contacts.

    Args:
        search: Optional search query
        limit: Max results (default 100)
    """
    repo = _get_repo()
    results = await _run_blocking(repo.search, search or "", limit)

    # Enrich with tags
    enriched = []
    for contact in results:
        resp = _contact_dict_to_response(contact)
        tags = await _run_blocking(repo.get_tags, contact['id'])
        resp['tags'] = tags
        enriched.append(resp)

    return enriched


@router.get("/{contact_id}")
async def contact_detail(contact_id: str):
    """Get a single contact by ID."""
    contact_id = unquote(contact_id)
    repo = _get_repo()

    contact = await _run_blocking(repo.get, contact_id)
    if not contact:
        contact = await _run_blocking(repo.find, contact_id)

    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    resp = _contact_dict_to_response(contact)
    resp['tags'] = await _run_blocking(repo.get_tags, contact['id'])
    return resp


@router.post("", status_code=201)
async def create_contact(request: CreateContactRequest):
    """Create a new contact."""
    repo = _get_repo()

    try:
        contact = await _run_blocking(
            repo.create,
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
        )

        if request.tags:
            await _run_blocking(repo.replace_tags, contact['id'], request.tags)

        resp = _contact_dict_to_response(contact)
        resp['tags'] = request.tags or []
        return resp
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{contact_id}")
async def update_contact(contact_id: str, request: UpdateContactRequest):
    """Update an existing contact (partial update)."""
    contact_id = unquote(contact_id)
    repo = _get_repo()

    # Check contact exists
    existing = await _run_blocking(repo.get, contact_id)
    if not existing:
        existing = await _run_blocking(repo.find, contact_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")

    actual_id = existing['id']

    # Build update kwargs (exclude tags - handled separately)
    kwargs = {}
    for k, v in request.model_dump().items():
        if v is not None and k != 'tags':
            kwargs[k] = v

    if kwargs:
        await _run_blocking(repo.update, actual_id, **kwargs)

    if request.tags is not None:
        await _run_blocking(repo.replace_tags, actual_id, request.tags)

    # Re-fetch updated contact
    updated = await _run_blocking(repo.get, actual_id)
    resp = _contact_dict_to_response(updated)
    resp['tags'] = await _run_blocking(repo.get_tags, actual_id)
    return resp


@router.get("/{contact_id}/history")
async def contact_history(contact_id: str, limit: int = Query(20, ge=1, le=100)):
    """Get interaction history for a contact."""
    contact_id = unquote(contact_id)
    repo = _get_repo()

    contact = await _run_blocking(repo.get, contact_id)
    if not contact:
        contact = await _run_blocking(repo.find, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    entries = await _run_blocking(repo.get_history, contact['id'], limit)
    return entries
