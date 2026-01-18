from pathlib import Path
from typing import Any, Dict

import yaml


DEFAULT_CONFIG: Dict[str, Any] = {
    "calendar": {
        "rollover_timeblocks": False,
        "week_window_days": 7,
        "month_window_days": 30,
        "month_mode": "to_end_of_month",
        "week_start_day": "monday",
    },
    "watcher": {
        "health_section": True,
        "navigation": {
            "include_hidden": False,
            "max_depth": None,
        },
    },
    "contacts": {
        "include_tags": None,
        "max_items": None,
    },
}


def deep_merge_dicts(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge two dictionaries without mutating the originals."""
    result = dict(base)
    for key, value in (override or {}).items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge_dicts(result[key], value)
        else:
            result[key] = value
    return result


def load_config(config_path: Path) -> Dict[str, Any]:
    """Load watcher configuration from config.yaml, falling back to defaults."""
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
            if not isinstance(loaded, dict):
                print("⚠️  config.yaml must contain a YAML dictionary; using defaults.")
                return DEFAULT_CONFIG
            return deep_merge_dicts(DEFAULT_CONFIG, loaded)
    except FileNotFoundError:
        return DEFAULT_CONFIG
    except Exception as exc:
        print(f"⚠️  Error loading config.yaml: {exc}")
        return DEFAULT_CONFIG

