"""Priorities module - Priority and task management.

This module provides:
- Priority data model
- CRUD operations for priorities
- Date-based priority queries
- Level-based grouping (critical, medium, low)

Usage:
    from modules.priorities import PrioritiesService, Priority

    service = PrioritiesService(storage)
    priority = service.create(content="Finish work", level="critical")
    service.complete(priority.id)
"""

from .models import Priority
from .service import PrioritiesService

__all__ = ['PrioritiesService', 'Priority']
