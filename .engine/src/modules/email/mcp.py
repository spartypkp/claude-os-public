"""Email MCP tool - Multi-provider email with send safeguards."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from core.mcp_helpers import get_db, get_services, notify_backend_event
from modules.accounts.access import get_access_service
from .service import EmailService

mcp = FastMCP("life-email")


@mcp.tool()
def email(
    operation: str,
    to: Optional[str] = None,
    subject: Optional[str] = None,
    content: Optional[str] = None,
    body_file: Optional[str] = None,
    cc: Optional[str] = None,
    limit: int = 50,
    # Inbox operations
    query: Optional[str] = None,
    message_id: Optional[str] = None,
    account: Optional[str] = None,
    # Attachments
    attachments: Optional[str] = None,  # Comma-separated file paths
    # Classification (for classify operation — pipeline internal)
    category: Optional[str] = None,
    reasoning: Optional[str] = None,
    summary: Optional[str] = None,
    display_name: Optional[str] = None,
    suggested_actions: Optional[str] = None,
) -> Dict[str, Any]:
    """Email operations - Multi-provider access with account-based routing.

    Args:
        operation: Operation - 'send', 'draft', 'accounts', 'search', 'read',
                   'classify', 'triage', 'handle', 'classification'

        # Outbound operations (send, draft)
        to: Recipient email address (required for send/draft)
        subject: Email subject (required for send/draft)
        content: Email content HTML (inline, for short emails)
        body_file: Path to email content file (preferred for emails).
                   If .md file, converts markdown to HTML automatically.
        cc: CC recipients (comma-separated)
        account: Account to send/draft from. Uses default sending account if not specified.
        attachments: Comma-separated file paths to attach (for draft operation)

        # Inbox operations (search, read)
        query: Search query - supports Gmail operators (from:, has:attachment, etc.)
        message_id: Message ID (required for read, handle, classification)
        account: Account identifier (email, name, or ID). Uses default if not specified.
        limit: Max results (default 50)

        # Classification (for classify operation — used by email pipeline agent)
        category: Classification category - 'action_needed', 'heads_up', 'fyi', 'noise'
        reasoning: 1-2 sentences explaining why this category was chosen
        summary: One-line summary of the email content
        display_name: Human-friendly sender identity (e.g. "Modal (via Ashby)", "GitHub", "Kai Zhang")
        suggested_actions: Newline-separated action suggestions for Chief (for classify operation)

    Returns:
        Object with success status and operation-specific data

    Examples:
        # Account management
        email("accounts")  # List all configured accounts

        # Draft (preferred - opens for human review)
        email("draft", to="will@example.com", subject="Meeting notes",
              body_file="/path/to/email.md", account="will@gmail.com")
        email("draft", to="will@example.com", subject="Report",
              content="See attachment", account="will@gmail.com",
              attachments="/path/to/report.pdf,/path/to/data.xlsx")

        # Send (only for accounts with can_send=true)
        email("send", to="will@example.com", subject="Quick note",
              body_file="/path/to/email.md", account="claude@gmail.com")

        # Inbox operations (any account - routed by provider)
        email("search", query="from:sean subject:interview", account="will@gmail.com")
        email("read", message_id="abc123", account="will@gmail.com")

        # Classification (called by the email pipeline agent)
        email("classify", message_id="abc123", account="will@gmail.com",
              category="action_needed", reasoning="Known recruiter at S-tier company",
              summary="Interview scheduling follow-up from Kai Zhang",
              display_name="Kai Zhang", suggested_actions="Reply with availability")

        # Triage operations (for Chief and Dashboard)
        email("triage", limit=20)  # Get unhandled classifications
        email("handle", message_id="abc123", account="will@gmail.com")  # Mark as handled
        email("classification", message_id="abc123", account="will@gmail.com")  # Full details

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
            return _email_send(email_service, to, subject, content, body_file, cc, None, account)
        elif operation == "accounts":
            return _email_accounts(email_service)
        elif operation == "search":
            return _email_search(email_service, query, account, None, limit)
        elif operation == "read":
            return _email_read(email_service, message_id, account)
        elif operation == "draft":
            return _email_draft(email_service, to, subject, content, body_file, cc, None, account, attachments)
        elif operation == "classify":
            return _email_classify(
                message_id=message_id,
                account=account,
                category=category,
                reasoning=reasoning,
                summary=summary,
                display_name=display_name,
                suggested_actions=suggested_actions,
            )
        elif operation == "triage":
            return _email_triage(category=category, limit=limit)
        elif operation == "handle":
            return _email_handle(message_id=message_id, account=account)
        elif operation == "classification":
            return _email_get_classification(message_id=message_id, account=account)
        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Valid: send, draft, accounts, search, read, classify, triage, handle, classification"
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


def _format_available_accounts(email_service: EmailService) -> str:
    """Format available accounts for error messages."""
    try:
        accounts = email_service.get_accounts_with_capabilities()
        if accounts:
            names = [a.get('email') or a.get('name') for a in accounts if a.get('email') or a.get('name')]
            if names:
                return f" Available accounts: {', '.join(names)}"
    except Exception:
        pass
    return ""


def _email_send(email_service: EmailService, to: Optional[str], subject: Optional[str],
                content: Optional[str], body_file: Optional[str], cc: Optional[str],
                bcc: Optional[str], account: Optional[str]) -> Dict[str, Any]:
    """Send email with safeguards."""
    # Access tier check — send requires autonomous
    try:
        access = get_access_service()
        if not access.can_act_autonomously('email'):
            tier = access.get_tier('email')
            return {
                "success": False,
                "error": f"Email access is set to '{tier.title()}' mode — use draft instead of send. "
                         "Change to 'Autonomous' in Settings to enable direct sending."
            }
    except RuntimeError:
        pass  # AccessService not initialized — skip check

    if not to or not subject:
        return {"success": False, "error": "to and subject are required for send operation"}

    # Resolve account
    if account:
        send_account = email_service.resolve_account(account)
        if not send_account:
            available = _format_available_accounts(email_service)
            return {"success": False, "error": f"Account not found: '{account}'.{available}"}
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
        notify_backend_event("email.sent", {"to": to_display, "subject": subject})

    return result



def _email_accounts(email_service: EmailService) -> Dict[str, Any]:
    """List configured email accounts with capabilities."""
    accounts = email_service.get_accounts_with_capabilities()
    return {"success": True, "count": len(accounts), "accounts": accounts}



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

    # Fire-and-forget contact signal
    try:
        from modules.contacts.signals import process_email_signals
        from modules.contacts.standalone import StandaloneContactsRepository
        repo = StandaloneContactsRepository(email_service._storage)
        process_email_signals(messages_data, repo)
    except Exception:
        pass  # Never block email operations

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

    # Fire-and-forget contact signal
    try:
        from modules.contacts.signals import process_email_signals
        from modules.contacts.standalone import StandaloneContactsRepository
        repo = StandaloneContactsRepository(email_service._storage)
        process_email_signals([message_data], repo)
    except Exception:
        pass  # Never block email operations

    return {"success": True, "message": message_data}



def _email_draft(email_service: EmailService, to: Optional[str], subject: Optional[str],
                 content: Optional[str], body_file: Optional[str], cc: Optional[str],
                 bcc: Optional[str], account: Optional[str], attachments: Optional[str]) -> Dict[str, Any]:
    """Create email draft for human review."""
    if not to or not subject:
        return {"success": False, "error": "to and subject are required for draft operation"}

    # Resolve account — try AccessService default, then primary, then error
    if not account:
        try:
            access = get_access_service()
            account = access.get_default('email', 'draft_account')
        except RuntimeError:
            pass  # AccessService not initialized

    if not account:
        # Fall back to primary account
        primary = email_service.get_default_account()
        if primary:
            account = primary.get('primary_email') or primary.get('email') or primary.get('id')
        else:
            return {"success": False, "error": "No email accounts configured. Run /setup-accounts"}

    draft_account = email_service.resolve_account(account)
    if not draft_account:
        available = _format_available_accounts(email_service)
        return {"success": False, "error": f"Account not found: '{account}'.{available}"}

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
        notify_backend_event("email.drafted", {"to": to_display, "subject": subject})

    return result


def _email_classify(
    message_id: Optional[str],
    account: Optional[str],
    category: Optional[str],
    reasoning: Optional[str],
    summary: Optional[str],
    display_name: Optional[str] = None,
    suggested_actions: Optional[str] = None,
) -> Dict[str, Any]:
    """Store email classification from the triage agent.

    Three fields matter: category, summary, briefing.
    The 'reasoning' param is used as the briefing field (Chief-facing intel).
    display_name is the human-friendly sender identity (e.g. "Modal (via Ashby)").
    suggested_actions: newline-separated action suggestions for Chief.
    Noise is auto-marked as handled.
    """
    import uuid
    from datetime import datetime, timezone

    if not message_id or not account or not category:
        return {"success": False, "error": "message_id, account, and category are required for classify"}

    valid_categories = {"action_needed", "heads_up", "fyi", "noise"}
    if category not in valid_categories:
        return {"success": False, "error": f"Invalid category '{category}'. Must be: {', '.join(sorted(valid_categories))}"}

    classification_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Noise auto-handled
    handled = 1 if category == "noise" else 0

    try:
        with get_db() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO email_classifications
                   (id, email_message_id, account_id, category, summary, briefing,
                    display_name, suggested_actions, handled, classified_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    classification_id,
                    message_id,
                    account,
                    category,
                    summary,
                    reasoning,  # 'reasoning' param maps to briefing column
                    display_name,
                    suggested_actions,
                    handled,
                    now,
                ),
            )
            conn.execute(
                "UPDATE email_metadata SET classified = 1, last_updated_at = ? WHERE email_message_id = ? AND account_id = ?",
                (now, message_id, account),
            )
            conn.commit()

        return {
            "success": True,
            "classification_id": classification_id,
            "category": category,
            "handled": bool(handled),
            "message": f"Email classified as {category}",
        }

    except Exception as e:
        return {"success": False, "error": f"Failed to store classification: {str(e)}"}


def _email_triage(
    category: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """Get unhandled classifications — Chief's triage queue.

    Returns classifications where handled=0, ordered by priority:
    action_needed first, then heads_up, then fyi.
    """
    try:
        with get_db() as conn:
            where = "WHERE ec.handled = 0"
            params: list = []

            if category:
                where += " AND ec.category = ?"
                params.append(category)

            rows = conn.execute(
                f"""SELECT ec.id, ec.email_message_id, ec.account_id, ec.category,
                           ec.summary, ec.briefing, ec.display_name, ec.sender,
                           ec.subject, ec.suggested_actions, ec.received_at,
                           ec.classified_at
                    FROM email_classifications ec
                    {where}
                    ORDER BY
                        CASE ec.category
                            WHEN 'action_needed' THEN 1
                            WHEN 'heads_up' THEN 2
                            WHEN 'fyi' THEN 3
                            ELSE 4
                        END,
                        ec.classified_at DESC
                    LIMIT ?""",
                params + [limit],
            ).fetchall()

            items = []
            for row in rows:
                item = {
                    "id": row["id"],
                    "message_id": row["email_message_id"],
                    "account": row["account_id"],
                    "category": row["category"],
                    "summary": row["summary"],
                    "briefing": row["briefing"],
                    "display_name": row["display_name"],
                    "sender": row["sender"],
                    "subject": row["subject"],
                    "received_at": row["received_at"],
                    "classified_at": row["classified_at"],
                }
                if row["suggested_actions"]:
                    item["suggested_actions"] = row["suggested_actions"].split("\n")
                else:
                    item["suggested_actions"] = []
                items.append(item)

        # Count by category for summary
        counts = {}
        for item in items:
            cat = item["category"]
            counts[cat] = counts.get(cat, 0) + 1

        return {
            "success": True,
            "count": len(items),
            "counts_by_category": counts,
            "items": items,
        }

    except Exception as e:
        return {"success": False, "error": f"Failed to get triage queue: {str(e)}"}


def _email_handle(
    message_id: Optional[str] = None,
    account: Optional[str] = None,
) -> Dict[str, Any]:
    """Mark a classification as handled — removes from triage queue."""
    from datetime import datetime, timezone

    if not message_id:
        return {"success": False, "error": "message_id is required for handle operation"}

    try:
        with get_db() as conn:
            now = datetime.now(timezone.utc).isoformat()

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

            if result.rowcount == 0:
                return {"success": False, "error": f"Classification not found for message {message_id}"}

        return {
            "success": True,
            "message": f"Marked {message_id} as handled",
        }

    except Exception as e:
        return {"success": False, "error": f"Failed to mark as handled: {str(e)}"}


def _email_get_classification(
    message_id: Optional[str] = None,
    account: Optional[str] = None,
) -> Dict[str, Any]:
    """Get full classification details for a single email."""
    if not message_id:
        return {"success": False, "error": "message_id is required for classification operation"}

    try:
        with get_db() as conn:
            if account:
                row = conn.execute(
                    """SELECT * FROM email_classifications
                       WHERE email_message_id = ? AND account_id = ?
                       ORDER BY classified_at DESC LIMIT 1""",
                    (message_id, account),
                ).fetchone()
            else:
                row = conn.execute(
                    """SELECT * FROM email_classifications
                       WHERE email_message_id = ?
                       ORDER BY classified_at DESC LIMIT 1""",
                    (message_id,),
                ).fetchone()

            if not row:
                return {"success": False, "error": f"No classification found for message {message_id}"}

            classification = {
                "id": row["id"],
                "message_id": row["email_message_id"],
                "account": row["account_id"],
                "category": row["category"],
                "summary": row["summary"],
                "briefing": row["briefing"],
                "display_name": row["display_name"],
                "sender": row["sender"],
                "subject": row["subject"],
                "preview": row["preview"],
                "handled": bool(row["handled"]),
                "received_at": row["received_at"],
                "classified_at": row["classified_at"],
                "processing_time_ms": row["processing_time_ms"],
            }
            if row["suggested_actions"]:
                classification["suggested_actions"] = row["suggested_actions"].split("\n")
            else:
                classification["suggested_actions"] = []

        return {"success": True, "classification": classification}

    except Exception as e:
        return {"success": False, "error": f"Failed to get classification: {str(e)}"}


