"""Contacts MCP tools - contact() consolidated tool."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

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


def contact(
    operation: str,
    query: Optional[str] = None,
    identifier: Optional[str] = None,
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
        operation: Operation - 'search', 'create', 'update', 'list'
        query: Search query (required for search)
        identifier: Name, phone, or short ID to find contact (required for update)
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
        tags: List of tags (replace-all semantics)
        limit: Max results for list (default 20)
        recent_days: For list - contacted in last N days

    Returns:
        Object with success status and contact data

    Examples:
        contact("search", query="Alex")
        contact("create", name="Alex Bricken", company="Anthropic", role="FDE")
        contact("update", identifier="Alex", notes="Met at conference")
        contact("list", pinned=True)
        contact("list", relationship="friend", limit=10)
    """
    try:
        service = get_service()
        
        if operation == "search":
            if not query:
                return {"success": False, "error": "query required for search"}
            
            contacts = service.search(query, limit=limit)
            
            return {
                "success": True,
                "contacts": [
                    {
                        "id": c.id[:8],
                        "name": c.name,
                        "phone": c.phone,
                        "description": c.description,
                        "pinned": c.pinned,
                    }
                    for c in contacts
                ],
                "count": len(contacts),
            }
        
        elif operation == "create":
            if not name:
                return {"success": False, "error": "name required for create"}
            
            c = service.create(
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
                tags=tags,
            )
            
            return {
                "success": True,
                "id": c.id[:8],
                "name": c.name,
                "phone": c.phone,
            }
        
        elif operation == "update":
            if not identifier:
                return {"success": False, "error": "identifier required for update"}
            
            existing = service.find(identifier)
            if not existing:
                return {"success": False, "error": f"Contact not found: {identifier}"}
            
            c = service.update(
                contact_id=existing.id,
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
                tags=tags,
            )
            
            # Count updated fields
            field_mapping = {
                "name": name,
                "phone": phone,
                "email": email,
                "company": company,
                "role": role,
                "location": location,
                "description": description,
                "relationship": relationship,
                "context_notes": context_notes,
                "value_exchange": value_exchange,
                "notes": notes,
                "pinned": pinned,
            }
            fields_updated = len([v for v in field_mapping.values() if v is not None])
            
            return {
                "success": True,
                "id": c.id[:8],
                "name": c.name,
                "fields_updated": fields_updated,
                "tags_updated": tags is not None,
            }
        
        elif operation == "list":
            # Require at least one filter
            if not pinned and not relationship and not recent_days:
                return {
                    "success": False,
                    "error": "list requires at least one filter: pinned=True, relationship='...', or recent_days=N"
                }
            
            if pinned:
                contacts = service.list_pinned(limit=limit)
            elif relationship:
                contacts = service.list_by_relationship(relationship, limit=limit)
            elif recent_days:
                contacts = service.list_recent(days=recent_days, limit=limit)
            else:
                contacts = service.list_pinned(limit=limit)
            
            return {
                "success": True,
                "contacts": [
                    {
                        "id": c.id[:8],
                        "name": c.name,
                        "phone": c.phone,
                        "description": c.description,
                        "pinned": c.pinned,
                        "relationship": c.relationship,
                        "last_contact": c.last_contact_date,
                    }
                    for c in contacts
                ],
                "count": len(contacts),
            }
        
        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use search, create, update, or list."
            }
    
    except Exception as e:
        error_str = str(e)
        if "UNIQUE constraint failed: contacts.phone" in error_str:
            return {"success": False, "error": f"Phone number already exists: {phone}"}
        return {"success": False, "error": error_str}

