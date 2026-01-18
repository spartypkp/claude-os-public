"""Mission Scheduler - Simplified scheduler for specialist missions.

After the Duties overhaul (Jan 2026), this scheduler ONLY handles:
- Spawning specialist windows for scheduled missions
- Tracking mission execution
- Chief heartbeat (calendar-aware wakes)

Chief-specific work moved to DutyScheduler:
- Memory consolidation (6 AM)
- Morning prep (7 AM)
- Force resets, gate logic, critical missions

Architecture:
- Reads due missions from `missions` table (WHERE role != 'chief')
- Spawns Claude sessions via SessionManager
- Tracks execution history in `mission_executions` table
- Handles Chief heartbeat (calendar-aware wakes)
"""

import asyncio
import logging
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

# User is in San Francisco - all mission times are Pacific
PACIFIC = ZoneInfo("America/Los_Angeles")

# Calendar-aware wake configuration
FOCUS_KEYWORDS = ["DS&A", "Focus", "Leetcode", "Recovery", "Interview", "Mock"]
PRE_EVENT_MINUTES_MIN = 5
PRE_EVENT_MINUTES_MAX = 10
POST_EVENT_MINUTES_MAX = 5

# Add src to path for utils import
_SRC_PATH = Path(__file__).resolve().parents[1]
if str(_SRC_PATH) not in sys.path:
    sys.path.insert(0, str(_SRC_PATH))

from config import settings
from db import get_async_db
from integrations.apple import get_events as get_calendar_events
from utils.event_bus import event_bus
from services.storage import SystemStorage
from apps.missions.service import MissionsService, Mission

logger = logging.getLogger("mission_scheduler")


def _get_wake_settings() -> dict:
    """Read wake settings from database."""
    import sqlite3
    db_path = settings.repo_root / ".engine" / "data" / "db" / "system.db"

    result = {
        "window_until": None,
        "pause_until": None,
        "interval_minutes": 15
    }

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Get wake_window_until
        cursor.execute("SELECT value FROM settings WHERE key = 'wake_window_until'")
        row = cursor.fetchone()
        if row and row["value"]:
            try:
                window_str = row["value"]
                if "+" in window_str or "Z" in window_str:
                    window_until = datetime.fromisoformat(window_str.replace("Z", "+00:00"))
                else:
                    window_until = datetime.fromisoformat(window_str).replace(tzinfo=timezone.utc)
                if window_until > datetime.now(timezone.utc):
                    result["window_until"] = window_until
                else:
                    cursor.execute("DELETE FROM settings WHERE key = 'wake_window_until'")
                    conn.commit()
            except (ValueError, TypeError):
                pass

        # Get pause_until
        cursor.execute("SELECT value FROM settings WHERE key = 'wake_pause_until'")
        row = cursor.fetchone()
        if row and row["value"]:
            try:
                pause_str = row["value"]
                if "+" in pause_str or "Z" in pause_str:
                    pause_until = datetime.fromisoformat(pause_str.replace("Z", "+00:00"))
                else:
                    pause_until = datetime.fromisoformat(pause_str).replace(tzinfo=timezone.utc)
                if pause_until > datetime.now(timezone.utc):
                    result["pause_until"] = pause_until
                else:
                    cursor.execute("DELETE FROM settings WHERE key = 'wake_pause_until'")
                    conn.commit()
            except (ValueError, TypeError):
                pass

        # Get interval
        cursor.execute("SELECT value FROM settings WHERE key = 'wake_interval_minutes'")
        row = cursor.fetchone()
        if row and row["value"]:
            try:
                result["interval_minutes"] = int(row["value"])
            except (ValueError, TypeError):
                pass

        conn.close()
    except Exception as e:
        logger.warning(f"Failed to read wake settings: {e}")

    return result


def _get_idle_seconds() -> float:
    """Get seconds since last user input (keyboard/mouse)."""
    try:
        result = subprocess.run(
            ["ioreg", "-c", "IOHIDSystem"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split('\n'):
            if 'HIDIdleTime' in line:
                parts = line.split()
                for i, part in enumerate(parts):
                    if part == '=' and i + 1 < len(parts):
                        ns = int(parts[i + 1])
                        return ns / 1_000_000_000
        return 0.0
    except Exception:
        return 0.0


def _has_waiting_items() -> Tuple[bool, dict]:
    """Check if there are items waiting for Chief's attention."""
    import sqlite3
    db_path = settings.repo_root / ".engine" / "data" / "db" / "system.db"

    counts = {"workers": 0, "pings": 0}

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        cursor.execute("""
            SELECT COUNT(*) FROM workers
            WHERE status IN ('complete', 'failed')
        """)
        counts["workers"] = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*) FROM pings
            WHERE acknowledged_at IS NULL
        """)
        counts["pings"] = cursor.fetchone()[0]

        conn.close()
    except Exception as e:
        logger.warning(f"Failed to check waiting items: {e}")
        return (True, counts)

    has_items = counts["workers"] > 0 or counts["pings"] > 0
    return (has_items, counts)


class MissionScheduler:
    """Simplified scheduler for specialist missions only.

    Chief duties (memory consolidation, morning prep) are handled by DutyScheduler.
    This scheduler only spawns specialist windows for non-Chief missions.
    """

    # Heartbeat configuration
    HEARTBEAT_INTERVAL_MINUTES = 15
    HEARTBEAT_START_HOUR = 7
    HEARTBEAT_END_HOUR = 23

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.storage = SystemStorage(settings.db_path)
        self.missions_service = MissionsService(self.storage)

        # Execution tracking
        self.running_mission_id: Optional[str] = None
        self.running_execution_id: Optional[str] = None

        # Heartbeat tracking
        self.last_heartbeat: Optional[datetime] = None

        # Calendar-aware wake tracking
        self.last_pre_event_alert: Optional[str] = None
        self.last_post_event_check: Optional[str] = None

        # Track executed missions today
        self.executed_today: set = set()
        self.last_date_check: Optional[str] = None

    async def run_forever(self, stop_event: asyncio.Event):
        """Main scheduler loop - runs until stop_event is set."""
        logger.info("Mission scheduler starting (specialist missions only)...")

        # No more gate/catch-up - that's handled by DutyScheduler
        logger.info("Mission scheduler running")

        # Cleanup counter (run every ~5 minutes)
        cleanup_counter = 0
        CLEANUP_INTERVAL = 10

        try:
            while not stop_event.is_set():
                now_pacific = datetime.now(PACIFIC)
                today = now_pacific.strftime("%Y-%m-%d")

                # Reset executed set on new day
                if self.last_date_check != today:
                    self.executed_today = set()
                    self.last_date_check = today

                # Check for due missions (specialist only)
                await self.check_and_execute_missions()

                # Check running mission status
                if self.running_execution_id:
                    await self.check_running_mission()

                # Heartbeat during daytime
                if now_pacific.hour >= self.HEARTBEAT_START_HOUR:
                    await self.check_and_send_heartbeat()

                # Periodic cleanup of orphaned executions
                cleanup_counter += 1
                if cleanup_counter >= CLEANUP_INTERVAL:
                    cleanup_counter = 0
                    await self._cleanup_orphaned_executions()

                # Check every 30 seconds
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=30.0)
                    break
                except asyncio.TimeoutError:
                    continue

        except Exception as e:
            logger.error(f"Mission scheduler error: {e}", exc_info=True)
        finally:
            logger.info("Mission scheduler stopped")

    async def check_and_execute_missions(self):
        """Check for due missions and execute them (specialists only)."""
        try:
            now_utc = datetime.now(timezone.utc)

            # Don't start new mission if one is already running
            if self.running_execution_id:
                return

            # Get due missions from database
            due_missions = self.missions_service.get_due_missions(now_utc)

            for mission in due_missions:
                # Skip Chief missions - handled by DutyScheduler
                if mission.role == "chief":
                    logger.debug(f"Skipping Chief mission {mission.slug} - handled by DutyScheduler")
                    continue

                # Skip if we already executed this today
                if mission.slug in self.executed_today:
                    continue

                # Execute the mission
                await self.execute_mission(mission)
                self.executed_today.add(mission.slug)

                # Only execute one at a time
                break

        except Exception as e:
            logger.error(f"Error checking missions: {e}", exc_info=True)

    async def execute_mission(self, mission: Mission):
        """Execute a mission by spawning a specialist session."""
        try:
            logger.info(f"Executing mission: {mission.name} ({mission.slug})")

            # Clear next_run to prevent double execution
            self.missions_service.clear_next_run(mission.id)

            # Create execution record
            execution_id = self.missions_service.create_execution(
                mission_id=mission.id,
                mission_slug=mission.slug,
            )

            # Build initial task message
            initial_task = self._build_initial_task(mission)

            # Spawn specialist session
            from services import SessionManager
            manager = SessionManager(repo_root=self.repo_root)

            result = manager.spawn(
                role=mission.role,
                mode=mission.mode,
                window_name=f"mission-{mission.slug[:12]}",
                initial_task=initial_task,
                mission_execution_id=execution_id,
            )

            if result.success:
                # Update execution with session_id
                self.missions_service.update_execution(
                    execution_id,
                    session_id=result.session_id,
                )

                self.running_mission_id = mission.slug
                self.running_execution_id = execution_id
                logger.info(f"Mission {mission.slug} started: {result.window_name}")
            else:
                # Mark execution as failed
                self.missions_service.complete_execution(
                    execution_id,
                    status="failed",
                    error_message=result.error,
                )
                await event_bus.publish("mission.completed", {"slug": mission.slug, "status": "failed"})
                logger.error(f"Failed to spawn mission {mission.slug}: {result.error}")

        except Exception as e:
            logger.error(f"Failed to execute mission {mission.name}: {e}", exc_info=True)

    def _build_initial_task(self, mission: Mission) -> str:
        """Build the initial task message for a mission."""
        if mission.prompt_type == "inline" and mission.prompt_inline:
            return mission.prompt_inline
        elif mission.prompt_file:
            return f"[SYSTEM]: Scheduled task - {mission.name}. See {mission.prompt_file}"
        else:
            return f"[SYSTEM]: Scheduled task - {mission.name}"

    async def check_running_mission(self):
        """Check if running mission has completed."""
        try:
            if not self.running_execution_id:
                return

            execution = self.missions_service.get_execution(self.running_execution_id)
            if not execution:
                self.running_mission_id = None
                self.running_execution_id = None
                return

            if execution.status != "running":
                logger.info(f"Mission {self.running_mission_id} completed: {execution.status}")

                # Update mission's last_run and last_status
                if self.running_mission_id:
                    mission = self.missions_service.get_mission(self.running_mission_id)
                    if mission:
                        self.missions_service.update_last_run(mission.id, execution.status)

                        # Compute next run for recurring missions
                        if mission.is_recurring and mission.enabled:
                            next_run = self.missions_service._compute_next_run(
                                schedule_type=mission.schedule_type,
                                schedule_cron=mission.schedule_cron,
                                schedule_time=mission.schedule_time,
                                schedule_days=mission.schedule_days,
                            )
                            if next_run:
                                self.missions_service.set_next_run(mission.id, next_run)

                # Cleanup tmux window
                await self._cleanup_mission_window()

                self.running_mission_id = None
                self.running_execution_id = None

        except Exception as e:
            logger.error(f"Error checking running mission: {e}")

    async def _cleanup_mission_window(self):
        """Kill the tmux window for a completed mission."""
        try:
            if not self.running_mission_id:
                return

            window_name = f"mission-{self.running_mission_id[:12]}"
            result = subprocess.run(
                ["tmux", "kill-window", "-t", f"life:{window_name}"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                logger.info(f"Cleaned up tmux window: {window_name}")
            else:
                logger.debug(f"Tmux window {window_name} cleanup: {result.stderr.strip() or 'already gone'}")
        except Exception as e:
            logger.warning(f"Failed to cleanup tmux window: {e}")

    async def _cleanup_orphaned_executions(self):
        """Cleanup orphaned mission executions."""
        try:
            from services import SessionManager
            manager = SessionManager(repo_root=self.repo_root)
            cleaned = manager.cleanup_orphan_mission_executions()
            if cleaned > 0:
                logger.info(f"Cleaned up {cleaned} orphaned mission execution(s)")
        except Exception as e:
            logger.error(f"Error cleaning orphaned executions: {e}")

    # =========================================================================
    # HEARTBEAT (unchanged)
    # =========================================================================

    def _is_chief_running(self) -> bool:
        """Check if Chief is actively running."""
        try:
            result = subprocess.run(
                ["tmux", "list-windows", "-t", "life", "-F", "#{window_name}"],
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                return False

            windows = result.stdout.strip().split('\n')
            if 'chief' not in windows:
                return False

            result = subprocess.run(
                ["tmux", "display-message", "-t", "life:chief", "-p", "#{pane_current_command}"],
                capture_output=True,
                text=True
            )

            cmd = result.stdout.strip().lower()
            return 'claude' in cmd or 'node' in cmd

        except Exception:
            return False

    def _get_calendar_context(self) -> Tuple[Optional[str], Optional[dict], Optional[dict]]:
        """Get calendar context for wake decision."""
        now = datetime.now()
        now_local = now.astimezone()

        try:
            from_date = now - timedelta(minutes=15)
            to_date = now + timedelta(minutes=15)
            events = get_calendar_events(from_date=from_date, to_date=to_date, limit=10)

            if not events:
                return ("HEARTBEAT", None, None)

            current_event = None
            upcoming_event = None
            recently_ended_event = None

            for event in events:
                if not event.get("start_ts") or not event.get("end_ts"):
                    continue

                try:
                    start_str = event["start_ts"]
                    end_str = event["end_ts"]

                    if "+" in start_str or "Z" in start_str:
                        start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                    else:
                        start = datetime.fromisoformat(start_str).astimezone()

                    if "+" in end_str or "Z" in end_str:
                        end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                    else:
                        end = datetime.fromisoformat(end_str).astimezone()

                    if event.get("all_day"):
                        continue

                    event_title = event.get("summary", "")
                    minutes_until_start = (start - now_local).total_seconds() / 60
                    minutes_since_end = (now_local - end).total_seconds() / 60

                    if start <= now_local <= end:
                        current_event = event
                        if any(kw.lower() in event_title.lower() for kw in FOCUS_KEYWORDS):
                            logger.debug(f"In focus block: {event_title}")
                            return ("SUPPRESS", current_event, None)

                    elif PRE_EVENT_MINUTES_MIN <= minutes_until_start <= PRE_EVENT_MINUTES_MAX:
                        if not upcoming_event:
                            upcoming_event = event

                    elif 0 < minutes_since_end <= POST_EVENT_MINUTES_MAX:
                        if not recently_ended_event:
                            recently_ended_event = event

                except (ValueError, TypeError) as e:
                    logger.warning(f"Failed to parse event times: {e}")
                    continue

            if upcoming_event:
                event_id = upcoming_event.get("id", "unknown")
                if event_id != self.last_pre_event_alert:
                    self.last_pre_event_alert = event_id
                    return ("PRE_EVENT", current_event, upcoming_event)

            if recently_ended_event and not current_event:
                event_id = recently_ended_event.get("id", "unknown")
                if event_id != self.last_post_event_check:
                    self.last_post_event_check = event_id
                    return ("POST_EVENT", recently_ended_event, None)

            return ("HEARTBEAT", current_event, upcoming_event)

        except Exception as e:
            logger.warning(f"Calendar check failed, using HEARTBEAT: {e}")
            return ("HEARTBEAT", None, None)

    async def check_and_send_heartbeat(self):
        """Send periodic wake signal to Chief if running."""
        try:
            now_pacific = datetime.now(PACIFIC)

            if not (self.HEARTBEAT_START_HOUR <= now_pacific.hour < self.HEARTBEAT_END_HOUR):
                return

            if not self._is_chief_running():
                return

            wake_settings = _get_wake_settings()

            if not wake_settings["window_until"]:
                return

            if wake_settings["pause_until"]:
                remaining = (wake_settings["pause_until"] - datetime.now(timezone.utc)).total_seconds() / 60
                logger.debug(f"Wake paused for {remaining:.1f} more minutes")
                return

            idle_seconds = _get_idle_seconds()
            if idle_seconds < 10:
                logger.debug(f"Wake skipped - user active (idle {idle_seconds:.1f}s < 10s)")
                return

            heartbeat_interval = wake_settings["interval_minutes"]
            wake_type, current_event, next_event = self._get_calendar_context()

            if wake_type == "SUPPRESS":
                event_title = current_event.get("summary", "Unknown") if current_event else "Unknown"
                logger.debug(f"Wake suppressed (focus block: {event_title})")
                self.last_heartbeat = datetime.now(timezone.utc)
                return

            if wake_type in ("PRE_EVENT", "POST_EVENT"):
                minutes_since_last = 0
                if self.last_heartbeat:
                    minutes_since_last = int((datetime.now(timezone.utc) - self.last_heartbeat).total_seconds() / 60)

                event_info = None
                if wake_type == "PRE_EVENT" and next_event:
                    event_info = next_event.get("summary", "Unknown event")
                elif wake_type == "POST_EVENT" and current_event:
                    event_info = current_event.get("summary", "Unknown event")

                self._send_chief_wake(
                    wake_type=wake_type,
                    minutes_since_last=minutes_since_last,
                    event_title=event_info
                )
                self.last_heartbeat = datetime.now(timezone.utc)
                logger.info(f"{wake_type} wake sent to Chief (event: {event_info})")
                return

            minutes_since_last = 0
            if self.last_heartbeat:
                minutes_since_last = int((datetime.now(timezone.utc) - self.last_heartbeat).total_seconds() / 60)
                if minutes_since_last < heartbeat_interval:
                    return
            else:
                minutes_since_last = heartbeat_interval

            has_items, item_counts = _has_waiting_items()
            if not has_items:
                self.last_heartbeat = datetime.now(timezone.utc)
                logger.debug(f"Heartbeat skipped - nothing waiting (after {minutes_since_last}m)")
                return

            self._send_chief_wake(
                wake_type="HEARTBEAT",
                minutes_since_last=minutes_since_last
            )
            self.last_heartbeat = datetime.now(timezone.utc)
            logger.debug(f"Heartbeat sent to Chief (after {minutes_since_last}m, waiting: {item_counts})")

        except Exception as e:
            logger.warning(f"Heartbeat check failed: {e}")

    def _send_chief_wake(
        self,
        wake_type: str = "HEARTBEAT",
        minutes_since_last: int = 15,
        event_title: Optional[str] = None
    ):
        """Send wake signal to Chief via SessionManager."""
        try:
            from services import SessionManager
            manager = SessionManager(repo_root=self.repo_root)
            success = manager.send_to_chief(
                "wake",
                wake_type=wake_type,
                minutes_since_last=minutes_since_last,
                event_title=event_title
            )
            if not success:
                logger.warning("Chief wake failed: send_to_chief returned False")
        except Exception as e:
            logger.warning(f"Failed to send Chief wake: {e}")


async def start_scheduler(stop_event: asyncio.Event):
    """Start the mission scheduler background service."""
    scheduler = MissionScheduler(settings.repo_root)
    await scheduler.run_forever(stop_event)
