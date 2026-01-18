"""Ping endpoints - Claude → user attention requests."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from db import get_db

router = APIRouter()


@router.get("")
async def list_pings(include_acked: bool = False):
    """List pings (unacknowledged by default).

    Returns pings with session info for dashboard display.
    """
    with get_db() as conn:
        sql = """
            SELECT
                p.id,
                p.session_id,
                p.message,
                p.created_at,
                p.acknowledged_at,
                s.role,
                s.mode
            FROM pings p
            LEFT JOIN sessions s ON p.session_id = s.session_id
        """

        if not include_acked:
            sql += " WHERE p.acknowledged_at IS NULL"

        sql += " ORDER BY p.created_at DESC LIMIT 50"

        cursor = conn.execute(sql)
        rows = cursor.fetchall()

        pings = []
        for row in rows:
            pings.append({
                "id": row["id"],
                "session_id": row["session_id"][:8] if row["session_id"] else None,
                "role": row["role"] or "unknown",
                "mode": row["mode"] or "unknown",
                "message": row["message"],
                "created_at": row["created_at"],
                "acknowledged_at": row["acknowledged_at"],
            })

        unacked_count = sum(1 for p in pings if not p["acknowledged_at"])

        return {
            "pings": pings,
            "count": len(pings),
            "unacked_count": unacked_count,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


@router.post("/{ping_id}/ack")
async def acknowledge_ping(ping_id: str):
    """Acknowledge (dismiss) a ping."""
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        cursor = conn.execute("SELECT id FROM pings WHERE id = ?", (ping_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail=f"Ping '{ping_id}' not found")

        conn.execute(
            "UPDATE pings SET acknowledged_at = ? WHERE id = ?",
            (now, ping_id)
        )
        conn.commit()

        return {"success": True, "id": ping_id}


@router.delete("/{ping_id}")
async def delete_ping(ping_id: str):
    """Delete a ping entirely."""
    with get_db() as conn:
        cursor = conn.execute("SELECT id FROM pings WHERE id = ?", (ping_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail=f"Ping '{ping_id}' not found")

        conn.execute("DELETE FROM pings WHERE id = ?", (ping_id,))
        conn.commit()

        return {"success": True}
