"""
Session domain models.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class SpawnResult:
    """Result of spawning a session."""
    success: bool
    session_id: Optional[str] = None
    window_name: Optional[str] = None
    conversation_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class Session:
    """Session data model."""
    session_id: str
    role: str
    mode: str

    started_at: str
    last_seen_at: str
    ended_at: Optional[str]
    end_reason: Optional[str]

    description: Optional[str]
    status_text: Optional[str]
    current_state: str

    tmux_pane: Optional[str]
    transcript_path: Optional[str]
    cwd: Optional[str]

    mission_execution_id: Optional[str] = None
    conversation_id: Optional[str] = None
    parent_session_id: Optional[str] = None
    spec_path: Optional[str] = None

    @property
    def is_active(self) -> bool:
        return self.ended_at is None

    @classmethod
    def from_row(cls, row) -> "Session":
        """Create Session from database row."""
        return cls(
            session_id=row["session_id"],
            role=row["role"] or "chief",
            mode=row["mode"] or "interactive",
            started_at=row["started_at"],
            last_seen_at=row["last_seen_at"],
            ended_at=row["ended_at"],
            end_reason=row["end_reason"],
            description=row["description"],
            status_text=row["status_text"],
            current_state=row["current_state"] or "idle",
            tmux_pane=row["tmux_pane"],
            transcript_path=row["transcript_path"],
            cwd=row["cwd"],
            mission_execution_id=row["mission_execution_id"],
            conversation_id=row["conversation_id"] if "conversation_id" in row.keys() else None,
            parent_session_id=row["parent_session_id"] if "parent_session_id" in row.keys() else None,
            spec_path=row["spec_path"] if "spec_path" in row.keys() else None,
        )
