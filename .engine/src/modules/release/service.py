"""Release service - parse pending.md and history/ for release tracking.

Source of truth is the markdown files, not the database.

Actual pending.md format:
  ## Feature Name
  Description paragraph(s).
  **Files:**
  - `path/to/file` — what changed
  **Sanitization notes:** Inline text about sanitization concerns.
  ---

History files are per-date (e.g., 2026-02-20.md) containing multiple ### features.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[4]  # claude-os/
RELEASE_DIR = PROJECT_ROOT / "Desktop" / "release"
PENDING_PATH = RELEASE_DIR / "pending.md"
HISTORY_DIR = RELEASE_DIR / "history"


@dataclass
class FeatureEntry:
    """A single feature entry parsed from pending.md."""
    slug: str
    name: str
    description: str = ""
    files: List[str] = field(default_factory=list)
    sanitization_notes: str = ""
    file_count: int = 0
    has_sanitization_warnings: bool = False


@dataclass
class HistoryFeature:
    """A single feature within a history sync."""
    name: str
    description: str = ""


@dataclass
class HistoryEntry:
    """A completed sync from history/."""
    slug: str
    name: str
    synced_date: str
    file_count: int = 0
    commit: str = ""
    branch: str = ""
    stats: str = ""
    features: List[HistoryFeature] = field(default_factory=list)


def _slugify(name: str) -> str:
    """Convert feature name to URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug


def _parse_feature_block(heading: str, body: str) -> Optional[FeatureEntry]:
    """Parse a single ## feature block from pending.md."""
    name = heading.strip()
    if not name:
        return None

    slug = _slugify(name)

    # Split body into description and structured sections
    # Description is everything before the first **bold:** section
    description = ""
    files: List[str] = []
    sanitization_notes = ""

    # Find **Files:** section
    files_match = re.search(
        r'\*\*Files:\*\*\s*\n(.*?)(?=\n\*\*[A-Z]|\n---|\Z)',
        body, re.DOTALL
    )

    # Find **Sanitization notes:** (inline or block)
    san_match = re.search(
        r'\*\*Sanitization notes?:\*\*\s*(.*?)(?=\n\n---|\n\n\*\*|\Z)',
        body, re.DOTALL
    )

    # Description is everything before the first **bold:** marker
    first_bold = re.search(r'\n\*\*\w', body)
    if first_bold:
        description = body[:first_bold.start()].strip()
    else:
        description = body.strip()

    # Parse files list
    if files_match:
        for line in files_match.group(1).strip().splitlines():
            stripped = line.strip()
            if stripped.startswith('-'):
                files.append(stripped[2:].strip())

    # Parse sanitization notes
    if san_match:
        sanitization_notes = san_match.group(1).strip()

    # Count file references (backtick-wrapped paths)
    file_count = len(files) if files else len(re.findall(r'`[^\s`]+\.[a-z]+`', body))

    return FeatureEntry(
        slug=slug,
        name=name,
        description=description,
        files=files,
        sanitization_notes=sanitization_notes,
        file_count=file_count,
        has_sanitization_warnings=bool(sanitization_notes and sanitization_notes.lower() not in (
            "no personal data.",
            "no personal data identified.",
            "no personal data. pure infrastructure.",
            "no personal data. both files are pure infrastructure.",
            "no personal data identified. pure ui wiring and window store logic.",
            "no personal data identified. all files are pure infrastructure and ui components.",
            "no personal data. pure analytics infrastructure.",
        )),
    )


def _parse_history_file(path: Path) -> Optional[HistoryEntry]:
    """Parse a history file (per-date format with multiple ### features)."""
    try:
        content = path.read_text()
    except Exception as e:
        logger.warning(f"Failed to read history file {path}: {e}")
        return None

    # Extract top-level heading: "# Release: Feb 20, 2026"
    heading_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if not heading_match:
        return None

    name = heading_match.group(1).strip()

    # Extract date from filename (e.g., 2026-02-20.md)
    synced_date = path.stem  # "2026-02-20"

    # Extract metadata
    commit = ""
    commit_match = re.search(r'\*\*Commit:\*\*\s*`?([^`\n]+)`?', content)
    if commit_match:
        commit = commit_match.group(1).strip()

    branch = ""
    branch_match = re.search(r'\*\*Branch:\*\*\s*`?([^`\n]+)`?', content)
    if branch_match:
        branch = branch_match.group(1).strip()

    stats_str = ""
    stats_match = re.search(r'\*\*Files:\*\*\s*(.+)', content)
    if stats_match:
        stats_str = stats_match.group(1).strip()

    # Count files from stats line
    file_count = 0
    fc_match = re.search(r'(\d+)\s+changed', stats_str)
    if fc_match:
        file_count = int(fc_match.group(1))

    # Parse ### feature subsections under "## Features Shipped"
    features: List[HistoryFeature] = []
    features_section = re.search(
        r'##\s+Features Shipped\s*\n(.*?)(?=\n##\s|\Z)',
        content, re.DOTALL
    )
    if features_section:
        subsections = re.split(r'^###\s+', features_section.group(1), flags=re.MULTILINE)
        for sub in subsections[1:]:  # Skip text before first ###
            lines = sub.split('\n', 1)
            feat_name = lines[0].strip()
            feat_desc = lines[1].strip() if len(lines) > 1 else ""
            if feat_name:
                features.append(HistoryFeature(name=feat_name, description=feat_desc))

    slug = path.stem  # Use date as slug

    return HistoryEntry(
        slug=slug,
        name=name,
        synced_date=synced_date,
        file_count=file_count,
        commit=commit,
        branch=branch,
        stats=stats_str,
        features=features,
    )


class ReleaseService:
    """Service for parsing release pipeline data from markdown files."""

    def __init__(self):
        self.pending_path = PENDING_PATH
        self.history_dir = HISTORY_DIR

    def list_pending(self) -> List[FeatureEntry]:
        """Parse pending.md and return all feature entries."""
        if not self.pending_path.exists():
            return []

        content = self.pending_path.read_text()

        # Split by ## headings (but not ### which are subsections)
        sections = re.split(r'^##\s+(?!#)', content, flags=re.MULTILINE)

        features = []
        for section in sections[1:]:  # Skip preamble before first ##
            lines = section.split('\n', 1)
            heading = lines[0]
            body = lines[1] if len(lines) > 1 else ""

            # Skip empty/placeholder entries
            if not heading.strip() or heading.strip().startswith('*'):
                continue

            feature = _parse_feature_block(heading, body)
            if feature:
                features.append(feature)

        return features

    def get_feature(self, slug: str) -> Optional[FeatureEntry]:
        """Get a single feature by slug."""
        for f in self.list_pending():
            if f.slug == slug:
                return f
        return None

    def mark_ready(self, slug: str) -> bool:
        """Not applicable in current format - features don't have status fields.
        Kept for API compatibility. Returns True if feature exists."""
        return self.get_feature(slug) is not None

    def mark_synced(self, slug: str) -> bool:
        """Remove a feature from pending.md.
        Returns True if the feature was found and removed.
        """
        feature = self.get_feature(slug)
        if not feature:
            return False

        if not self.pending_path.exists():
            return False

        content = self.pending_path.read_text()

        # Find the ## heading and remove everything until next ## or ---\n\n## or end
        # Pattern: ## Feature Name\n...content...\n---\n
        pattern = re.compile(
            r'##\s+' + re.escape(feature.name) + r'\s*\n.*?(?=\n---\s*\n\n##|\n---\s*\Z|\Z)',
            re.DOTALL
        )

        new_content = pattern.sub('', content)

        # Clean up double --- separators
        new_content = re.sub(r'(---\s*\n)\s*\n*(---)', r'\1', new_content)

        self.pending_path.write_text(new_content)
        return True

    def list_history(self) -> List[HistoryEntry]:
        """List all completed syncs from history/."""
        if not self.history_dir.exists():
            return []

        entries = []
        for path in sorted(self.history_dir.glob("*.md"), reverse=True):
            entry = _parse_history_file(path)
            if entry:
                entries.append(entry)

        return entries

    def get_stats(self) -> dict:
        """Get summary statistics."""
        pending = self.list_pending()
        history = self.list_history()

        total_files = sum(f.file_count for f in pending)
        total_synced_features = sum(len(h.features) for h in history)

        last_sync = None
        if history:
            last_sync = history[0].synced_date

        return {
            "total_pending": len(pending),
            "total_files_pending": total_files,
            "total_synced": total_synced_features,
            "total_syncs": len(history),
            "last_sync_date": last_sync,
        }
