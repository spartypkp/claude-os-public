"""Email sending service with safeguards.

This service wraps email sending with safety features:
- Send delay queue (10-30 seconds configurable)
- Rate limiting (50 emails/hour default)
- Audit logging (all sends tracked in database)
- New recipient confirmation (optional)
- Cancellation (cancel queued emails before they send)

Architecture:
    EmailSendService
        ↓ queues
    email_send_log (SQLite)
        ↓ background worker processes
    GmailAdapter.send_email()

Usage:
    service = EmailSendService(storage, email_service)

    # Queue email (sent after delay)
    result = service.queue_email(
        to=["user@example.com"],
        subject="Daily Report",
        content="<h2>Report</h2>",
    )

    # Cancel queued email
    service.cancel_email(email_id)

    # Process queue (background worker)
    service.process_queue()  # Sends emails that are ready
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class EmailSendService:
    """Email sending with safeguards.

    Provides safe email sending for Claude's autonomous account:
    - Delay before sending (time to cancel if needed)
    - Rate limiting (prevent spam/abuse)
    - Audit logging (track all sends)
    - New recipient confirmation (optional)
    """

    def __init__(self, storage, email_service):
        """Initialize send service.

        Args:
            storage: SystemStorage for database access
            email_service: EmailService for actual sending
        """
        self._storage = storage
        self._email_service = email_service

        # Load settings from database
        self._load_settings()

    def _load_settings(self) -> None:
        """Load safeguard settings from unified settings table."""
        try:
            # Load safety settings from unified settings table
            settings = self._storage.fetchall(
                "SELECT key, value FROM settings WHERE key IN (?, ?, ?)",
                (
                    'send_delay_seconds',
                    'rate_limit_per_hour',
                    'require_new_recipient_confirmation',
                )
            )

            settings_dict = {row['key']: row['value'] for row in settings}

            self.send_delay_seconds = int(settings_dict.get('send_delay_seconds', '15'))
            self.rate_limit_per_hour = int(settings_dict.get('rate_limit_per_hour', '50'))
            self.require_new_recipient_confirmation = settings_dict.get(
                'require_new_recipient_confirmation', 'false'
            ).lower() == 'true'

            # Get Claude's account ID from the unified accounts table
            claude_account = self._storage.fetchone(
                "SELECT id FROM accounts WHERE is_claude_account = 1 LIMIT 1"
            )
            self.claude_account_id = claude_account['id'] if claude_account else None

        except Exception as e:
            logger.warning(f"Failed to load email settings, using defaults: {e}")
            self.send_delay_seconds = 15
            self.rate_limit_per_hour = 50
            self.require_new_recipient_confirmation = False
            self.claude_account_id = None

    def queue_email(
        self,
        to: List[str],
        subject: str,
        content: str,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        html: bool = True,
        delay_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Queue an email for sending after delay.

        Args:
            to: Recipient email addresses
            subject: Email subject
            content: Email content (HTML or plain text)
            cc: CC recipients
            bcc: BCC recipients
            html: Whether content is HTML (default True)
            delay_seconds: Override default delay

        Returns:
            Dict with:
            - success: Whether queueing succeeded
            - email_id: Queued email ID (for cancellation)
            - status: "queued" or error status
            - send_at: When email will be sent
            - requires_confirmation: Whether confirmation is needed
            - message: Human-readable message
        """
        try:
            # Check rate limit
            rate_limit_ok, remaining = self._check_rate_limit()
            if not rate_limit_ok:
                return {
                    "success": False,
                    "status": "rate_limited",
                    "message": f"Rate limit exceeded. {remaining} emails remaining this hour.",
                }

            # Check for new recipients
            new_recipients = self._check_new_recipients(to + (cc or []) + (bcc or []))
            requires_confirmation = (
                self.require_new_recipient_confirmation and len(new_recipients) > 0
            )

            # Create email ID
            email_id = str(uuid.uuid4())

            # Calculate send time
            delay = delay_seconds if delay_seconds is not None else self.send_delay_seconds
            queued_at = datetime.now(timezone.utc)
            send_at = queued_at + timedelta(seconds=delay)

            # Hash content for audit
            content_hash = hashlib.sha256(content.encode()).hexdigest()
            content_preview = content[:200]

            # Current hour bucket for rate limiting
            hour_bucket = queued_at.strftime('%Y-%m-%d-%H')

            # Insert into send log
            self._storage.execute("""
                INSERT INTO email_send_log (
                    id, account_id, to_emails, cc_emails, bcc_emails,
                    subject, content_hash, content_preview, content_full,
                    status, queued_at, send_at, hour_bucket,
                    requires_confirmation
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                email_id,
                self.claude_account_id,
                json.dumps(to),
                json.dumps(cc or []),
                json.dumps(bcc or []),
                subject,
                content_hash,
                content_preview,
                content,  # Full content stored here
                'queued',
                queued_at.isoformat(),
                send_at.isoformat(),
                hour_bucket,
                1 if requires_confirmation else 0,
            ))

            logger.info(f"Queued email {email_id} to {to}, send at {send_at}")

            return {
                "success": True,
                "email_id": email_id,
                "status": "queued",
                "send_at": send_at.isoformat(),
                "delay_seconds": delay,
                "requires_confirmation": requires_confirmation,
                "new_recipients": new_recipients,
                "message": f"Email queued. Will send in {delay} seconds." + (
                    f" NEW RECIPIENTS: {', '.join(new_recipients)} - confirmation required."
                    if requires_confirmation else ""
                ),
            }

        except Exception as e:
            logger.error(f"Failed to queue email: {e}")
            return {
                "success": False,
                "status": "error",
                "message": f"Failed to queue email: {str(e)}",
            }

    def cancel_email(self, email_id: str) -> Dict[str, Any]:
        """Cancel a queued email before it sends.

        Args:
            email_id: Email ID to cancel

        Returns:
            Dict with success status and message
        """
        try:
            # Check if email exists and is queued
            email = self._storage.fetchone(
                "SELECT id, status, send_at, to_emails, subject FROM email_send_log WHERE id = ?",
                (email_id,)
            )

            if not email:
                return {
                    "success": False,
                    "message": f"Email {email_id} not found",
                }

            if email['status'] != 'queued':
                return {
                    "success": False,
                    "message": f"Email {email_id} has status '{email['status']}' (only queued emails can be cancelled)",
                }

            # Check if already sent
            send_at = datetime.fromisoformat(email['send_at'].replace('Z', '+00:00'))
            if datetime.now(timezone.utc) >= send_at:
                return {
                    "success": False,
                    "message": f"Email {email_id} already sent (send time was {send_at})",
                }

            # Cancel it
            self._storage.execute("""
                UPDATE email_send_log
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (email_id,))

            logger.info(f"Cancelled email {email_id}")

            return {
                "success": True,
                "message": f"Cancelled email to {email['to_emails']} - '{email['subject']}'",
            }

        except Exception as e:
            logger.error(f"Failed to cancel email: {e}")
            return {
                "success": False,
                "message": f"Failed to cancel email: {str(e)}",
            }

    def confirm_email(self, email_id: str, session_id: str) -> Dict[str, Any]:
        """Confirm sending an email to new recipients.

        Args:
            email_id: Email ID to confirm
            session_id: Session that confirmed

        Returns:
            Dict with success status
        """
        try:
            self._storage.execute("""
                UPDATE email_send_log
                SET requires_confirmation = 0,
                    confirmed_at = CURRENT_TIMESTAMP,
                    confirmed_by = ?
                WHERE id = ? AND status = 'queued'
            """, (session_id, email_id))

            logger.info(f"Confirmed email {email_id} by session {session_id}")

            return {
                "success": True,
                "message": "Email confirmed and will send after delay",
            }

        except Exception as e:
            logger.error(f"Failed to confirm email: {e}")
            return {
                "success": False,
                "message": f"Failed to confirm: {str(e)}",
            }

    def process_queue(self) -> Dict[str, Any]:
        """Process send queue - send emails that are ready.

        This should be called periodically by a background worker.

        Returns:
            Dict with:
            - sent_count: Number of emails sent
            - failed_count: Number that failed
            - details: List of results per email
        """
        try:
            now = datetime.now(timezone.utc)

            # Get emails ready to send
            emails = self._storage.fetchall("""
                SELECT * FROM email_send_log
                WHERE status = 'queued'
                  AND requires_confirmation = 0
                  AND send_at <= ?
                ORDER BY send_at ASC
                LIMIT 10
            """, (now.isoformat(),))

            results = []
            sent_count = 0
            failed_count = 0

            for email in emails:
                result = self._send_email(email)
                results.append(result)

                if result['success']:
                    sent_count += 1
                else:
                    failed_count += 1

            return {
                "success": True,
                "sent_count": sent_count,
                "failed_count": failed_count,
                "processed": len(emails),
                "details": results,
            }

        except Exception as e:
            logger.error(f"Failed to process send queue: {e}")
            return {
                "success": False,
                "message": f"Failed to process queue: {str(e)}",
                "sent_count": 0,
                "failed_count": 0,
            }

    def _send_email(self, email_record: dict) -> Dict[str, Any]:
        """Actually send an email via Gmail adapter.

        Args:
            email_record: Email record from database

        Returns:
            Dict with success status
        """
        email_id = email_record['id']

        try:
            # Get Gmail adapter (assumes it's configured)
            adapter = self._email_service.get_adapter('gmail')
            if not adapter:
                raise Exception("Gmail adapter not available")

            # Parse recipients
            to = json.loads(email_record['to_emails'])
            cc = json.loads(email_record['cc_emails']) if email_record['cc_emails'] else None
            bcc = json.loads(email_record['bcc_emails']) if email_record['bcc_emails'] else None

            # Send via adapter
            send_result = adapter.send_message(
                account_id=email_record['account_id'],
                to=to,
                subject=email_record['subject'],
                content=email_record['content_full'] or email_record['content_preview'],
                cc=cc,
                bcc=bcc,
                html=True,
            )

            if send_result.get('success'):
                # Update status
                self._storage.execute("""
                    UPDATE email_send_log
                    SET status = 'sent',
                        sent_at = CURRENT_TIMESTAMP,
                        provider_message_id = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (send_result.get('message_id'), email_id))

                # Update rate limit counter
                hour_bucket = datetime.now(timezone.utc).strftime('%Y-%m-%d-%H')
                self._storage.execute("""
                    INSERT INTO email_rate_limits (hour_bucket, emails_sent)
                    VALUES (?, 1)
                    ON CONFLICT(hour_bucket) DO UPDATE SET
                        emails_sent = emails_sent + 1
                """, (hour_bucket,))

                # Track recipients
                for recipient in to + (cc or []) + (bcc or []):
                    self._track_recipient(recipient)

                logger.info(f"Sent email {email_id} to {to}")

                return {
                    "success": True,
                    "email_id": email_id,
                    "account_id": email_record.get("account_id"),
                    "to": to,
                    "subject": email_record['subject'],
                }
            else:
                # Mark as failed
                self._storage.execute("""
                    UPDATE email_send_log
                    SET status = 'failed',
                        error_message = ?,
                        retry_count = retry_count + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (send_result.get('error', 'Unknown error'), email_id))

                logger.error(f"Failed to send email {email_id}: {send_result.get('error')}")

                return {
                    "success": False,
                    "email_id": email_id,
                    "error": send_result.get('error'),
                }

        except Exception as e:
            # Mark as failed
            self._storage.execute("""
                UPDATE email_send_log
                SET status = 'failed',
                    error_message = ?,
                    retry_count = retry_count + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (str(e), email_id))

            logger.error(f"Exception sending email {email_id}: {e}")

            return {
                "success": False,
                "email_id": email_id,
                "error": str(e),
            }

    def _check_rate_limit(self) -> tuple[bool, int]:
        """Check if sending another email would exceed rate limit.

        Returns:
            (within_limit, emails_remaining_this_hour)
        """
        try:
            hour_bucket = datetime.now(timezone.utc).strftime('%Y-%m-%d-%H')

            result = self._storage.fetchone(
                "SELECT emails_sent FROM email_rate_limits WHERE hour_bucket = ?",
                (hour_bucket,)
            )

            emails_sent = result['emails_sent'] if result else 0
            remaining = self.rate_limit_per_hour - emails_sent

            return (emails_sent < self.rate_limit_per_hour, max(0, remaining))

        except Exception as e:
            logger.warning(f"Failed to check rate limit: {e}")
            return (True, self.rate_limit_per_hour)  # Fail open

    def _check_new_recipients(self, recipients: List[str]) -> List[str]:
        """Check which recipients are new (never sent to before).

        Args:
            recipients: List of email addresses

        Returns:
            List of new recipient emails
        """
        if not recipients:
            return []

        try:
            placeholders = ','.join('?' * len(recipients))
            known = self._storage.fetchall(
                f"SELECT email_address FROM email_known_recipients WHERE email_address IN ({placeholders})",
                tuple(recipients)
            )
            known_set = {row['email_address'] for row in known}

            new_recipients = [r for r in recipients if r not in known_set]
            return new_recipients

        except Exception as e:
            logger.warning(f"Failed to check new recipients: {e}")
            return []  # Assume all known on error

    def _track_recipient(self, email_address: str) -> None:
        """Track that we sent to this recipient.

        Args:
            email_address: Recipient email
        """
        try:
            self._storage.execute("""
                INSERT INTO email_known_recipients (email_address, first_sent_at, last_sent_at, total_emails_sent)
                VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                ON CONFLICT(email_address) DO UPDATE SET
                    last_sent_at = CURRENT_TIMESTAMP,
                    total_emails_sent = total_emails_sent + 1
            """, (email_address,))
        except Exception as e:
            logger.warning(f"Failed to track recipient {email_address}: {e}")

    def get_send_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent send history.

        Args:
            limit: Max number of records

        Returns:
            List of send log records
        """
        try:
            rows = self._storage.fetchall("""
                SELECT id, to_emails, subject, status, queued_at, sent_at, error_message
                FROM email_send_log
                ORDER BY queued_at DESC
                LIMIT ?
            """, (limit,))

            return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Failed to get send history: {e}")
            return []

    def get_queued_emails(self) -> List[Dict[str, Any]]:
        """Get all queued emails (pending send).

        Returns:
            List of queued email records
        """
        try:
            rows = self._storage.fetchall("""
                SELECT id, to_emails, subject, send_at, requires_confirmation
                FROM email_send_log
                WHERE status = 'queued'
                ORDER BY send_at ASC
            """)

            return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Failed to get queued emails: {e}")
            return []
