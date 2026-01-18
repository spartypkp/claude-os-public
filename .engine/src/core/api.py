"""Core API - Stable interface for blueprints and integrations.

This module exports the common helpers that blueprints and integrations need.
It provides a stable interface so blueprints don't depend on internal implementation.

Exports:
- get_db: Database connection context manager
- REPO_ROOT: Path to repository root
- ENGINE_ROOT: Path to .engine directory
- PACIFIC: Pacific timezone (ZoneInfo)
"""

from __future__ import annotations

import sys
from pathlib import Path
from zoneinfo import ZoneInfo

# Path setup - api.py is at .engine/src/core/api.py
# Parents: [0]=core, [1]=src, [2]=.engine, [3]=repo_root
REPO_ROOT = Path(__file__).resolve().parents[3]
ENGINE_ROOT = REPO_ROOT / ".engine"

# User is in San Francisco - all times are Pacific
PACIFIC = ZoneInfo("America/Los_Angeles")

# Add src to path for imports if needed
SRC_PATH = ENGINE_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))

# Import from internal modules
from db import get_db


__all__ = [
    'get_db',
    'REPO_ROOT',
    'ENGINE_ROOT',
    'PACIFIC',
]
