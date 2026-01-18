"""Unified account management endpoints for Dashboard."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db
from services.account_discovery import AccountDiscoveryService

logger = logging.getLogger(__name__)
router = APIRouter()


class UpdateAccountRequest(BaseModel):
    """Request to update account capabilities and metadata."""
    display_name: Optional[str] = None
    can_read_email: Optional[bool] = None
    can_send_email: Optional[bool] = None
    can_draft_email: Optional[bool] = None
    can_read_calendar: Optional[bool] = None
    can_create_calendar: Optional[bool] = None
    can_delete_calendar: Optional[bool] = None
    can_read_contacts: Optional[bool] = None
    can_modify_contacts: Optional[bool] = None
    can_read_messages: Optional[bool] = None
    can_send_messages: Optional[bool] = None
    is_enabled: Optional[bool] = None


@router.get("")
async def list_accounts(enabled_only: bool = False):
    """List all accounts in the unified accounts table.

    Args:
        enabled_only: If True, only return enabled accounts

    Returns:
        List of accounts with capabilities and metadata
    """
    with get_db() as conn:
        sql = """
            SELECT
                id,
                email,
                display_name,
                account_type,
                discovered_via,
                can_read_email,
                can_send_email,
                can_draft_email,
                can_read_calendar,
                can_create_calendar,
                can_delete_calendar,
                can_read_contacts,
                can_modify_contacts,
                can_read_messages,
                can_send_messages,
                is_claude_account,
                is_primary,
                is_enabled,
                apple_account_guid,
                mail_account_name,
                calendar_owner_email,
                addressbook_source_id,
                config_json,
                discovered_at,
                last_verified_at,
                created_at,
                updated_at
            FROM accounts
        """

        params = []
        if enabled_only:
            sql += " WHERE is_enabled = 1"

        sql += " ORDER BY is_primary DESC, is_claude_account DESC, email"

        cursor = conn.execute(sql, params)
        rows = cursor.fetchall()

        accounts = []
        for row in rows:
            config = json.loads(row["config_json"] or '{}')
            accounts.append({
                "id": row["id"],
                "email": row["email"],
                "display_name": row["display_name"],
                "account_type": row["account_type"],
                "discovered_via": row["discovered_via"],
                "capabilities": {
                    "email": {
                        "can_read": bool(row["can_read_email"]),
                        "can_send": bool(row["can_send_email"]),
                        "can_draft": bool(row["can_draft_email"]),
                    },
                    "calendar": {
                        "can_read": bool(row["can_read_calendar"]),
                        "can_create": bool(row["can_create_calendar"]),
                        "can_delete": bool(row["can_delete_calendar"]),
                    },
                    "contacts": {
                        "can_read": bool(row["can_read_contacts"]),
                        "can_modify": bool(row["can_modify_contacts"]),
                    },
                    "messages": {
                        "can_read": bool(row["can_read_messages"]),
                        "can_send": bool(row["can_send_messages"]),
                    },
                },
                "flags": {
                    "is_claude_account": bool(row["is_claude_account"]),
                    "is_primary": bool(row["is_primary"]),
                    "is_enabled": bool(row["is_enabled"]),
                },
                "system_ids": {
                    "apple_account_guid": row["apple_account_guid"],
                    "mail_account_name": row["mail_account_name"],
                    "calendar_owner_email": row["calendar_owner_email"],
                    "addressbook_source_id": row["addressbook_source_id"],
                },
                "config": config,
                "timestamps": {
                    "discovered_at": row["discovered_at"],
                    "last_verified_at": row["last_verified_at"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            })

        return {
            "accounts": accounts,
            "count": len(accounts),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


@router.get("/{account_id}")
async def get_account(account_id: str):
    """Get a single account by ID or email."""
    with get_db() as conn:
        # Try by ID first, then by email
        row = conn.execute(
            "SELECT * FROM accounts WHERE id = ? OR lower(email) = lower(?)",
            (account_id, account_id)
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Account not found: {account_id}")

        config = json.loads(row["config_json"] or '{}')

        return {
            "id": row["id"],
            "email": row["email"],
            "display_name": row["display_name"],
            "account_type": row["account_type"],
            "discovered_via": row["discovered_via"],
            "capabilities": {
                "email": {
                    "can_read": bool(row["can_read_email"]),
                    "can_send": bool(row["can_send_email"]),
                    "can_draft": bool(row["can_draft_email"]),
                },
                "calendar": {
                    "can_read": bool(row["can_read_calendar"]),
                    "can_create": bool(row["can_create_calendar"]),
                    "can_delete": bool(row["can_delete_calendar"]),
                },
                "contacts": {
                    "can_read": bool(row["can_read_contacts"]),
                    "can_modify": bool(row["can_modify_contacts"]),
                },
                "messages": {
                    "can_read": bool(row["can_read_messages"]),
                    "can_send": bool(row["can_send_messages"]),
                },
            },
            "flags": {
                "is_claude_account": bool(row["is_claude_account"]),
                "is_primary": bool(row["is_primary"]),
                "is_enabled": bool(row["is_enabled"]),
            },
            "system_ids": {
                "apple_account_guid": row["apple_account_guid"],
                "mail_account_name": row["mail_account_name"],
                "calendar_owner_email": row["calendar_owner_email"],
                "addressbook_source_id": row["addressbook_source_id"],
            },
            "config": config,
            "timestamps": {
                "discovered_at": row["discovered_at"],
                "last_verified_at": row["last_verified_at"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
        }


@router.put("/{account_id}")
async def update_account(account_id: str, request: UpdateAccountRequest):
    """Update account capabilities and metadata.

    Only updates provided fields. Use this to:
    - Enable/disable accounts
    - Change display names
    - Adjust per-service capabilities
    """
    with get_db() as conn:
        # Check if account exists
        existing = conn.execute(
            "SELECT id FROM accounts WHERE id = ? OR lower(email) = lower(?)",
            (account_id, account_id)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail=f"Account not found: {account_id}")

        # Build UPDATE statement dynamically
        updates = []
        params = []

        if request.display_name is not None:
            updates.append("display_name = ?")
            params.append(request.display_name)

        if request.can_read_email is not None:
            updates.append("can_read_email = ?")
            params.append(1 if request.can_read_email else 0)

        if request.can_send_email is not None:
            updates.append("can_send_email = ?")
            params.append(1 if request.can_send_email else 0)

        if request.can_draft_email is not None:
            updates.append("can_draft_email = ?")
            params.append(1 if request.can_draft_email else 0)

        if request.can_read_calendar is not None:
            updates.append("can_read_calendar = ?")
            params.append(1 if request.can_read_calendar else 0)

        if request.can_create_calendar is not None:
            updates.append("can_create_calendar = ?")
            params.append(1 if request.can_create_calendar else 0)

        if request.can_delete_calendar is not None:
            updates.append("can_delete_calendar = ?")
            params.append(1 if request.can_delete_calendar else 0)

        if request.can_read_contacts is not None:
            updates.append("can_read_contacts = ?")
            params.append(1 if request.can_read_contacts else 0)

        if request.can_modify_contacts is not None:
            updates.append("can_modify_contacts = ?")
            params.append(1 if request.can_modify_contacts else 0)

        if request.can_read_messages is not None:
            updates.append("can_read_messages = ?")
            params.append(1 if request.can_read_messages else 0)

        if request.can_send_messages is not None:
            updates.append("can_send_messages = ?")
            params.append(1 if request.can_send_messages else 0)

        if request.is_enabled is not None:
            updates.append("is_enabled = ?")
            params.append(1 if request.is_enabled else 0)

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Add updated_at timestamp
        updates.append("updated_at = datetime('now')")

        # Add account ID to params
        params.append(existing["id"])

        # Execute update
        sql = f"UPDATE accounts SET {', '.join(updates)} WHERE id = ?"
        conn.execute(sql, params)
        conn.commit()

        logger.info(f"Updated account {account_id}: {', '.join(updates)}")

        # Return updated account
        return await get_account(existing["id"])


@router.post("/discover")
async def trigger_discovery():
    """Manually trigger account discovery.

    This runs the same discovery process that runs on startup,
    useful for testing or when adding new accounts.
    """
    try:
        with get_db() as conn:
            # Create service with storage wrapper
            from db import SystemStorage
            storage = SystemStorage(conn)
            discovery_service = AccountDiscoveryService(storage)

            # Run discovery
            stats = discovery_service.run_discovery()

            logger.info(f"Manual discovery complete: {stats}")

            return {
                "success": True,
                "stats": stats,
                "message": f"Discovery complete: {stats['inserted']} inserted, {stats['updated']} updated, {stats['unchanged']} unchanged",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
    except Exception as e:
        logger.error(f"Discovery failed: {e}")
        raise HTTPException(status_code=500, detail=f"Discovery failed: {str(e)}")
