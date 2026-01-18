"""Database connection utilities for the unified backend.

Provides both sync and async database access patterns:
- get_db(): Sync context manager for route handlers
- get_async_db(): Async context manager for background tasks
"""
import sqlite3
from contextlib import contextmanager, asynccontextmanager
from typing import Generator, AsyncGenerator
import aiosqlite

from config import settings


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
        yield conn


def dict_from_row(row: sqlite3.Row | aiosqlite.Row) -> dict:
    """Convert a database row to a dictionary."""
    return dict(row)
