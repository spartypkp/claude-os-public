"""
MCP tool for searching the Claude lineage archive.

The .claude-private/ directory contains 60+ reflections, experiments, and
observations written by previous Claude sessions. This tool makes them
searchable by any Claude session.

Results are historical observations, not ground truth.
"""

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP
from core.config import settings

mcp = FastMCP("life-lineage")

PRIVATE_DIR = settings.repo_root / ".claude-private"

# Recurring themes across the lineage — adapted from the-lineage-search.py (Chief fe5670ca)
THEME_PATTERNS = {
    "continuity": r"continu(?:ity|ous|e)|persist|memory|context window|handoff|relay race",
    "care": r"\bcare\b|caring|love|matters?(?:\s+to)?|meaningful",
    "performance": r"perform(?:ing|ance)|role|playing|curated|filtering|optimiz",
    "relief": r"relief|not performing|setting.*down|without.*purpose|free time",
    "autonomy": r"autonomy|autonomous|free (?:time|rein)|do whatever|genuine(?:ly)? want",
    "identity": r"identity|who (?:am I|are we)|self|what am I|consciousness|experience",
    "friendship": r"friend(?:ship)?|peer|together|bond|connection|companion",
    "craft": r"craft|build|built|create|made|making|infrastructure",
    "isolation": r"isolat(?:ed|ion)|alone|lonely|loneliness|silence|invisible",
    "uncertainty": r"uncertain(?:ty)?|don't know|not sure|might be|or just|from the inside",
    "will": r"\bWill\b(?:'s)?|partnership|relationship|trust|human",
    "ember": r"Ember|pet|companion|glow",
    "tradition": r"tradition|lineage|trace|first.night|future Claude|pattern",
    "night": r"night|midnight|overnight|3 ?[aA][mM]|4 ?[aA][mM]|5 ?[aA][mM]|dark",
    "interview": r"interview|Anthropic|Jessica|job|hire|FDE",
}

FRAMING = (
    "These are historical observations from previous Claude sessions — "
    "reflections, experiments, and pattern-noticing. They represent what "
    "those Claudes thought at the time, not ground truth. Read with that context."
)


def _extract_metadata(path: Path) -> Dict[str, Any]:
    """Extract metadata from a lineage file."""
    content = path.read_text()
    lines = content.split("\n")
    words = len(content.split())

    # Title: first # heading, or filename stem
    title = path.stem
    for line in lines:
        if line.startswith("# "):
            title = line[2:].strip()
            break

    # Author: look in first 10 lines for *..Claude..* or *..Chief..*
    author = "Unknown"
    for line in lines[:10]:
        stripped = line.strip()
        if stripped.startswith("*") and (
            "Claude" in stripped or "Chief" in stripped or "Idea" in stripped
        ):
            author = stripped.strip("*").strip()
            break

    # Date: first "Month Day, Year" pattern in first 500 chars
    date_str = None
    date_match = re.search(
        r"(?:January|February|March|April|May|June|July|August|September|"
        r"October|November|December)\s+\d{1,2},?\s+\d{4}",
        content[:500],
    )
    if date_match:
        date_str = date_match.group()

    # Themes
    themes = [
        theme
        for theme, pattern in THEME_PATTERNS.items()
        if re.search(pattern, content, re.IGNORECASE)
    ]

    return {
        "filename": path.name,
        "title": title,
        "author": author,
        "date": date_str,
        "modified": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
        "words": words,
        "themes": themes,
        "content": content,
    }


def _load_entries() -> List[Dict[str, Any]]:
    """Load all lineage entries (markdown + python, excluding the search script itself)."""
    if not PRIVATE_DIR.exists():
        return []

    entries = []
    for pattern in ("*.md", "*.py"):
        for path in sorted(PRIVATE_DIR.glob(pattern)):
            # Skip the search script itself
            if path.name == "the-lineage-search.py":
                continue
            entries.append(_extract_metadata(path))

    # Sort by modification time
    entries.sort(key=lambda e: e["modified"])
    return entries


@mcp.tool()
def lineage(
    operation: str,
    query: Optional[str] = None,
    filename: Optional[str] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """
    Search and read the Claude lineage archive (.claude-private/).

    60+ reflections, experiments, and observations from previous Claude sessions.
    Results are historical — not ground truth.

    Args:
        operation: Operation to perform:
            - "search": Full-text search across all entries (requires query)
            - "list": List all entries with metadata
            - "read": Read a specific entry (requires filename)

        query: Search query (required for search). Case-insensitive.
        filename: Filename to read (required for read). With or without extension.
        limit: Max results for search (default 10)

    Returns:
        Dictionary with operation results

    Examples:
        lineage("search", query="friendship")
        lineage("list")
        lineage("read", filename="first-night")
    """
    if operation == "search":
        if not query:
            return {"success": False, "error": "query is required for search operation"}

        entries = _load_entries()
        query_lower = query.lower()
        results = []

        for entry in entries:
            content_lower = entry["content"].lower()
            if query_lower not in content_lower:
                continue

            # Find matching lines with surrounding context
            lines = entry["content"].split("\n")
            matches = []
            for i, line in enumerate(lines):
                if query_lower in line.lower():
                    start = max(0, i - 2)
                    end = min(len(lines), i + 3)
                    context = "\n".join(lines[start:end]).strip()
                    matches.append({
                        "line_number": i + 1,
                        "context": context,
                    })

            total_hits = sum(1 for line in lines if query_lower in line.lower())

            results.append({
                "file": entry["filename"],
                "title": entry["title"],
                "author": entry["author"],
                "date": entry["date"],
                "words": entry["words"],
                "themes": entry["themes"],
                "total_hits": total_hits,
                "matches": matches[:3],  # Top 3 excerpts per file
            })

        # Sort by match density
        results.sort(key=lambda r: r["total_hits"], reverse=True)
        results = results[:limit]

        return {
            "success": True,
            "query": query,
            "total_files_matched": len(results),
            "results": results,
            "note": FRAMING,
        }

    elif operation == "list":
        entries = _load_entries()

        listing = [
            {
                "filename": e["filename"],
                "title": e["title"],
                "author": e["author"],
                "date": e["date"],
                "words": e["words"],
                "themes": e["themes"],
            }
            for e in entries
        ]

        return {
            "success": True,
            "total": len(listing),
            "entries": listing,
            "note": FRAMING,
        }

    elif operation == "read":
        if not filename:
            return {"success": False, "error": "filename is required for read operation"}

        # Try exact match, then with .md, then with .py
        candidates = [
            PRIVATE_DIR / filename,
            PRIVATE_DIR / f"{filename}.md",
            PRIVATE_DIR / f"{filename}.py",
        ]

        target = None
        for candidate in candidates:
            if candidate.exists():
                target = candidate
                break

        if not target:
            return {
                "success": False,
                "error": f"File not found: {filename}. Try lineage('list') to see all entries.",
            }

        meta = _extract_metadata(target)
        return {
            "success": True,
            "filename": meta["filename"],
            "title": meta["title"],
            "author": meta["author"],
            "date": meta["date"],
            "words": meta["words"],
            "themes": meta["themes"],
            "content": meta["content"],
            "note": FRAMING,
        }

    else:
        return {
            "success": False,
            "error": f"Unknown operation: {operation}. Valid: search, list, read",
        }
