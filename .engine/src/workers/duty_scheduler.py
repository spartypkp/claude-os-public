"""Duty Scheduler - Self-healing scheduler for Chief duties.

Chief duties are critical scheduled work that INTERRUPTS Chief's eternal
conversation. Duties run by injecting skill messages into Chief's session.

Key design decisions:
1. NO next_run state - self-healing based on last_run
2. NO spawn/detection logic - just inject message like triggers do
3. Core-only - no user-configurable duties

Core duties:
- morning-reset (6 AM) - Archive, consolidate memory, prepare brief, deliver
"""

import asyncio
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from core.config import settings
from core.storage import SystemStorage
from core.perf import record_worker_latency
from core.events import event_bus
from core.tmux import inject_message, window_exists

logger = logging.getLogger("duty_scheduler")

# Default timezone: Pacific - all duty times are Pacific
PACIFIC = ZoneInfo("America/Los_Angeles")


class DutyScheduler:
    """Scheduler for Chief duties.

    Self-healing scheduling means no fragile next_run state:

        def should_run_duty(duty, now_pacific):
            hour, minute = map(int, duty.schedule_time.split(':'))
            today_scheduled = now_pacific.replace(hour=hour, minute=minute)

            if now_pacific < today_scheduled:
                return False  # Not yet reached scheduled time

            if not duty.last_run:
                return True  # Never ran

            last_run = parse(duty.last_run).astimezone(PACIFIC)
            return last_run < today_scheduled  # Last run was before today's schedule

    This is robust:
    - Never ran → runs immediately
    - Missed (system off) → runs on startup
    - Failed → runs again tomorrow (last_run updated)
    - last_run corrupt → runs (since < today's schedule)
    """

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.db_path = repo_root / ".engine" / "data" / "db" / "system.db"
        self.storage = SystemStorage(self.db_path)

    def _get_duties_service(self):
        """Get DutiesService (lazy import to avoid circular deps)."""
        from modules.duties import get_duties_service
        return get_duties_service()

    async def run_forever(self, stop_event: asyncio.Event):
        """Main scheduler loop - runs until stop_event is set."""
        logger.info("Duty scheduler starting...")
        logger.info("Duty scheduler running (self-healing)")

        try:
            while not stop_event.is_set():
                start = time.perf_counter()
                errored = False
                try:
                    await self.check_and_execute_duties()
                except Exception:
                    errored = True
                    raise
                finally:
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    record_worker_latency("duty_scheduler.tick", elapsed_ms, errored)

                # Check every 30 seconds
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=30.0)
                    break  # Stop event was set
                except asyncio.TimeoutError:
                    continue  # Timeout, check again

        except Exception as e:
            logger.error(f"Duty scheduler error: {e}", exc_info=True)
        finally:
            logger.info("Duty scheduler stopped")

    async def check_and_execute_duties(self):
        """Check for due duties and execute them."""
        try:
            service = self._get_duties_service()
            due_duties = service.get_due_duties()

            for duty in due_duties:
                logger.info(f"Duty due: {duty.name} ({duty.slug})")
                await self.execute_duty(duty)
                # Only execute one at a time
                break

        except Exception as e:
            logger.error(f"Error checking duties: {e}", exc_info=True)

    async def execute_duty(self, duty) -> bool:
        """Execute duty by injecting skill message to Chief.

        Same pattern as triggers.py - no process detection needed.
        Just check window exists, inject message.

        Returns True if successful, False if failed.
        """
        start = time.perf_counter()
        errored = False
        success = False

        try:
            logger.info(f"Executing duty: {duty.name} ({duty.slug})")

            # Check if chief window exists (same as triggers.py)
            if not window_exists("chief"):
                logger.warning(f"Chief window not found - duty {duty.slug} not injected")
                return False

            # Inject message (same as triggers.py)
            message = f"[DUTY] /{duty.slug}"
            success = await asyncio.to_thread(
                inject_message,
                "life:chief",
                message,
                True,   # submit
                0.1,    # delay
                True,   # cleanup
                "DUTY"  # source tag
            )

            if success:
                logger.info(f"Duty injected: {duty.slug}")
                service = self._get_duties_service()
                service.update_last_run(duty.id, "triggered")

                # Emit event
                await event_bus.publish("duty.completed", {
                    "slug": duty.slug,
                    "status": "triggered",
                })
            else:
                logger.warning(f"Duty injection failed: {duty.slug}")

            return success

        except Exception as e:
            errored = True
            logger.error(f"Failed to execute duty {duty.name}: {e}", exc_info=True)
            return False
        finally:
            if not errored:
                errored = not success
            elapsed_ms = (time.perf_counter() - start) * 1000
            record_worker_latency(f"duty_scheduler.execute.{duty.slug}", elapsed_ms, errored)


async def start_duty_scheduler(stop_event: asyncio.Event):
    """Start the duty scheduler background service."""
    scheduler = DutyScheduler(settings.repo_root)
    await scheduler.run_forever(stop_event)
