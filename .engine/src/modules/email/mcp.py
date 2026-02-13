"""Email MCP tool - Multi-provider email with send safeguards."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_db, get_services
from .service import EmailService

mcp = FastMCP("life-email")


def _notify_backend_event(event_type: str, data: dict = None):
    """Notify the backend to emit an SSE event for real-time Dashboard updates."""
    import urllib.request
    import json as json_module

    session_id = os.environ.get("CLAUDE_SESSION_ID", "unknown")
    payload = {
        "event_type": event_type,
        "session_id": session_id,
        "data": data or {}
    }

    try:
        req = urllib.request.Request(
            "http://localhost:5001/api/sessions/notify-event",
            data=json_module.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=1)
    except Exception:
        pass  # Best effort - don't fail the tool if notification fails


@mcp.tool()
def email(
    operation: str,
    to: Optional[str] = None,
    subject: Optional[str] = None,
    content: Optional[str] = None,
    body_file: Optional[str] = None,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    email_id: Optional[str] = None,
    limit: int = 50,
    # Inbox operations
    query: Optional[str] = None,
    message_id: Optional[str] = None,
    mailbox: Optional[str] = None,
    account: Optional[str] = None,
    unread_only: bool = False,
    # Attachments
    attachments: Optional[str] = None,  # Comma-separated file paths
) -> Dict[str, Any]:
    """Email operations - Multi-provider access with account-based routing.

    Args:
        operation: Operation - 'send', 'draft', 'cancel', 'status', 'history', 'queue',
                   'unread', 'search', 'read', 'mark_read', 'accounts', 'test', 'discover'

        # Outbound operations (send, draft, cancel, status, history, queue)
        to: Recipient email address (required for send/draft)
        subject: Email subject (required for send/draft)
        content: Email content HTML (inline, for short emails)
        body_file: Path to email content file (preferred for emails).
                   If .md file, converts markdown to HTML automatically.
        cc: CC recipients (comma-separated)
        bcc: BCC recipients (comma-separated)
        email_id: Email ID (required for cancel, status)
        account: Account to send/draft from. Uses default sending account if not specified.
        attachments: Comma-separated file paths to attach (for draft operation)

        # Inbox operations (unread, search, read, mark_read)
        query: Search query - supports Gmail operators (from:, has:attachment, etc.)
        message_id: Message ID (required for read, mark_read)
        mailbox: Mailbox/label name (default: INBOX)
        account: Account identifier (email, name, or ID). Uses default if not specified.
        unread_only: Filter for unread messages only (for unread operation)
        limit: Max results (default 50)

    Returns:
        Object with success status and operation-specific data

    Examples:
        # Account discovery (for onboarding)
        email("discover")  # Discover available accounts (Mail.app on Mac)

        # Account management
        email("accounts")  # List all configured accounts
        email("test", account="user@gmail.com")  # Test account connection

        # Draft (preferred - opens for human review)
        email("draft", to="user@example.com", subject="Meeting notes",
              body_file="/path/to/email.md", account="user@gmail.com")
        email("draft", to="user@example.com", subject="Report",
              content="See attachment", account="user@gmail.com",
              attachments="/path/to/report.pdf,/path/to/data.xlsx")
        # → Apple Mail: Opens compose window in Mail.app
        # → Gmail: Creates draft and opens in browser

        # Send (only for accounts with can_send=true)
        email("send", to="user@example.com", subject="Quick note",
              body_file="/path/to/email.md", account="claude@gmail.com")
        email("cancel", email_id="abc123")
        email("history", limit=10)
        email("queue")  # Show pending sends

        # Inbox operations (any account - routed by provider)
        email("unread", account="user@gmail.com", limit=20)
        email("search", query="from:alex subject:meeting", account="user@gmail.com")
        email("read", message_id="abc123", account="user@gmail.com")
        email("mark_read", message_id="abc123", account="user@gmail.com")

    Gmail Search Operators:
        from:sender, to:recipient, subject:words, has:attachment
        is:unread, is:starred, label:name, after:2024/01/01

    Account Resolution:
        The 'account' parameter accepts: email address, display name, or account ID.
        If not specified, uses default sending account.

    Sending Capabilities:
        - 'draft': Any account (opens for human review - preferred)
        - 'send': Only accounts with can_send=true (queued with safeguards)

    Safeguards (send only):
        - 15 second send delay (time to cancel)
        - 50 emails/hour rate limit
        - All sends logged to database
    """
    try:
        services = get_services()
        storage = services.storage
        email_service = EmailService(storage)

        if operation == "send":
            return _email_send(email_service, to, subject, content, body_file, cc, bcc, account)
        elif operation == "cancel":
            return _email_cancel(email_service, email_id)
        elif operation == "status":
            return _email_status(email_id)
        elif operation == "history":
            return _email_history(email_service, limit)
        elif operation == "queue":
            return _email_queue(email_service)
        elif operation == "accounts":
            return _email_accounts(email_service)
        elif operation == "unread":
            return _email_unread(email_service, account, mailbox, limit)
        elif operation == "search":
            return _email_search(email_service, query, account, mailbox, limit)
        elif operation == "read":
            return _email_read(email_service, message_id, account)
        elif operation == "mark_read":
            return _email_mark_read(email_service, message_id, account, mailbox)
        elif operation == "draft":
            return _email_draft(email_service, to, subject, content, body_file, cc, bcc, account, attachments)
        elif operation == "discover":
            return _email_discover()
        elif operation == "test":
            return _email_test(account)
        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use accounts, send, draft, cancel, status, history, queue, unread, search, read, mark_read, discover, or test"
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


def _resolve_email_content(content: Optional[str], body_file: Optional[str]) -> tuple[Optional[str], Optional[Dict]]:
    """Resolve email content from inline or file, converting markdown if needed.

    Returns (content, error_dict). If error_dict is not None, return it immediately.
    """
    email_content = content

    if body_file:
        file_path = Path(body_file)
        if not file_path.exists():
            return None, {"success": False, "error": f"body_file not found: {body_file}"}

        raw_content = file_path.read_text()

        # Convert markdown to HTML if .md file
        if file_path.suffix.lower() == '.md':
            try:
                import markdown
                email_content = markdown.markdown(
                    raw_content,
                    extensions=['tables', 'fenced_code', 'nl2br']
                )
            except ImportError:
                # Fallback: basic conversion without markdown library
                import html
                email_content = f"<pre>{html.escape(raw_content)}</pre>"
        else:
            email_content = raw_content

    return email_content, None


def _parse_recipients(to: str, cc: Optional[str], bcc: Optional[str]) -> tuple[List[str], Optional[List[str]], Optional[List[str]]]:
    """Parse comma-separated recipient strings into lists."""
    to_list = [e.strip() for e in to.split(',')]
    cc_list = [e.strip() for e in cc.split(',')] if cc else None
    bcc_list = [e.strip() for e in bcc.split(',')] if bcc else None
    return to_list, cc_list, bcc_list


def _email_send(email_service: EmailService, to: Optional[str], subject: Optional[str],
                content: Optional[str], body_file: Optional[str], cc: Optional[str],
                bcc: Optional[str], account: Optional[str]) -> Dict[str, Any]:
    """Send email with safeguards."""
    if not to or not subject:
        return {"success": False, "error": "to and subject are required for send operation"}

    # Resolve account
    if account:
        send_account = email_service.resolve_account(account)
        if not send_account:
            return {"success": False, "error": f"Account not found: {account}"}
    else:
        send_account = email_service.get_default_sending_account()
        if not send_account:
            send_account = email_service.get_claude_account()
        if not send_account:
            return {
                "success": False,
                "error": "No default sending account configured. Specify account= or set a default sending account."
            }

    # Check if account can send
    if not send_account.get('can_send'):
        account_label = send_account.get('primary_email') or send_account.get('email') or send_account.get('display_name')
        return {
            "success": False,
            "error": f"Account '{account_label}' is not configured for sending. "
                     f"Use email('draft', ...) to create a draft for review, or enable sending in account settings."
        }

    # Resolve content
    email_content, error = _resolve_email_content(content, body_file)
    if error:
        return error
    if not email_content:
        return {"success": False, "error": "Either content or body_file is required for send operation"}

    # Parse recipients
    to_list, cc_list, bcc_list = _parse_recipients(to, cc, bcc)

    # Send via EmailService (queued with safeguards)
    result = email_service.send_message(
        account_id=send_account['id'],
        to=to_list,
        subject=subject,
        content=email_content,
        cc=cc_list,
        bcc=bcc_list,
        html=True,
    )

    # Log to Timeline and emit SSE event on successful send
    if result.get("success"):
        from core.timeline import log_system_event
        to_display = to_list[0] if len(to_list) == 1 else f"{to_list[0]} +{len(to_list)-1}"
        log_system_event(f'Email sent to {to_display} re: {subject}')
        result["logged_to"] = "Timeline"

        # Emit SSE event for real-time Dashboard update
        _notify_backend_event("email.sent", {"to": to_display, "subject": subject})

    return result


def _email_cancel(email_service: EmailService, email_id: Optional[str]) -> Dict[str, Any]:
    """Cancel a queued email."""
    if not email_id:
        return {"success": False, "error": "email_id required for cancel operation"}
    result = email_service.cancel_email(email_id)

    if result.get("success"):
        # Emit SSE event for real-time Dashboard update
        _notify_backend_event("email.cancelled", {"id": email_id})

    return result


def _email_status(email_id: Optional[str]) -> Dict[str, Any]:
    """Get status of a sent/queued email."""
    if not email_id:
        return {"success": False, "error": "email_id required for status operation"}

    with get_db() as conn:
        email_record = conn.execute("""
            SELECT id, to_emails, subject, status, queued_at, send_at, sent_at, error_message
            FROM email_send_log
            WHERE id = ?
        """, (email_id,)).fetchone()

    if not email_record:
        return {"success": False, "error": f"Email {email_id} not found"}

    return {"success": True, "email": dict(email_record)}


def _email_history(email_service: EmailService, limit: int) -> Dict[str, Any]:
    """Get send history."""
    history = email_service.get_send_history(limit=limit)
    return {"success": True, "count": len(history), "emails": history}


def _email_queue(email_service: EmailService) -> Dict[str, Any]:
    """Get queued emails pending send."""
    queued = email_service.get_queued_emails()
    return {"success": True, "count": len(queued), "queued_emails": queued}


def _email_accounts(email_service: EmailService) -> Dict[str, Any]:
    """List configured email accounts with capabilities."""
    accounts = email_service.get_accounts_with_capabilities()
    return {"success": True, "count": len(accounts), "accounts": accounts}


def _email_unread(email_service: EmailService, account: Optional[str],
                  mailbox: Optional[str], limit: int) -> Dict[str, Any]:
    """Get unread messages from inbox."""
    messages = email_service.get_messages(
        mailbox_name=mailbox or "INBOX",
        account_identifier=account,
        limit=limit,
        unread_only=True
    )

    messages_data = [
        {
            "id": msg.id,
            "from": msg.sender,
            "subject": msg.subject,
            "date": msg.date_received,
            "preview": msg.snippet,
            "is_read": msg.is_read,
            "mailbox": msg.mailbox,
            "account": msg.account,
        }
        for msg in messages
    ]

    return {"success": True, "count": len(messages_data), "messages": messages_data}


def _email_search(email_service: EmailService, query: Optional[str],
                  account: Optional[str], mailbox: Optional[str], limit: int) -> Dict[str, Any]:
    """Search emails with query."""
    if not query:
        return {"success": False, "error": "query required for search operation"}

    messages = email_service.search_messages(
        query=query,
        mailbox_name=mailbox,
        account_identifier=account,
        limit=limit
    )

    messages_data = [
        {
            "id": msg.id,
            "from": msg.sender,
            "subject": msg.subject,
            "date": msg.date_received,
            "preview": msg.snippet,
            "is_read": msg.is_read,
            "mailbox": msg.mailbox,
            "account": msg.account,
        }
        for msg in messages
    ]

    return {"success": True, "count": len(messages_data), "messages": messages_data}


def _email_read(email_service: EmailService, message_id: Optional[str],
                account: Optional[str]) -> Dict[str, Any]:
    """Read full email content."""
    if not message_id:
        return {"success": False, "error": "message_id required for read operation"}

    message = email_service.get_message(
        message_id=message_id,
        account_identifier=account,
    )

    if not message:
        return {"success": False, "error": f"Message {message_id} not found"}

    message_data = {
        "id": message.id,
        "from": message.sender,
        "to": message.recipients,
        "subject": message.subject,
        "date": message.date_received,
        "body": message.content or message.html_content,
        "is_read": message.is_read,
        "mailbox": message.mailbox,
        "account": message.account,
    }

    return {"success": True, "message": message_data}


def _email_mark_read(email_service: EmailService, message_id: Optional[str],
                     account: Optional[str], mailbox: Optional[str]) -> Dict[str, Any]:
    """Mark email as read."""
    if not message_id:
        return {"success": False, "error": "message_id required for mark_read operation"}

    success = email_service.mark_as_read(
        message_id=message_id,
        mailbox_name=mailbox or "INBOX",
        account_identifier=account
    )

    if success:
        return {"success": True, "message": f"Message {message_id} marked as read"}
    else:
        return {"success": False, "error": f"Failed to mark message {message_id} as read"}


def _email_draft(email_service: EmailService, to: Optional[str], subject: Optional[str],
                 content: Optional[str], body_file: Optional[str], cc: Optional[str],
                 bcc: Optional[str], account: Optional[str], attachments: Optional[str]) -> Dict[str, Any]:
    """Create email draft for human review."""
    if not to or not subject:
        return {"success": False, "error": "to and subject are required for draft operation"}

    if not account:
        return {"success": False, "error": "account is required for draft operation (e.g., account='user@gmail.com')"}

    draft_account = email_service.resolve_account(account)
    if not draft_account:
        return {"success": False, "error": f"Account not found: {account}"}

    # Resolve content
    email_content, error = _resolve_email_content(content, body_file)
    if error:
        return error
    if not email_content:
        return {"success": False, "error": "Either content or body_file is required for draft operation"}

    # Parse recipients
    to_list, cc_list, bcc_list = _parse_recipients(to, cc, bcc)

    # Parse attachments
    attachments_list = None
    if attachments:
        attachments_list = []
        for path_str in attachments.split(','):
            path_str = path_str.strip()
            if not path_str:
                continue
            file_path = Path(path_str).expanduser().resolve()
            if not file_path.exists():
                return {"success": False, "error": f"Attachment file not found: {path_str}"}
            attachments_list.append(str(file_path))

    # Create draft via EmailService
    result = email_service.create_draft(
        account_id=draft_account['id'],
        to=to_list,
        subject=subject,
        content=email_content,
        cc=cc_list,
        bcc=bcc_list,
        html=True,
        attachments=attachments_list,
    )

    if result.get("success"):
        # Emit SSE event for real-time Dashboard update
        to_display = to_list[0] if len(to_list) == 1 else f"{to_list[0]} +{len(to_list)-1}"
        _notify_backend_event("email.drafted", {"to": to_display, "subject": subject})

    return result


def _email_discover() -> Dict[str, Any]:
    """Discover email accounts available on this machine."""
    from .providers.apple import discover_apple_mail_accounts
    result = discover_apple_mail_accounts()
    return {"success": result.get("available", False), **result}


def _email_test(account: Optional[str]) -> Dict[str, Any]:
    """Test email connection for a specific account or the default adapter."""
    from .providers.apple import AppleMailAdapter

    adapter = AppleMailAdapter()
    success, message = adapter.test_connection()

    return {
        "success": success,
        "message": message,
        "account": account,
    }
