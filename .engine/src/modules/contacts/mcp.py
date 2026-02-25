"""Contacts MCP tool - People database with relationship context."""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_services, normalize_phone, notify_backend_event
from .standalone import StandaloneContactsRepository
from .providers.apple import AppleContactsAdapter
from .providers.base import ContactUpdate
from .activity import log_activity

logger = logging.getLogger(__name__)

mcp = FastMCP("life-contacts")


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
    current_state: Optional[str] = None,
    linkedin_url: Optional[str] = None,
    contact_cadence: Optional[int] = None,
    entry: Optional[str] = None,
    source: Optional[str] = None,
) -> Dict[str, Any]:
    """Contact management.

    Args:
        operation: Operation to perform:
            - "search": Find contacts by name, email, phone, or keyword
            - "create": Add a new contact (name required)
            - "update": Modify existing contact fields (REPLACES values — tags replaced entirely)
            - "enrich": Add to existing contact (ONLY fills empty fields — tags MERGED not replaced)
            - "merge": Combine two contacts into one
            - "list": List contacts with filters (pinned, relationship, recent activity)
            - "history": Read or write contact interaction history.
                With entry: appends a history entry.
                Without entry: reads last N entries.
        query: Search query (required for search)
        identifier: Name, phone, or short ID to find contact (required for update/enrich/history)
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
        current_state: Living summary of who this person is right now (update replaces, enrich fills if NULL)
        linkedin_url: LinkedIn profile URL
        contact_cadence: Desired days between contact (e.g. 14 = every 2 weeks)
        entry: History entry text (required for history write mode)
        source: History entry source - chief, email, imessage, calendar, manual (default: chief)

    Returns:
        Object with success status and contact data

    Examples:
        contact("search", query="Alex")
        contact("create", name="Alex Bricken", company="Anthropic", role="FDE")
        contact("update", identifier="Alex", notes="Met at conference")
        contact("update", identifier="Alex", current_state="FDE at Anthropic, working on Claude Code")
        contact("enrich", identifier="Mark", notes="Great conversation about AI", tags=["anthropic"])
        contact("merge", source_identifier="Alex B", target_identifier="Alex Bricken")
        contact("list", pinned=True)
        contact("list", relationship="friend", limit=10)
        contact("history", identifier="John Smith", entry="Feb 18: Telegram session about the system")
        contact("history", identifier="John", limit=5)
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
                                   description, relationship, context_notes, value_exchange, notes, pinned, tags,
                                   current_state, linkedin_url, contact_cadence)
        elif operation == "enrich":
            return _contact_enrich(repo, identifier, name, phone, email, company, role, location,
                                   description, relationship, context_notes, value_exchange, notes, pinned, tags,
                                   current_state, linkedin_url, contact_cadence)
        elif operation == "merge":
            return _contact_merge(repo, source_identifier, target_identifier)
        elif operation == "list":
            return _contact_list(repo, pinned, relationship, recent_days, limit)
        elif operation == "history":
            return _contact_history(repo, identifier, entry, source, limit)
        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use search, create, update, enrich, merge, list, or history."}

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

    # Log activity + emit SSE event
    services = get_services()
    log_activity(services.storage, created["id"], "created", "Contact created", source="manual")
    notify_backend_event("contact.created", {"id": created["id"][:8], "name": created["name"]})

    return {
        "success": True,
        "id": created["id"][:8],
        "name": created["name"],
        "phone": created.get("phone"),
    }


def _contact_update(repo, identifier, name, phone, email, company, role, location,
                    description, relationship, context_notes, value_exchange, notes, pinned, tags,
                    current_state=None, linkedin_url=None, contact_cadence=None) -> Dict[str, Any]:
    if not identifier:
        return {"success": False, "error": "identifier required for update"}

    found = repo.find(identifier)
    if not found:
        return {"success": False, "error": f"Contact not found: {identifier}"}

    contact_id = found["id"]

    field_count = sum(1 for v in [name, phone, email, company, role, location,
                                  description, relationship, context_notes,
                                  value_exchange, notes, pinned,
                                  current_state, linkedin_url, contact_cadence] if v is not None)

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
        current_state=current_state,
        linkedin_url=linkedin_url,
        contact_cadence=contact_cadence,
    )

    if tags is not None:
        repo.replace_tags(contact_id, tags)

    # Apple write-back for basic fields when macos_contact_id exists
    macos_id = found.get("macos_contact_id")
    if macos_id and any(v is not None for v in [company, role, notes]):
        try:
            adapter = AppleContactsAdapter()
            update_data = ContactUpdate(
                company=company,
                job_title=role,
                notes=notes,
            )
            adapter.update_contact(macos_id, update_data)
        except Exception as e:
            logger.warning(f"Apple write-back failed for {macos_id}: {e}")

    # Log activity only if something actually changed
    if field_count > 0 or tags is not None:
        changed = [k for k, v in {
            "name": name, "phone": phone, "email": email, "company": company,
            "role": role, "location": location, "description": description,
            "relationship": relationship, "context_notes": context_notes,
            "value_exchange": value_exchange, "notes": notes, "pinned": pinned,
            "current_state": current_state, "linkedin_url": linkedin_url,
            "contact_cadence": contact_cadence,
        }.items() if v is not None]
        if tags is not None:
            changed.append("tags")
        desc = f"Updated: {', '.join(changed)}" if changed else "Updated"
        services = get_services()
        log_activity(services.storage, contact_id, "updated", desc, source="chief")

    # Emit SSE event for real-time Dashboard update
    notify_backend_event("contact.updated", {"id": contact_id[:8], "name": name or found["name"]})

    return {
        "success": True,
        "id": contact_id[:8],
        "name": name or found["name"],
        "fields_updated": field_count,
        "tags_updated": tags is not None,
    }


def _contact_enrich(repo, identifier, name, phone, email, company, role, location,
                    description, relationship, context_notes, value_exchange, notes, pinned, tags,
                    current_state=None, linkedin_url=None, contact_cadence=None) -> Dict[str, Any]:
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
        current_state=current_state,
        linkedin_url=linkedin_url,
        contact_cadence=contact_cadence,
    )

    tags_added = 0
    if tags:
        tags_added = repo.merge_tags(contact_id, tags)

    # Log activity only if something actually changed
    if fields_count > 0 or tags_added > 0:
        enriched_fields = [k for k, v in {
            "name": name, "phone": phone, "email": email, "company": company,
            "role": role, "location": location, "description": description,
            "relationship": relationship, "context_notes": context_notes,
            "value_exchange": value_exchange, "notes": notes,
            "current_state": current_state, "linkedin_url": linkedin_url,
            "contact_cadence": contact_cadence,
        }.items() if v is not None]
        if tags_added > 0:
            enriched_fields.append("tags")
        desc = f"Enriched: {', '.join(enriched_fields)}" if enriched_fields else "Enriched"
        services = get_services()
        log_activity(services.storage, contact_id, "enriched", desc, source="chief")

    # Emit SSE event for real-time Dashboard update
    notify_backend_event("contact.updated", {"id": contact_id[:8], "name": name or found["name"]})

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
    notify_backend_event("contact.deleted", {"id": source_id[:8], "name": source["name"]})
    notify_backend_event("contact.updated", {"id": target_id[:8], "name": target["name"]})

    return {
        "success": True,
        "merged_into": target_id[:8],
        "target_name": target["name"],
        "source_name": source["name"],
        "fields_merged": result["fields_merged"],
        "tags_merged": result["tags_merged"],
    }


def _contact_history(repo, identifier, entry, source, limit) -> Dict[str, Any]:
    if not identifier:
        return {"success": False, "error": "identifier required for history"}

    found = repo.find(identifier)
    if not found:
        return {"success": False, "error": f"Contact not found: {identifier}"}

    contact_id = found["id"]

    if entry:
        # Write mode: append history entry
        result = repo.add_history(
            contact_id=contact_id,
            entry=entry,
            source=source or "chief",
        )
        # Log activity
        preview = entry[:80] + ("..." if len(entry) > 80 else "")
        services = get_services()
        log_activity(services.storage, contact_id, "history_added", f"History: {preview}", source=source or "chief")
        return {
            "success": True,
            "mode": "write",
            "contact": found["name"],
            "entry": result,
        }
    else:
        # Read mode: return last N entries
        entries = repo.get_history(contact_id, limit)
        return {
            "success": True,
            "mode": "read",
            "contact": found["name"],
            "entries": entries,
            "count": len(entries),
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
