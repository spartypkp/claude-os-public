"""Email queue processor loop.

Processes queued emails after their delay period.
Runs every 5 seconds to check for emails ready to send.
Emits email.sent events for Dashboard updates.
"""

import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


async def start_email_queue(stop_event: asyncio.Event) -> None:
    """Background task to process email send queue.

    Checks every 5 seconds for emails that are ready to send.
    Only sends emails that:
    - Have status 'queued'
    - Don't require confirmation
    - Have passed their send_at time
    
    Emits email.sent event when emails are sent successfully.
    """
    from services.storage import SystemStorage
    from apps.email.service import EmailService
    from apps.email.send_service import EmailSendService
    from utils.event_bus import event_bus

    # Initialize services
    db_path = Path(__file__).parent.parent.parent / 'data' / 'db' / 'system.db'
    storage = SystemStorage(db_path)
    email_service = EmailService(storage)
    send_service = EmailSendService(storage, email_service)

    logger.info("Email queue processor started (unified EmailService)")

    while not stop_event.is_set():
        try:
            result = send_service.process_queue()

            sent_count = result.get('sent_count', 0)
            failed_count = result.get('failed_count', 0)
            details = result.get('details', [])
            
            if sent_count > 0 or failed_count > 0:
                logger.info(
                    f"Email queue: sent {sent_count}, failed {failed_count}"
                )
            
            # Emit events for sent emails so Dashboard updates
            if sent_count > 0:
                for entry in details:
                    if not entry.get("success"):
                        continue
                    await event_bus.publish(
                        "email.sent",
                        {
                            "email_id": entry.get("email_id"),
                            "account": entry.get("account_id"),
                            "to": entry.get("to"),
                            "subject": entry.get("subject"),
                        },
                    )

        except Exception as e:
            logger.error(f"Email queue processor error: {e}")

        # Check every 5 seconds
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            pass  # Normal - timeout means keep going

    logger.info("Email queue processor stopped")
