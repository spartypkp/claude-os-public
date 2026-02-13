"""
Core Types - Shared Pydantic models and type definitions.

These are base types used across multiple domains.
Domain-specific types should live in their respective domain modules.
"""

from datetime import datetime
from typing import Optional, List, Any, Dict
from enum import Enum
from pydantic import BaseModel, Field


# === Enums ===

class SessionStatus(str, Enum):
    """Session lifecycle states."""
    SPAWNING = "spawning"
    ACTIVE = "active"
    IDLE = "idle"
    ENDED = "ended"



class PriorityLevel(str, Enum):
    """Priority urgency levels."""
    CRITICAL = "critical"
    MEDIUM = "medium"
    LOW = "low"


class WorkerStatus(str, Enum):
    """Background worker states."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ACKED = "acked"


# === Base Models ===

class TimestampedModel(BaseModel):
    """Base model with created/updated timestamps."""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# === API Response Models ===

class APIResponse(BaseModel):
    """Standard API response wrapper."""
    success: bool
    data: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None


class PaginatedResponse(BaseModel):
    """Paginated list response."""
    success: bool = True
    items: List[Any]
    total: int
    page: int = 1
    page_size: int = 50
    has_more: bool = False


# === Common Request/Response Models ===

class IDResponse(BaseModel):
    """Response containing just an ID."""
    id: str


class MessageRequest(BaseModel):
    """Simple message input."""
    message: str


class StatusUpdate(BaseModel):
    """Status text update."""
    text: str = Field(..., max_length=100)


# === File System Types ===

class FileInfo(BaseModel):
    """File metadata for Finder."""
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None
    mtime: Optional[str] = None
    extension: Optional[str] = None
    is_protected: bool = False


class DirectoryListing(BaseModel):
    """Directory contents."""
    path: str
    items: List[FileInfo]
    parent: Optional[str] = None
