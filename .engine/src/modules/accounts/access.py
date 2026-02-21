"""
Service Access Tier Management.

Single source of truth for what Claude can do with each service.
Replaces 11 per-account boolean flags with 4 service-level tiers.

Tiers:
- read: Can view data only
- assist: Can view + create/draft (human confirms actions)
- autonomous: Full access (rate-limited where applicable)
"""
from __future__ import annotations

import logging
from typing import Optional

from core.storage import SystemStorage

logger = logging.getLogger(__name__)

VALID_SERVICES = ('email', 'calendar', 'contacts', 'messages')
VALID_TIERS = ('read', 'assist', 'autonomous')


class AccessService:
    """Service access tier management.

    Single source of truth for what Claude can do with each service.
    Replaces 11 per-account boolean flags with 4 service-level tiers.
    """

    def __init__(self, storage: SystemStorage):
        self._storage = storage
        self._cache: dict[str, str] = {}  # service -> tier
        self._defaults_cache: dict[str, dict[str, str]] = {}  # service -> {key: value}
        self._load()

    def _load(self):
        """Load access tiers and defaults from DB."""
        rows = self._storage.fetchall("SELECT service, tier FROM service_access")
        self._cache = {row['service']: row['tier'] for row in rows}

        rows = self._storage.fetchall("SELECT service, key, value FROM service_defaults")
        self._defaults_cache = {}
        for row in rows:
            self._defaults_cache.setdefault(row['service'], {})[row['key']] = row['value']

    def get_tier(self, service: str) -> str:
        """Get access tier for a service. Returns 'read' if not configured."""
        return self._cache.get(service, 'read')

    def can_read(self, service: str) -> bool:
        """Check if Claude can read data from this service."""
        return self.get_tier(service) in ('read', 'assist', 'autonomous')

    def can_assist(self, service: str) -> bool:
        """Check if Claude can create/draft for this service (human confirms)."""
        return self.get_tier(service) in ('assist', 'autonomous')

    def can_act_autonomously(self, service: str) -> bool:
        """Check if Claude has full autonomous access to this service."""
        return self.get_tier(service) == 'autonomous'

    def set_tier(self, service: str, tier: str):
        """Update access tier for a service."""
        if service not in VALID_SERVICES:
            raise ValueError(f"Invalid service: {service}. Must be one of {VALID_SERVICES}")
        if tier not in VALID_TIERS:
            raise ValueError(f"Invalid tier: {tier}. Must be one of {VALID_TIERS}")

        self._storage.execute(
            "INSERT OR REPLACE INTO service_access (service, tier, updated_at) VALUES (?, ?, datetime('now'))",
            (service, tier)
        )
        self._cache[service] = tier
        logger.info(f"Set {service} access tier to '{tier}'")

    def get_default(self, service: str, key: str, fallback: Optional[str] = None) -> Optional[str]:
        """Get a default setting for a service."""
        return self._defaults_cache.get(service, {}).get(key, fallback)

    def set_default(self, service: str, key: str, value: str):
        """Set a default setting for a service."""
        self._storage.execute(
            "INSERT OR REPLACE INTO service_defaults (service, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))",
            (service, key, value)
        )
        self._defaults_cache.setdefault(service, {})[key] = value
        logger.info(f"Set {service} default '{key}' to '{value}'")

    def get_service_summary(self) -> list[dict]:
        """Get summary of all services for settings UI."""
        summaries = []
        for service in VALID_SERVICES:
            summaries.append({
                'service': service,
                'tier': self.get_tier(service),
                'defaults': dict(self._defaults_cache.get(service, {})),
            })
        return summaries


# =============================================================================
# Singleton management
# =============================================================================

_access_service: Optional[AccessService] = None


def init_access_service(storage: SystemStorage) -> AccessService:
    """Initialize the AccessService singleton. Call once at startup."""
    global _access_service
    _access_service = AccessService(storage)
    logger.info("AccessService initialized")
    return _access_service


def get_access_service() -> AccessService:
    """Get the AccessService singleton. Raises if not initialized."""
    if _access_service is None:
        raise RuntimeError(
            "AccessService not initialized. Call init_access_service() first."
        )
    return _access_service


__all__ = [
    "AccessService",
    "get_access_service",
    "init_access_service",
    "VALID_SERVICES",
    "VALID_TIERS",
]
