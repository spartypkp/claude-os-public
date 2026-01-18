"""Email API - direct-read Apple Mail + send safeguards."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from utils.event_bus import (
    emit_email_deleted,
    emit_email_flagged,
    emit_email_read,
)

router = APIRouter()

_service = None


def set_service(service):
    global _service
    _service = service


def get_service():
    if _service is None:
        raise RuntimeError("EmailService not initialized")
    return _service


# === Response Models ===

class MailboxResponse(BaseModel):
    id: str
    name: str
    account: str
    unread_count: int


class MessageListItem(BaseModel):
    id: str
    subject: str
    sender: str
    sender_name: Optional[str]
    recipients: Optional[List[str]] = None
    date_received: str
    is_read: bool
    is_flagged: bool
    mailbox: str
    account: str


class MessageDetail(BaseModel):
    id: str
    subject: str
    sender: str
    sender_name: Optional[str]
    recipients: List[str]
    date_received: str
    is_read: bool
    is_flagged: bool
    mailbox: str
    account: str
    content: Optional[str]


class DraftCreate(BaseModel):
    to: List[str]
    subject: str
    content: str
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None
    account: Optional[str] = None


class UnreadCountResponse(BaseModel):
    mailbox: str
    count: int


class AccountWithCapabilities(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    provider: str
    can_read: bool
    can_send: bool
    can_draft: bool
    is_claude_account: bool


class SendEmailRequest(BaseModel):
    to: List[str]
    subject: str
    content: str
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None
    html: bool = True
    delay_seconds: Optional[int] = None


# === Read endpoints ===

@router.get("/accounts", response_model=List[str])
async def list_accounts() -> List[str]:
    service = get_service()
    accounts = service.get_accounts_with_capabilities()
    return [account["name"] for account in accounts]


@router.get("/accounts/full", response_model=List[AccountWithCapabilities])
async def list_accounts_with_capabilities() -> List[AccountWithCapabilities]:
    service = get_service()
    accounts = service.get_accounts_with_capabilities()
    return [AccountWithCapabilities(**account) for account in accounts]


@router.get("/mailboxes", response_model=List[MailboxResponse])
async def list_mailboxes(
    account: Optional[str] = Query(None, description="Account ID, email, or name")
) -> List[MailboxResponse]:
    service = get_service()
    mailboxes = service.get_mailboxes(account)
    return [
        MailboxResponse(
            id=mb.id,
            name=mb.name,
            account=mb.account,
            unread_count=mb.unread_count,
        )
        for mb in mailboxes
    ]


@router.get("/messages", response_model=List[MessageListItem])
async def list_messages(
    mailbox: str = Query("INBOX", description="Mailbox name"),
    account: Optional[str] = Query(None, description="Account ID, email, or name"),
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False, description="Only unread messages"),
) -> List[MessageListItem]:
    service = get_service()
    messages = service.get_messages(
        mailbox_name=mailbox,
        account_identifier=account,
        limit=limit,
        unread_only=unread_only,
    )
    return [
        MessageListItem(
            id=str(msg.id),
            subject=msg.subject,
            sender=msg.sender,
            sender_name=msg.sender_name,
            recipients=msg.recipients,
            date_received=msg.date_received,
            is_read=msg.is_read,
            is_flagged=msg.is_flagged,
            mailbox=msg.mailbox,
            account=msg.account,
        )
        for msg in messages
    ]


@router.get("/messages/{message_id}", response_model=MessageDetail)
async def get_message(
    message_id: str,
    mailbox: str = Query("INBOX", description="Mailbox containing the message"),
    account: Optional[str] = Query(None, description="Account ID, email, or name"),
) -> MessageDetail:
    service = get_service()
    message = service.get_message(
        message_id=message_id,
        mailbox_name=mailbox,
        account_identifier=account,
    )

    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    return MessageDetail(
        id=str(message.id),
        subject=message.subject,
        sender=message.sender,
        sender_name=message.sender_name,
        recipients=message.recipients,
        date_received=message.date_received,
        is_read=message.is_read,
        is_flagged=message.is_flagged,
        mailbox=message.mailbox,
        account=message.account,
        content=message.content,
    )


@router.get("/search", response_model=List[MessageListItem])
async def search_messages(
    q: str = Query(..., description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    account: Optional[str] = Query(None, description="Account ID, email, or name"),
    mailbox: Optional[str] = Query(None, description="Mailbox name"),
) -> List[MessageListItem]:
    service = get_service()
    messages = service.search_messages(
        query=q,
        mailbox_name=mailbox,
        account_identifier=account,
        limit=limit,
    )
    return [
        MessageListItem(
            id=str(msg.id),
            subject=msg.subject,
            sender=msg.sender,
            sender_name=msg.sender_name,
            recipients=msg.recipients,
            date_received=msg.date_received,
            is_read=msg.is_read,
            is_flagged=msg.is_flagged,
            mailbox=msg.mailbox,
            account=msg.account,
        )
        for msg in messages
    ]


@router.get("/unread", response_model=UnreadCountResponse)
async def get_unread_count(
    mailbox: str = Query("INBOX", description="Mailbox name"),
    account: Optional[str] = Query(None, description="Account ID, email, or name"),
) -> UnreadCountResponse:
    service = get_service()
    count = service.get_unread_count(mailbox_name=mailbox, account_identifier=account)
    return UnreadCountResponse(mailbox=mailbox, count=count)


# === Actions ===

@router.post("/drafts", status_code=201)
async def create_draft(data: DraftCreate):
    service = get_service()
    result = service.create_draft(
        account_id=data.account,
        to=data.to,
        subject=data.subject,
        content=data.content,
        cc=data.cc,
        bcc=data.bcc,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to create draft"))

    return {"status": "created", "message": result.get("message")}


@router.post("/messages/{message_id}/read")
async def mark_message_read(
    message_id: str,
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
):
    service = get_service()
    success = service.mark_as_read(
        message_id=message_id,
        mailbox_name=mailbox,
        account_identifier=account,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Message not found")
    await emit_email_read(message_id=message_id, account=account or "unknown")
    return {"status": "ok"}


@router.post("/messages/{message_id}/flag")
async def toggle_message_flag(
    message_id: str,
    flagged: bool = Query(..., description="True to flag, False to unflag"),
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
):
    service = get_service()
    success = service.mark_as_flagged(
        message_id=message_id,
        flagged=flagged,
        mailbox_name=mailbox,
        account_identifier=account,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Message not found")
    await emit_email_flagged(message_id=message_id, account=account or "unknown", flagged=flagged)
    return {"status": "ok", "flagged": flagged}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
):
    service = get_service()
    success = service.move_to_trash(
        message_id=message_id,
        mailbox_name=mailbox,
        account_identifier=account,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Message not found")
    await emit_email_deleted(message_id=message_id, account=account or "unknown")
    return {"status": "ok"}


# === Send safeguards ===

@router.post("/{account_id}/send")
async def send_email(account_id: str, data: SendEmailRequest):
    service = get_service()

    result = service.send_message(
        account_id=account_id,
        to=data.to,
        subject=data.subject,
        content=data.content,
        cc=data.cc,
        bcc=data.bcc,
        html=data.html,
        delay_seconds=data.delay_seconds,
    )

    if not result.get("success"):
        status = result.get("status")
        if status == "no_capability":
            raise HTTPException(status_code=403, detail=result.get("message"))
        if status == "rate_limited":
            raise HTTPException(status_code=429, detail=result.get("message"))
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


@router.get("/queue")
async def get_send_queue():
    service = get_service()
    return service.get_queued_emails()


@router.post("/queue/{email_id}/cancel")
async def cancel_queued_email(email_id: str):
    service = get_service()
    result = service.cancel_email(email_id)

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))

    return result


@router.get("/send-history")
async def get_send_history(limit: int = Query(50, ge=1, le=200)):
    service = get_service()
    return service.get_send_history(limit=limit)


# === Settings ===

@router.get("/settings")
async def get_settings():
    service = get_service()
    return service.get_settings()


@router.patch("/settings")
async def update_settings(settings: Dict[str, Any]):
    service = get_service()
    for key, value in settings.items():
        service.update_setting(key, value)
    return {"status": "ok", "updated": list(settings.keys())}
