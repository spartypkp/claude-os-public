"""Contact service - database-first contact management."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from .storage import SystemStorage


@dataclass(frozen=True)
class Contact:
    """Contact data for rendering"""
    name: str
    description: str
    tags: Tuple[str, ...]
    relative_path: Path
    absolute_path: Path
    last_modified: datetime


class ContactsService:
    """Database-first contact management service.

    Queries contacts from SQLite database and generates markdown files
    for pinned contacts only. Replaces markdown-based ContactsService.
    """

    def __init__(self, repo_root: Path, config: Dict[str, Any], storage: Optional[SystemStorage] = None):
        self.repo_root = repo_root
        self.config = config

        # Initialize storage
        if storage is None:
            db_path = repo_root / ".engine" / "data" / "db" / "system.db"
            storage = SystemStorage(db_path)
        self.storage = storage

    def load_contacts(self) -> Tuple[List[Contact], List[str]]:
        """Load pinned contacts from database.

        Returns contacts sorted by updated_at (most recent first).
        Warnings list is kept for API compatibility but should be empty.
        """
        warnings: List[str] = []
        contacts: List[Contact] = []

        # Query pinned contacts from database
        query = """
            SELECT id, name, description, updated_at
            FROM contacts
            WHERE pinned = 1
            ORDER BY updated_at DESC
        """

        rows = self.storage.fetchall(query)

        for row in rows:
            contact_id = row["id"]
            name = row["name"]
            description = row["description"] or "No description provided."

            # Get tags for this contact
            tags_query = "SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag"
            tag_rows = self.storage.fetchall(tags_query, (contact_id,))
            tags = tuple(tag_row[0] for tag_row in tag_rows if tag_row[0] is not None)

            # Generate markdown file path
            filename = name.lower().replace(" ", "-") + ".md"
            relative_path = Path("Library") / "contacts" / filename
            absolute_path = self.repo_root / relative_path

            # Use updated_at as last_modified
            try:
                updated_at_str = row["updated_at"]
                last_modified = datetime.fromisoformat(updated_at_str)
            except (ValueError, TypeError):
                last_modified = datetime.now()

            contacts.append(
                Contact(
                    name=name,
                    description=description,
                    tags=tags,
                    relative_path=relative_path,
                    absolute_path=absolute_path,
                    last_modified=last_modified,
                )
            )

        return contacts, warnings

    def build_contacts_section(self, contacts: List[Contact]) -> str:
        """Build contacts section for markdown output."""
        cfg = (self.config.get("contacts") or {}) if self.config else {}
        max_items = cfg.get("max_items")
        include_tags_raw = cfg.get("include_tags")

        include_tags: Optional[Tuple[str, ...]] = None
        if isinstance(include_tags_raw, str):
            tokens = [token.strip().lower() for token in include_tags_raw.split(",")]
            include_tags = tuple(filter(None, tokens))
        elif isinstance(include_tags_raw, Iterable):
            tokens = [str(token).strip().lower() for token in include_tags_raw if str(token).strip()]
            include_tags = tuple(tokens)

        section_lines = ["## Important People 🔒", ""]
        filtered_contacts = contacts
        if include_tags:
            tag_set = set(include_tags)
            filtered_contacts = [
                contact for contact in contacts
                if tag_set.intersection(tag.lower() for tag in contact.tags)
            ]

        if not filtered_contacts:
            section_lines.append("*No contacts found.*")
            return "\n".join(section_lines)

        render_contacts = filtered_contacts
        if isinstance(max_items, int) and max_items > 0:
            render_contacts = filtered_contacts[:max_items]

        for contact in render_contacts:
            tag_suffix = ""
            if contact.tags:
                tag_suffix = f" [{', '.join(contact.tags)}]"
            section_lines.append(
                f"- **[{contact.name}]({contact.relative_path})** — {contact.description}{tag_suffix}"
            )

        if isinstance(max_items, int) and max_items > 0 and len(contacts) > max_items:
            section_lines.append("")
            section_lines.append(
                f"*…and {len(contacts) - max_items} more. Adjust `contacts.max_items` to show additional people.*"
            )
        elif include_tags and len(filtered_contacts) < len(contacts):
            section_lines.append("")
            section_lines.append(f"*Filtered to tags: {', '.join(include_tags)}*")

        return "\n".join(section_lines)


__all__ = ["Contact", "ContactsService"]
