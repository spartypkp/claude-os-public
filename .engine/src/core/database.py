"""
Core Database - Connection management and migrations.

Provides:
- Sync and async database connections
- Migration system
- Helper utilities
"""
import sqlite3
from contextlib import contextmanager, asynccontextmanager
from typing import Generator, AsyncGenerator, Optional
from pathlib import Path
from datetime import datetime
import aiosqlite

from .config import settings


# === Connection Management ===

@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Get a sync database connection with row factory.

    Usage:
        with get_db() as conn:
            cursor = conn.execute("SELECT ...")
            rows = cursor.fetchall()
    """
    conn = sqlite3.connect(str(settings.db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
    finally:
        conn.close()


@asynccontextmanager
async def get_async_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    """Get an async database connection with row factory.

    Usage:
        async with get_async_db() as conn:
            cursor = await conn.execute("SELECT ...")
            rows = await cursor.fetchall()
    """
    async with aiosqlite.connect(str(settings.db_path)) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA busy_timeout=5000;")
        await conn.execute("PRAGMA foreign_keys=ON;")
        yield conn


def dict_from_row(row: sqlite3.Row | aiosqlite.Row) -> dict:
    """Convert a database row to a dictionary."""
    return dict(row)


# === Migration System ===

def ensure_migrations_table(conn: sqlite3.Connection) -> None:
    """Create migrations tracking table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL
        )
    """)
    conn.commit()


def get_applied_migrations(conn: sqlite3.Connection) -> set[str]:
    """Get set of already-applied migration names."""
    cursor = conn.execute("SELECT name FROM _migrations ORDER BY id")
    return {row[0] for row in cursor.fetchall()}


def apply_migration(conn: sqlite3.Connection, name: str, sql: str) -> None:
    """Apply a single migration and record it."""
    conn.executescript(sql)
    conn.execute(
        "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
        (name, datetime.now().isoformat())
    )
    conn.commit()


def run_migrations(migrations_dir: Optional[Path] = None) -> list[str]:
    """Run all pending migrations.

    Migrations are .sql files in the migrations directory, named:
        001_initial.sql
        002_add_feature.sql
        etc.

    Returns list of applied migration names.
    """
    migrations_dir = migrations_dir or settings.migrations_dir

    if not migrations_dir.exists():
        return []

    # Get migration files sorted by name
    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        return []

    applied = []
    with get_db() as conn:
        ensure_migrations_table(conn)
        already_applied = get_applied_migrations(conn)

        for migration_file in migration_files:
            name = migration_file.stem  # e.g., "001_initial"
            if name in already_applied:
                continue

            sql = migration_file.read_text()
            apply_migration(conn, name, sql)
            applied.append(name)

    return applied


def init_database() -> None:
    """Initialize database with base schema if empty.

    Called at startup. Creates tables from schema.sql if database is new.
    Then runs any pending migrations.
    """
    # Ensure data directory exists
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)

    # Check if database needs initialization
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        has_tables = cursor.fetchone() is not None

    # If no tables, initialize from schema.sql
    if not has_tables and settings.schema_path.exists():
        schema_sql = settings.schema_path.read_text()
        with get_db() as conn:
            conn.executescript(schema_sql)

    # Run any pending migrations
    run_migrations()
