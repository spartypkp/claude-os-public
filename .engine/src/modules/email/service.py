"""Email service - direct-read Apple Mail + send safeguards.

Reads:
- Apple Mail SQLite (read-only)

Writes:
- Drafts via AppleScript (Mail.app)
- Sends via Gmail API (Claude account only, with safeguards)
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any, Dict, List, Optional

from .models import DraftMessage, EmailMessage, Mailbox
from .providers.apple import AppleMailAdapter
from .providers.gmail import GmailAdapter
from .send_service import EmailSendService

logger = logging.getLogger(__name__)

IS_MACOS = sys.platform == "darwin"


class EmailService:
    """Email service with direct-read Apple Mail + send safeguards."""

    def __init__(self, storage=None):
        self._storage = storage
        self._accounts_cache: Dict[str, Dict[str, Any]] = {}
        self._email_to_id: Dict[str, str] = {}
        self._name_to_id: Dict[str, str] = {}

        self._apple_adapter = AppleMailAdapter() if IS_MACOS else None
        self._gmail_adapter = GmailAdapter()

        if storage:
            self._load_accounts()

        self._send_service = EmailSendService(storage, self) if storage else None

    # === Account loading ===

    def _load_accounts(self) -> None:
        try:
            # Read from unified accounts table with column mapping for compatibility
            rows = self._storage.fetchall("""
                SELECT
                    id,
                    email as primary_email,
                    display_name,
                    account_type as provider,
                    can_read_email as can_read,
                    can_send_email as can_send,
                    can_draft_email as can_draft,
                    is_claude_account,
                    is_enabled as enabled,
                    config_json,
                    apple_account_guid
                FROM accounts
                WHERE is_enabled = 1
            """)

            self._accounts_cache.clear()
            self._email_to_id.clear()
            self._name_to_id.clear()

            for row_obj in rows:
                account = dict(row_obj)
                account_id = account["id"]

                raw_config = account.get("config_json") or account.get("config")
                if raw_config:
                    account["config_json"] = json.loads(raw_config)
                else:
                    account["config_json"] = {}

                self._accounts_cache[account_id] = account

                if account.get("primary_email"):
                    self._email_to_id[account["primary_email"].lower()] = account_id

                if account.get("display_name"):
                    self._name_to_id[account["display_name"].lower()] = account_id

            logger.info("Loaded %s email accounts", len(self._accounts_cache))

        except Exception as e:
            logger.warning("Failed to load email accounts: %s", e)

    def resolve_account(self, identifier: Optional[str]) -> Optional[Dict[str, Any]]:
        if not identifier:
            return None

        if identifier in self._accounts_cache:
            return self._accounts_cache[identifier]

        identifier_lower = identifier.lower()
        if identifier_lower in self._email_to_id:
            return self._accounts_cache.get(self._email_to_id[identifier_lower])

        if identifier_lower in self._name_to_id:
            return self._accounts_cache.get(self._name_to_id[identifier_lower])

        return None

    def get_default_account(self) -> Optional[Dict[str, Any]]:
        for account in self._accounts_cache.values():
            if account.get("is_claude_account"):
                return account
        if self._accounts_cache:
            return next(iter(self._accounts_cache.values()))
        return None

    def get_claude_account(self) -> Optional[Dict[str, Any]]:
        for account in self._accounts_cache.values():
            if account.get("is_claude_account"):
                return account
        return None

    def get_default_sending_account(self) -> Optional[Dict[str, Any]]:
        """Get the default account for sending emails.

        Returns Claude's account since it's the only one configured for sending.
        """
        return self.get_claude_account()

    def get_accounts_with_capabilities(self) -> List[Dict[str, Any]]:
        accounts = []
        for account in self._accounts_cache.values():
            accounts.append({
                "id": account["id"],
                "name": account.get("display_name") or account.get("name", "Unknown"),
                "email": account.get("primary_email") or account.get("email"),
                "provider": account.get("provider"),
                "can_read": bool(account.get("can_read", True)),
                "can_send": bool(account.get("can_send", False)),
                "can_draft": bool(account.get("can_draft", True)),
                "is_claude_account": bool(account.get("is_claude_account", False)),
            })
        return accounts

    # === Adapter access ===

    def get_adapter(self, provider: str):
        if provider == "gmail":
            account = self.get_claude_account()
            if not account:
                return self._gmail_adapter
            config = account.get("config_json") or {}
            # Extract provider_config if nested
            if "provider_config" in config:
                config = config["provider_config"]
            return GmailAdapter(config)
        if provider == "apple_mail":
            return self._apple_adapter
        return None

    # === Read helpers ===

    def _resolve_read_account(self, identifier: Optional[str]) -> Optional[Dict[str, Any]]:
        if identifier:
            account = self.resolve_account(identifier)
            if account and account.get("can_read"):
                return account
            return None

        for account in self._accounts_cache.values():
            if account.get("can_read"):
                return account

        return None

    def _apple_read_identifier(self, account: Dict[str, Any]) -> Optional[str]:
        # Check column-level apple_account_guid first
        apple_guid = account.get("apple_account_guid")
        if apple_guid:
            return apple_guid
        # Fallback to config_json for backwards compatibility
        config = account.get("config_json") or {}
        apple_guid = config.get("apple_account_guid") or config.get("mailboxes_url_prefix")
        if apple_guid:
            return apple_guid
        # No GUID means account not in Mail.app - return None to skip
        return None

    # === Read operations (Apple Mail direct-read) ===

    def get_mailboxes(self, account_identifier: str = None) -> List[Mailbox]:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return []

        account_id = self._apple_read_identifier(account)
        return self._apple_adapter.get_mailboxes(account_id)

    def get_messages(
        self,
        mailbox_name: str = "INBOX",
        account_identifier: str = None,
        limit: int = 50,
        unread_only: bool = False,
    ) -> List[EmailMessage]:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return []

        account_id = self._apple_read_identifier(account)
        messages = self._apple_adapter.get_messages(
            mailbox=mailbox_name,
            account=account_id,
            limit=limit,
            offset=0,
            unread_only=unread_only,
        )

        # Replace apple_account_guid with actual account ID for frontend
        from dataclasses import replace
        return [replace(msg, account=account.get("id")) for msg in messages]

    def get_message(
        self,
        message_id: str,
        mailbox_name: str = "INBOX",
        account_identifier: str = None,
    ) -> Optional[EmailMessage]:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return None

        account_id = self._apple_read_identifier(account)
        if hasattr(self._apple_adapter, "get_message_detail"):
            message = self._apple_adapter.get_message_detail(
                message_id=message_id,
                mailbox=mailbox_name,
                account=account_id,
            )
        else:
            message = self._apple_adapter.get_message(
                message_id=message_id,
                mailbox=mailbox_name,
                account=account_id,
            )

        # Replace apple_account_guid with actual account ID
        if message:
            from dataclasses import replace
            return replace(message, account=account.get("id"))

        return None

    def search_messages(
        self,
        query: str,
        mailbox_name: str = None,
        account_identifier: str = None,
        limit: int = 20,
    ) -> List[EmailMessage]:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return []

        account_id = self._apple_read_identifier(account)
        messages = self._apple_adapter.search(
            query=query,
            mailbox=mailbox_name,
            account=account_id,
            limit=limit,
        )

        # Replace apple_account_guid with actual account ID
        from dataclasses import replace
        return [replace(msg, account=account.get("id")) for msg in messages]

    def get_unread_count(
        self,
        mailbox_name: str = "INBOX",
        account_identifier: str = None,
    ) -> int:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return 0

        account_id = self._apple_read_identifier(account)
        return self._apple_adapter.get_unread_count(mailbox_name, account_id)

    # === Actions (Apple Mail) ===

    def create_draft(
        self,
        account_id: Optional[str],
        to: List[str],
        subject: str,
        content: str,
        cc: List[str] = None,
        bcc: List[str] = None,
        html: bool = True,
        attachments: List[str] = None,
    ) -> Dict[str, Any]:
        account = self.resolve_account(account_id) if account_id else self._resolve_read_account(None)
        if not account or not self._apple_adapter:
            return {"success": False, "message": "Apple Mail not available"}

        if not account.get("can_draft", True):
            return {"success": False, "message": "Account cannot draft"}

        account_id_value = self._apple_read_identifier(account)
        draft = DraftMessage(
            to=to,
            subject=subject,
            content=content,
            cc=cc,
            bcc=bcc,
            attachments=attachments,
        )
        success = self._apple_adapter.create_draft(draft=draft, account=account_id_value)

        if not success:
            return {"success": False, "message": "Failed to create draft"}

        return {
            "success": True,
            "message": "Compose window opened in Mail.app. Review and send when ready.",
        }

    def mark_as_read(
        self,
        message_id: str,
        mailbox_name: str = "INBOX",
        account_identifier: str = None,
    ) -> bool:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return False

        return self._apple_adapter.mark_read(
            str(message_id),
            mailbox_name,
            self._apple_read_identifier(account),
        )

    def mark_as_flagged(
        self,
        message_id: str,
        flagged: bool,
        mailbox_name: str = "INBOX",
        account_identifier: str = None,
    ) -> bool:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return False

        return self._apple_adapter.mark_flagged(
            str(message_id),
            flagged,
            mailbox_name,
            self._apple_read_identifier(account),
        )

    def move_to_trash(
        self,
        message_id: str,
        mailbox_name: str = "INBOX",
        account_identifier: str = None,
    ) -> bool:
        account = self._resolve_read_account(account_identifier)
        if not account or not self._apple_adapter:
            return False

        return self._apple_adapter.delete(
            str(message_id),
            mailbox_name,
            self._apple_read_identifier(account),
        )

    # === Send safeguards ===

    def send_message(
        self,
        account_id: str,
        to: List[str],
        subject: str,
        content: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        html: bool = True,
        delay_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        if not self._send_service or not self._storage:
            return {"success": False, "status": "error", "message": "No storage configured"}

        account = self.resolve_account(account_id)
        if not account:
            return {"success": False, "status": "error", "message": f"Account '{account_id}' not found"}

        if not account.get("can_send", False):
            return {
                "success": False,
                "status": "no_capability",
                "message": f"Account '{account.get('display_name')}' cannot send. Use create_draft() instead.",
            }

        if not account.get("is_claude_account"):
            return {
                "success": False,
                "status": "error",
                "message": "Direct send only for Claude's account",
            }

        return self._send_service.queue_email(
            to=to,
            subject=subject,
            content=content,
            cc=cc,
            bcc=bcc,
            html=html,
            delay_seconds=delay_seconds,
        )

    def cancel_email(self, email_id: str) -> Dict[str, Any]:
        if not self._send_service:
            return {"success": False, "message": "Send service unavailable"}
        return self._send_service.cancel_email(email_id)

    def get_queued_emails(self) -> List[Dict[str, Any]]:
        if not self._send_service:
            return []
        return self._send_service.get_queued_emails()

    def get_send_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        if not self._send_service:
            return []
        return self._send_service.get_send_history(limit=limit)

    # === Settings ===

    def get_settings(self) -> Dict[str, Any]:
        if not self._storage:
            return {}
        rows = self._storage.fetchall("SELECT key, value FROM email_settings")
        return {row["key"]: row["value"] for row in rows}

    def update_setting(self, key: str, value: Any) -> None:
        if not self._storage:
            return
        self._storage.execute(
            "INSERT OR REPLACE INTO email_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            (key, str(value)),
        )
