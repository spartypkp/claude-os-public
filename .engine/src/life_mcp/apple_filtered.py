#!/usr/bin/env python3
"""
Filtered Apple MCP Server - Messages and Mail only

Exposes only:
- messages (for iMessage contacts - send/schedule BLOCKED by hook)
- mail (for email access - send BLOCKED by hook)

Calendar functionality moved to Life MCP calendar() tool which uses
apps/calendar for direct-read Apple Calendar access.

REMOVED (now in Life MCP):
- calendar (use Life MCP calendar() tool instead)

REMOVED (never used, pure attack surface):
- contacts (redundant - Life system has its own contacts DB)
- notes (never used)
- reminders (overlaps with priority system)
- maps (never used)
- web_search (redundant with Claude's built-in WebSearch)
"""

import logging
import sys

from mcp.server.fastmcp import FastMCP

# Import only the handlers we need from pyapple_mcp
from pyapple_mcp.utils.messages import MessagesHandler
from pyapple_mcp.utils.mail import MailHandler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)

logger = logging.getLogger(__name__)

# Create the FastMCP server
app = FastMCP(
    "Life System Apple Tools",
    dependencies=[
        "httpx>=0.25.0",
        "beautifulsoup4>=4.12.0",
        "pyobjc-framework-Cocoa>=10.0",
        "pyobjc-framework-EventKit>=10.0",
        "pyobjc-framework-ScriptingBridge>=10.0",
    ],
)

# Initialize only the handlers we use
messages_handler = MessagesHandler()
mail_handler = MailHandler()


# Tool: Messages (KEEP - for claude_direct contacts with permission checks)
@app.tool()
def messages(
    operation: str,
    phone_number: str = None,
    message: str = None,
    limit: int = 10,
    scheduled_time: str = None,
) -> str:
    """
    Interact with Apple Messages app - send, read, schedule messages and check unread messages.

    Args:
        operation: Operation to perform: 'send', 'read', 'schedule', or 'unread'
        phone_number: Phone number for send, read, and schedule operations
        message: Message to send (required for send and schedule operations)
        limit: Number of messages to read (optional, for read and unread operations)
        scheduled_time: ISO string of when to send message (required for schedule operation)

    Returns:
        String containing operation result or message content
    """
    try:
        if operation == "send":
            if not phone_number or not message:
                return "Phone number and message are required for send operation"

            result = messages_handler.send_message(phone_number, message)
            if result["success"]:
                return f"Message sent successfully to {phone_number}: {message}"
            else:
                return f"Failed to send message: {result['message']}"

        elif operation == "read":
            if not phone_number:
                return "Phone number is required for read operation"

            messages_list = messages_handler.read_messages(phone_number, limit)
            if messages_list:
                formatted_messages = []
                for msg in messages_list:
                    sender = msg.get('sender', 'Unknown')
                    content = msg.get('content', '')
                    time = msg.get('time', msg.get('date', ''))
                    formatted_messages.append(f"[{time}] {sender}: {content}")
                return (
                    f"Last {len(messages_list)} messages with {phone_number}:\n\n"
                    + "\n".join(formatted_messages)
                )
            else:
                return f"No messages found with {phone_number}"

        elif operation == "schedule":
            if not phone_number or not message or not scheduled_time:
                return "Phone number, message, and scheduled_time are required for schedule operation"

            result = messages_handler.schedule_message(phone_number, message, scheduled_time)
            if result["success"]:
                return f"Message scheduled successfully to {phone_number} at {scheduled_time}: {message}"
            else:
                return f"Failed to schedule message: {result['message']}"

        elif operation == "unread":
            unread_messages = messages_handler.get_unread_messages(limit)
            if unread_messages:
                formatted_messages = []
                for msg in unread_messages:
                    formatted_messages.append(f"[{msg['date']}] {msg['sender']}: {msg['content']}")
                return f"Found {len(unread_messages)} unread messages:\n\n" + "\n".join(formatted_messages)
            else:
                return "No unread messages found"
        else:
            return f"Unknown operation: {operation}. Valid operations are: send, read, schedule, unread"

    except Exception as e:
        logger.error(f"Error in messages tool: {e}")
        return f"Error accessing messages: {str(e)}"


# Tool: Mail (KEEP - for email access when explicitly needed)
@app.tool()
def mail(
    operation: str,
    account: str = None,
    mailbox: str = None,
    limit: int = 10,
    search_term: str = None,
    to: str = None,
    subject: str = None,
    body: str = None,
    cc: str = None,
    bcc: str = None,
    full_content: bool = False,
    search_range: int = None,
    mark_read: bool = False,
) -> str:
    """
    Interact with Apple Mail app - read unread emails, search emails, and send emails.
    Optimized for performance by accessing local Mail database directly.
    Searches all accounts by default when no account is specified.

    Args:
        operation: Operation to perform: 'unread', 'search', 'send', 'mailboxes', or 'accounts'
        account: Email account to use (optional, searches all accounts if not specified)
        mailbox: Mailbox to use (optional)
        limit: Number of emails to retrieve (optional, for unread and search operations)
        search_term: Text to search for in emails (required for search operation)
        to: Recipient email address (required for send operation)
        subject: Email subject (required for send operation)
        body: Email body content (required for send operation)
        cc: CC email address (optional for send operation)
        bcc: BCC email address (optional for send operation)
        full_content: If True, return full email content without truncation (default: False)
        search_range: Number of recent messages to search through per inbox (optional, ignored for database method)
        mark_read: If True, mark retrieved unread emails as read (default: False, only for unread operation)

    Returns:
        String containing email information or operation result
    """
    try:
        if operation == "unread":
            emails = mail_handler.get_unread_emails(account, mailbox, limit, full_content, search_range, mark_read)
            if emails:
                formatted_emails = []
                for email in emails:
                    email_info = f"From: {email['sender']}\nSubject: {email['subject']}\nDate: {email['date']}"
                    if email.get('mailbox'):
                        email_info += f"\nMailbox: {email['mailbox']}"
                    if full_content or len(email['content']) <= 500:
                        email_info += f"\nContent: {email['content']}"
                    else:
                        email_info += f"\nContent: {email['content'][:500]}..."
                    formatted_emails.append(email_info)

                result = f"Found {len(emails)} unread emails"
                if mark_read:
                    result += " (marked as read)"
                result += ":\n\n" + "\n\n".join(formatted_emails)
                return result
            else:
                return "No unread emails found"

        elif operation == "search":
            if not search_term:
                return "Search term is required for search operation"

            emails = mail_handler.search_emails(search_term, account, mailbox, limit, full_content, search_range)
            if emails:
                formatted_emails = []
                for email in emails:
                    email_info = f"From: {email['sender']}\nSubject: {email['subject']}\nDate: {email['date']}"
                    if email.get('account'):
                        email_info += f"\nAccount: {email['account']}"
                    if email.get('mailbox'):
                        email_info += f"\nMailbox: {email['mailbox']}"
                    if full_content or len(email['content']) <= 500:
                        email_info += f"\nContent: {email['content']}"
                    else:
                        email_info += f"\nContent: {email['content'][:500]}..."
                    formatted_emails.append(email_info)

                result = f"Found {len(emails)} emails matching '{search_term}' (case insensitive)"
                if limit == -1:
                    result += " (all)"
                else:
                    result += f" (limit: {limit})"
                result += ":\n\n" + "\n\n".join(formatted_emails)
                return result
            else:
                return f"No emails found matching '{search_term}'"

        elif operation == "send":
            if not to or not subject or not body:
                return "To, subject, and body are required for send operation"

            result = mail_handler.send_email(to, subject, body, cc, bcc)
            if result["success"]:
                return f"Email sent successfully to {to} with subject '{subject}'"
            else:
                return f"Failed to send email: {result['message']}"

        elif operation == "mailboxes":
            mailboxes = mail_handler.list_mailboxes(account)
            if mailboxes:
                return f"Available mailboxes: {', '.join(mailboxes)}"
            else:
                return "No mailboxes found"

        elif operation == "accounts":
            accounts = mail_handler.list_accounts()
            if accounts:
                return f"Available accounts: {', '.join(accounts)}"
            else:
                return "No email accounts found"

        else:
            return f"Unknown operation: {operation}. Valid operations are: unread, search, send, mailboxes, accounts"

    except Exception as e:
        logger.error(f"Error in mail tool: {e}")
        return f"Error accessing mail: {str(e)}"


def main() -> None:
    """Main entry point for the server."""
    logger.info("Starting Life System Apple Tools (messages + mail only)...")
    logger.info("Enabled tools: messages, mail")
    logger.info("Calendar: Use Life MCP calendar() tool instead")

    if sys.platform != "darwin":
        logger.error("This MCP server requires macOS to function properly")
        sys.exit(1)

    try:
        app.run()
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
