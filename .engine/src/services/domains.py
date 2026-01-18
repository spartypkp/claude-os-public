"""Domain specification discovery and hierarchy building."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import yaml


class DomainsService:
    def __init__(self, repo_root: Path):
        self.repo_root = repo_root

    def find_spec_files(self) -> List[Path]:
        spec_files: List[Path] = []
        for spec_path in self.repo_root.rglob("LIFE-SPEC.md"):
            if not any(part.startswith('.') for part in spec_path.relative_to(self.repo_root).parts):
                spec_files.append(spec_path)
        return sorted(spec_files)

    def extract_description(self, spec_path: Path) -> Tuple[Optional[str], Optional[str]]:
        try:
            content = spec_path.read_text(encoding="utf-8")
            match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
            if not match:
                return None, "Missing YAML frontmatter (should start with ---)"
            frontmatter = yaml.safe_load(match.group(1))
            if not isinstance(frontmatter, dict):
                return None, "Frontmatter is not a YAML dictionary"
            description = frontmatter.get('description')
            if not description or not str(description).strip():
                return None, "Missing 'description' field in frontmatter"
            return str(description).strip(), None
        except Exception as exc:
            return None, f"Error reading file: {exc}"

    def build_domain_hierarchy(self, spec_files: List[Path]) -> str:
        lines = ["## Life Domains 🔒\n"]
        for spec_path in spec_files:
            rel_path = spec_path.relative_to(self.repo_root)
            parts = rel_path.parts[:-1]
            depth = len(parts) - 1
            heading_level = "#" * (3 + depth)
            domain_name = parts[-1] if parts else "Root"
            domain_name = domain_name.replace("-", " ").title()
            description, error = self.extract_description(spec_path)
            link = f"[{rel_path}]({rel_path})"
            lines.append(f"{heading_level} {domain_name} → {link}")
            if error:
                lines.append(f"⚠️ **WARNING: {error}**\n")
            else:
                lines.append(f"{description}\n")
        return "\n".join(lines)

__all__ = ["DomainsService"]
