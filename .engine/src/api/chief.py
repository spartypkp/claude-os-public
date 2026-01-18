"""Chief API routes - control Chief of Staff Claude.

Endpoints for spawning Chief, sending messages, and checking status.
Uses SessionManager directly (no subprocess).
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Import SessionManager
# chief.py is at .engine/src/api/chief.py → api → src → .engine → repo_root
REPO_ROOT = Path(__file__).resolve().parents[3]
import sys
sys.path.insert(0, str(REPO_ROOT / ".engine" / "src"))
from services import SessionManager

# Handoff file location (new pattern: Workspace/handoffs/ for ephemeral handoffs)
HANDOFF_FILE = REPO_ROOT / "Workspace" / "handoffs" / "chief.md"


def get_manager() -> SessionManager:
    """Get a SessionManager instance."""
    return SessionManager(repo_root=REPO_ROOT)


# ============================================
# Lifecycle endpoints
# ============================================

@router.post("/spawn")
async def spawn_chief():
    """Spawn Chief in persistent tmux window."""
    manager = get_manager()

    # Check for handoff file
    handoff_path = None
    if HANDOFF_FILE.exists():
        handoff_path = str(HANDOFF_FILE.relative_to(REPO_ROOT))

    result = manager.spawn_chief(handoff_path=handoff_path)

    if result.success:
        # Clear handoff file after successful spawn
        if handoff_path and HANDOFF_FILE.exists():
            HANDOFF_FILE.unlink()
        return {"success": True, "message": f"Chief spawned: {result.window_name}"}
    else:
        return {"success": False, "error": result.error}


@router.post("/respawn")
async def respawn_chief():
    """Respawn Chief (for handoff)."""
    manager = get_manager()

    # Check if Chief is running - it should have exited first
    status = manager.get_chief_status()
    if status["claude_running"]:
        return {"success": False, "error": "Chief still running. It should exit first."}

    return await spawn_chief()


@router.post("/reset")
async def reset_chief():
    """Force reset Chief - kill current Claude and spawn fresh.

    Use when Chief is out of context or unresponsive and can't
    do a proper session_handoff.
    """
    manager = get_manager()
    result = manager.reset_chief()

    if result.success:
        return {
            "success": True,
            "message": f"Chief reset complete",
            "session_id": result.session_id,
            "window_name": result.window_name
        }
    else:
        return {"success": False, "error": result.error}


@router.get("/status")
async def chief_status():
    """Check if Chief is running."""
    manager = get_manager()
    return manager.get_chief_status()


# ============================================
# Message endpoints
# ============================================

class MessageRequest(BaseModel):
    message: str


@router.post("/wake")
async def wake_chief():
    """Send [WAKE] message to Chief with context."""
    manager = get_manager()
    if manager.send_to_chief("wake"):
        return {"success": True, "message": "Wake sent"}
    return {"success": False, "error": "Failed to send wake - Chief may not be running"}


@router.post("/drop")
async def drop_to_chief(req: MessageRequest):
    """Send [DROP] message - file silently, no response expected."""
    if not req.message:
        raise HTTPException(status_code=400, detail="Message required")

    manager = get_manager()
    if manager.send_to_chief("drop", req.message):
        return {"success": True, "message": "Drop sent"}
    return {"success": False, "error": "Failed to send drop"}


@router.post("/bug")
async def bug_to_chief(req: MessageRequest):
    """Send [BUG] message - add to Open Loops."""
    if not req.message:
        raise HTTPException(status_code=400, detail="Message required")

    manager = get_manager()
    if manager.send_to_chief("bug", req.message):
        return {"success": True, "message": "Bug sent"}
    return {"success": False, "error": "Failed to send bug"}


@router.post("/idea")
async def idea_to_chief(req: MessageRequest):
    """Send [IDEA] message - capture to ideas file."""
    if not req.message:
        raise HTTPException(status_code=400, detail="Message required")

    manager = get_manager()
    if manager.send_to_chief("idea", req.message):
        return {"success": True, "message": "Idea sent"}
    return {"success": False, "error": "Failed to send idea"}


@router.post("/dump")
async def dump_to_chief(req: MessageRequest):
    """Send [BRAIN-DUMP] message - rapid capture mode."""
    if not req.message:
        raise HTTPException(status_code=400, detail="Message required")

    manager = get_manager()
    if manager.send_to_chief("dump", req.message):
        return {"success": True, "message": "Brain dump sent"}
    return {"success": False, "error": "Failed to send dump"}


@router.post("/say")
async def say_to_chief(req: MessageRequest):
    """Send raw message to Chief (normal conversation)."""
    if not req.message:
        raise HTTPException(status_code=400, detail="Message required")

    manager = get_manager()
    if manager.send_to_chief("say", req.message):
        return {"success": True, "message": "Message sent"}
    return {"success": False, "error": "Failed to send message"}
