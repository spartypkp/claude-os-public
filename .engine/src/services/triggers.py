"""Proactive Telegram Triggers - Inject prompts into Chief at key moments.

Triggers are lightweight message injections that tell Chief to act. They don't
force reset Chief (unlike duties). Instead, they inject tagged system messages
that Chief responds to naturally.

Three trigger types:
1. Scheduled triggers - Fire at specific times (morning brief, evening checkin)
2. Calendar triggers - Fire N minutes before events (pre-event reminders)

Each trigger injects a message into Chief's tmux pane. Chief then invokes
appropriate skills and sends results via Telegram autonomously.
"""

import asyncio
import logging
from datetime import datetime, timedelta, time
from pathlib import Path
from typing import List, Optional
from zoneinfo import ZoneInfo

from services.storage import SystemStorage
from utils.tmux import inject_message, window_exists
from integrations.apple import get_events

logger = logging.getLogger("triggers")

# User is in San Francisco - all trigger times are Pacific
PACIFIC = ZoneInfo("America/Los_Angeles")


class TriggerService:
    """Service for proactive triggers that inject prompts into Chief."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.storage = SystemStorage(db_path)

        # Track which events we've already triggered for (avoid duplicates)
        self.triggered_events = set()  # Set of event IDs we've already triggered

    def get_enabled_triggers(self) -> List[dict]:
        """Get all enabled triggers from database."""
        rows = self.storage.fetchall("""
            SELECT id, type, time_spec, enabled, last_run
            FROM triggers
            WHERE enabled = 1
            ORDER BY time_spec
        """, ())

        return [
            {
                "id": row["id"],
                "type": row["type"],
                "time_spec": row["time_spec"],
                "enabled": row["enabled"],
                "last_run": row["last_run"],
            }
            for row in rows
        ]

    def should_fire_scheduled_trigger(self, trigger: dict) -> bool:
        """Check if a scheduled trigger should fire now.

        Scheduled triggers fire once per day at their configured time.
        Uses self-healing logic: if last_run < today's scheduled time, fire.
        """
        now_pacific = datetime.now(PACIFIC)

        try:
            # Parse time_spec (HH:MM format)
            hour, minute = map(int, trigger["time_spec"].split(':'))
            today_scheduled = now_pacific.replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )
        except (ValueError, AttributeError):
            logger.error(f"Invalid time_spec for trigger {trigger['id']}: {trigger['time_spec']}")
            return False

        # Not yet reached scheduled time today
        if now_pacific < today_scheduled:
            return False

        # Never ran before
        if not trigger["last_run"]:
            return True

        # Check if last run was before today's scheduled time
        try:
            last_run_str = trigger["last_run"]
            if last_run_str.endswith('Z'):
                last_run_str = last_run_str[:-1] + '+00:00'
            last_run = datetime.fromisoformat(last_run_str).astimezone(PACIFIC)

            # Fire if last run was before today's schedule
            return last_run < today_scheduled

        except (ValueError, TypeError):
            # Corrupt last_run - fire to be safe
            return True

    def get_upcoming_events(self, minutes_ahead: int = 15) -> List[dict]:
        """Get calendar events starting in the next N minutes.

        Args:
            minutes_ahead: How many minutes ahead to look

        Returns:
            List of event dicts from apple integration
        """
        now = datetime.now()
        window_start = now + timedelta(minutes=minutes_ahead - 1)
        window_end = now + timedelta(minutes=minutes_ahead + 1)

        # Use apple integration to fetch events
        events = get_events(
            from_date=window_start,
            to_date=window_end,
            use_preferred=True  # Only preferred calendars
        )

        return events

    def update_last_run(self, trigger_id: int):
        """Update last_run timestamp for a trigger."""
        now_iso = datetime.now(PACIFIC).isoformat()
        self.storage.execute("""
            UPDATE triggers
            SET last_run = ?
            WHERE id = ?
        """, (now_iso, trigger_id))

    def inject_trigger_message(self, message: str, source: str = "TRIGGER") -> bool:
        """Inject a trigger message into Chief's tmux pane.

        Args:
            message: The trigger message to inject
            source: Tag for the message (appears as [TRIGGER HH:MM])

        Returns:
            True if successful, False otherwise
        """
        # Check if chief window exists
        if not window_exists("chief"):
            logger.warning("Chief window not found - cannot inject trigger")
            return False

        # Inject message into Chief's pane
        success = inject_message(
            target="life:chief",
            message=message,
            source=source
        )

        if success:
            logger.info(f"Trigger message injected: {message[:50]}...")
        else:
            logger.error(f"Failed to inject trigger message")

        return success

    async def check_and_fire_triggers(self):
        """Check all triggers and fire any that are due."""
        try:
            triggers = self.get_enabled_triggers()

            for trigger in triggers:
                if trigger["type"] == "scheduled":
                    await self._check_scheduled_trigger(trigger)
                elif trigger["type"] == "calendar":
                    await self._check_calendar_trigger(trigger)

        except Exception as e:
            logger.error(f"Error checking triggers: {e}", exc_info=True)

    async def _check_scheduled_trigger(self, trigger: dict):
        """Check and fire a scheduled trigger if due."""
        if not self.should_fire_scheduled_trigger(trigger):
            return

        # Determine which trigger this is based on time_spec
        time_spec = trigger["time_spec"]

        # Map time to trigger type
        if time_spec == "08:00":
            message = (
                "[MORNING-BRIEF] Time for morning brief. "
                "Use /morning-brief skill, then send result to user via Telegram."
            )
            source = "MORNING-BRIEF"
        elif time_spec == "21:00":
            message = (
                "[EVENING-CHECKIN] Time for evening check-in. "
                "Use /evening-checkin skill, then send result to user via Telegram."
            )
            source = "EVENING-CHECKIN"
        else:
            logger.warning(f"Unknown scheduled trigger time: {time_spec}")
            return

        # Inject the message
        success = self.inject_trigger_message(message, source=source)

        if success:
            # Update last_run
            self.update_last_run(trigger["id"])
            logger.info(f"Scheduled trigger fired: {source} at {time_spec}")

    async def _check_calendar_trigger(self, trigger: dict):
        """Check and fire calendar-based triggers (pre-event reminders).

        Fires N minutes before events. The time_spec stores the minutes
        (e.g., "15" for 15 minutes before).
        """
        try:
            minutes_ahead = int(trigger["time_spec"])
        except (ValueError, TypeError):
            logger.error(f"Invalid calendar trigger time_spec: {trigger['time_spec']}")
            return

        # Get upcoming events in the trigger window
        events = self.get_upcoming_events(minutes_ahead=minutes_ahead)

        for event in events:
            event_id = event.get("id")
            if not event_id:
                continue

            # Skip if we've already triggered for this event
            if event_id in self.triggered_events:
                continue

            # Build pre-event message
            event_title = event.get("summary", "Unknown Event")
            message = (
                f"[PRE-EVENT] Event \"{event_title}\" in {minutes_ahead} min. "
                f"Decide if user needs context. If important (interviews, mocks, "
                f"meetings with contacts), send brief via Telegram. If casual, skip."
            )

            success = self.inject_trigger_message(message, source="PRE-EVENT")

            if success:
                # Mark this event as triggered
                self.triggered_events.add(event_id)
                logger.info(f"Pre-event trigger fired for: {event_title}")

                # Update last_run for the trigger
                self.update_last_run(trigger["id"])

    async def cleanup_old_triggered_events(self):
        """Clean up triggered_events set to prevent memory growth.

        Remove event IDs for events that ended more than 1 hour ago.
        """
        # This is a simple approach: clear the whole set periodically
        # A more sophisticated approach would track event end times
        # For now, just clear every hour
        self.triggered_events.clear()
        logger.debug("Cleared triggered_events set")

    async def run_forever(self, stop_event: asyncio.Event):
        """Main trigger loop - runs until stop_event is set."""
        logger.info("Trigger service starting...")

        cleanup_counter = 0

        try:
            while not stop_event.is_set():
                # Check triggers
                await self.check_and_fire_triggers()

                # Periodic cleanup of triggered events (every ~120 checks = 1 hour)
                cleanup_counter += 1
                if cleanup_counter >= 120:
                    await self.cleanup_old_triggered_events()
                    cleanup_counter = 0

                # Check every 30 seconds (same as duty scheduler)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=30.0)
                    break  # Stop event was set
                except asyncio.TimeoutError:
                    continue  # Timeout, check again

        except Exception as e:
            logger.error(f"Trigger service error: {e}", exc_info=True)
        finally:
            logger.info("Trigger service stopped")


async def start_trigger_service(stop_event: asyncio.Event, db_path: Path):
    """Start the trigger service background loop."""
    service = TriggerService(db_path)
    await service.run_forever(stop_event)
