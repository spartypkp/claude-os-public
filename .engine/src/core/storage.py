"""Shared SQLite storage for calendar data, scheduled work, and attention queue."""

from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Sequence

from core.config import settings


class SystemStorage:
    """Thin wrapper around the shared SQLite database."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(
            str(self.db_path),
            isolation_level=None,
            check_same_thread=False,
        )
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA busy_timeout=5000;")
        self._conn.execute("PRAGMA foreign_keys=ON;")
        self._initialize_schema()

    def close(self) -> None:
        self._conn.close()

    def execute(self, sql: str, params: Sequence | None = None):
        return self._execute_with_retry(self._conn.execute, sql, params or [])

    def executemany(self, sql: str, seq_of_params: Iterable[Sequence]):
        return self._execute_with_retry(self._conn.executemany, sql, seq_of_params)

    def fetchone(self, sql: str, params: Sequence | None = None):
        cursor = self.execute(sql, params)
        return cursor.fetchone()

    def fetchall(self, sql: str, params: Sequence | None = None):
        cursor = self.execute(sql, params)
        return cursor.fetchall()

    def _execute_with_retry(self, fn, *args):
        """Retry database operations when the database is temporarily locked."""
        delay = 0.1
        attempts = 3
        for attempt in range(attempts):
            try:
                return fn(*args)
            except sqlite3.OperationalError as e:
                message = str(e).lower()
                if "database is locked" in message and attempt < attempts - 1:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise

    @contextmanager
    def transaction(self):
        cursor = self._conn.cursor()
        try:
            cursor.execute("BEGIN IMMEDIATE;")
            yield cursor
        except Exception:
            cursor.execute("ROLLBACK;")
            raise
        else:
            cursor.execute("COMMIT;")

    # ------------------------------------------------------------------ schema
    def _initialize_schema(self) -> None:
        """Create tables and indexes if they don't exist yet.

        Reads from .engine/config/schema.sql (single source of truth).
        CREATE TABLE IF NOT EXISTS is idempotent, so safe to run multiple times.
        """
        # Load schema from config (single source of truth)
        schema_path = settings.schema_path
        if not schema_path.exists():
            raise FileNotFoundError(f"Schema file not found: {schema_path}")

        schema_sql = schema_path.read_text()

        # Execute entire schema (idempotent due to IF NOT EXISTS)
        self._conn.executescript(schema_sql)


__all__ = ["SystemStorage"]
