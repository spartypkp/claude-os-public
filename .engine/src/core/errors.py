"""
Core Errors - Base exception classes for the entire application.

All domain-specific errors should inherit from these base classes.
This enables consistent error handling across the codebase.

Usage:
    from core.errors import NotFoundError, ValidationError

    class SessionNotFound(NotFoundError):
        pass

    class InvalidMessageFormat(ValidationError):
        pass
"""


class ClaudeOSError(Exception):
    """Base exception for all Claude OS errors."""

    def __init__(self, message: str, code: str = "UNKNOWN_ERROR", details: dict = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict for API responses."""
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


class NotFoundError(ClaudeOSError):
    """Resource not found."""

    def __init__(self, resource: str, identifier: str = None):
        message = f"{resource} not found"
        if identifier:
            message = f"{resource} '{identifier}' not found"
        super().__init__(message, code=f"{resource.upper()}_NOT_FOUND")
        self.resource = resource
        self.identifier = identifier


class ValidationError(ClaudeOSError):
    """Input validation failed."""

    def __init__(self, message: str, field: str = None):
        code = "VALIDATION_ERROR"
        if field:
            code = f"INVALID_{field.upper()}"
        super().__init__(message, code=code)
        self.field = field


class PermissionError(ClaudeOSError):
    """Operation not permitted."""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(message, code="PERMISSION_DENIED")


class ConflictError(ClaudeOSError):
    """Resource conflict (e.g., duplicate, state conflict)."""

    def __init__(self, message: str):
        super().__init__(message, code="CONFLICT")


class RateLimitError(ClaudeOSError):
    """Rate limit exceeded."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = None):
        super().__init__(message, code="RATE_LIMIT_EXCEEDED")
        self.retry_after = retry_after


class ExternalServiceError(ClaudeOSError):
    """External service (Apple, Google, etc.) failed."""

    def __init__(self, service: str, message: str):
        super().__init__(f"{service}: {message}", code=f"{service.upper()}_ERROR")
        self.service = service


# === Domain-Specific Errors ===
# These can move to domain modules later, but are here for convenience

class SessionNotFound(NotFoundError):
    def __init__(self, session_id: str):
        super().__init__("Session", session_id)


class ContactNotFound(NotFoundError):
    def __init__(self, identifier: str):
        super().__init__("Contact", identifier)


class CalendarEventNotFound(NotFoundError):
    def __init__(self, event_id: str):
        super().__init__("Calendar event", event_id)


class PriorityNotFound(NotFoundError):
    def __init__(self, priority_id: str):
        super().__init__("Priority", priority_id)


class MissionNotFound(NotFoundError):
    def __init__(self, mission_id: str):
        super().__init__("Mission", mission_id)
