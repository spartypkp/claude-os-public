"""
Sessions domain - session lifecycle management.

Provides:
- Session, SpawnResult models
- SessionRepository for database operations
- SessionService for business logic
"""

from pathlib import Path

from .models import Session, SpawnResult
from .repository import SessionRepository
from .service import SessionService, get_session_folder, get_session_workers_folder


# Default paths
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DB_PATH = _REPO_ROOT / ".engine" / "data" / "db" / "system.db"


def get_session_service(db_path: Path = None, repo_root: Path = None) -> SessionService:
    """Get a SessionService instance with default paths."""
    return SessionService(
        db_path=db_path or _DB_PATH,
        repo_root=repo_root or _REPO_ROOT,
    )


# Backwards compatibility - SessionManager is now SessionService
SessionManager = SessionService


__all__ = [
    "Session",
    "SpawnResult",
    "SessionRepository",
    "SessionService",
    "SessionManager",  # Backwards compatibility
    "get_session_service",
    "get_session_folder",
    "get_session_workers_folder",
]
