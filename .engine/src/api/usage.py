"""
Claude Code Usage API

Exposes usage tracking data to the Dashboard.
"""

import asyncio
import logging
from fastapi import APIRouter, HTTPException
from typing import Optional, Dict, Any
from datetime import datetime

from services.storage import SystemStorage
from services.usage_tracker import UsageTracker
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/usage", tags=["usage"])

# Store tracker instance (set during startup)
_tracker: Optional[UsageTracker] = None


def set_tracker(tracker: UsageTracker):
    """Set the global tracker instance."""
    global _tracker
    _tracker = tracker


@router.get("/current")
async def get_current_usage():
    """
    Get current Claude Code usage statistics.

    Returns:
        {
            "session": {
                "used": 45234,
                "total": 100000,
                "percentage": 45.2,
                "resetAt": "2026-01-11T18:30:00"
            },
            "weekly": {
                "used": 856000,
                "total": 1000000,
                "percentage": 85.6,
                "resetAt": "2026-01-13T00:00:00"
            } | null,
            "model": "Sonnet 4.5" | null,
            "plan": "max" | null,
            "lastUpdated": "2026-01-11T15:45:23",
            "status": "success" | "error"
        }
    """
    try:
        storage = SystemStorage(settings.db_path)
        tracker = UsageTracker(storage)

        latest = tracker.get_latest_usage()

        if not latest:
            # No data yet - tracker might not have run
            return {
                'status': 'no_data',
                'message': 'No usage data available yet. Tracker will fetch data soon.'
            }

        if latest['fetch_status'] == 'error':
            return {
                'status': 'error',
                'error': latest['error_message'],
                'lastUpdated': latest['timestamp']
            }

        if latest['fetch_status'] == 'parsing_failed':
            return {
                'status': 'parsing_failed',
                'error': 'Could not parse usage data from Claude Code',
                'lastUpdated': latest['timestamp']
            }

        # Format response
        response = {
            'session': {
                'used': latest['session_tokens_used'],
                'total': latest['session_tokens_total'],
                'percentage': latest['session_percentage'],
                'resetAt': latest['session_reset_at']
            },
            'model': latest['current_model'],
            'plan': latest['plan_tier'],
            'lastUpdated': latest['timestamp'],
            'status': 'success'
        }

        # Add weekly if available
        if latest['weekly_tokens_used'] is not None:
            response['weekly'] = {
                'used': latest['weekly_tokens_used'],
                'total': latest['weekly_tokens_total'],
                'percentage': latest['weekly_percentage'],
                'resetAt': latest['weekly_reset_at']
            }
        else:
            response['weekly'] = None

        return response

    except Exception as e:
        logger.error(f"Error getting current usage: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh")
async def refresh_usage():
    """
    Manually trigger a usage data refresh.

    Triggers an immediate fetch. Returns immediately while fetch happens
    in background.

    Returns:
        {
            "status": "refreshing",
            "message": "Usage data refresh triggered"
        }
    """
    try:
        if not _tracker:
            raise HTTPException(status_code=503, detail="Usage tracker not initialized")

        # Trigger async fetch (don't wait)
        asyncio.create_task(_tracker.fetch_and_store_usage())

        return {
            'status': 'refreshing',
            'message': 'Usage data refresh triggered. Check back in a few seconds.'
        }

    except Exception as e:
        logger.error(f"Error triggering refresh: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_usage_history(limit: int = 100):
    """
    Get historical usage data.

    Args:
        limit: Max number of records to return (default 100)

    Returns:
        List of usage records, most recent first
    """
    try:
        storage = SystemStorage(settings.db_path)

        results = storage.fetchall("""
            SELECT
                timestamp,
                session_percentage,
                weekly_percentage,
                current_model,
                fetch_status
            FROM claude_usage
            ORDER BY timestamp DESC
            LIMIT ?
        """, (limit,))

        return {
            'history': [{key: row[key] for key in row.keys()} for row in results]
        }

    except Exception as e:
        logger.error(f"Error getting usage history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
