"""Settings API - Model configuration and UI preferences."""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.database import get_db

router = APIRouter(tags=["settings"])


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking DB operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


# =============================================================================
# MODEL CONFIGURATION
# =============================================================================

AVAILABLE_MODELS = [
    {"alias": "opus", "name": "Claude Opus 4.5", "full": "claude-opus-4-5-20251101", "tier": "max"},
    {"alias": "sonnet", "name": "Claude Sonnet 4", "full": "claude-sonnet-4-20250514", "tier": "pro"},
    {"alias": "haiku", "name": "Claude Haiku 3.5", "full": "claude-3-5-haiku-20241022", "tier": "free"},
]

DEFAULT_MODELS = {
    "chief": "opus",
    "builder": "sonnet",
    "writer": "sonnet",
    "researcher": "sonnet",
    "curator": "sonnet",
    "project": "sonnet",
    "idea": "sonnet",
}

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
    model: str


@router.get("/models")
async def get_model_config():
    """Get model configuration for all roles."""
    def _load_config():
        config = {}
        for role, default in DEFAULT_MODELS.items():
            saved = _get_model_setting(role)
            config[role] = saved if saved else default
        return config

    config = await _run_blocking(_load_config)

    return {
        "config": config,
        "defaults": DEFAULT_MODELS,
        "available": AVAILABLE_MODELS,
    }


@router.put("/models/{role}")
async def set_model_for_role(role: str, data: ModelConfigUpdate):
    """Set the model for a specific role."""
    if role not in DEFAULT_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {role}. Must be one of: {list(DEFAULT_MODELS.keys())}"
        )

    valid_aliases = [m["alias"] for m in AVAILABLE_MODELS]
    valid_full = [m["full"] for m in AVAILABLE_MODELS]
    if data.model not in valid_aliases and data.model not in valid_full:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model: {data.model}. Must be one of: {valid_aliases}"
        )

    success = await _run_blocking(_set_model_setting, role, data.model)
    if success:
        return {"success": True, "role": role, "model": data.model}
    else:
        raise HTTPException(status_code=500, detail="Failed to save model setting")


@router.delete("/models/{role}")
async def reset_model_for_role(role: str):
    """Reset a role's model to default."""
    if role not in DEFAULT_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role}")

    key = f"{MODEL_SETTING_PREFIX}{role}"
    try:
        def _reset_model():
            with get_db() as conn:
                conn.execute("DELETE FROM settings WHERE key = ?", (key,))
        await _run_blocking(_reset_model)
        return {"success": True, "role": role, "model": DEFAULT_MODELS[role]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# UI PREFERENCES
# =============================================================================

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
