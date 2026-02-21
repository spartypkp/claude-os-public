"""Email API - inbox read endpoints + safety settings for sending."""
import asyncio
import json
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.database import get_db
from core.storage import SystemStorage
from core.config import settings


def _ensure_utc_suffix(ts: str | None) -> str | None:
    """Ensure ISO timestamp has timezone suffix so JS parses as UTC."""
    if not ts:
        return ts
    # Already has timezone info (+00:00 or Z)
    if "+" in ts[10:] or ts.endswith("Z"):
        return ts
    return ts + "Z"

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


@router.post("/messages/{message_id}/archive")
async def archive_message(
    message_id: str,
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
):
    """Archive a message (move to Archive or [Gmail]/All Mail)."""
    def _archive():
        svc = get_email_service()
        return svc.archive(message_id, mailbox, account)
    success = await _run_blocking(_archive)
    return {"success": success}


@router.post("/messages/{message_id}/flag")
async def flag_message(
    message_id: str,
    flagged: bool = Query(True),
    mailbox: str = Query("INBOX"),
    account: Optional[str] = Query(None),
):
    """Set flagged status on a message."""
    def _flag():
        svc = get_email_service()
        return svc.mark_as_flagged(message_id, flagged, mailbox, account)
    success = await _run_blocking(_flag)
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

        # Deduplicate across accounts (same email forwarded/synced to multiple)
        seen = set()
        unique_messages = []
        for msg in all_messages:
            dedup_key = (msg.get("subject"), msg.get("sender"), msg.get("date_received"))
            if dedup_key not in seen:
                seen.add(dedup_key)
                unique_messages.append(msg)

        # Sort by date_received descending and take top N
        unique_messages.sort(key=lambda m: m.get("date_received", ""), reverse=True)
        top_messages = unique_messages[:limit]

        # Enrich with classification data if available
        try:
            from core.database import get_db
            with get_db() as conn:
                for msg in top_messages:
                    msg_id = msg.get("id")
                    msg_account = msg.get("account")
                    if msg_id and msg_account:
                        cursor = conn.execute(
                            """
                            SELECT category, summary, briefing
                            FROM email_classifications
                            WHERE email_message_id = ? AND account_id = ?
                            ORDER BY classified_at DESC
                            LIMIT 1
                            """,
                            (msg_id, msg_account),
                        )
                        row = cursor.fetchone()
                        if row:
                            msg["classification"] = {
                                "category": row["category"],
                                "summary": row["summary"],
                                "briefing": row["briefing"],
                            }
                        else:
                            msg["classification"] = None
                    else:
                        msg["classification"] = None
        except Exception as e:
            logger.debug(f"Classification enrichment failed (non-fatal): {e}")
            for msg in top_messages:
                msg["classification"] = None

        return {
            "unread_count": total_unread,
            "accounts": per_account,
            "messages": top_messages,
        }

    return await _run_blocking(_triage)


# =============================================================================
# CLASSIFICATION PIPELINE
# =============================================================================

@router.get("/pipeline/status")
async def get_pipeline_status():
    """Get classification pipeline status with processing metrics."""

    def _status():
        with get_db() as conn:
            total = conn.execute("SELECT COUNT(*) as c FROM email_metadata").fetchone()["c"]
            classified = conn.execute("SELECT COUNT(*) as c FROM email_metadata WHERE classified = 1").fetchone()["c"]
            pending = total - classified

            recent = conn.execute(
                """SELECT category, COUNT(*) as c FROM email_classifications
                   GROUP BY category ORDER BY c DESC"""
            ).fetchall()
            breakdown = {row["category"]: row["c"] for row in recent}

            action_needed_count = conn.execute(
                "SELECT COUNT(*) as c FROM email_classifications WHERE category = 'action_needed'"
            ).fetchone()["c"]

            # Processing metrics
            avg_time = conn.execute(
                "SELECT AVG(processing_time_ms) as avg_ms FROM email_classifications WHERE processing_time_ms IS NOT NULL"
            ).fetchone()["avg_ms"]

            # Recent classifications (last 10) for live feed
            recent_items = conn.execute(
                """SELECT ec.email_message_id, ec.account_id, ec.category, ec.summary,
                          ec.display_name, ec.sender, ec.subject, ec.processing_time_ms,
                          ec.classified_at
                   FROM email_classifications ec
                   ORDER BY ec.classified_at DESC
                   LIMIT 10"""
            ).fetchall()

            # Pending queue details (what's waiting)
            pending_items = conn.execute(
                """SELECT em.email_message_id, em.account_id, em.received_at, em.first_seen_at
                   FROM email_metadata em
                   WHERE em.classified = 0
                   ORDER BY em.first_seen_at DESC
                   LIMIT 20"""
            ).fetchall()

            # Throughput: classifications in last hour
            last_hour = conn.execute(
                """SELECT COUNT(*) as c FROM email_classifications
                   WHERE classified_at >= datetime('now', '-1 hour')"""
            ).fetchone()["c"]

            # Error count (fyi with "error" or "did not" in summary)
            errors = conn.execute(
                """SELECT COUNT(*) as c FROM email_classifications
                   WHERE summary LIKE '%error%' OR summary LIKE '%did not produce%'"""
            ).fetchone()["c"]

        return {
            "total_tracked": total,
            "classified": classified,
            "pending": pending,
            "action_needed_count": action_needed_count,
            "category_breakdown": breakdown,
            "avg_processing_ms": round(avg_time) if avg_time else None,
            "throughput_last_hour": last_hour,
            "error_count": errors,
            "max_workers": 3,
            "recent_classifications": [
                {
                    "message_id": r["email_message_id"],
                    "category": r["category"],
                    "summary": r["summary"],
                    "display_name": r["display_name"],
                    "sender": r["sender"],
                    "subject": r["subject"],
                    "processing_time_ms": r["processing_time_ms"],
                    "classified_at": _ensure_utc_suffix(r["classified_at"]),
                }
                for r in recent_items
            ],
            "pending_queue": [
                {
                    "message_id": r["email_message_id"],
                    "account_id": r["account_id"],
                    "received_at": _ensure_utc_suffix(r["received_at"]),
                    "queued_at": _ensure_utc_suffix(r["first_seen_at"]),
                }
                for r in pending_items
            ],
        }

    return await _run_blocking(_status)


@router.get("/classifications/triage")
async def get_triage_classifications(
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Get unhandled classifications for triage view.

    Returns items where handled=0, ordered: action_needed > heads_up > fyi.
    """

    def _get():
        with get_db() as conn:
            where_clauses = ["ec.handled = 0"]
            params = []

            if category:
                where_clauses.append("ec.category = ?")
                params.append(category)

            where_sql = "WHERE " + " AND ".join(where_clauses)

            rows = conn.execute(
                f"""SELECT ec.id, ec.email_message_id, ec.account_id, ec.category,
                           ec.summary, ec.briefing, ec.display_name, ec.sender,
                           ec.subject, ec.preview, ec.suggested_actions, ec.handled,
                           ec.received_at, ec.classified_at, ec.processing_time_ms
                    FROM email_classifications ec
                    {where_sql}
                    ORDER BY
                        CASE ec.category
                            WHEN 'action_needed' THEN 1
                            WHEN 'heads_up' THEN 2
                            WHEN 'fyi' THEN 3
                            ELSE 4
                        END,
                        COALESCE(ec.received_at, ec.classified_at) DESC
                    LIMIT ?""",
                params + [limit],
            ).fetchall()

            items = []
            for row in rows:
                item = {
                    "id": row["id"],
                    "message_id": row["email_message_id"],
                    "account_id": row["account_id"],
                    "category": row["category"],
                    "summary": row["summary"],
                    "briefing": row["briefing"],
                    "display_name": row["display_name"],
                    "sender": row["sender"],
                    "subject": row["subject"],
                    "preview": row["preview"],
                    "suggested_actions": row["suggested_actions"].split("\n") if row["suggested_actions"] else [],
                    "handled": bool(row["handled"]),
                    "received_at": _ensure_utc_suffix(row["received_at"]),
                    "classified_at": _ensure_utc_suffix(row["classified_at"]),
                    "processing_time_ms": row["processing_time_ms"],
                }
                items.append(item)

            # Count unhandled by category
            counts = conn.execute(
                """SELECT category, COUNT(*) as c FROM email_classifications
                   WHERE handled = 0 GROUP BY category"""
            ).fetchall()
            counts_by_category = {r["category"]: r["c"] for r in counts}

        return {
            "total_unhandled": sum(counts_by_category.values()),
            "counts_by_category": counts_by_category,
            "classifications": items,
        }

    return await _run_blocking(_get)


@router.post("/classifications/{message_id}/handle")
async def handle_classification(
    message_id: str,
    account: Optional[str] = Query(None),
):
    """Mark a classification as handled."""

    def _handle():
        with get_db() as conn:
            if account:
                result = conn.execute(
                    "UPDATE email_classifications SET handled = 1 WHERE email_message_id = ? AND account_id = ?",
                    (message_id, account),
                )
            else:
                result = conn.execute(
                    "UPDATE email_classifications SET handled = 1 WHERE email_message_id = ?",
                    (message_id,),
                )
            conn.commit()
            return result.rowcount

    count = await _run_blocking(_handle)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Classification not found for {message_id}")
    return {"success": True, "message": f"Marked {message_id} as handled"}


@router.post("/classifications/handle-batch")
async def handle_batch_classifications(data: dict):
    """Mark multiple classifications as handled."""

    message_ids = data.get("message_ids", [])
    if not message_ids:
        raise HTTPException(status_code=400, detail="message_ids required")

    def _handle():
        with get_db() as conn:
            placeholders = ",".join("?" * len(message_ids))
            conn.execute(
                f"UPDATE email_classifications SET handled = 1 WHERE email_message_id IN ({placeholders})",
                message_ids,
            )
            conn.commit()
            return len(message_ids)

    count = await _run_blocking(_handle)
    return {"success": True, "handled": count}


@router.get("/classifications")
async def get_classifications(
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
):
    """Get classified emails with full classification data.

    Supports filtering by category, search by sender/subject, and pagination.
    Returns data from email_classifications table — no Apple Mail fetch needed.
    """

    def _get():
        with get_db() as conn:
            where_clauses = []
            params = []

            if category:
                where_clauses.append("ec.category = ?")
                params.append(category)

            if search:
                where_clauses.append(
                    "(ec.sender LIKE ? OR ec.subject LIKE ? OR ec.summary LIKE ? OR ec.briefing LIKE ?)"
                )
                term = f"%{search}%"
                params.extend([term, term, term, term])

            where_sql = ""
            if where_clauses:
                where_sql = "WHERE " + " AND ".join(where_clauses)

            # Get total count for pagination
            count_row = conn.execute(
                f"SELECT COUNT(*) as c FROM email_classifications ec {where_sql}",
                params,
            ).fetchone()
            total = count_row["c"]

            # Get paginated results
            rows = conn.execute(
                f"""SELECT ec.id, ec.email_message_id, ec.account_id, ec.category,
                           ec.summary, ec.briefing, ec.reasoning,
                           ec.display_name, ec.sender, ec.subject, ec.preview,
                           ec.suggested_actions, ec.handled,
                           ec.processing_time_ms, ec.received_at, ec.classified_at
                    FROM email_classifications ec
                    {where_sql}
                    ORDER BY COALESCE(ec.received_at, ec.classified_at) DESC
                    LIMIT ? OFFSET ?""",
                params + [limit, offset],
            ).fetchall()

            classifications = []
            for row in rows:
                classifications.append({
                    "id": row["id"],
                    "message_id": row["email_message_id"],
                    "account_id": row["account_id"],
                    "category": row["category"],
                    "summary": row["summary"],
                    "briefing": row["briefing"],
                    "reasoning": row["reasoning"],
                    "display_name": row["display_name"],
                    "sender": row["sender"],
                    "subject": row["subject"],
                    "preview": row["preview"],
                    "suggested_actions": row["suggested_actions"].split("\n") if row["suggested_actions"] else [],
                    "handled": bool(row["handled"]),
                    "processing_time_ms": row["processing_time_ms"],
                    "received_at": _ensure_utc_suffix(row["received_at"]),
                    "classified_at": _ensure_utc_suffix(row["classified_at"]),
                })

        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "classifications": classifications,
        }

    return await _run_blocking(_get)


# =============================================================================
# DRAFT (opens in Mail.app)
# =============================================================================


class CreateDraftRequest(BaseModel):
    to: str
    subject: str
    content: str
    account: Optional[str] = None


@router.post("/draft")
async def create_email_draft(data: CreateDraftRequest):
    """Create a draft email (opens Mail.app compose window)."""

    def _draft():
        svc = get_email_service()
        return svc.create_draft(
            account_id=data.account,
            to=[data.to],
            subject=data.subject,
            content=data.content,
        )

    result = await _run_blocking(_draft)
    return result


# =============================================================================
# REPLY DRAFTING
# =============================================================================

REPLY_PROMPT = """You are drafting an email reply for the user. Write a natural, concise reply based on the context below.

**Original Email:**
- From: {sender}
- Subject: {subject}
- Body: {body}

{classification_context}
{thread_context}
{contact_context}

**Instructions:**
- Write ONLY the reply body text. No subject line, no greeting headers like "Dear X" unless appropriate.
- Match the formality of the original email.
- Be concise — 2-5 sentences for most replies.
- If the email requires a specific action (scheduling, confirming, etc.), address it directly.
- Do NOT include any meta-commentary or instructions. Just the reply text.
"""


class GenerateReplyRequest(BaseModel):
    sender: str
    subject: str
    body: str
    classification_summary: Optional[str] = None
    classification_category: Optional[str] = None
    matched_signals: Optional[list] = None
    thread_summary: Optional[str] = None
    contact_name: Optional[str] = None
    contact_company: Optional[str] = None
    contact_relationship: Optional[str] = None


@router.post("/generate-reply")
async def generate_reply(data: GenerateReplyRequest):
    """Generate a reply draft using Haiku."""

    classification_context = ""
    if data.classification_summary or data.classification_category:
        parts = []
        if data.classification_category:
            parts.append(f"Category: {data.classification_category}")
        if data.classification_summary:
            parts.append(f"Summary: {data.classification_summary}")
        if data.matched_signals:
            parts.append(f"Signals: {', '.join(data.matched_signals)}")
        classification_context = "**AI Classification:**\n" + "\n".join(f"- {p}" for p in parts)

    thread_context = ""
    if data.thread_summary:
        thread_context = f"**Thread Summary:** {data.thread_summary}"

    contact_context = ""
    if data.contact_name:
        parts = [f"Name: {data.contact_name}"]
        if data.contact_company:
            parts.append(f"Company: {data.contact_company}")
        if data.contact_relationship:
            parts.append(f"Relationship: {data.contact_relationship}")
        contact_context = "**Sender Contact Info:**\n" + "\n".join(f"- {p}" for p in parts)

    prompt = REPLY_PROMPT.format(
        sender=data.sender,
        subject=data.subject or "(no subject)",
        body=(data.body or "")[:3000],
        classification_context=classification_context,
        thread_context=thread_context,
        contact_context=contact_context,
    )

    try:
        draft = await _generate_with_agent(prompt)
        if not draft:
            raise HTTPException(status_code=500, detail="Reply generation returned empty")
        return {"success": True, "draft": draft}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reply generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Reply generation failed: {str(e)}")


async def _generate_with_agent(prompt: str) -> str:
    """Use Agent SDK to generate text with Haiku (no MCP tools needed)."""
    from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
    import os
    import uuid

    # Isolate from parent session
    env_keys = [
        "CLAUDE_SESSION_ID", "CLAUDE_SESSION_MODE",
        "CLAUDE_CONVERSATION_ID", "CLAUDE_SESSION_ROLE",
        "CLAUDE_PARENT_SESSION_ID",
    ]
    original_env = {k: os.environ.get(k) for k in env_keys}

    reply_id = uuid.uuid4().hex[:8]
    os.environ["CLAUDE_SESSION_ID"] = f"reply-drafter-{reply_id}"
    os.environ["CLAUDE_SESSION_MODE"] = "reply-drafter"
    for k in ["CLAUDE_CONVERSATION_ID", "CLAUDE_SESSION_ROLE", "CLAUDE_PARENT_SESSION_ID"]:
        os.environ.pop(k, None)

    try:
        options = ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            model="haiku",
            max_turns=1,
            setting_sources=["project"],
        )

        text_parts = []
        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)
            async for message in client.receive_response():
                if hasattr(message, "text") and message.text:
                    text_parts.append(str(message.text))
                if hasattr(message, "content"):
                    content = message.content
                    if isinstance(content, str) and content:
                        text_parts.append(content)
                    elif isinstance(content, list):
                        for block in content:
                            if hasattr(block, "text") and block.text:
                                text_parts.append(str(block.text))
                            elif isinstance(block, dict) and block.get("type") == "text":
                                text_parts.append(block.get("text", ""))
                if isinstance(message, dict):
                    if message.get("type") == "text":
                        text_parts.append(message.get("text", ""))
                    if "content" in message and isinstance(message["content"], str):
                        text_parts.append(message["content"])

        return "\n".join(p for p in text_parts if p)

    finally:
        for k, v in original_env.items():
            if v is not None:
                os.environ[k] = v
            elif k in os.environ:
                del os.environ[k]


# =============================================================================
# SMART AUTO-ARCHIVE
# =============================================================================


@router.get("/archivable")
async def get_archivable_emails():
    """Get emails classified as spam/low with automated/marketing signals."""

    def _get():
        with get_db() as conn:
            rows = conn.execute(
                """
                SELECT ec.email_message_id, ec.account_id, ec.category,
                       ec.summary, ec.sender, ec.subject, ec.matched_signals,
                       ec.classified_at
                FROM email_classifications ec
                WHERE ec.category IN ('spam', 'low')
                  AND ec.action_taken IS NULL
                  AND (
                      ec.matched_signals LIKE '%automated%'
                      OR ec.matched_signals LIKE '%marketing%'
                  )
                ORDER BY ec.classified_at DESC
                """
            ).fetchall()

            return [
                {
                    "message_id": row["email_message_id"],
                    "account": row["account_id"],
                    "category": row["category"],
                    "summary": row["summary"],
                    "sender": row["sender"],
                    "subject": row["subject"],
                    "matched_signals": json.loads(row["matched_signals"]) if row["matched_signals"] else [],
                    "classified_at": row["classified_at"],
                }
                for row in rows
            ]

    archivable = await _run_blocking(_get)
    return {"archivable": archivable, "count": len(archivable)}


class BatchArchiveRequest(BaseModel):
    messages: list  # [{message_id, account}]


@router.post("/batch-archive")
async def batch_archive(data: BatchArchiveRequest):
    """Archive multiple messages and update their classification action_taken."""
    if not data.messages:
        raise HTTPException(status_code=400, detail="No messages to archive")

    def _archive():
        svc = get_email_service()
        archived = 0
        failed = 0

        for item in data.messages:
            msg_id = item.get("message_id")
            account = item.get("account")
            if not msg_id or not account:
                failed += 1
                continue

            try:
                success = svc.archive(msg_id, "INBOX", account)
                if success:
                    # Update action_taken in classification
                    with get_db() as conn:
                        conn.execute(
                            """UPDATE email_classifications
                               SET action_taken = 'archived'
                               WHERE email_message_id = ? AND account_id = ?
                                 AND action_taken IS NULL""",
                            (msg_id, account),
                        )
                        conn.commit()
                    archived += 1
                else:
                    failed += 1
            except Exception as e:
                logger.warning(f"Failed to archive {msg_id}: {e}")
                failed += 1

        return {"archived": archived, "failed": failed}

    result = await _run_blocking(_archive)
    return {"success": True, **result}


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
