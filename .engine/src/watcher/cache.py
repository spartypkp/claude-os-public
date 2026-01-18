"""File-backed cache for watcher inputs and outputs."""

from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path
from typing import Any, Dict, Optional


def sha256_hex(data: Any) -> str:
    """Return a stable SHA-256 hex digest for the given data."""
    if isinstance(data, bytes):
        payload = data
    else:
        payload = str(data).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class WatcherCache:
    """Simple namespace-based cache with JSON persistence."""

    def __init__(self, cache_path: Path):
        self.cache_path = cache_path
        self._data: Dict[str, Dict[str, Any]] = {}
        self._dirty = False
        self._lock = threading.Lock()
        self._load()

    # ------------------------------------------------------------------ utils
    def _load(self) -> None:
        if not self.cache_path.exists():
            self._data = {}
            return

        try:
            with open(self.cache_path, "r", encoding="utf-8") as handle:
                raw = json.load(handle)
                if isinstance(raw, dict):
                    self._data = raw
                else:
                    self._data = {}
        except (OSError, json.JSONDecodeError):
            self._data = {}

    def save(self, force: bool = False) -> None:
        with self._lock:
            if not self._dirty and not force:
                return

            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self.cache_path.with_suffix(".tmp")
            with open(tmp_path, "w", encoding="utf-8") as handle:
                json.dump(self._data, handle, indent=2, sort_keys=True)
            tmp_path.replace(self.cache_path)
            self._dirty = False

    # --------------------------------------------------------------- namespace
    def get(self, namespace: str, key: str, default: Optional[Any] = None) -> Any:
        return self._data.get(namespace, {}).get(key, default)

    def set(self, namespace: str, key: str, value: Any) -> None:
        with self._lock:
            ns = self._data.setdefault(namespace, {})
            if ns.get(key) != value:
                ns[key] = value
                self._dirty = True

    def delete(self, namespace: str, key: str) -> None:
        with self._lock:
            ns = self._data.get(namespace)
            if ns and key in ns:
                del ns[key]
                self._dirty = True

    def clear_namespace(self, namespace: str) -> None:
        with self._lock:
            if namespace in self._data:
                del self._data[namespace]
                self._dirty = True

    def namespace(self, namespace: str) -> Dict[str, Any]:
        """Return a shallow copy of a namespace."""
        return dict(self._data.get(namespace, {}))



