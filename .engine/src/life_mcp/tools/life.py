"""Life MCP tools: contact, priority, timer, log, remind."""
from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from tools.helpers import (
    PACIFIC,
    REPO_ROOT,
    get_db,
    get_services,
    get_current_session_id,
    get_current_session_role,
    normalize_phone,
    find_contact,
    ensure_timers_table,
    ensure_reminders_table,
)

mcp = FastMCP("life-life")


# ----------------------------------------------------------------------------
# CONTACT TOOL (Consolidated)
# Replaces: contact_search, contact_update, contact_create
# Adds: list operation
# ----------------------------------------------------------------------------


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
        contact("create", name="Alex Bricken", company="Anthropic", role="FDE")
        contact("update", identifier="Alex", notes="Met at conference")
        contact("enrich", identifier="Mark", notes="Great conversation about AI", tags=["anthropic"])
        contact("merge", source_identifier="Alex B", target_identifier="Alex Bricken")
        contact("list", pinned=True)
        contact("list", relationship="friend", limit=10)
    """
    try:
        if operation == "search":
            if not query:
                return {"success": False, "error": "query required for search"}

            search_term = f"%{query}%"
            with get_db() as conn:
                cursor = conn.execute("""
                    SELECT DISTINCT id, name, phone, description, pinned
                    FROM contacts
                    WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?
                       OR company LIKE ? OR description LIKE ? OR notes LIKE ?
                    ORDER BY pinned DESC, name
                    LIMIT ?
                """, (search_term, search_term, search_term, search_term, search_term, search_term, limit))

                contacts = []
                for row in cursor.fetchall():
                    contacts.append({
                        "id": row["id"][:8],
                        "name": row["name"],
                        "phone": row["phone"],
                        "description": row["description"],
                        "pinned": bool(row["pinned"])
                    })
            return {"success": True, "contacts": contacts, "count": len(contacts)}

        elif operation == "create":
            if not name:
                return {"success": False, "error": "name required for create"}

            contact_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            normalized_phone = normalize_phone(phone) if phone else None

            with get_db() as conn:
                conn.execute("""
                    INSERT INTO contacts (
                        id, name, phone, email, company, role, location,
                        description, relationship, context_notes, value_exchange, notes,
                        pinned, source, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
                """, (
                    contact_id, name, normalized_phone, email, company, role, location,
                    description, relationship, context_notes, value_exchange, notes,
                    1 if pinned else 0, now, now
                ))

                if tags:
                    for tag in tags:
                        conn.execute(
                            "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                            (contact_id, tag)
                        )

                conn.commit()
            return {
                "success": True,
                "id": contact_id[:8],
                "name": name,
                "phone": normalized_phone,
            }

        elif operation == "update":
            if not identifier:
                return {"success": False, "error": "identifier required for update"}

            services = get_services()
            storage = services["storage"]
            found = find_contact(storage, identifier)
            if not found:
                return {"success": False, "error": f"Contact not found: {identifier}"}

            contact_id = found["id"]

            updates = []
            values = []
            field_mapping = {
                "name": name,
                "phone": normalize_phone(phone) if phone else None,
                "email": email,
                "company": company,
                "role": role,
                "location": location,
                "description": description,
                "relationship": relationship,
                "context_notes": context_notes,
                "value_exchange": value_exchange,
                "notes": notes,
                "pinned": 1 if pinned else (0 if pinned is False else None),
            }

            for field, value in field_mapping.items():
                if value is not None:
                    updates.append(f"{field} = ?")
                    values.append(value)

            if not updates and tags is None:
                return {"success": False, "error": "No fields to update"}

            now = datetime.now(timezone.utc).isoformat()

            with get_db() as conn:
                if updates:
                    updates.append("updated_at = ?")
                    values.append(now)
                    values.append(contact_id)
                    sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
                    conn.execute(sql, values)

                if tags is not None:
                    conn.execute("DELETE FROM contact_tags WHERE contact_id = ?", (contact_id,))
                    for tag in tags:
                        conn.execute(
                            "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                            (contact_id, tag)
                        )

                conn.commit()
            return {
                "success": True,
                "id": contact_id[:8],
                "name": name or found["name"],
                "fields_updated": len([v for v in field_mapping.values() if v is not None]),
                "tags_updated": tags is not None,
            }

        elif operation == "enrich":
            # Additive enrichment: append to text fields, merge tags, fill empty fields
            if not identifier:
                return {"success": False, "error": "identifier required for enrich"}

            services = get_services()
            storage = services["storage"]
            found = find_contact(storage, identifier)
            if not found:
                return {"success": False, "error": f"Contact not found: {identifier}"}

            contact_id = found["id"]

            # Get current contact data
            with get_db() as conn:
                cursor = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,))
                current = cursor.fetchone()
                if not current:
                    return {"success": False, "error": f"Contact not found: {identifier}"}

                # Build update with additive/fill semantics
                updates = []
                values = []

                # Fill empty fields only
                fill_fields = {
                    "name": name,
                    "phone": normalize_phone(phone) if phone else None,
                    "email": email,
                    "company": company,
                    "role": role,
                    "location": location,
                    "description": description,
                    "relationship": relationship,
                }
                for field, value in fill_fields.items():
                    if value is not None and not current[field]:
                        updates.append(f"{field} = ?")
                        values.append(value)

                # Append to text fields
                append_fields = {
                    "context_notes": context_notes,
                    "value_exchange": value_exchange,
                    "notes": notes,
                }
                for field, value in append_fields.items():
                    if value is not None:
                        existing = current[field] or ""
                        if existing:
                            combined = f"{existing}\n\n{value}"
                        else:
                            combined = value
                        updates.append(f"{field} = ?")
                        values.append(combined)

                # Pinned (allow override)
                if pinned is not None:
                    updates.append("pinned = ?")
                    values.append(1 if pinned else 0)

                now = datetime.now(timezone.utc).isoformat()
                fields_count = len(updates)

                if updates:
                    updates.append("updated_at = ?")
                    values.append(now)
                    values.append(contact_id)
                    sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
                    conn.execute(sql, values)

                # Merge tags (add new, keep existing)
                tags_added = 0
                if tags:
                    existing_tags = set()
                    cursor = conn.execute(
                        "SELECT tag FROM contact_tags WHERE contact_id = ?",
                        (contact_id,)
                    )
                    for row in cursor.fetchall():
                        existing_tags.add(row["tag"])

                    for tag in tags:
                        if tag not in existing_tags:
                            conn.execute(
                                "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                                (contact_id, tag)
                            )
                            tags_added += 1

                conn.commit()

            return {
                "success": True,
                "id": contact_id[:8],
                "name": name or found["name"],
                "fields_updated": fields_count,
                "tags_added": tags_added,
                "mode": "additive",
            }

        elif operation == "merge":
            # Merge source contact into target contact, delete source
            if not source_identifier or not target_identifier:
                return {
                    "success": False,
                    "error": "source_identifier and target_identifier required for merge"
                }

            services = get_services()
            storage = services["storage"]

            source = find_contact(storage, source_identifier)
            target = find_contact(storage, target_identifier)

            if not source:
                return {"success": False, "error": f"Source contact not found: {source_identifier}"}
            if not target:
                return {"success": False, "error": f"Target contact not found: {target_identifier}"}

            if source["id"] == target["id"]:
                return {"success": False, "error": "Cannot merge contact with itself"}

            source_id = source["id"]
            target_id = target["id"]

            with get_db() as conn:
                # Get full source and target data
                source_row = conn.execute("SELECT * FROM contacts WHERE id = ?", (source_id,)).fetchone()
                target_row = conn.execute("SELECT * FROM contacts WHERE id = ?", (target_id,)).fetchone()

                # Build merged data (prefer target, fill from source)
                updates = []
                values = []

                # Fill empty fields from source
                fill_fields = ["email", "company", "role", "location", "description", "relationship"]
                for field in fill_fields:
                    if not target_row[field] and source_row[field]:
                        updates.append(f"{field} = ?")
                        values.append(source_row[field])

                # Append text fields
                append_fields = ["context_notes", "value_exchange", "notes"]
                for field in append_fields:
                    target_val = target_row[field] or ""
                    source_val = source_row[field] or ""
                    if source_val:
                        combined = f"{target_val}\n\n{source_val}" if target_val else source_val
                        updates.append(f"{field} = ?")
                        values.append(combined)

                # Merge tags
                source_tags = set()
                target_tags = set()

                for row in conn.execute("SELECT tag FROM contact_tags WHERE contact_id = ?", (source_id,)).fetchall():
                    source_tags.add(row["tag"])
                for row in conn.execute("SELECT tag FROM contact_tags WHERE contact_id = ?", (target_id,)).fetchall():
                    target_tags.add(row["tag"])

                new_tags = source_tags - target_tags
                for tag in new_tags:
                    conn.execute(
                        "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                        (target_id, tag)
                    )

                # Update target contact
                now = datetime.now(timezone.utc).isoformat()
                if updates:
                    updates.append("updated_at = ?")
                    values.append(now)
                    values.append(target_id)
                    sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
                    conn.execute(sql, values)

                # Delete source contact
                conn.execute("DELETE FROM contact_tags WHERE contact_id = ?", (source_id,))
                conn.execute("DELETE FROM contacts WHERE id = ?", (source_id,))

                conn.commit()

            return {
                "success": True,
                "merged_into": target_id[:8],
                "target_name": target["name"],
                "source_name": source["name"],
                "fields_merged": len(updates),
                "tags_merged": len(new_tags),
            }

        elif operation == "list":
            # Require at least one filter to prevent listing all 732 contacts
            if not pinned and not relationship and not recent_days:
                return {
                    "success": False,
                    "error": "list requires at least one filter: pinned=True, relationship='...', or recent_days=N"
                }

            query_sql = "SELECT id, name, phone, description, pinned, relationship, last_contact_date FROM contacts WHERE 1=1"
            params = []

            if pinned:
                query_sql += " AND pinned = 1"
            if relationship:
                query_sql += " AND relationship = ?"
                params.append(relationship)
            if recent_days:
                threshold = (datetime.now(timezone.utc) - timedelta(days=recent_days)).isoformat()
                query_sql += " AND last_contact_date >= ?"
                params.append(threshold)

            query_sql += " ORDER BY pinned DESC, name LIMIT ?"
            params.append(limit)

            with get_db() as conn:
                cursor = conn.execute(query_sql, params)
                contacts = []
                for row in cursor.fetchall():
                    contacts.append({
                        "id": row["id"][:8],
                        "name": row["name"],
                        "phone": row["phone"],
                        "description": row["description"],
                        "pinned": bool(row["pinned"]),
                        "relationship": row["relationship"],
                        "last_contact": row["last_contact_date"],
                    })
            return {"success": True, "contacts": contacts, "count": len(contacts)}

        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use search, create, update, enrich, merge, or list."}

    except sqlite3.IntegrityError as e:
        if "phone" in str(e).lower():
            return {"success": False, "error": f"Phone number already exists: {phone}"}
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ----------------------------------------------------------------------------
# PRIORITY TOOL (Consolidated)
# Replaces: priority_create, priority_delete
# Adds: complete operation
# Kills: pool_list, pool_to_daily, daily_to_pool (never used)
# ----------------------------------------------------------------------------


@mcp.tool()
def priority(
    operation: str,
    content: Optional[str] = None,
    level: str = "medium",
    date: Optional[str] = None,
    id: Optional[str] = None,
) -> Dict[str, Any]:
    """Priority management for today's tasks.

    Args:
        operation: Operation - 'create', 'delete', 'complete'
        content: Priority text (required for create)
        level: Priority level - 'critical', 'medium', 'low' (default medium)
        date: ISO date YYYY-MM-DD (defaults to today)
        id: Priority ID (required for delete, complete)

    Returns:
        Object with success status and priority data

    Examples:
        priority("create", content="Finish MCP consolidation", level="critical")
        priority("complete", id="abc12345")
        priority("delete", id="abc12345")
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        session_id = get_current_session_id()

        if operation == "create":
            if not content:
                return {"success": False, "error": "content required for create"}
            if level not in ('critical', 'medium', 'low'):
                return {"success": False, "error": f"Invalid level '{level}'. Must be critical, medium, or low."}

            priority_id = str(uuid.uuid4())[:8]
            target_date = date or datetime.now().strftime("%Y-%m-%d")

            with get_db() as conn:
                # Get next position for this date+level
                cursor = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM priorities WHERE date = ? AND level = ?",
                    (target_date, level)
                )
                position = cursor.fetchone()[0]

                conn.execute("""
                    INSERT INTO priorities (id, date, content, level, completed, position, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
                """, (priority_id, target_date, content, level, position, now, now))
                conn.commit()

            from utils.events import emit_event
            emit_event(
                "priority",
                "created",
                actor=session_id,
                data={"id": priority_id, "content": content, "level": level}
            )

            # Emit SSE event for Dashboard real-time update
            import asyncio
            from utils.event_bus import event_bus
            try:
                loop = asyncio.get_event_loop()
                asyncio.run_coroutine_threadsafe(
                    event_bus.publish("priority.created", {
                        "id": priority_id,
                        "content": content,
                        "level": level,
                        "date": target_date,
                    }),
                    loop
                )
            except RuntimeError:
                pass  # No event loop (CLI context)

            return {"success": True, "id": priority_id, "date": target_date, "level": level}

        elif operation == "delete":
            if not id:
                return {"success": False, "error": "id required for delete"}

            with get_db() as conn:
                cursor = conn.execute("SELECT id, content, level FROM priorities WHERE id = ?", (id,))
                row = cursor.fetchone()
                if not row:
                    return {"success": False, "error": f"Priority '{id}' not found"}

                content_text = row["content"]
                level_val = row["level"]

                conn.execute("DELETE FROM priorities WHERE id = ?", (id,))
                conn.commit()

            from utils.events import emit_event
            emit_event(
                "priority",
                "deleted",
                actor=session_id,
                data={"id": id, "content": content_text, "level": level_val}
            )

            # Emit SSE event for Dashboard real-time update
            import asyncio
            from utils.event_bus import event_bus
            try:
                loop = asyncio.get_event_loop()
                asyncio.run_coroutine_threadsafe(
                    event_bus.publish("priority.deleted", {"id": id}),
                    loop
                )
            except RuntimeError:
                pass  # No event loop (CLI context)

            return {"success": True}

        elif operation == "complete":
            if not id:
                return {"success": False, "error": "id required for complete"}

            with get_db() as conn:
                cursor = conn.execute("SELECT id, content, level, completed FROM priorities WHERE id = ?", (id,))
                row = cursor.fetchone()
                if not row:
                    return {"success": False, "error": f"Priority '{id}' not found"}

                if row["completed"]:
                    return {"success": False, "error": f"Priority '{id}' already completed"}

                conn.execute(
                    "UPDATE priorities SET completed = 1, updated_at = ? WHERE id = ?",
                    (now, id)
                )
                conn.commit()

            from utils.events import emit_event
            emit_event(
                "priority",
                "completed",
                actor=session_id,
                data={"id": id, "content": row["content"], "level": row["level"]}
            )

            # Emit SSE event for Dashboard real-time update
            import asyncio
            from utils.event_bus import event_bus
            try:
                loop = asyncio.get_event_loop()
                asyncio.run_coroutine_threadsafe(
                    event_bus.publish("priority.completed", {"id": id}),
                    loop
                )
            except RuntimeError:
                pass  # No event loop (CLI context)

            return {
                "success": True,
                "id": id,
                "content": row["content"],
                "reminder": "✓ Done! Keep momentum."
            }

        else:
            return {"success": False, "error": f"Unknown operation: {operation}. Use create, delete, or complete."}

    except Exception as e:
        return {"success": False, "error": str(e)}


# ----------------------------------------------------------------------------
# TIMER TOOL (NEW)
# ADHD time awareness - start/check/stop/list timers
# ----------------------------------------------------------------------------


@mcp.tool()
def timer(
    operation: str,
    minutes: Optional[int] = None,
    label: Optional[str] = None,
    id: Optional[str] = None,
) -> Dict[str, Any]:
    """Timer for ADHD time awareness.

    Args:
        operation: Operation - 'start', 'check', 'stop', 'list'
        minutes: Duration in minutes (required for start)
        label: Optional description (for start)
        id: Timer ID (optional for check/stop - defaults to most recent)

    Returns:
        Object with success status and timer data

    Examples:
        timer("start", minutes=25, label="Focus block")
        timer("check")
        timer("stop")
        timer("list")
    """
    try:
        ensure_timers_table()
        conn = get_db()
        session_id = get_current_session_id()
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        if operation == "start":
            if not minutes:
                return {"success": False, "error": "minutes required for start"}
            if minutes < 1 or minutes > 480:
                return {"success": False, "error": "minutes must be between 1 and 480"}

            timer_id = str(uuid.uuid4())[:8]
            ends_at = now + timedelta(minutes=minutes)

            conn.execute("""
                INSERT INTO timers (id, label, minutes, started_at, ends_at, session_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (timer_id, label, minutes, now_iso, ends_at.isoformat(), session_id))
            conn.commit()
            conn.close()

            return {
                "success": True,
                "id": timer_id,
                "label": label,
                "minutes": minutes,
                "ends_at": ends_at.isoformat(),
                "message": f"Timer started for {minutes} minutes"
            }

        elif operation == "check":
            # Get specific timer or most recent active
            if id:
                cursor = conn.execute(
                    "SELECT * FROM timers WHERE id = ?",
                    (id,)
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM timers WHERE ends_at > ? ORDER BY started_at DESC LIMIT 1",
                    (now_iso,)
                )

            row = cursor.fetchone()
            conn.close()

            if not row:
                return {"success": True, "active": False, "message": "No active timer"}

            ends_at = datetime.fromisoformat(row["ends_at"].replace("Z", "+00:00"))
            started_at = datetime.fromisoformat(row["started_at"].replace("Z", "+00:00"))

            remaining = (ends_at - now).total_seconds() / 60
            elapsed = (now - started_at).total_seconds() / 60

            if remaining <= 0:
                return {
                    "success": True,
                    "active": False,
                    "id": row["id"],
                    "label": row["label"],
                    "message": "Timer expired!",
                    "elapsed_minutes": round(elapsed, 1)
                }

            return {
                "success": True,
                "active": True,
                "id": row["id"],
                "label": row["label"],
                "remaining_minutes": round(remaining, 1),
                "elapsed_minutes": round(elapsed, 1),
                "ends_at": row["ends_at"]
            }

        elif operation == "stop":
            # Stop specific timer or most recent active
            if id:
                cursor = conn.execute(
                    "SELECT * FROM timers WHERE id = ?",
                    (id,)
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM timers WHERE ends_at > ? ORDER BY started_at DESC LIMIT 1",
                    (now_iso,)
                )

            row = cursor.fetchone()

            if not row:
                conn.close()
                return {"success": False, "error": "No active timer to stop"}

            timer_id = row["id"]
            started_at = datetime.fromisoformat(row["started_at"].replace("Z", "+00:00"))
            elapsed = (now - started_at).total_seconds() / 60

            # Delete the timer
            conn.execute("DELETE FROM timers WHERE id = ?", (timer_id,))
            conn.commit()
            conn.close()

            return {
                "success": True,
                "id": timer_id,
                "label": row["label"],
                "elapsed_minutes": round(elapsed, 1),
                "message": "Timer stopped"
            }

        elif operation == "list":
            cursor = conn.execute(
                "SELECT * FROM timers ORDER BY ends_at ASC"
            )
            rows = cursor.fetchall()
            conn.close()

            timers = []
            for row in rows:
                ends_at = datetime.fromisoformat(row["ends_at"].replace("Z", "+00:00"))
                started_at = datetime.fromisoformat(row["started_at"].replace("Z", "+00:00"))
                remaining = (ends_at - now).total_seconds() / 60

                timers.append({
                    "id": row["id"],
                    "label": row["label"],
                    "minutes": row["minutes"],
                    "remaining_minutes": round(remaining, 1) if remaining > 0 else 0,
                    "active": remaining > 0,
                    "ends_at": row["ends_at"]
                })

            return {"success": True, "timers": timers, "count": len(timers)}

        else:
            conn.close()
            return {"success": False, "error": f"Unknown operation: {operation}. Use start, check, stop, or list."}

    except Exception as e:
        return {"success": False, "error": str(e)}




@mcp.tool()
def timeline(description: str) -> Dict[str, Any]:
    """Add entry to today's timeline.

    Timestamp and role/mode auto-detected. Just provide description.

    Args:
        description: What happened (1-2 sentences)

    Returns:
        Object with success status and entry logged

    Example:
        timeline("Morning check-in with the user")
        timeline("Completed API refactor, 3 endpoints updated")
        timeline("Mock interview prep session")
    """
    from utils.timeline import log_session_event
    import os

    role = get_current_session_role() or "chief"
    mode = os.environ.get("CLAUDE_SESSION_MODE", "interactive")

    return log_session_event(description, role, mode)


@mcp.tool()
def remind(time: str, message: str) -> Dict[str, Any]:
    """Set a reminder that shows in Dashboard.

    For ADHD time awareness. Reminders appear as notifications in Dashboard.

    Args:
        time: When to remind. Formats:
            - Relative: "5m", "30m", "2h" (minutes/hours from now)
            - Absolute: "15:30" (today at that time)
            - ISO: "2026-01-03T20:15:00"
        message: What to remind about

    Returns:
        Object with remind_at timestamp and reminder id

    Example:
        remind("15m", "Mock interview prep")
        remind("16:00", "Standup with team")
    """
    try:
        ensure_reminders_table()

        session_id = get_current_session_id()
        now = datetime.now(PACIFIC)

        # Parse time
        remind_at = None

        # Relative time: "5m", "30m", "2h"
        if time.endswith('m'):
            try:
                minutes = int(time[:-1])
                remind_at = now + timedelta(minutes=minutes)
            except ValueError:
                pass
        elif time.endswith('h'):
            try:
                hours = int(time[:-1])
                remind_at = now + timedelta(hours=hours)
            except ValueError:
                pass
        # Absolute time: "15:30"
        elif ':' in time and len(time) <= 5:
            try:
                hour, minute = map(int, time.split(':'))
                remind_at = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                # If time is in the past, assume tomorrow
                if remind_at < now:
                    remind_at += timedelta(days=1)
            except ValueError:
                pass
        # ISO timestamp
        else:
            try:
                remind_at = datetime.fromisoformat(time.replace("Z", "+00:00"))
                if remind_at.tzinfo is None:
                    remind_at = PACIFIC.localize(remind_at)
            except ValueError:
                pass

        if remind_at is None:
            return {
                "success": False,
                "error": f"Could not parse time: '{time}'. Use '5m', '2h', '15:30', or ISO format."
            }

        # Store reminder
        with get_db() as conn:
            reminder_id = str(uuid.uuid4())[:8]
            now_iso = datetime.now(timezone.utc).isoformat()

            conn.execute("""
                INSERT INTO reminders (id, message, remind_at, session_id, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (reminder_id, message, remind_at.isoformat(), session_id, now_iso))
            conn.commit()

        return {
            "success": True,
            "id": reminder_id,
            "remind_at": remind_at.isoformat(),
            "message": message,
            "in_minutes": round((remind_at - now).total_seconds() / 60)
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ----------------------------------------------------------------------------
# EMAIL TOOL
# Send emails from Claude's autonomous account with safeguards
# ----------------------------------------------------------------------------


@mcp.tool()
def email(
    operation: str,
    to: Optional[str] = None,
    subject: Optional[str] = None,
    content: Optional[str] = None,
    body_file: Optional[str] = None,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    email_id: Optional[str] = None,
    limit: int = 50,
    # Inbox operations
    query: Optional[str] = None,
    message_id: Optional[str] = None,
    mailbox: Optional[str] = None,
    account: Optional[str] = None,
    unread_only: bool = False,
    # Attachments
    attachments: Optional[str] = None,  # Comma-separated file paths
) -> Dict[str, Any]:
    """Email operations - Multi-provider access with account-based routing.

    Args:
        operation: Operation - 'send', 'draft', 'cancel', 'status', 'history', 'queue',
                   'unread', 'search', 'read', 'mark_read', 'accounts', 'test', 'discover'

        # Outbound operations (send, draft, cancel, status, history, queue)
        to: Recipient email address (required for send/draft)
        subject: Email subject (required for send/draft)
        content: Email content HTML (inline, for short emails)
        body_file: Path to email content file (preferred for emails).
                   If .md file, converts markdown to HTML automatically.
        cc: CC recipients (comma-separated)
        bcc: BCC recipients (comma-separated)
        email_id: Email ID (required for cancel, status)
        account: Account to send/draft from. Uses default sending account if not specified.
        attachments: Comma-separated file paths to attach (for draft operation)

        # Inbox operations (unread, search, read, mark_read)
        query: Search query - supports Gmail operators (from:, has:attachment, etc.)
        message_id: Message ID (required for read, mark_read)
        mailbox: Mailbox/label name (default: INBOX)
        account: Account identifier (email, name, or ID). Uses default if not specified.
        unread_only: Filter for unread messages only (for unread operation)
        limit: Max results (default 50)

    Returns:
        Object with success status and operation-specific data

    Examples:
        # Account discovery (for onboarding)
        email("discover")  # Discover available accounts (Mail.app on Mac)

        # Account management
        email("accounts")  # List all configured accounts
        email("test", account="will@gmail.com")  # Test account connection

        # Draft (preferred - opens for human review)
        email("draft", to="will@example.com", subject="Meeting notes",
              body_file="/path/to/email.md", account="will@gmail.com")
        email("draft", to="will@example.com", subject="Report",
              content="See attachment", account="will@gmail.com",
              attachments="/path/to/report.pdf,/path/to/data.xlsx")
        # → Apple Mail: Opens compose window in Mail.app
        # → Gmail: Creates draft and opens in browser

        # Send (only for accounts with can_send=true)
        email("send", to="will@example.com", subject="Quick note",
              body_file="/path/to/email.md", account="claude@gmail.com")
        email("cancel", email_id="abc123")
        email("history", limit=10)
        email("queue")  # Show pending sends

        # Inbox operations (any account - routed by provider)
        email("unread", account="will@gmail.com", limit=20)
        email("search", query="from:sean subject:interview", account="will@gmail.com")
        email("read", message_id="abc123", account="will@gmail.com")
        email("mark_read", message_id="abc123", account="will@gmail.com")

    Gmail Search Operators:
        from:sender, to:recipient, subject:words, has:attachment
        is:unread, is:starred, label:name, after:2024/01/01

    Account Resolution:
        The 'account' parameter accepts: email address, display name, or account ID.
        If not specified, uses default sending account.

    Sending Capabilities:
        - 'draft': Any account (opens for human review - preferred)
        - 'send': Only accounts with can_send=true (queued with safeguards)
        
    Safeguards (send only):
        - 15 second send delay (time to cancel)
        - 50 emails/hour rate limit
        - All sends logged to database
    """
    try:
        # Get EmailService (unified send/read interface)
        from apps.email.service import EmailService

        # Use properly initialized storage from get_services()
        services = get_services()
        storage = services['storage']
        email_service = EmailService(storage)

        if operation == "send":
            if not to or not subject:
                return {
                    "success": False,
                    "error": "to and subject are required for send operation"
                }

            # Resolve account - use specified account or user's default sending account
            if account:
                send_account = email_service.resolve_account(account)
                if not send_account:
                    return {
                        "success": False,
                        "error": f"Account not found: {account}"
                    }
            else:
                # Try user's default sending account first, then Claude's account as fallback
                send_account = email_service.get_default_sending_account()
                if not send_account:
                    send_account = email_service.get_claude_account()
                if not send_account:
                    return {
                        "success": False,
                        "error": "No default sending account configured. Specify account= or set a default sending account."
                    }

            # Check if account can send
            if not send_account.get('can_send'):
                account_label = send_account.get('primary_email') or send_account.get('email') or send_account.get('display_name')
                return {
                    "success": False,
                    "error": f"Account '{account_label}' is not configured for sending. "
                             f"Use email('draft', ...) to create a draft for review, or enable sending in account settings."
                }

            # Resolve content: either inline or from file
            email_content = content
            if body_file:
                from pathlib import Path
                file_path = Path(body_file)
                if not file_path.exists():
                    return {
                        "success": False,
                        "error": f"body_file not found: {body_file}"
                    }

                raw_content = file_path.read_text()

                # Convert markdown to HTML if .md file
                if file_path.suffix.lower() == '.md':
                    try:
                        import markdown
                        email_content = markdown.markdown(
                            raw_content,
                            extensions=['tables', 'fenced_code', 'nl2br']
                        )
                    except ImportError:
                        # Fallback: basic conversion without markdown library
                        import html
                        email_content = f"<pre>{html.escape(raw_content)}</pre>"
                else:
                    email_content = raw_content

            if not email_content:
                return {
                    "success": False,
                    "error": "Either content or body_file is required for send operation"
                }

            # Parse recipients
            to_list = [e.strip() for e in to.split(',')]
            cc_list = [e.strip() for e in cc.split(',')] if cc else None
            bcc_list = [e.strip() for e in bcc.split(',')] if bcc else None

            # Send via unified EmailService (will queue with safeguards)
            result = email_service.send_message(
                account_id=send_account['id'],
                to=to_list,
                subject=subject,
                content=email_content,
                cc=cc_list,
                bcc=bcc_list,
                html=True,
            )

            # Log to Timeline on successful send
            if result.get("success"):
                from utils.timeline import log_system_event
                to_display = to_list[0] if len(to_list) == 1 else f"{to_list[0]} +{len(to_list)-1}"
                log_system_event(f'Email sent to {to_display} re: {subject}')
                result["logged_to"] = "Timeline"

            return result

        elif operation == "cancel":
            if not email_id:
                return {
                    "success": False,
                    "error": "email_id required for cancel operation"
                }

            result = email_service.cancel_email(email_id)
            return result

        elif operation == "status":
            if not email_id:
                return {
                    "success": False,
                    "error": "email_id required for status operation"
                }

            # Get status from database
            with get_db() as conn:
                email_record = conn.execute("""
                    SELECT id, to_emails, subject, status, queued_at, send_at, sent_at, error_message
                    FROM email_send_log
                    WHERE id = ?
                """, (email_id,)).fetchone()

            if not email_record:
                return {
                    "success": False,
                    "error": f"Email {email_id} not found"
                }

            return {
                "success": True,
                "email": dict(email_record)
            }

        elif operation == "history":
            history = email_service.get_send_history(limit=limit)
            return {
                "success": True,
                "count": len(history),
                "emails": history
            }

        elif operation == "queue":
            queued = email_service.get_queued_emails()
            return {
                "success": True,
                "count": len(queued),
                "queued_emails": queued
            }

        elif operation == "accounts":
            accounts = email_service.get_accounts_with_capabilities()
            return {
                "success": True,
                "count": len(accounts),
                "accounts": accounts
            }

        # Inbox operations - route via account-based service
        elif operation == "unread":
            messages = email_service.get_messages(
                mailbox_name=mailbox or "INBOX",
                account_identifier=account,
                limit=limit,
                unread_only=True
            )

            # Convert EmailMessage objects to dicts
            messages_data = [
                {
                    "id": msg.id,
                    "from": msg.sender,
                    "subject": msg.subject,
                    "date": msg.date_received,
                    "preview": msg.snippet,
                    "is_read": msg.is_read,
                    "mailbox": msg.mailbox,
                    "account": msg.account,
                }
                for msg in messages
            ]

            return {
                "success": True,
                "count": len(messages_data),
                "messages": messages_data
            }

        elif operation == "search":
            if not query:
                return {
                    "success": False,
                    "error": "query required for search operation"
                }

            messages = email_service.search_messages(
                query=query,
                mailbox_name=mailbox,
                account_identifier=account,
                limit=limit
            )

            # Convert EmailMessage objects to dicts
            messages_data = [
                {
                    "id": msg.id,
                    "from": msg.sender,
                    "subject": msg.subject,
                    "date": msg.date_received,
                    "preview": msg.snippet,
                    "is_read": msg.is_read,
                    "mailbox": msg.mailbox,
                    "account": msg.account,
                }
                for msg in messages
            ]

            return {
                "success": True,
                "count": len(messages_data),
                "messages": messages_data
            }

        elif operation == "read":
            if not message_id:
                return {
                    "success": False,
                    "error": "message_id required for read operation"
                }

            message = email_service.get_message(
                message_id=message_id,
                account_identifier=account,
            )

            if not message:
                return {
                    "success": False,
                    "error": f"Message {message_id} not found"
                }

            # Convert EmailMessage to dict with full content
            message_data = {
                "id": message.id,
                "from": message.sender,
                "to": message.recipients,
                "subject": message.subject,
                "date": message.date_received,
                "body": message.content or message.html_content,
                "is_read": message.is_read,
                "mailbox": message.mailbox,
                "account": message.account,
            }

            return {
                "success": True,
                "message": message_data
            }

        elif operation == "mark_read":
            if not message_id:
                return {
                    "success": False,
                    "error": "message_id required for mark_read operation"
                }

            success = email_service.mark_as_read(
                message_id=message_id,
                mailbox_name=mailbox or "INBOX",
                account_identifier=account  # Routes to correct provider
            )

            if success:
                return {
                    "success": True,
                    "message": f"Message {message_id} marked as read"
                }
            else:
                return {
                    "success": False,
                    "error": f"Failed to mark message {message_id} as read"
                }

        elif operation == "draft":
            # Draft operation - creates draft for human review
            # Apple Mail: Opens compose window immediately
            # Gmail: Creates draft and opens in browser
            # IMAP: Creates draft in Drafts folder
            
            if not to or not subject:
                return {
                    "success": False,
                    "error": "to and subject are required for draft operation"
                }

            # Resolve account - required for draft
            if not account:
                return {
                    "success": False,
                    "error": "account is required for draft operation (e.g., account='will@gmail.com')"
                }

            draft_account = email_service.resolve_account(account)
            if not draft_account:
                return {
                    "success": False,
                    "error": f"Account not found: {account}"
                }

            # Resolve content from file (preferred) or inline
            email_content = content
            if body_file:
                from pathlib import Path
                file_path = Path(body_file)
                if not file_path.exists():
                    return {
                        "success": False,
                        "error": f"body_file not found: {body_file}"
                    }

                raw_content = file_path.read_text()

                # Convert markdown to HTML if .md file
                if file_path.suffix.lower() == '.md':
                    try:
                        import markdown
                        email_content = markdown.markdown(
                            raw_content,
                            extensions=['tables', 'fenced_code', 'nl2br']
                        )
                    except ImportError:
                        # Fallback: basic conversion without markdown library
                        import html
                        email_content = f"<pre>{html.escape(raw_content)}</pre>"
                else:
                    email_content = raw_content

            if not email_content:
                return {
                    "success": False,
                    "error": "Either content or body_file is required for draft operation"
                }

            # Parse recipients
            to_list = [e.strip() for e in to.split(',')]
            cc_list = [e.strip() for e in cc.split(',')] if cc else None
            bcc_list = [e.strip() for e in bcc.split(',')] if bcc else None

            # Parse attachments (comma-separated file paths)
            attachments_list = None
            if attachments:
                from pathlib import Path
                attachments_list = []
                for path_str in attachments.split(','):
                    path_str = path_str.strip()
                    if not path_str:
                        continue
                    # Expand ~ and resolve path
                    file_path = Path(path_str).expanduser().resolve()
                    if not file_path.exists():
                        return {
                            "success": False,
                            "error": f"Attachment file not found: {path_str}"
                        }
                    attachments_list.append(str(file_path))

            # Create draft via EmailService - no safeguards, opens for review
            result = email_service.create_draft(
                account_id=draft_account['id'],
                to=to_list,
                subject=subject,
                content=email_content,
                cc=cc_list,
                bcc=bcc_list,
                html=True,
                attachments=attachments_list,
            )

            return result

        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use accounts, send, draft, cancel, status, history, queue, unread, search, read, or mark_read"
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ----------------------------------------------------------------------------
# CALENDAR TOOL
# Unified calendar operations across all providers
# ----------------------------------------------------------------------------


@mcp.tool()
def calendar(
    operation: str,
    # List/Get operations
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    event_id: Optional[str] = None,
    calendar_id: Optional[str] = None,
    limit: int = 100,
    # Create/Update operations
    title: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    all_day: bool = False,
    location: Optional[str] = None,
    description: Optional[str] = None,
    recurrence_rule: Optional[str] = None,
    attendees: Optional[List[str]] = None,
    # Provider selection
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """Calendar operations across all providers.

    Args:
        operation: Operation - 'list', 'get', 'create', 'update', 'delete', 'calendars'

        # List/Get operations
        from_date: Start date (ISO format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
        to_date: End date (ISO format)
        event_id: Event ID (required for get, update, delete)
        calendar_id: Calendar ID filter or target
        limit: Max events to return (default 100)

        # Create/Update operations
        title: Event title (required for create)
        start_time: Start datetime (ISO format, required for create)
        end_time: End datetime (ISO format, required for create)
        all_day: All-day event flag
        location: Event location
        description: Event description
        recurrence_rule: iCalendar RRULE for recurring events
        attendees: List of attendee email addresses

        # Provider selection
        provider: Provider type ('apple', 'google', 'local', etc.)

    Returns:
        Object with success status and operation-specific data

    Examples:
        # List operations
        calendar("list", from_date="2026-01-07", to_date="2026-01-14")
        calendar("calendars")  # List available calendars

        # Get specific event
        calendar("get", event_id="abc123")

        # Create event
        calendar("create", title="Meeting", start_time="2026-01-08T14:00:00",
                 end_time="2026-01-08T15:00:00", location="Office")

        # Update event
        calendar("update", event_id="abc123", title="Updated Meeting",
                 location="Zoom")

        # Delete event
        calendar("delete", event_id="abc123")
    """
    try:
        # Get CalendarService
        from apps.calendar.service import CalendarService
        from apps.calendar.adapters import EventCreate, EventUpdate

        services = get_services()
        storage = services['storage']
        calendar_service = CalendarService(storage)

        if operation == "calendars":
            calendars = calendar_service.get_calendars(provider_type=provider)

            # Convert CalendarInfo objects to dicts
            calendars_data = [
                {
                    "id": cal.id,
                    "name": cal.name,
                    "provider": cal.provider.value,
                    "is_primary": cal.primary,
                    "color": cal.color,
                }
                for cal in calendars
            ]

            return {
                "success": True,
                "count": len(calendars_data),
                "calendars": calendars_data
            }

        elif operation == "list":
            # Parse dates if provided
            start = None
            end = None

            if from_date:
                from datetime import datetime
                start = datetime.fromisoformat(from_date.replace('Z', '+00:00'))

            if to_date:
                from datetime import datetime
                # Fix date-only strings: set to end-of-day so same-day queries work
                # Without this, "2026-01-09" to "2026-01-09" creates 0-width range
                if 'T' not in to_date:
                    # Date-only string, set to 23:59:59 to include all events that day
                    to_date = to_date + "T23:59:59"
                end = datetime.fromisoformat(to_date.replace('Z', '+00:00'))

            events = calendar_service.get_events(
                start=start,
                end=end,
                calendar_id=calendar_id,
                provider_type=provider,
                limit=limit
            )

            # Convert CalendarEvent objects to dicts
            events_data = [
                {
                    "id": event.id,
                    "title": event.summary,
                    "start": event.start.isoformat(),
                    "end": event.end.isoformat(),
                    "all_day": event.all_day,
                    "location": event.location,
                    "description": event.description,
                    "calendar_id": event.calendar_id,
                    "calendar_name": event.calendar_name,
                    "provider": event.provider.value,
                }
                for event in events
            ]

            return {
                "success": True,
                "count": len(events_data),
                "events": events_data
            }

        elif operation == "get":
            if not event_id:
                return {
                    "success": False,
                    "error": "event_id required for get operation"
                }

            # Get events and filter by ID
            # (CalendarService doesn't have get_by_id, so we filter)
            events = calendar_service.get_events(limit=1000)
            event = next((e for e in events if e.id == event_id), None)

            if not event:
                return {
                    "success": False,
                    "error": f"Event {event_id} not found"
                }

            event_data = {
                "id": event.id,
                "title": event.summary,
                "start": event.start.isoformat(),
                "end": event.end.isoformat(),
                "all_day": event.all_day,
                "location": event.location,
                "description": event.description,
                "calendar_id": event.calendar_id,
                "calendar_name": event.calendar_name,
                "provider": event.provider.value,
                "recurrence_rule": event.recurrence_rule,
                "attendees": event.attendees,
            }

            return {
                "success": True,
                "event": event_data
            }

        elif operation == "create":
            if not title or not start_time or not end_time:
                return {
                    "success": False,
                    "error": "title, start_time, and end_time required for create"
                }

            from datetime import datetime
            start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end = datetime.fromisoformat(end_time.replace('Z', '+00:00'))

            event_create = EventCreate(
                summary=title,
                start=start,
                end=end,
                all_day=all_day,
                location=location,
                description=description,
                calendar_id=calendar_id,
                recurrence_rule=recurrence_rule,
                attendees=attendees or []
            )

            created_event = calendar_service.create_event(
                event=event_create,
                provider_type=provider
            )

            if not created_event:
                return {
                    "success": False,
                    "error": "Failed to create event"
                }

            # Log to Timeline
            from utils.timeline import log_system_event
            time_str = created_event.start.strftime("%b %d %I:%M%p").replace(" 0", " ").lower()
            log_system_event(f'Calendar: added "{created_event.summary}" for {time_str}')

            return {
                "success": True,
                "event": {
                    "id": created_event.id,
                    "title": created_event.summary,
                    "start": created_event.start.isoformat(),
                    "end": created_event.end.isoformat(),
                    "calendar_id": created_event.calendar_id,
                },
                "logged_to": "Timeline"
            }

        elif operation == "update":
            if not event_id:
                return {
                    "success": False,
                    "error": "event_id required for update operation"
                }

            # Build update object with only provided fields
            from datetime import datetime

            event_update = EventUpdate()

            if title is not None:
                event_update.summary = title
            if start_time is not None:
                event_update.start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            if end_time is not None:
                event_update.end = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            if location is not None:
                event_update.location = location
            if description is not None:
                event_update.description = description
            if calendar_id is not None:
                event_update.calendar_id = calendar_id

            updated_event = calendar_service.update_event(
                event_id=event_id,
                update=event_update,
                calendar_id=calendar_id,
                provider_type=provider
            )

            if not updated_event:
                return {
                    "success": False,
                    "error": f"Failed to update event {event_id}"
                }

            # Log to Timeline
            from utils.timeline import log_system_event
            time_str = updated_event.start.strftime("%b %d %I:%M%p").replace(" 0", " ").lower()
            log_system_event(f'Calendar: "{updated_event.summary}" updated to {time_str}')

            return {
                "success": True,
                "event": {
                    "id": updated_event.id,
                    "title": updated_event.summary,
                    "start": updated_event.start.isoformat(),
                    "end": updated_event.end.isoformat(),
                },
                "logged_to": "Timeline"
            }

        elif operation == "delete":
            if not event_id:
                return {
                    "success": False,
                    "error": "event_id required for delete operation"
                }

            # Get event title before deleting for logging
            events = calendar_service.get_events(limit=1000)
            event_to_delete = next((e for e in events if e.id == event_id), None)
            event_title = event_to_delete.summary if event_to_delete else event_id

            success = calendar_service.delete_event(
                event_id=event_id,
                calendar_id=calendar_id,
                provider_type=provider
            )

            if success:
                # Log to Timeline
                from utils.timeline import log_system_event
                log_system_event(f'Calendar: "{event_title}" cancelled')

                return {
                    "success": True,
                    "message": f"Event {event_id} deleted",
                    "logged_to": "Timeline"
                }
            else:
                return {
                    "success": False,
                    "error": f"Failed to delete event {event_id}"
                }

        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use list, get, create, update, delete, or calendars"
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ----------------------------------------------------------------------------
# SHOW TOOL
# Visual content rendering for Telegram and Dashboard
# ----------------------------------------------------------------------------


@mcp.tool()
async def show(
    what: str,
    destination: str = "auto"
) -> Dict[str, Any]:
    """Render visual output for the given content type.

    Args:
        what: Content to show. Formats:
            - "calendar" — Today's calendar
            - "calendar:week" — This week's calendar
            - "contact:{name}" — Contact card
            - "priorities" — Today's priorities
            - "specialists" — Active specialists
            - "diagram:{name}" — Mermaid diagram
            - "file:{path}" — File preview
        destination: Where to render
            - "auto" — Detect from message source
            - "telegram" — Force Telegram (image)
            - "dashboard" — Force Dashboard (component)

    Returns:
        {"success": True, "rendered": "telegram|dashboard", "message": "..."}
    """
    from services.show import show_content
    return await show_content(what, destination)
