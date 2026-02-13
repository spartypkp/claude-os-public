"""Contacts MCP tool - People database with relationship context."""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_services, normalize_phone
from .standalone import StandaloneContactsRepository

mcp = FastMCP("life-contacts")


def _notify_backend_event(event_type: str, data: dict = None):
    """Notify the backend to emit an SSE event for real-time Dashboard updates."""
    import urllib.request
    import json as json_module

    session_id = os.environ.get("CLAUDE_SESSION_ID", "unknown")
    payload = {
        "event_type": event_type,
        "session_id": session_id,
        "data": data or {}
    }

    try:
        req = urllib.request.Request(
            "http://localhost:5001/api/sessions/notify-event",
            data=json_module.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=1)
    except Exception:
        pass  # Best effort - don't fail the tool if notification fails


@mcp.tool()
def contact(
    operation: str,
    query: Optional[str] = None,
    identifier: Optional[str] = None,
    source_identifier: Optional[str] = None,
    target_identifier: Optional[str] = None,
    name: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    company: Optional[str] = None,
    role: Optional[str] = None,
    location: Optional[str] = None,
    description: Optional[str] = None,
    relationship: Optional[str] = None,
    context_notes: Optional[str] = None,
    value_exchange: Optional[str] = None,
    notes: Optional[str] = None,
    pinned: Optional[bool] = None,
    tags: Optional[List[str]] = None,
    limit: int = 20,
    recent_days: Optional[int] = None,
) -> Dict[str, Any]:
    """Contact management.

    Args:
        operation: Operation - 'search', 'create', 'update', 'enrich', 'merge', 'list'
        query: Search query (required for search)
        identifier: Name, phone, or short ID to find contact (required for update/enrich)
        source_identifier: Source contact to merge (required for merge)
        target_identifier: Target contact to merge into (required for merge)
        name: Display name (required for create)
        phone: Phone number (auto-normalized to E.164)
        email: Email address
        company: Company/organization
        role: Job title/role
        location: Location
        description: One-liner description
        relationship: Relationship type
        context_notes: Context notes
        value_exchange: Value exchange notes
        notes: General notes
        pinned: Pin this contact
        tags: List of tags (replace-all for update, merge for enrich)
        limit: Max results for list (default 20)
        recent_days: For list - contacted in last N days

    Returns:
        Object with success status and contact data

    Examples:
        contact("search", query="Alex")
        contact("create", name="Jane Smith", company="Acme Corp", role="Engineer")
        contact("update", identifier="Alex", notes="Met at conference")
        contact("enrich", identifier="Alex", notes="Great conversation about AI", tags=["ai-research"])
        contact("merge", source_identifier="J Smith", target_identifier="Jane Smith")
        contact("list", pinned=True)
        contact("list", relationship="friend", limit=10)
    """
    try:
        services = get_services()
        repo = StandaloneContactsRepository(services.storage)

        if operation == "search":
            return _contact_search(repo, query, limit)
        elif operation == "create":
            return _contact_create(repo, name, phone, email, company, role, location,
                                   description, relationship, context_notes, value_exchange, notes, pinned, tags)
        elif operation == "update":
            return _contact_update(repo, identifier, name, phone, email, company, role, location,
                                   description, relationship, context_notes, value_exchange, notes, pinned, tags)
        elif operation == "enrich":
            return _contact_enrich(repo, identifier, name, phone, email, company, role, location,
                                   description, relationship, context_notes, value_exchange, notes, pinned, tags)
        elif operation == "merge":
            return _contact_merge(repo, source_identifier, target_identifier)
        elif operation == "list":
            return _contact_list(repo, pinned, relationship, recent_days, limit)
        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use search, create, update, enrich, merge, or list."}

    except sqlite3.IntegrityError as e:
        if "phone" in str(e).lower():
            return {"success": False, "error": f"Phone number already exists: {phone}"}
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _contact_search(repo, query: Optional[str], limit: int) -> Dict[str, Any]:
    if not query:
        return {"success": False, "error": "query required for search"}

    results = repo.search(query, limit)
    contacts = [{
        "id": c["id"][:8],
        "name": c["name"],
        "phone": c.get("phone"),
        "description": c.get("description"),
        "pinned": bool(c.get("pinned", 0))
    } for c in results]
    return {"success": True, "contacts": contacts, "count": len(contacts)}


def _contact_create(repo, name, phone, email, company, role, location,
                    description, relationship, context_notes, value_exchange, notes, pinned, tags) -> Dict[str, Any]:
    if not name:
        return {"success": False, "error": "name required for create"}

    created = repo.create(
        name=name,
        phone=phone,
        email=email,
        company=company,
        role=role,
        location=location,
        description=description,
        relationship=relationship,
        context_notes=context_notes,
        value_exchange=value_exchange,
        notes=notes,
        pinned=pinned or False,
    )

    if tags:
        repo.replace_tags(created["id"], tags)

    # Emit SSE event for real-time Dashboard update
    _notify_backend_event("contact.created", {"id": created["id"][:8], "name": created["name"]})

    return {
        "success": True,
        "id": created["id"][:8],
        "name": created["name"],
        "phone": created.get("phone"),
    }


def _contact_update(repo, identifier, name, phone, email, company, role, location,
                    description, relationship, context_notes, value_exchange, notes, pinned, tags) -> Dict[str, Any]:
    if not identifier:
        return {"success": False, "error": "identifier required for update"}

    found = repo.find(identifier)
    if not found:
        return {"success": False, "error": f"Contact not found: {identifier}"}

    contact_id = found["id"]

    field_count = sum(1 for v in [name, phone, email, company, role, location,
                                  description, relationship, context_notes,
                                  value_exchange, notes, pinned] if v is not None)

    if field_count == 0 and tags is None:
        return {"success": False, "error": "No fields to update"}

    repo.update(
        contact_id=contact_id,
        name=name,
        phone=phone,
        email=email,
        company=company,
        role=role,
        location=location,
        description=description,
        relationship=relationship,
        context_notes=context_notes,
        value_exchange=value_exchange,
        notes=notes,
        pinned=pinned,
    )

    if tags is not None:
        repo.replace_tags(contact_id, tags)

    # Emit SSE event for real-time Dashboard update
    _notify_backend_event("contact.updated", {"id": contact_id[:8], "name": name or found["name"]})

    return {
        "success": True,
        "id": contact_id[:8],
        "name": name or found["name"],
        "fields_updated": field_count,
        "tags_updated": tags is not None,
    }


def _contact_enrich(repo, identifier, name, phone, email, company, role, location,
                    description, relationship, context_notes, value_exchange, notes, pinned, tags) -> Dict[str, Any]:
    if not identifier:
        return {"success": False, "error": "identifier required for enrich"}

    found = repo.find(identifier)
    if not found:
        return {"success": False, "error": f"Contact not found: {identifier}"}

    contact_id = found["id"]
    current = repo.get(contact_id)

    fields_count = repo.enrich(
        contact_id=contact_id,
        current=current,
        name=name,
        phone=phone,
        email=email,
        company=company,
        role=role,
        location=location,
        description=description,
        relationship=relationship,
        context_notes=context_notes,
        value_exchange=value_exchange,
        notes=notes,
        pinned=pinned,
    )

    tags_added = 0
    if tags:
        tags_added = repo.merge_tags(contact_id, tags)

    # Emit SSE event for real-time Dashboard update
    _notify_backend_event("contact.updated", {"id": contact_id[:8], "name": name or found["name"]})

    return {
        "success": True,
        "id": contact_id[:8],
        "name": name or found["name"],
        "fields_updated": fields_count,
        "tags_added": tags_added,
        "mode": "additive",
    }


def _contact_merge(repo, source_identifier, target_identifier) -> Dict[str, Any]:
    if not source_identifier or not target_identifier:
        return {
            "success": False,
            "error": "source_identifier and target_identifier required for merge"
        }

    source = repo.find(source_identifier)
    target = repo.find(target_identifier)

    if not source:
        return {"success": False, "error": f"Source contact not found: {source_identifier}"}
    if not target:
        return {"success": False, "error": f"Target contact not found: {target_identifier}"}

    if source["id"] == target["id"]:
        return {"success": False, "error": "Cannot merge contact with itself"}

    source_id = source["id"]
    target_id = target["id"]

    source_data = repo.get(source_id)
    target_data = repo.get(target_id)

    result = repo.merge(source_id, target_id, source_data, target_data)

    # Emit SSE event for real-time Dashboard update (source deleted, target updated)
    _notify_backend_event("contact.deleted", {"id": source_id[:8], "name": source["name"]})
    _notify_backend_event("contact.updated", {"id": target_id[:8], "name": target["name"]})

    return {
        "success": True,
        "merged_into": target_id[:8],
        "target_name": target["name"],
        "source_name": source["name"],
        "fields_merged": result["fields_merged"],
        "tags_merged": result["tags_merged"],
    }


def _contact_list(repo, pinned, relationship, recent_days, limit) -> Dict[str, Any]:
    if not pinned and not relationship and not recent_days:
        return {
            "success": False,
            "error": "list requires at least one filter: pinned=True, relationship='...', or recent_days=N"
        }

    if pinned:
        results = repo.list_pinned(limit)
    elif relationship:
        results = repo.list_by_relationship(relationship, limit)
    elif recent_days:
        threshold = (datetime.now(timezone.utc) - timedelta(days=recent_days)).isoformat()
        results = repo.list_recent(threshold, limit)
    else:
        results = []

    contacts = [{
        "id": c["id"][:8],
        "name": c["name"],
        "phone": c.get("phone"),
        "description": c.get("description"),
        "pinned": bool(c.get("pinned", 0)),
        "relationship": c.get("relationship"),
        "last_contact": c.get("last_contact_date"),
    } for c in results]

    return {"success": True, "contacts": contacts, "count": len(contacts)}
