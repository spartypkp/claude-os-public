"""Duty Scheduler - Self-healing scheduler for Chief duties.

Chief duties are critical scheduled work that INTERRUPTS Chief's eternal
conversation. Unlike missions (which spawn specialists), duties run IN
Chief's context via force reset -> inject prompt -> continue.

Key design decisions:
1. NO next_run state - self-healing based on last_run
2. Duties are blocking - wait for completion before continuing
3. Core-only - no user-configurable duties

Core duties:
- memory-consolidation (6 AM) - Archive, consolidate memory
- morning-prep (7 AM) - Create brief, prepare fresh Chief
"""

import asyncio
import logging
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from config import settings
from services.storage import SystemStorage
from utils.event_bus import event_bus

# Add src to path
_SRC_PATH = Path(__file__).resolve().parents[1]
if str(_SRC_PATH) not in sys.path:
    sys.path.insert(0, str(_SRC_PATH))

logger = logging.getLogger("duty_scheduler")

# User is in San Francisco - all duty times are Pacific
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

        # Track currently running duty
        self.running_duty_slug: Optional[str] = None
        self.running_execution_id: Optional[str] = None

    def _get_duties_service(self):
        """Get DutiesService (lazy import to avoid circular deps)."""
        from apps.duties.service import DutiesService
        return DutiesService(self.storage)

    async def run_forever(self, stop_event: asyncio.Event):
        """Main scheduler loop - runs until stop_event is set."""
        logger.info("Duty scheduler starting...")

        # On startup, check for catch-up (duties that should have run)
        await self._ensure_catch_up()

        logger.info("Duty scheduler running (self-healing)")

        try:
            while not stop_event.is_set():
                # Don't check if we're already running a duty
                if not self.running_execution_id:
                    await self.check_and_execute_duties()

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

    async def _ensure_catch_up(self):
        """On startup, run any duties that should have run but didn't.

        This handles the case where the system was offline. If memory-consolidation
        was supposed to run at 6 AM but the computer was off, run it now.
        """
        try:
            service = self._get_duties_service()
            due_duties = service.get_due_duties()

            for duty in due_duties:
                gap_info = self._calculate_gap(duty)
                if gap_info["days"] > 0:
                    logger.warning(
                        f"CATCH-UP: {duty.name} needs catch-up "
                        f"(last ran: {duty.last_run}, gap: {gap_info['days']} days)"
                    )

                    success = await self.execute_duty(duty, catch_up=True, gap_info=gap_info)
                    if success:
                        logger.info(f"CATCH-UP: {duty.name} complete")
                    else:
                        logger.error(f"CATCH-UP: {duty.name} FAILED")

            logger.info("Duty catch-up check complete")

        except Exception as e:
            logger.error(f"Duty catch-up error: {e}", exc_info=True)

    def _calculate_gap(self, duty) -> dict:
        """Calculate how many days behind the duty is."""
        now_pacific = datetime.now(PACIFIC)

        try:
            hour, minute = map(int, duty.schedule_time.split(':'))
        except (ValueError, AttributeError):
            hour, minute = 6, 0

        today_scheduled = now_pacific.replace(hour=hour, minute=minute, second=0, microsecond=0)

        if not duty.last_run:
            return {"days": 999, "last_run": None}

        try:
            last_run_str = duty.last_run
            if last_run_str.endswith('Z'):
                last_run_str = last_run_str[:-1] + '+00:00'
            last_run = datetime.fromisoformat(last_run_str).astimezone(PACIFIC)
        except (ValueError, TypeError):
            return {"days": 999, "last_run": None}

        # Gap is how many days behind the expected schedule
        if now_pacific >= today_scheduled:
            expected_date = today_scheduled.date()
        else:
            expected_date = (today_scheduled - timedelta(days=1)).date()

        gap_days = max(0, (expected_date - last_run.date()).days)
        return {"days": gap_days, "last_run": duty.last_run}

    async def check_and_execute_duties(self):
        """Check for due duties and execute them."""
        try:
            # Don't start new duty if one is already running
            if self.running_execution_id:
                return

            service = self._get_duties_service()
            due_duties = service.get_due_duties()

            for duty in due_duties:
                logger.info(f"Duty due: {duty.name} ({duty.slug})")
                await self.execute_duty(duty)
                # Only execute one at a time
                break

        except Exception as e:
            logger.error(f"Error checking duties: {e}", exc_info=True)

    async def execute_duty(
        self,
        duty,
        catch_up: bool = False,
        gap_info: Optional[dict] = None,
    ) -> bool:
        """Execute a duty by forcing Chief reset with duty prompt.

        Returns True if successful, False if failed.
        """
        try:
            logger.info(f"Executing duty: {duty.name} ({duty.slug})")

            service = self._get_duties_service()

            # Create execution record
            execution_id = service.create_execution(duty.id, duty.slug)
            self.running_duty_slug = duty.slug
            self.running_execution_id = execution_id

            # Build duty prompt
            if catch_up and gap_info and gap_info["days"] > 0:
                initial_task = (
                    f"[DUTY - CATCH-UP MODE]\n\n"
                    f"Duty: {duty.name}\n"
                    f"Last ran: {gap_info['last_run']} ({gap_info['days']} days ago)\n"
                    f"The system was offline. You cannot recover those days.\n\n"
                    f"Read {duty.prompt_file} for instructions.\n"
                    f"Adapt to catch-up mode as described in the prompt."
                )
            else:
                initial_task = (
                    f"[DUTY]\n\n"
                    f"Duty: {duty.name}\n"
                    f"Read {duty.prompt_file} for instructions."
                )

            # Check if Chief is running
            chief_running = self._is_chief_running()

            if chief_running:
                # Path A: Force reset Chief with duty prompt
                logger.info(f"Path A: Chief running, sending warning then forcing reset")
                success = await self._execute_with_chief_reset(
                    duty, execution_id, initial_task
                )
            else:
                # Path B: Spawn Chief directly with duty prompt
                logger.info(f"Path B: Chief not running, spawning directly")
                success = await self._spawn_chief_for_duty(
                    duty, execution_id, initial_task
                )

            # Update duty state regardless of success
            status = "completed" if success else "failed"
            service.update_last_run(duty.id, status)
            service.complete_execution(execution_id, status=status)

            # Emit event
            await event_bus.publish("duty.completed", {
                "slug": duty.slug,
                "status": status,
            })

            # Clear running state
            self.running_duty_slug = None
            self.running_execution_id = None

            return success

        except Exception as e:
            logger.error(f"Failed to execute duty {duty.name}: {e}", exc_info=True)

            # Mark as failed
            service = self._get_duties_service()
            service.update_last_run(duty.id, "failed")
            if self.running_execution_id:
                service.complete_execution(
                    self.running_execution_id,
                    status="failed",
                    error_message=str(e)
                )

            self.running_duty_slug = None
            self.running_execution_id = None
            return False

    async def _execute_with_chief_reset(
        self,
        duty,
        execution_id: str,
        initial_task: str,
    ) -> bool:
        """Execute duty when Chief IS running (force reset path).

        1. Send 2-minute warning to Chief
        2. Wait for Chief to save state
        3. Force kill Chief
        4. Spawn fresh Chief with duty prompt
        5. Wait for completion
        """
        try:
            from services.messaging import get_messaging

            # 1. Send warning
            messaging = get_messaging(self.db_path)
            messaging.warn_mission_reset(minutes=2)  # Use existing method
            logger.info("2-minute warning sent to Chief")

            # 2. Wait for Chief to prepare
            logger.info("Waiting 2 minutes for Chief to save state...")
            await asyncio.sleep(120)  # 2 minutes

            # 3. Force kill Chief
            await self._force_kill_chief()

            # 4. Spawn fresh Chief with duty prompt
            return await self._spawn_chief_for_duty(duty, execution_id, initial_task)

        except Exception as e:
            logger.error(f"Error in force reset path: {e}", exc_info=True)
            return False

    async def _spawn_chief_for_duty(
        self,
        duty,
        execution_id: str,
        initial_task: str,
    ) -> bool:
        """Spawn Chief with duty prompt and wait for completion."""
        try:
            from services import SessionManager

            manager = SessionManager(repo_root=self.repo_root)

            # Spawn Chief in duty mode
            result = manager.spawn(
                role="chief",
                mode="mission",  # Use mission mode for duty execution
                window_name="chief",
                initial_task=initial_task,
                mission_execution_id=execution_id,  # Reuse for duty tracking
            )

            if not result.success:
                logger.error(f"Failed to spawn Chief for duty: {result.error}")
                return False

            logger.info(f"Chief spawned for duty {duty.slug}, waiting for completion...")

            # Update execution with session_id
            service = self._get_duties_service()
            service.update_execution(execution_id, session_id=result.session_id)

            # Wait for completion (poll)
            start_time = datetime.now()
            timeout = timedelta(minutes=duty.timeout_minutes)

            while True:
                await asyncio.sleep(10)  # Check every 10 seconds

                # Check timeout
                if datetime.now() - start_time > timeout:
                    logger.warning(f"Duty timed out after {duty.timeout_minutes} minutes")
                    return False

                # Check if Chief is still running duty
                # When Chief calls done(), it transitions to interactive
                # We detect completion by checking if the execution is marked complete
                execution = service.get_execution(execution_id)
                if execution and execution.status != "running":
                    return execution.status == "completed"

                # Also check if tmux window still exists with Claude
                if not self._is_chief_running():
                    # Chief exited - assume completion
                    return True

        except Exception as e:
            logger.error(f"Error spawning Chief for duty: {e}", exc_info=True)
            return False

    async def _force_kill_chief(self):
        """Force kill the current Chief process."""
        import time

        try:
            # Send Ctrl+C to kill Claude process
            subprocess.run(
                ["tmux", "send-keys", "-t", "life:chief", "C-c"],
                capture_output=True
            )
            time.sleep(1.5)

            # Second Ctrl+C for reliability
            subprocess.run(
                ["tmux", "send-keys", "-t", "life:chief", "C-c"],
                capture_output=True
            )
            time.sleep(1.0)

            # Mark old Chief session as ended in DB
            now_iso = datetime.now(timezone.utc).isoformat()
            self.storage.execute("""
                UPDATE sessions
                SET ended_at = ?, end_reason = 'duty_reset', current_state = 'ended'
                WHERE role = 'chief' AND ended_at IS NULL
            """, (now_iso,))

            logger.debug("Killed Chief process for duty execution")

        except Exception as e:
            logger.warning(f"Failed to cleanly kill Chief: {e}")

    def _is_chief_running(self) -> bool:
        """Check if Chief is actively running."""
        try:
            # Check if chief window exists
            result = subprocess.run(
                ["tmux", "list-windows", "-t", "life", "-F", "#{window_name}"],
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                return False  # Tmux session doesn't exist

            windows = result.stdout.strip().split('\n')
            if 'chief' not in windows:
                return False  # Chief window doesn't exist

            # Check if Claude process is actually running
            result = subprocess.run(
                ["tmux", "display-message", "-t", "life:chief", "-p", "#{pane_current_command}"],
                capture_output=True,
                text=True
            )

            cmd = result.stdout.strip().lower()
            return 'claude' in cmd or 'node' in cmd

        except Exception:
            return False


async def start_duty_scheduler(stop_event: asyncio.Event):
    """Start the duty scheduler background service."""
    scheduler = DutyScheduler(settings.repo_root)
    await scheduler.run_forever(stop_event)
