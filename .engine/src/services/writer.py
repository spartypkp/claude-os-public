"""High-level writer utilities for marker-driven Markdown updates."""

from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import Path
from typing import Iterable, Optional, Tuple


@dataclass(frozen=True)
class SectionUpdate:
    """Describe a marked section replacement inside a Markdown file."""

    start_marker: str
    end_marker: str
    body: str
    insert_after: Optional[str] = None


class WriterService:
    """Apply safe, marker-based updates to Markdown files."""

    def _format_section(self, start: str, end: str, body: str) -> str:
        body = (body or "").rstrip()
        return f"{start}\n\n{body}\n\n{end}"

    def _replace_or_insert(
        self,
        content: str,
        update: SectionUpdate,
    ) -> Tuple[str, bool]:
        formatted = self._format_section(update.start_marker, update.end_marker, update.body)
        pattern = re.compile(
            f"{re.escape(update.start_marker)}.*?{re.escape(update.end_marker)}",
            re.DOTALL,
        )

        if pattern.search(content):
            new_content = pattern.sub(formatted, content, count=1)
            return new_content, new_content != content

        if update.insert_after and update.insert_after in content:
            insertion_point = content.index(update.insert_after) + len(update.insert_after)
            insertion = f"\n\n{formatted}"
            new_content = content[:insertion_point] + insertion + content[insertion_point:]
            return new_content, True

        return content, False

    def apply_updates(self, file_path: Path, updates: Iterable[SectionUpdate]) -> bool:
        """Apply multiple SectionUpdate objects to a file."""
        if not file_path.exists():
            raise FileNotFoundError(f"{file_path} does not exist")

        with open(file_path, "r", encoding="utf-8", newline="") as handle:
            raw_content = handle.read()

        line_ending = self._detect_line_ending(raw_content)
        content = (
            raw_content.replace("\r\n", "\n")
            .replace("\r", "\n")
        )

        changed = False
        for update in updates:
            content, section_changed = self._replace_or_insert(content, update)
            changed = changed or section_changed

        if not changed:
            return False

        with open(file_path, "w", encoding="utf-8", newline=line_ending) as handle:
            handle.write(content)

        return True

    def update_section(self, file_path: Path, update: SectionUpdate) -> bool:
        """Update a single marked section."""
        return self.apply_updates(file_path, [update])

    def _detect_line_ending(self, content: str) -> str:
        if "\r\n" in content:
            return "\r\n"
        if "\r" in content and "\n" not in content:
            return "\r"
        return "\n"
