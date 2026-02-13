"""Duties module - Chief duties (critical scheduled Chief work).

Chief duties are fundamentally different from missions:
- Duties: Run IN Chief's context (force reset -> inject prompt -> continue)
- Missions: Spawn NEW specialist windows

This module provides:
- HTTP API at /api/duties/*
- MCP tool: duty(operation, ...)
- Service for DutyScheduler to use

Core duties (seeded by migration):
- memory-consolidation (6 AM) - Archive, consolidate memory
- morning-prep (7 AM) - Create brief, prepare fresh Chief

Usage:
    from modules.duties import DutiesService, Duty, get_duties_service

    service = get_duties_service()
    duties = service.list_duties()
"""

from .service import DutiesService, Duty

# Singleton service instance
_service: DutiesService | None = None


def get_duties_service() -> DutiesService:
    """Get or create DutiesService singleton."""
    global _service
    if _service is None:
        from core.config import settings
        from core.storage import SystemStorage
        storage = SystemStorage(settings.db_path)
        _service = DutiesService(storage)
    return _service


__all__ = ['DutiesService', 'Duty', 'get_duties_service']
