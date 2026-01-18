"""Settings API routes - system information, health, and model configuration."""

from __future__ import annotations

import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from db import get_db

router = APIRouter()


# ============================================
# Model Configuration
# ============================================

# Available models (aliases and full names)
AVAILABLE_MODELS = [
    {"alias": "opus", "name": "Claude Opus 4.5", "full": "claude-opus-4-5-20251101", "tier": "max"},
    {"alias": "sonnet", "name": "Claude Sonnet 4", "full": "claude-sonnet-4-20250514", "tier": "pro"},
    {"alias": "haiku", "name": "Claude Haiku 3.5", "full": "claude-3-5-haiku-20241022", "tier": "free"},
]

# Default models per role (optimized for cost/capability)
DEFAULT_MODELS = {
    "chief": "opus",       # Chief needs full capability for orchestration
    "builder": "sonnet",   # Builder work is technical but bounded
    "deep-work": "sonnet", # Deep work benefits from capability
    "project": "sonnet",   # External codebases need good context
    "idea": "sonnet",      # Brainstorming needs creativity
    "worker": "sonnet",    # Workers are bounded tasks
}

# Settings keys for model config
MODEL_SETTING_PREFIX = "model_"


def _get_model_setting(role: str) -> Optional[str]:
    """Get model setting for a role from database."""
    key = f"{MODEL_SETTING_PREFIX}{role}"
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            )
            row = cursor.fetchone()
            return row["value"] if row else None
    except Exception:
        return None


def _set_model_setting(role: str, model: str) -> bool:
    """Set model setting for a role in database."""
    key = f"{MODEL_SETTING_PREFIX}{role}"
    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
                """,
                (key, model, now, model, now)
            )
            conn.commit()
        return True
    except Exception:
        return False


class ModelConfigUpdate(BaseModel):
    """Request body for updating model config."""
    model: str  # Model alias (opus, sonnet, haiku) or full name


@router.get("/models")
async def get_model_config():
    """Get model configuration for all roles.
    
    Returns the configured model for each role, falling back to defaults.
    """
    config = {}
    for role, default in DEFAULT_MODELS.items():
        saved = _get_model_setting(role)
        config[role] = saved if saved else default
    
    return {
        "config": config,
        "defaults": DEFAULT_MODELS,
        "available": AVAILABLE_MODELS,
    }


@router.put("/models/{role}")
async def set_model_for_role(role: str, data: ModelConfigUpdate):
    """Set the model for a specific role.
    
    Args:
        role: The role to configure (chief, system, focus, project, idea, worker)
        data: The model to use (alias like 'opus' or full name)
    """
    if role not in DEFAULT_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {role}. Must be one of: {list(DEFAULT_MODELS.keys())}"
        )
    
    # Validate model
    valid_aliases = [m["alias"] for m in AVAILABLE_MODELS]
    valid_full = [m["full"] for m in AVAILABLE_MODELS]
    if data.model not in valid_aliases and data.model not in valid_full:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model: {data.model}. Must be one of: {valid_aliases}"
        )
    
    if _set_model_setting(role, data.model):
        return {"success": True, "role": role, "model": data.model}
    else:
        raise HTTPException(status_code=500, detail="Failed to save model setting")


@router.delete("/models/{role}")
async def reset_model_for_role(role: str):
    """Reset a role's model to default.
    
    Args:
        role: The role to reset
    """
    if role not in DEFAULT_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {role}"
        )
    
    key = f"{MODEL_SETTING_PREFIX}{role}"
    try:
        with get_db() as conn:
            conn.execute("DELETE FROM settings WHERE key = ?", (key,))
        return {"success": True, "role": role, "model": DEFAULT_MODELS[role]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system-info")
async def get_system_info():
    """Get system information."""
    return {
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
        },
        "python": {
            "version": sys.version,
            "executable": sys.executable,
        },
        "engine": {
            "version": "4.0.0",
            "port": settings.port,
            "repo_root": str(settings.repo_root),
            "db_path": str(settings.db_path),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/keyboard-shortcuts")
async def get_keyboard_shortcuts():
    """Get keyboard shortcut reference."""
    return {
        "global": [
            {"key": "⌘ K", "action": "Open command palette"},
            {"key": "⌘ \\", "action": "Toggle Claude panel"},
            {"key": "⌘ W", "action": "Close app / return to Desktop"},
            {"key": "⌘ 1-9", "action": "Switch to dock item"},
            {"key": "Escape", "action": "Return to Desktop"},
        ],
        "desktop": [
            {"key": "Space", "action": "QuickLook selected item"},
            {"key": "Enter", "action": "Open selected item"},
            {"key": "Delete", "action": "Move to Trash"},
            {"key": "Arrow keys", "action": "Navigate icons"},
        ],
        "finder": [
            {"key": "⌘ N", "action": "New folder"},
            {"key": "⌘ Shift N", "action": "New file"},
            {"key": "Enter", "action": "Rename selected"},
            {"key": "Backspace", "action": "Go up one level"},
        ],
        "calendar": [
            {"key": "T", "action": "Go to today"},
            {"key": "D", "action": "Day view"},
            {"key": "W", "action": "Week view"},
            {"key": "M", "action": "Month view"},
            {"key": "C", "action": "Create event"},
            {"key": "← →", "action": "Previous / Next"},
        ],
    }


@router.get("/about")
async def get_about():
    """Get about information."""
    return {
        "name": "Claude OS",
        "version": "4.0.0",
        "description": "Your life, rendered as a desktop you can touch.",
        "repository": "life-specifications",
        "author": "Claude OS",
        "ai_partner": "Claude (Anthropic)",
        "built_with": [
            "Next.js 15",
            "FastAPI",
            "SQLite",
            "FastMCP",
            "Tailwind CSS",
        ],
    }


# ============================================
# Unified Accounts
# ============================================

class AccountCapabilities(BaseModel):
    """Capabilities for an account."""
    email: dict  # read, send, draft
    calendar: dict  # read, create, delete
    contacts: dict  # read, modify
    messages: dict  # read, send


class UnifiedAccount(BaseModel):
    """Unified account information."""
    id: str
    email: str
    display_name: Optional[str]
    account_type: str
    is_claude_account: bool
    is_primary: bool
    is_enabled: bool
    capabilities: AccountCapabilities
    discovered_via: Optional[str] = None
    last_verified_at: Optional[str] = None


@router.get("/accounts")
async def get_unified_accounts():
    """Get all unified accounts with their capabilities.

    Returns accounts from the unified accounts table with
    capabilities organized by app domain (email, calendar, contacts, messages).
    """
    try:
        with get_db() as conn:
            cursor = conn.execute("""
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
                    last_verified_at
                FROM accounts
                ORDER BY is_primary DESC, is_claude_account DESC, display_name
            """)
            rows = cursor.fetchall()

            accounts = []
            for row in rows:
                account = UnifiedAccount(
                    id=row["id"],
                    email=row["email"],
                    display_name=row["display_name"],
                    account_type=row["account_type"],
                    is_claude_account=bool(row["is_claude_account"]),
                    is_primary=bool(row["is_primary"]),
                    is_enabled=bool(row["is_enabled"]),
                    discovered_via=row["discovered_via"],
                    last_verified_at=row["last_verified_at"],
                    capabilities=AccountCapabilities(
                        email={
                            "read": bool(row["can_read_email"]),
                            "send": bool(row["can_send_email"]),
                            "draft": bool(row["can_draft_email"]),
                        },
                        calendar={
                            "read": bool(row["can_read_calendar"]),
                            "create": bool(row["can_create_calendar"]),
                            "delete": bool(row["can_delete_calendar"]),
                        },
                        contacts={
                            "read": bool(row["can_read_contacts"]),
                            "modify": bool(row["can_modify_contacts"]),
                        },
                        messages={
                            "read": bool(row["can_read_messages"]),
                            "send": bool(row["can_send_messages"]),
                        },
                    ),
                )
                accounts.append(account)

            return {"accounts": accounts, "count": len(accounts)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch accounts: {str(e)}")


# ============================================
# Safety Settings (Email Send Safeguards)
# ============================================

# Default safety settings
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
    """Get email send safety settings.

    Returns the configured safety settings for email sending,
    including send delay, rate limits, and new recipient confirmation.
    """
    # Get Claude account for display
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


@router.patch("/safety")
async def update_safety_settings(data: SafetySettingsUpdate):
    """Update email send safety settings.

    Args:
        data: Fields to update (only provided fields are updated)
    """
    updated = []

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

    if not updated:
        raise HTTPException(status_code=400, detail="No fields to update")

    return {
        "success": True,
        "updated": updated,
        "settings": await get_safety_settings()
    }


# ============================================
# Calendar Preferences
# ============================================

# Default calendar preferences
DEFAULT_CALENDAR_SETTINGS = {
    "default_calendar": "Personal",
    "default_meeting_calendar": "Personal",
    "default_personal_calendar": "Calendar",
}


class CalendarPreferencesUpdate(BaseModel):
    """Request body for updating calendar preferences."""
    default_calendar: Optional[str] = None
    default_meeting_calendar: Optional[str] = None
    default_personal_calendar: Optional[str] = None


def _get_calendar_setting(key: str) -> Optional[str]:
    """Get a calendar setting from the settings table."""
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            )
            row = cursor.fetchone()
            return row["value"] if row else None
    except Exception:
        return None


def _set_calendar_setting(key: str, value: str) -> bool:
    """Set a calendar setting in the settings table."""
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


@router.get("/calendar")
async def get_calendar_preferences():
    """Get calendar preferences.

    Returns the configured default calendars for various event types.
    """
    return {
        "default_calendar": _get_calendar_setting("default_calendar") or DEFAULT_CALENDAR_SETTINGS["default_calendar"],
        "default_meeting_calendar": _get_calendar_setting("default_meeting_calendar") or DEFAULT_CALENDAR_SETTINGS["default_meeting_calendar"],
        "default_personal_calendar": _get_calendar_setting("default_personal_calendar") or DEFAULT_CALENDAR_SETTINGS["default_personal_calendar"],
        "defaults": DEFAULT_CALENDAR_SETTINGS,
    }


@router.patch("/calendar")
async def update_calendar_preferences(data: CalendarPreferencesUpdate):
    """Update calendar preferences.

    Args:
        data: Fields to update (only provided fields are updated)
    """
    updated = []

    if data.default_calendar is not None:
        if _set_calendar_setting("default_calendar", data.default_calendar):
            updated.append("default_calendar")
        else:
            raise HTTPException(status_code=500, detail="Failed to update default_calendar")

    if data.default_meeting_calendar is not None:
        if _set_calendar_setting("default_meeting_calendar", data.default_meeting_calendar):
            updated.append("default_meeting_calendar")
        else:
            raise HTTPException(status_code=500, detail="Failed to update default_meeting_calendar")

    if data.default_personal_calendar is not None:
        if _set_calendar_setting("default_personal_calendar", data.default_personal_calendar):
            updated.append("default_personal_calendar")
        else:
            raise HTTPException(status_code=500, detail="Failed to update default_personal_calendar")

    if not updated:
        raise HTTPException(status_code=400, detail="No fields to update")

    return {
        "success": True,
        "updated": updated,
        "settings": await get_calendar_preferences()
    }

