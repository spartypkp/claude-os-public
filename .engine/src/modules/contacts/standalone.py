"""Standalone contacts repository - For systems without Apple Contacts.

This repository manages contacts entirely in SQLite, independent of
Apple Contacts integration. Used by MCP tools for portable contact management.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from .models import normalize_phone


class StandaloneContactsRepository:
    """Repository for standalone contact management.

    All contact data stored in SQLite 'contacts' table.
    No Apple Contacts dependency.
    """

    def __init__(self, storage):
        """Initialize with storage backend.

        Args:
            storage: SystemStorage instance for database access
        """
        self.storage = storage

    def _now(self) -> str:
        """Get current UTC timestamp in ISO format."""
        return datetime.now(timezone.utc).isoformat()

    # === Search Operations ===

    def search(self, query: str, limit: int = 20) -> List[dict]:
        """Search contacts by name, phone, email, company, description, or notes.

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of contact dicts
        """
        search_term = f"%{query}%"
        rows = self.storage.fetchall("""
            SELECT DISTINCT id, name, phone, description, pinned
            FROM contacts
            WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?
               OR company LIKE ? OR description LIKE ? OR notes LIKE ?
            ORDER BY pinned DESC, name
            LIMIT ?
        """, (search_term, search_term, search_term, search_term, search_term, search_term, limit))
        return [dict(row) for row in rows]

    def find(self, identifier: str) -> Optional[dict]:
        """Find a contact by ID prefix, name, or phone.

        Args:
            identifier: ID prefix, name, or phone number

        Returns:
            Contact dict or None
        """
        # Try by ID prefix
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE id LIKE ?",
            (f"{identifier}%",)
        )
        if row:
            return dict(row)

        # Try by exact name
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)",
            (identifier,)
        )
        if row:
            return dict(row)

        # Try by phone
        normalized = normalize_phone(identifier)
        if normalized:
            row = self.storage.fetchone(
                "SELECT * FROM contacts WHERE phone = ?",
                (normalized,)
            )
            if row:
                return dict(row)

        # Fuzzy name match
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE LOWER(name) LIKE LOWER(?) ORDER BY pinned DESC, name LIMIT 1",
            (f"%{identifier}%",)
        )
        if row:
            return dict(row)

        return None

    def find_by_email(self, email: str) -> Optional[dict]:
        """Find a contact by email address (case-insensitive).

        Args:
            email: Email address to search

        Returns:
            Contact dict or None
        """
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE LOWER(email) = LOWER(?)",
            (email,)
        )
        return dict(row) if row else None

    def find_by_phone(self, phone: str) -> Optional[dict]:
        """Find a contact by phone number (normalized).

        Args:
            phone: Phone number (will be normalized)

        Returns:
            Contact dict or None
        """
        normalized = normalize_phone(phone)
        if not normalized:
            return None
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE phone = ?",
            (normalized,)
        )
        return dict(row) if row else None

    def get(self, contact_id: str) -> Optional[dict]:
        """Get a contact by full ID.

        Args:
            contact_id: Full contact UUID

        Returns:
            Contact dict or None
        """
        row = self.storage.fetchone(
            "SELECT * FROM contacts WHERE id = ?",
            (contact_id,)
        )
        return dict(row) if row else None

    # === CRUD Operations ===

    def create(
        self,
        name: str,
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
        pinned: bool = False,
    ) -> dict:
        """Create a new contact.

        Args:
            name: Display name (required)
            phone: Phone number (auto-normalized)
            email: Email address
            company: Company/organization
            role: Job title/role
            location: Location
            description: One-liner description
            relationship: Relationship type
            context_notes: Context notes
            value_exchange: Value exchange notes
            notes: General notes
            pinned: Pin status

        Returns:
            Created contact dict with id
        """
        contact_id = str(uuid.uuid4())
        now = self._now()
        normalized_phone = normalize_phone(phone) if phone else None

        self.storage.execute("""
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

        return {
            "id": contact_id,
            "name": name,
            "phone": normalized_phone,
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
            "created_at": now,
            "updated_at": now,
        }

    def update(
        self,
        contact_id: str,
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
        current_state: Optional[str] = None,
        linkedin_url: Optional[str] = None,
        contact_cadence: Optional[int] = None,
    ) -> bool:
        """Update a contact (replace semantics).

        Args:
            contact_id: Contact UUID
            All other args: Fields to update (None = no change)

        Returns:
            True if updated, False if not found
        """
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
            "current_state": current_state,
            "linkedin_url": linkedin_url,
        }

        for field, value in field_mapping.items():
            if value is not None:
                updates.append(f"{field} = ?")
                values.append(value)

        if pinned is not None:
            updates.append("pinned = ?")
            values.append(1 if pinned else 0)

        if contact_cadence is not None:
            updates.append("contact_cadence = ?")
            values.append(contact_cadence)

        if not updates:
            return True  # Nothing to update

        updates.append("updated_at = ?")
        values.append(self._now())
        values.append(contact_id)

        sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
        self.storage.execute(sql, values)
        return True

    def enrich(
        self,
        contact_id: str,
        current: dict,
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
        current_state: Optional[str] = None,
        linkedin_url: Optional[str] = None,
        contact_cadence: Optional[int] = None,
    ) -> int:
        """Enrich a contact (additive semantics).

        Fill empty fields, append to text fields.

        Args:
            contact_id: Contact UUID
            current: Current contact data
            All other args: Fields to enrich

        Returns:
            Number of fields updated
        """
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
            "current_state": current_state,
            "linkedin_url": linkedin_url,
        }
        for field, value in fill_fields.items():
            if value is not None and not current.get(field):
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
                existing = current.get(field) or ""
                combined = f"{existing}\n\n{value}" if existing else value
                updates.append(f"{field} = ?")
                values.append(combined)

        if pinned is not None:
            updates.append("pinned = ?")
            values.append(1 if pinned else 0)

        if contact_cadence is not None and not current.get("contact_cadence"):
            updates.append("contact_cadence = ?")
            values.append(contact_cadence)

        fields_count = len(updates)

        if updates:
            updates.append("updated_at = ?")
            values.append(self._now())
            values.append(contact_id)
            sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
            self.storage.execute(sql, values)

        return fields_count

    # === History Operations ===

    def add_history(
        self,
        contact_id: str,
        entry: str,
        entry_date: Optional[str] = None,
        source: str = "chief",
    ) -> dict:
        """Add a history entry for a contact.

        Args:
            contact_id: Contact UUID
            entry: History entry text
            entry_date: ISO date (defaults to today)
            source: Entry source (chief, email, imessage, calendar, manual)

        Returns:
            Created history entry dict
        """
        history_id = str(uuid.uuid4())
        if not entry_date:
            entry_date = date.today().isoformat()

        self.storage.execute("""
            INSERT INTO contact_history (id, contact_id, entry, entry_date, source)
            VALUES (?, ?, ?, ?, ?)
        """, (history_id, contact_id, entry, entry_date, source))

        return {
            "id": history_id,
            "contact_id": contact_id,
            "entry": entry,
            "entry_date": entry_date,
            "source": source,
        }

    def get_history(self, contact_id: str, limit: int = 20) -> List[dict]:
        """Get history entries for a contact.

        Args:
            contact_id: Contact UUID
            limit: Max entries to return

        Returns:
            List of history entry dicts, most recent first
        """
        rows = self.storage.fetchall("""
            SELECT id, contact_id, entry, entry_date, source, created_at
            FROM contact_history
            WHERE contact_id = ?
            ORDER BY entry_date DESC, created_at DESC
            LIMIT ?
        """, (contact_id, limit))
        return [dict(row) for row in rows]

    def delete(self, contact_id: str) -> bool:
        """Delete a contact.

        Args:
            contact_id: Contact UUID

        Returns:
            True if deleted
        """
        self.storage.execute("DELETE FROM contact_tags WHERE contact_id = ?", (contact_id,))
        self.storage.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        return True

    # === Tag Operations ===

    def get_tags(self, contact_id: str) -> List[str]:
        """Get all tags for a contact."""
        rows = self.storage.fetchall(
            "SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag",
            (contact_id,)
        )
        return [row["tag"] for row in rows]

    def replace_tags(self, contact_id: str, tags: List[str]) -> None:
        """Replace all tags for a contact."""
        self.storage.execute("DELETE FROM contact_tags WHERE contact_id = ?", (contact_id,))
        for tag in tags:
            self.storage.execute(
                "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                (contact_id, tag)
            )

    def merge_tags(self, contact_id: str, tags: List[str]) -> int:
        """Merge tags (add new ones, keep existing)."""
        existing = set(self.get_tags(contact_id))
        added = 0
        for tag in tags:
            if tag not in existing:
                self.storage.execute(
                    "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                    (contact_id, tag)
                )
                added += 1
        return added

    # === List Operations ===

    def list_pinned(self, limit: int = 20) -> List[dict]:
        """List pinned contacts."""
        rows = self.storage.fetchall("""
            SELECT id, name, phone, description, pinned, relationship, last_contact_date
            FROM contacts
            WHERE pinned = 1
            ORDER BY name
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in rows]

    def list_by_relationship(self, relationship: str, limit: int = 20) -> List[dict]:
        """List contacts by relationship type."""
        rows = self.storage.fetchall("""
            SELECT id, name, phone, description, pinned, relationship, last_contact_date
            FROM contacts
            WHERE relationship = ?
            ORDER BY pinned DESC, name
            LIMIT ?
        """, (relationship, limit))
        return [dict(row) for row in rows]

    def list_recent(self, threshold: str, limit: int = 20) -> List[dict]:
        """List recently contacted people."""
        rows = self.storage.fetchall("""
            SELECT id, name, phone, description, pinned, relationship, last_contact_date
            FROM contacts
            WHERE last_contact_date >= ?
            ORDER BY last_contact_date DESC
            LIMIT ?
        """, (threshold, limit))
        return [dict(row) for row in rows]

    # === Merge Operation ===

    def merge(self, source_id: str, target_id: str, source: dict, target: dict) -> dict:
        """Merge source contact into target, delete source.

        Args:
            source_id: Source contact UUID
            target_id: Target contact UUID
            source: Source contact data
            target: Target contact data

        Returns:
            Merge summary
        """
        updates = []
        values = []

        # Fill empty fields from source
        fill_fields = ["email", "company", "role", "location", "description", "relationship"]
        for field in fill_fields:
            if not target.get(field) and source.get(field):
                updates.append(f"{field} = ?")
                values.append(source[field])

        # Append text fields
        append_fields = ["context_notes", "value_exchange", "notes"]
        for field in append_fields:
            target_val = target.get(field) or ""
            source_val = source.get(field) or ""
            if source_val:
                combined = f"{target_val}\n\n{source_val}" if target_val else source_val
                updates.append(f"{field} = ?")
                values.append(combined)

        # Merge tags
        source_tags = set(self.get_tags(source_id))
        target_tags = set(self.get_tags(target_id))
        new_tags = source_tags - target_tags
        for tag in new_tags:
            self.storage.execute(
                "INSERT INTO contact_tags (contact_id, tag) VALUES (?, ?)",
                (target_id, tag)
            )

        # Update target
        if updates:
            updates.append("updated_at = ?")
            values.append(self._now())
            values.append(target_id)
            sql = f"UPDATE contacts SET {', '.join(updates)} WHERE id = ?"
            self.storage.execute(sql, values)

        # Delete source
        self.delete(source_id)

        return {
            "fields_merged": len(updates) - 1 if updates else 0,  # Exclude updated_at
            "tags_merged": len(new_tags),
        }

    # === Staleness & Graph Operations ===

    def list_stale(self, limit: int = 50) -> List[dict]:
        """List contacts with cadence tracking, sorted by staleness.

        Returns contacts where contact_cadence is set OR pinned with last_contact_date.
        Annotates each with days_since_contact and status.

        Status logic:
        - on_track: days_since <= cadence
        - overdue: cadence < days_since <= cadence * 2
        - way_overdue: days_since > cadence * 2
        - no_cadence: contact_cadence not set (pinned contacts without cadence)

        Returns:
            List of contact dicts with staleness annotations, most overdue first
        """
        rows = self.storage.fetchall("""
            SELECT id, name, phone, email, company, role, description,
                   relationship, pinned, last_contact_date, contact_cadence,
                   current_state, linkedin_url
            FROM contacts
            WHERE contact_cadence > 0
               OR (pinned = 1 AND last_contact_date IS NOT NULL)
            ORDER BY name
            LIMIT ?
        """, (limit,))

        today = date.today()
        results = []
        for row in rows:
            contact = dict(row)
            cadence = contact.get("contact_cadence") or 0
            last = contact.get("last_contact_date")

            if last:
                try:
                    last_date = date.fromisoformat(last[:10])
                    days_since = (today - last_date).days
                except (ValueError, TypeError):
                    days_since = None
            else:
                days_since = None

            if cadence > 0 and days_since is not None:
                if days_since <= cadence:
                    status = "on_track"
                elif days_since <= cadence * 2:
                    status = "overdue"
                else:
                    status = "way_overdue"
            elif cadence > 0 and days_since is None:
                status = "way_overdue"  # Has cadence but never contacted
            else:
                status = "no_cadence"

            contact["days_since"] = days_since
            contact["status"] = status
            results.append(contact)

        # Sort: way_overdue first, then overdue, then no_cadence, then on_track
        # Within each group, sort by days_since descending (most stale first)
        status_order = {"way_overdue": 0, "overdue": 1, "no_cadence": 2, "on_track": 3}
        results.sort(key=lambda c: (
            status_order.get(c["status"], 4),
            -(c["days_since"] or 9999),
        ))

        return results

    def get_graph_data(self, limit: int = 200) -> Dict[str, Any]:
        """Build social graph data from contacts.

        Returns nodes and edges for contacts that have at least one connection
        (shared company, shared tags) or are pinned.

        Returns:
            { nodes: [...], edges: [...] }
        """
        # Get contacts with company, tags, or pinned status
        rows = self.storage.fetchall("""
            SELECT id, name, company, role, relationship, pinned,
                   last_contact_date, current_state, description
            FROM contacts
            WHERE company IS NOT NULL AND company != ''
               OR pinned = 1
               OR relationship IS NOT NULL AND relationship != ''
            ORDER BY pinned DESC, name
            LIMIT ?
        """, (limit,))

        contacts = [dict(r) for r in rows]
        contact_ids = {c["id"] for c in contacts}

        # Get tags for these contacts
        tags_by_contact: Dict[str, List[str]] = {}
        if contact_ids:
            placeholders = ",".join("?" for _ in contact_ids)
            tag_rows = self.storage.fetchall(f"""
                SELECT contact_id, tag FROM contact_tags
                WHERE contact_id IN ({placeholders})
                ORDER BY tag
            """, list(contact_ids))
            for tr in tag_rows:
                cid = tr["contact_id"]
                if cid not in tags_by_contact:
                    tags_by_contact[cid] = []
                tags_by_contact[cid].append(tr["tag"])

        # Also include contacts that share tags with the above set
        all_tags = set()
        for tags in tags_by_contact.values():
            all_tags.update(tags)

        if all_tags:
            tag_placeholders = ",".join("?" for _ in all_tags)
            extra_rows = self.storage.fetchall(f"""
                SELECT DISTINCT c.id, c.name, c.company, c.role, c.relationship,
                       c.pinned, c.last_contact_date, c.current_state, c.description
                FROM contacts c
                JOIN contact_tags ct ON c.id = ct.contact_id
                WHERE ct.tag IN ({tag_placeholders})
                  AND c.id NOT IN ({placeholders})
                LIMIT ?
            """, list(all_tags) + list(contact_ids) + [limit])
            for er in extra_rows:
                ec = dict(er)
                contacts.append(ec)
                contact_ids.add(ec["id"])
                # Fetch their tags too
                et_rows = self.storage.fetchall(
                    "SELECT tag FROM contact_tags WHERE contact_id = ?",
                    (ec["id"],)
                )
                tags_by_contact[ec["id"]] = [r["tag"] for r in et_rows]

        # Build nodes
        nodes = []
        for c in contacts:
            nodes.append({
                "id": c["id"],
                "name": c["name"],
                "company": c["company"],
                "role": c["role"],
                "relationship": c["relationship"],
                "pinned": bool(c.get("pinned")),
                "tags": tags_by_contact.get(c["id"], []),
                "description": c.get("description"),
            })

        # Build edges from shared company
        edges = []
        edge_set = set()  # Deduplicate
        company_groups: Dict[str, List[str]] = {}
        for c in contacts:
            comp = c.get("company")
            if comp:
                if comp not in company_groups:
                    company_groups[comp] = []
                company_groups[comp].append(c["id"])

        for company, ids in company_groups.items():
            if len(ids) < 2:
                continue
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    edge_key = tuple(sorted([ids[i], ids[j]]))
                    if edge_key not in edge_set:
                        edge_set.add(edge_key)
                        edges.append({
                            "source": ids[i],
                            "target": ids[j],
                            "type": "company",
                            "label": company,
                        })

        # Build edges from shared tags
        tag_groups: Dict[str, List[str]] = {}
        for cid, tags in tags_by_contact.items():
            for tag in tags:
                if tag not in tag_groups:
                    tag_groups[tag] = []
                tag_groups[tag].append(cid)

        for tag, ids in tag_groups.items():
            if len(ids) < 2:
                continue
            for i in range(len(ids)):
                for j in range(i + 1, len(ids)):
                    edge_key = tuple(sorted([ids[i], ids[j]]))
                    if edge_key not in edge_set:
                        edge_set.add(edge_key)
                        edges.append({
                            "source": ids[i],
                            "target": ids[j],
                            "type": "tag",
                            "label": tag,
                        })

        # Filter to only connected nodes or pinned
        connected_ids = set()
        for e in edges:
            connected_ids.add(e["source"])
            connected_ids.add(e["target"])

        filtered_nodes = [n for n in nodes if n["id"] in connected_ids or n["pinned"]]

        return {
            "nodes": filtered_nodes,
            "edges": edges,
        }

    # === Calendar Attendee Enrichment ===

    def enrich_from_calendar_attendees(
        self,
        attendees: List[Dict],
        event_title: str,
    ) -> Dict[str, Any]:
        """Enrich contacts from calendar event attendees.

        For each attendee email: find or create a contact, touch last_contact_date.
        Utility for Chief or scheduled tasks.

        Args:
            attendees: List of attendee dicts with 'email' and optionally 'name'
            event_title: Event title for context

        Returns:
            Summary of actions taken
        """
        created = []
        touched = []
        today = date.today().isoformat()

        for attendee in attendees:
            email = None
            name = None
            if isinstance(attendee, dict):
                email = attendee.get("email")
                name = attendee.get("name")
            elif isinstance(attendee, str):
                email = attendee

            if not email:
                continue

            existing = self.find_by_email(email)
            if existing:
                # Touch last_contact_date if not already today
                if existing.get("last_contact_date") != today:
                    self.storage.execute(
                        "UPDATE contacts SET last_contact_date = ?, updated_at = ? WHERE id = ?",
                        (today, self._now(), existing["id"])
                    )
                touched.append(existing["name"])
            else:
                # Create new contact with minimal info
                new_contact = self.create(
                    name=name or email.split("@")[0],
                    email=email,
                    context_notes=f"Met at: {event_title}",
                )
                # Set last_contact_date
                self.storage.execute(
                    "UPDATE contacts SET last_contact_date = ? WHERE id = ?",
                    (today, new_contact["id"])
                )
                created.append(new_contact["name"])

        return {
            "created": created,
            "touched": touched,
            "total": len(created) + len(touched),
        }
