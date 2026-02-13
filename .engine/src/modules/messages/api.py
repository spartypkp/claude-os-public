"""Messages API - HTTP endpoints for Dashboard.

Provides REST endpoints for the Messages Core App.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from core.events import emit_message_sent

router = APIRouter(tags=["messages"])

def _get_service():
    """Get or create the messages service (with contact name resolution)."""
    from . import get_messages_service
    return get_messages_service()


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking service calls in a thread."""
    import asyncio
    return await asyncio.to_thread(fn, *args, **kwargs)


# === Request Models ===


class SendMessageRequest(BaseModel):
    """Request to send a message."""
    recipient: str
    text: str


# === Endpoints ===


@router.get("/status")
async def get_status():
    """Get Messages connection status."""
    service = _get_service()
    return await _run_blocking(service.test_connection)


@router.get("/conversations")
async def list_conversations(
    limit: int = Query(50, ge=1, le=200),
    include_archived: bool = Query(False),
):
    """List recent conversations."""
    service = _get_service()
    conversations = await _run_blocking(
        service.get_conversations,
        limit=limit,
        include_archived=include_archived,
    )
    return {"conversations": conversations, "count": len(conversations)}


@router.get("/conversations/{chat_id}")
async def get_conversation(chat_id: str):
    """Get a specific conversation."""
    service = _get_service()
    conversation = await _run_blocking(service.get_conversation, chat_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("/conversations/{chat_id}/messages")
async def get_conversation_messages(
    chat_id: str,
    limit: int = Query(50, ge=1, le=500),
    before: Optional[str] = Query(None, description="ISO datetime to paginate before"),
):
    """Get messages in a conversation."""
    service = _get_service()
    before_dt = None
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid before datetime")

    messages = await _run_blocking(
        service.get_messages,
        chat_id=chat_id,
        limit=limit,
        before=before_dt,
    )
    return {"messages": messages, "count": len(messages)}


@router.get("/messages")
async def list_messages(
    phone: Optional[str] = Query(None, description="Phone number or email to filter by"),
    limit: int = Query(50, ge=1, le=500),
):
    """Get messages, optionally filtered by contact."""
    service = _get_service()
    messages = await _run_blocking(
        service.get_messages,
        handle_id=phone,
        limit=limit,
    )
    return {"messages": messages, "count": len(messages)}


@router.get("/unread")
async def get_unread(
    limit: int = Query(50, ge=1, le=200),
):
    """Get unread messages."""
    service = _get_service()
    messages = await _run_blocking(service.get_unread, limit=limit)
    return {"messages": messages, "count": len(messages)}


@router.get("/search")
async def search_messages(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=200),
):
    """Search messages by text."""
    service = _get_service()
    messages = await _run_blocking(service.search, query=q, limit=limit)
    return {"messages": messages, "count": len(messages), "query": q}


@router.post("/send")
async def send_message(request: SendMessageRequest):
    """Send a message.

    Note: This endpoint may be blocked by security hooks for non-Claude accounts.
    """
    service = _get_service()
    result = await _run_blocking(
        service.send,
        recipient=request.recipient,
        text=request.text,
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Send failed"))

    # Emit event for Dashboard real-time update
    await emit_message_sent(
        message_id=result.get("message_id", ""),
        recipient=request.recipient,
    )

    return result
