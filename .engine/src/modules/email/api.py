"""Email API - inbox read endpoints + safety settings for sending."""
import asyncio
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.database import get_db
from core.storage import SystemStorage
from core.config import settings

router = APIRouter(tags=["email"])
logger = logging.getLogger(__name__)

# =============================================================================
# EMAIL SERVICE SINGLETON
# =============================================================================

_email_service = None


def get_email_service():
    """Get or create the EmailService singleton."""
    global _email_service
    if _email_service is None:
        from .service import EmailService
        storage = SystemStorage(settings.db_path)
        _email_service = EmailService(storage)
    return _email_service


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


def _serialize_message(msg) -> dict:
    """Convert an EmailMessage dataclass to a JSON-safe dict."""
    d = asdict(msg)
    # Convert ProviderType enum to string
    if "provider" in d:
        d["provider"] = str(d["provider"].value) if hasattr(d["provider"], "value") else str(d["provider"])
    return d


def _serialize_mailbox(mb) -> dict:
    """Convert a Mailbox dataclass to a JSON-safe dict."""
    d = asdict(mb)
    if "provider" in d:
        d["provider"] = str(d["provider"].value) if hasattr(d["provider"], "value") else str(d["provider"])
    return d


# =============================================================================
# INBOX READ ENDPOINTS
# =============================================================================


@router.get("/accounts/full")
async def get_accounts_full():
    """Get all email accounts with capabilities."""
    def _get():
        svc = get_email_service()
        return svc.get_accounts_with_capabilities()
    accounts = await _run_blocking(_get)
    return {"accounts": accounts}


@router.get("/mailboxes")
async def get_mailboxes(account: Optional[str] = Query(None)):
    """Get mailboxes for an account."""
    def _get():
        svc = get_email_service()
        return [_serialize_mailbox(mb) for mb in svc.get_mailboxes(account)]
    mailboxes = await _run_blocking(_get)
    return {"mailboxes": mailboxes}


@router.get("/messages")
async def get_messages(
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False),
):
    """Get messages from a mailbox."""
    def _get():
        svc = get_email_service()
        msgs = svc.get_messages(mailbox, account, limit, unread_only)
        return [_serialize_message(m) for m in msgs]
    messages = await _run_blocking(_get)
    return {"messages": messages, "count": len(messages)}


@router.get("/messages/{message_id}")
async def get_message_detail(
    message_id: str,
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
):
    """Get a single message with full content."""
    def _get():
        svc = get_email_service()
        msg = svc.get_message(message_id, mailbox, account)
        if not msg:
            return None
        return _serialize_message(msg)
    message = await _run_blocking(_get)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return message


@router.get("/search")
async def search_messages(
    query: str = Query(..., min_length=1),
    mailbox: Optional[str] = Query(None),
    account: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Search messages."""
    def _get():
        svc = get_email_service()
        msgs = svc.search_messages(query, mailbox, account, limit)
        return [_serialize_message(m) for m in msgs]
    messages = await _run_blocking(_get)
    return {"messages": messages, "count": len(messages)}


@router.post("/messages/{message_id}/read")
async def mark_message_read(
    message_id: str,
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
):
    """Mark a message as read."""
    def _mark():
        svc = get_email_service()
        return svc.mark_as_read(message_id, mailbox, account)
    success = await _run_blocking(_mark)
    return {"success": success}


# =============================================================================
# TRIAGE ENDPOINT (optimized for widget)
# =============================================================================


@router.get("/triage")
async def get_email_triage(limit: int = Query(8, ge=1, le=20)):
    """Get email triage data for the menubar widget.

    Returns unread count and top N recent unread messages across all accounts.
    Single call optimized for widget display.
    """
    def _triage():
        svc = get_email_service()
        accounts = svc.get_accounts_with_capabilities()

        total_unread = 0
        per_account = []
        all_messages = []

        for acct in accounts:
            if not acct.get("can_read"):
                continue

            try:
                count = svc.get_unread_count("INBOX", acct["id"])
                total_unread += count
                per_account.append({
                    "id": acct["id"],
                    "name": acct.get("name", "Unknown"),
                    "email": acct.get("email"),
                    "unread_count": count,
                })

                if count > 0:
                    msgs = svc.get_messages("INBOX", acct["id"], limit=limit, unread_only=True)
                    for msg in msgs:
                        all_messages.append(_serialize_message(msg))
            except Exception as e:
                logger.warning(f"Failed to get triage for account {acct.get('id')}: {e}")

        # Sort by date_received descending and take top N
        all_messages.sort(key=lambda m: m.get("date_received", ""), reverse=True)
        top_messages = all_messages[:limit]

        return {
            "unread_count": total_unread,
            "accounts": per_account,
            "messages": top_messages,
        }

    return await _run_blocking(_triage)


# =============================================================================
# SAFETY SETTINGS
# =============================================================================

DEFAULT_SAFETY_SETTINGS = {
    "send_delay_seconds": "15",
    "rate_limit_per_hour": "50",
    "require_new_recipient_confirmation": "false",
}


class SafetySettingsUpdate(BaseModel):
    """Request body for updating safety settings."""
    send_delay_seconds: Optional[int] = None
    rate_limit_per_hour: Optional[int] = None
    require_new_recipient_confirmation: Optional[bool] = None


def _get_safety_setting(key: str) -> Optional[str]:
    """Get a safety setting from the settings table."""
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            )
            row = cursor.fetchone()
            return row["value"] if row else None
    except Exception:
        return None


def _set_safety_setting(key: str, value: str) -> bool:
    """Set a safety setting in the settings table."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
                """,
                (key, value, now, value, now)
            )
            conn.commit()
        return True
    except Exception:
        return False


@router.get("/safety")
async def get_safety_settings():
    """Get email send safety settings."""
    def _load_safety_settings():
        claude_account_email = None
        try:
            with get_db() as conn:
                cursor = conn.execute(
                    "SELECT email FROM accounts WHERE is_claude_account = 1 LIMIT 1"
                )
                row = cursor.fetchone()
                if row:
                    claude_account_email = row["email"]
        except Exception:
            pass

        return {
            "send_delay_seconds": int(_get_safety_setting("send_delay_seconds") or DEFAULT_SAFETY_SETTINGS["send_delay_seconds"]),
            "rate_limit_per_hour": int(_get_safety_setting("rate_limit_per_hour") or DEFAULT_SAFETY_SETTINGS["rate_limit_per_hour"]),
            "require_new_recipient_confirmation": (_get_safety_setting("require_new_recipient_confirmation") or DEFAULT_SAFETY_SETTINGS["require_new_recipient_confirmation"]).lower() == "true",
            "claude_account_email": claude_account_email,
            "defaults": {
                "send_delay_seconds": int(DEFAULT_SAFETY_SETTINGS["send_delay_seconds"]),
                "rate_limit_per_hour": int(DEFAULT_SAFETY_SETTINGS["rate_limit_per_hour"]),
                "require_new_recipient_confirmation": DEFAULT_SAFETY_SETTINGS["require_new_recipient_confirmation"].lower() == "true",
            }
        }

    return await _run_blocking(_load_safety_settings)


@router.patch("/safety")
async def update_safety_settings(data: SafetySettingsUpdate):
    """Update email send safety settings."""
    updated = []

    def _apply_updates():
        if data.send_delay_seconds is not None:
            if data.send_delay_seconds < 0 or data.send_delay_seconds > 300:
                raise HTTPException(status_code=400, detail="send_delay_seconds must be between 0 and 300")
            if _set_safety_setting("send_delay_seconds", str(data.send_delay_seconds)):
                updated.append("send_delay_seconds")
            else:
                raise HTTPException(status_code=500, detail="Failed to update send_delay_seconds")

        if data.rate_limit_per_hour is not None:
            if data.rate_limit_per_hour < 1 or data.rate_limit_per_hour > 500:
                raise HTTPException(status_code=400, detail="rate_limit_per_hour must be between 1 and 500")
            if _set_safety_setting("rate_limit_per_hour", str(data.rate_limit_per_hour)):
                updated.append("rate_limit_per_hour")
            else:
                raise HTTPException(status_code=500, detail="Failed to update rate_limit_per_hour")

        if data.require_new_recipient_confirmation is not None:
            if _set_safety_setting("require_new_recipient_confirmation", str(data.require_new_recipient_confirmation).lower()):
                updated.append("require_new_recipient_confirmation")
            else:
                raise HTTPException(status_code=500, detail="Failed to update require_new_recipient_confirmation")

    await _run_blocking(_apply_updates)

    if not updated:
        raise HTTPException(status_code=400, detail="No fields to update")

    return {
        "success": True,
        "updated": updated,
        "settings": await get_safety_settings()
    }
