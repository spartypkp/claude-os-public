"""Utility helpers for reading YAML frontmatter."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

_FRONTMATTER_RE = re.compile(r'^---\s*\n(.*?)\n---\s*\n', re.DOTALL)


def read_yaml_frontmatter(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return None
    match = _FRONTMATTER_RE.match(content)
    if not match:
        return None
    try:
        data = yaml.safe_load(match.group(1))
    except Exception:
        return None
    return data if isinstance(data, dict) else None
