"""Service Settings API — Access tiers and smart defaults.

Provides:
- GET  /            — List all services with tiers, defaults, account counts
- GET  /{service}   — Get one service config
- PUT  /{service}   — Update tier and/or defaults
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.database import get_db
from .access import get_access_service, VALID_SERVICES, VALID_TIERS

logger = logging.getLogger(__name__)
router = APIRouter(tags=["services"])


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


class UpdateServiceRequest(BaseModel):
    """Request to update a service's tier and/or defaults."""
    tier: Optional[str] = None
    defaults: Optional[dict[str, str]] = None


# Map services to account capability columns that indicate the account is relevant
_SERVICE_ACCOUNT_FILTERS = {
    'email': 'can_read_email = 1',
    'calendar': 'can_read_calendar = 1',
    'contacts': 'can_read_contacts = 1',
    'messages': 'can_read_messages = 1',
}


def _get_accounts_for_service(service: str) -> list[dict]:
    """Get connected accounts for a service."""
    filter_clause = _SERVICE_ACCOUNT_FILTERS.get(service)
    if not filter_clause:
        return []

    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT id, email, display_name, is_primary, is_claude_account, is_enabled
                FROM accounts
                WHERE is_enabled = 1 AND {filter_clause}
                ORDER BY is_primary DESC, is_claude_account DESC, email"""
        ).fetchall()

        return [
            {
                "id": row["id"],
                "email": row["email"],
                "display_name": row["display_name"],
                "is_primary": bool(row["is_primary"]),
                "is_claude_account": bool(row["is_claude_account"]),
            }
            for row in rows
        ]


def _build_service_response(service: str) -> dict:
    """Build the full service response object."""
    access = get_access_service()
    accounts = _get_accounts_for_service(service)

    return {
        "service": service,
        "tier": access.get_tier(service),
        "account_count": len(accounts),
        "defaults": dict(access._defaults_cache.get(service, {})),
        "accounts": accounts,
    }


@router.get("")
async def list_services():
    """List all services with tiers, defaults, and account counts."""
    def _load():
        return [_build_service_response(s) for s in VALID_SERVICES]

    services = await _run_blocking(_load)
    return {"services": services}


@router.get("/{service}")
async def get_service(service: str):
    """Get one service configuration."""
    if service not in VALID_SERVICES:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown service: '{service}'. Valid services: {', '.join(VALID_SERVICES)}"
        )

    return await _run_blocking(_build_service_response, service)


@router.put("/{service}")
async def update_service(service: str, request: UpdateServiceRequest):
    """Update service tier and/or defaults."""
    if service not in VALID_SERVICES:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown service: '{service}'. Valid services: {', '.join(VALID_SERVICES)}"
        )

    def _update():
        access = get_access_service()

        if request.tier is not None:
            if request.tier not in VALID_TIERS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid tier: '{request.tier}'. Valid tiers: {', '.join(VALID_TIERS)}"
                )
            access.set_tier(service, request.tier)

        if request.defaults is not None:
            for key, value in request.defaults.items():
                access.set_default(service, key, value)

        return _build_service_response(service)

    return await _run_blocking(_update)
