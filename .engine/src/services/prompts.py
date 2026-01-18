"""Prompt assembly helpers for regular + async Claude modes."""

from __future__ import annotations

import textwrap
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional


class PromptAssemblyError(Exception):
    """Raised when a required prompt file is missing or invalid."""


class PromptAssemblyService:
    def __init__(self, repo_root: Path, *, prompts_root: Optional[Path] = None):
        self.repo_root = repo_root
        self.prompts_root = prompts_root or (repo_root / ".engine" / "config" / "prompts")
        self._frontmatter_re = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

    # ---------------------------------------------------------------- async
    def build_async_prompt(self, task_type: str, params: Dict[str, object]) -> str:
        # Workers get: BACKGROUND-WORKER.md + core context + task params
        layers = [
            self._read_async_claude_md(),
            self._read_core_context(),
            self._format_params(params),
        ]

        return "\n\n---\n\n".join(layer for layer in layers if layer.strip())

    def _read_core_context(self) -> str:
        """Read core context files that workers need.

        Same files that Chief/Specialists get auto-loaded:
        - TODAY.md (daily memory, schedule, priorities)
        - MEMORY.md (persistent patterns)
        - IDENTITY.md (who the user is)
        - SYSTEM-INDEX.md (system overview)
        """
        desktop = self.repo_root / "Desktop"
        context_files = [
            ("TODAY.md", "Daily Memory"),
            ("MEMORY.md", "Persistent Memory"),
            ("IDENTITY.md", "About the user"),
            ("SYSTEM-INDEX.md", "System Overview"),
        ]

        sections = ["# Core Context\n\nThese files are auto-loaded to give you system context.\n"]

        for filename, label in context_files:
            path = desktop / filename
            if path.exists():
                content = path.read_text(encoding="utf-8")
                # Truncate very long files to avoid context bloat
                if len(content) > 15000:
                    content = content[:15000] + "\n\n...[truncated]..."
                sections.append(f"## {label} ({filename})\n\n{content}")

        return "\n\n---\n\n".join(sections)

    # ---------------------------------------------------------------- helpers
    def _read_async_claude_md(self) -> str:
        """Read BACKGROUND-WORKER.md from repo root."""
        path = self.repo_root / "BACKGROUND-WORKER.md"
        if not path.exists():
            message = textwrap.dedent(
                f"""
                Required file missing: BACKGROUND-WORKER.md
                Expected path: {path}

                This file contains operating instructions for Background Workers.
                """
            ).strip()
            raise PromptAssemblyError(message)
        return path.read_text(encoding="utf-8")

    def _read_required(self, relative_path: str) -> str:
        path = self.prompts_root / relative_path
        if not path.exists():
            message = textwrap.dedent(
                f"""
                Required prompt file missing: `{relative_path}`
                Expected path: {path}

                Create this file per `.engine/config/prompts/README.md` before running async tasks.
                """
            ).strip()
            raise PromptAssemblyError(message)
        text = path.read_text(encoding="utf-8")
        if relative_path.startswith("async/features/"):
            text = self._strip_frontmatter(text)
        return text

    def _read_optional(self, relative_path: str) -> Optional[str]:
        """Read a prompt file if it exists, return None if not."""
        path = self.prompts_root / relative_path
        if not path.exists():
            return None
        text = path.read_text(encoding="utf-8")
        if relative_path.startswith("async/features/"):
            text = self._strip_frontmatter(text)
        return text

    def _format_params(self, params: Dict[str, object]) -> str:
        params_copy = dict(params or {})
        instructions_raw = params_copy.pop("instructions", None)
        instructions = str(instructions_raw).strip() if instructions_raw is not None else ""

        lines: List[str] = []

        if instructions:
            lines.append("## Task Instructions")
            lines.append("")
            lines.append(instructions)
            lines.append("")

        if params_copy:
            lines.append("## Task Parameters")
            lines.append("")
            for key, value in params_copy.items():
                label = key.replace("_", " ").title()
                lines.append(f"- **{label}:** {value}")

        if not lines:
            return "## Task Instructions\n\n_No instructions provided_"
        return "\n".join(lines)

    def _strip_frontmatter(self, text: str) -> str:
        match = self._frontmatter_re.match(text)
        if not match:
            return text
        return text[match.end():]


__all__ = ["PromptAssemblyService", "PromptAssemblyError"]
