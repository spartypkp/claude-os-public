"""Release MCP tool - programmatic interface for Release specialist."""
from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, Optional

from fastmcp import FastMCP

from .service import ReleaseService

mcp = FastMCP("life-release")


@mcp.tool()
def release(
    operation: str,
    slug: Optional[str] = None,
) -> Dict[str, Any]:
    """Manage the release pipeline — track features syncing from private to public repo.

    Args:
        operation: Operation to perform:
            - "list": List pending features with status
            - "get": Get a single feature's details (requires slug)
            - "mark_ready": Mark a feature as ready to sync (requires slug)
            - "mark_synced": Mark a feature as synced, moves to history (requires slug)
            - "history": List completed syncs
            - "stats": Get summary statistics
        slug: Feature slug (required for get, mark_ready, mark_synced)

    Returns:
        Object with success status and operation-specific data

    Examples:
        release("list")
        release("get", slug="email-overhaul")
        release("mark_ready", slug="email-overhaul")
        release("mark_synced", slug="email-overhaul")
        release("history")
        release("stats")
    """
    try:
        service = ReleaseService()

        if operation == "list":
            features = service.list_pending()
            return {
                "success": True,
                "count": len(features),
                "items": [asdict(f) for f in features],
            }

        elif operation == "get":
            if not slug:
                return {"success": False, "error": "slug required for get"}
            feature = service.get_feature(slug)
            if not feature:
                return {"success": False, "error": f"Feature '{slug}' not found"}
            return {"success": True, **asdict(feature)}

        elif operation == "mark_ready":
            if not slug:
                return {"success": False, "error": "slug required for mark_ready"}
            feature = service.get_feature(slug)
            if not feature:
                return {"success": False, "error": f"Feature '{slug}' not found"}
            if feature.status == "ready":
                return {"success": True, "message": "Already ready"}
            success = service.mark_ready(slug)
            return {"success": success}

        elif operation == "mark_synced":
            if not slug:
                return {"success": False, "error": "slug required for mark_synced"}
            success = service.mark_synced(slug)
            if not success:
                return {"success": False, "error": f"Feature '{slug}' not found or sync failed"}
            return {"success": True, "message": f"'{slug}' moved to history"}

        elif operation == "history":
            entries = service.list_history()
            return {
                "success": True,
                "count": len(entries),
                "items": [asdict(e) for e in entries],
            }

        elif operation == "stats":
            stats = service.get_stats()
            return {"success": True, **stats}

        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use: list, get, mark_ready, mark_synced, history, stats",
            }

    except Exception as e:
        return {"success": False, "error": str(e)}
