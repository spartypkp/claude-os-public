"""
Core - Infrastructure layer for Claude OS.

Provides shared primitives for all modules:
- config: Settings and paths
- database: Connection management
- events: Real-time pub/sub (SSE)
- event_log: Persistent event storage
- errors: Exception classes
- types: Shared models

Usage:
    from core.config import settings
    from core.database import get_db
    from core.events import event_bus
    from core.errors import NotFoundError
"""

from __future__ import annotations

# === INFRASTRUCTURE IMPORTS ===

from .config import settings
from .database import get_db, get_async_db, dict_from_row, init_database, run_migrations
from .events import (
    event_bus,
    SystemEvent,
    emit_session_started,
    emit_session_ended,
    emit_session_state,
    emit_worker_created,
    emit_worker_completed,
    emit_worker_acked,
    emit_priority_changed,
    emit_file_changed,
    emit_calendar_created,
    emit_calendar_updated,
    emit_calendar_deleted,
    emit_contact_created,
    emit_contact_updated,
    emit_contact_deleted,
    emit_email_sent,
    emit_email_queued,
    emit_email_cancelled,
    emit_message_sent,
    emit_message_received,
    # Backwards compat
    sse_bus,
    FileChangeEvent,
)
from .audit_log import log_event, get_events, emit_event
from .errors import (
    ClaudeOSError,
    NotFoundError,
    ValidationError,
    PermissionError as ClaudeOSPermissionError,
    ConflictError,
    RateLimitError,
    ExternalServiceError,
    SessionNotFound,
    ContactNotFound,
    CalendarEventNotFound,
    PriorityNotFound,
    MissionNotFound,
)
from .types import (
    SessionStatus,

    PriorityLevel,
    WorkerStatus,
    TimestampedModel,
    APIResponse,
    PaginatedResponse,
    IDResponse,
    MessageRequest,
    StatusUpdate,
    FileInfo,
    DirectoryListing,
)


__all__ = [
    # Config
    "settings",
    # Database
    "get_db",
    "get_async_db",
    "dict_from_row",
    "init_database",
    "run_migrations",
    # Events (real-time)
    "event_bus",
    "SystemEvent",
    "emit_session_started",
    "emit_session_ended",
    "emit_session_state",
    "emit_worker_created",
    "emit_worker_completed",
    "emit_worker_acked",
    "emit_priority_changed",
    "emit_file_changed",
    "emit_calendar_created",
    "emit_calendar_updated",
    "emit_calendar_deleted",
    "emit_contact_created",
    "emit_contact_updated",
    "emit_contact_deleted",
    "emit_email_sent",
    "emit_email_queued",
    "emit_email_cancelled",
    "emit_message_sent",
    "emit_message_received",
    "sse_bus",
    "FileChangeEvent",
    # Audit log (persistent)
    "log_event",
    "get_events",
    "emit_event",
    # Errors
    "ClaudeOSError",
    "NotFoundError",
    "ValidationError",
    "ClaudeOSPermissionError",
    "ConflictError",
    "RateLimitError",
    "ExternalServiceError",
    "SessionNotFound",
    "ContactNotFound",
    "CalendarEventNotFound",
    "PriorityNotFound",
    "MissionNotFound",
    # Types
    "SessionStatus",

    "PriorityLevel",
    "WorkerStatus",
    "TimestampedModel",
    "APIResponse",
    "PaginatedResponse",
    "IDResponse",
    "MessageRequest",
    "StatusUpdate",
    "FileInfo",
    "DirectoryListing",
]
