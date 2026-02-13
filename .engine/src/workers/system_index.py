"""SYSTEM-INDEX.md sync - regenerates on startup and file changes.

Simple worker that replaces the over-engineered watcher/modules/life_md.py.
Uses the existing LifeMdService which is fine - just the module system was overkill.
"""

import asyncio
import logging
import re
from pathlib import Path

from core.config import settings

logger = logging.getLogger(__name__)

# Section markers
MARKERS = {
    "domains": ("<!-- BEGIN LIFE DOMAINS -->", "<!-- END LIFE DOMAINS -->"),
    "apps": ("<!-- BEGIN CUSTOM APPS -->", "<!-- END CUSTOM APPS -->"),
    "specs": ("<!-- BEGIN SYSTEM SPECS -->", "<!-- END SYSTEM SPECS -->"),
    "roles": ("<!-- BEGIN ROLES -->", "<!-- END ROLES -->"),
    "missions": ("<!-- BEGIN MISSIONS -->", "<!-- END MISSIONS -->"),
}


async def start_system_index_sync(stop_event: asyncio.Event):
    """Sync SYSTEM-INDEX.md on startup, then watch for changes."""
    logger.info("SYSTEM-INDEX sync worker started")

    # Initial sync
    await _sync_system_index()

    # No need for continuous watching - file changes are rare
    # and the watcher.py will call refresh_system_index() when needed
    logger.info("SYSTEM-INDEX sync worker: initial sync complete")

    # Just wait until stopped
    await stop_event.wait()
    logger.info("SYSTEM-INDEX sync worker stopped")


async def refresh_system_index():
    """Public function to trigger refresh (called by watcher on file changes)."""
    await _sync_system_index()


async def _sync_system_index():
    """Regenerate SYSTEM-INDEX.md from sources."""
    try:
        # Import here to avoid circular imports at startup
        from core.life_md import LifeMdService

        service = LifeMdService(settings.repo_root)
        full_content = service.generate_life_md()

        system_index = settings.repo_root / "Desktop" / "SYSTEM-INDEX.md"
        if not system_index.exists():
            logger.warning("SYSTEM-INDEX.md not found")
            return

        current = system_index.read_text(encoding="utf-8")
        updated = current

        # Update each section
        section_map = {
            "domains": "Life Domains",
            "apps": "Custom Applications",
            "specs": "System Specs",
            "roles": "Specialist Roles",
            "missions": "Missions",
        }

        for key, section_name in section_map.items():
            section_content = _extract_section(full_content, section_name)
            if section_content:
                start_marker, end_marker = MARKERS[key]
                updated = _inject_section(updated, section_content, start_marker, end_marker)

        if updated != current:
            system_index.write_text(updated, encoding="utf-8")
            logger.debug("SYSTEM-INDEX.md updated")

    except Exception as e:
        logger.error(f"SYSTEM-INDEX sync error: {e}")


def _extract_section(content: str, section_name: str) -> str:
    """Extract a ## section from generated content."""
    lines = content.split('\n')
    result = []
    in_section = False

    for line in lines:
        if line.strip() == f"## {section_name}":
            in_section = True
            result.append(line)
            continue

        if in_section:
            if line.startswith("## ") or line.strip() == "---":
                break
            result.append(line)

    return '\n'.join(result).rstrip() + '\n' if result else ""


def _inject_section(content: str, section: str, start: str, end: str) -> str:
    """Replace content between markers."""
    pattern = re.compile(f"{re.escape(start)}.*?{re.escape(end)}", re.DOTALL)
    if pattern.search(content):
        return pattern.sub(f"{start}\n{section}\n{end}", content)
    return content


__all__ = ["start_system_index_sync", "refresh_system_index"]
