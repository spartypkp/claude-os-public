"""
Core Configuration - Single source of truth for all paths and settings.

All other modules import from here. No more Path(__file__).parents[N] hacks.
"""
from pathlib import Path
from typing import Any, Dict, List, Set
from zoneinfo import ZoneInfo
import os

import yaml


def find_repo_root() -> Path:
    """Find repo root by looking for CLAUDE.md marker file."""
    current = Path(__file__).resolve().parent
    for _ in range(10):  # Max 10 levels up
        if (current / "CLAUDE.md").exists():
            return current
        if current.parent == current:
            break
        current = current.parent
    raise RuntimeError("Could not find repo root (no CLAUDE.md found)")


class Settings:
    """Application settings - THE source of truth for all configuration."""

    def __init__(self):
        # === Path Configuration ===
        # These are computed once at startup. Import settings and use these directly.
        self.repo_root = find_repo_root()
        self.engine_dir = self.repo_root / ".engine"
        self.src_dir = self.engine_dir / "src"

        # Data paths
        self.data_dir = self.engine_dir / "data"
        self.db_path = self.data_dir / "db" / "system.db"
        self.outputs_dir = self.data_dir / "outputs"
        self.logs_dir = self.data_dir / "logs"

        # Config paths
        self.config_dir = self.engine_dir / "config"
        self.schema_path = self.config_dir / "schema.sql"
        self.migrations_dir = self.config_dir / "migrations"

        # User content
        self.desktop_dir = self.repo_root / "Desktop"
        self.claude_dir = self.repo_root / "Claude"

        # === Server Configuration ===
        self.host = os.environ.get("CLAUDE_OS_HOST", "0.0.0.0")
        self.port = int(os.environ.get("CLAUDE_OS_PORT", "5001"))
        self.debug = os.environ.get("CLAUDE_OS_DEBUG", "false").lower() == "true"

        # === Timezone ===
        # User timezone for event timestamps, calendar display, etc.
        self.timezone_name = os.environ.get("CLAUDE_OS_TIMEZONE", "America/Los_Angeles")
        self.timezone = ZoneInfo(self.timezone_name)

        # === Watcher Configuration ===
        self.watch_dirs: List[str] = [
            "Desktop",              # LIFE-SPEC.md, APP-SPEC.md, contacts/
            ".claude/guides",       # Guide markdown files
            ".engine/data",         # system.db changes
            ".engine/src",          # SYSTEM-SPEC.md files
            ".engine/config",       # SYSTEM-SPEC.md in config/
        ]
        self.watcher_debounce_ms = 1600  # Batch changes within this window

        # === Worker Configuration ===
        self.executor_poll_interval = 60  # seconds between polling for new tasks
        self.executor_batch_size = 10  # max concurrent workers

        # === File Browser Configuration ===
        self.root_dirs = ["Desktop"]
        self.allowed_extensions: Set[str] = {
            # Documents
            ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".pdf",
            # Code
            ".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".html",
            # Images
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
            ".heic", ".heif",
            # Video
            ".mp4", ".webm", ".mov", ".avi", ".mkv",
            # Audio
            ".mp3", ".wav", ".ogg", ".m4a", ".flac",
            # Office
            ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            # Data
            ".csv", ".tsv",
            # Archives
            ".zip",
            # Notebooks
            ".ipynb",
        }
        self.skip_patterns: Set[str] = {
            "__pycache__", ".git", "node_modules", ".venv", "venv",
            ".cache", ".DS_Store", ".next"
        }
        self.max_file_size = 100 * 1024 * 1024  # 100MB

        # === Claude System Files ===
        # Protected from deletion, displayed with badge
        self.claude_system_files: Set[str] = {
            "TODAY.md", "MEMORY.md", "IDENTITY.md", "SYSTEM-INDEX.md"
        }
        self.claude_system_folders: Set[str] = {
            "sessions", "working", "prepared", "logs"
        }

        # === Rate Limits ===
        self.email_rate_limit_per_hour = 50
        self.email_send_delay_seconds = 15  # Cancellation window


# Global singleton - import this
settings = Settings()


# =============================================================================
# YAML CONFIG FILE LOADER
# =============================================================================

DEFAULT_YAML_CONFIG: Dict[str, Any] = {
    "calendar": {
        "rollover_timeblocks": False,
        "week_window_days": 7,
        "month_window_days": 30,
        "month_mode": "to_end_of_month",
        "week_start_day": "monday",
    },
    "contacts": {
        "include_tags": None,
        "max_items": None,
    },
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge two dictionaries."""
    result = dict(base)
    for key, value in (override or {}).items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_config(config_path: Path) -> Dict[str, Any]:
    """Load YAML config file, falling back to defaults."""
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
            if not isinstance(loaded, dict):
                return DEFAULT_YAML_CONFIG
            return _deep_merge(DEFAULT_YAML_CONFIG, loaded)
    except FileNotFoundError:
        return DEFAULT_YAML_CONFIG
    except Exception:
        return DEFAULT_YAML_CONFIG


# =============================================================================
# MODULE CONFIG LOADER
# =============================================================================

# Cache for loaded module configs
_module_configs: Dict[str, Dict[str, Any]] = {}


def get_module_config(module_name: str) -> Dict[str, Any]:
    """Load config for a module from .engine/config/modules/{name}.yaml.

    Args:
        module_name: Name of the module (e.g., "calendar", "email")

    Returns:
        Config dict, empty dict if no config file exists

    Example:
        config = get_module_config("calendar")
        aliases = config.get("aliases", {})
    """
    global _module_configs

    if module_name in _module_configs:
        return _module_configs[module_name]

    config_path = settings.config_dir / "modules" / f"{module_name}.yaml"

    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}
                _module_configs[module_name] = config
                return config
        except Exception:
            _module_configs[module_name] = {}
            return {}

    _module_configs[module_name] = {}
    return {}


def get_credentials_path(name: str) -> Path:
    """Get path to a credentials file.

    Args:
        name: Credential name (e.g., "gmail" -> credentials/gmail.json)

    Returns:
        Path to credentials file (may not exist)
    """
    return settings.config_dir / "credentials" / f"{name}.json"
