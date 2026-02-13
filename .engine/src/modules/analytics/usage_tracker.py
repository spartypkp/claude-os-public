"""
Claude Code Usage Tracker

Polls Claude Code usage via /usage command in temporary tmux sessions.
Stores usage data in database for display in Dashboard widget.
"""

import asyncio
import subprocess
import re
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class UsageTracker:
    """Tracks Claude Code usage by polling /usage command via tmux."""

    def __init__(self, db, poll_interval: int = 600):
        """
        Args:
            db: Database connection (SystemStorage instance)
            poll_interval: Seconds between polls (default: 10 min)
        """
        self.db = db
        self.poll_interval = poll_interval
        self._running = False
        self._task = None

    async def start(self):
        """Start the background polling loop."""
        logger.info(f"Starting usage tracker (poll interval: {self.poll_interval}s)")
        self._cleanup_orphan_windows()
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())

    def _cleanup_orphan_windows(self):
        """Kill any leftover usage-check-* windows from previous runs."""
        try:
            result = subprocess.run(
                ['tmux', 'list-windows', '-t', 'life', '-F', '#{window_name}'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                for name in result.stdout.strip().split('\n'):
                    if name.startswith('usage-check-'):
                        logger.info(f"Cleaning up orphan usage window: {name}")
                        subprocess.run(
                            ['tmux', 'kill-window', '-t', f'life:{name}'],
                            capture_output=True, timeout=5
                        )
        except Exception as e:
            logger.debug(f"Orphan cleanup error (non-critical): {e}")

    async def stop(self):
        """Stop the polling loop."""
        logger.info("Stopping usage tracker")
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _poll_loop(self):
        """Main polling loop."""
        # Do initial fetch immediately
        await self.fetch_and_store_usage()

        while self._running:
            try:
                await asyncio.sleep(self.poll_interval)
                if self._running:
                    await self.fetch_and_store_usage()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in poll loop: {e}")
                await asyncio.sleep(60)  # Back off on error

    async def fetch_and_store_usage(self) -> Dict[str, Any]:
        """
        Fetch usage via /usage command and store in DB.

        Returns:
            Dict with usage data or error
        """
        try:
            logger.debug("Fetching usage data...")

            # Run /usage command in temporary tmux window
            result = await self._run_usage_command()

            if result['status'] == 'error':
                self._store_error(result['error'])
                return result

            # Parse the text output
            parsed = self._parse_usage_output(result['output'])

            if not parsed:
                logger.warning("Failed to parse usage output")
                self._store_error("Failed to parse /usage output", result['output'])
                return {'status': 'parsing_failed'}

            # Store in database
            self._store_usage(parsed, result['output'])
            logger.info(f"Usage data stored: session={parsed.get('session_percentage', 0):.1f}%, weekly={parsed.get('weekly_percentage', 0):.1f}%")

            return parsed

        except Exception as e:
            logger.error(f"Error fetching usage: {e}", exc_info=True)
            self._store_error(str(e))
            return {'status': 'error', 'error': str(e)}

    async def _run_usage_command(self) -> Dict[str, Any]:
        """
        Run /usage command in temporary tmux window.

        Strategy:
        1. Spawn a new tmux window
        2. Start claude with --dangerously-skip-permissions
        3. Wait for startup
        4. Send /usage command
        5. Wait for output
        6. Capture pane
        7. Kill window

        Returns:
            Dict with 'status' and 'output' or 'error'
        """
        window_name = None
        try:
            # Create unique window name
            window_name = f"usage-check-{datetime.now().strftime('%H%M%S')}"

            # Create new window in life session (detached - don't steal focus)
            subprocess.run(
                ['tmux', 'new-window', '-d', '-t', 'life', '-n', window_name],
                check=True,
                capture_output=True,
                timeout=5
            )

            # Start claude
            subprocess.run(
                ['tmux', 'send-keys', '-t', f'life:{window_name}',
                 'claude --dangerously-skip-permissions', 'Enter'],
                check=True,
                timeout=5
            )

            # Wait for Claude to start
            await asyncio.sleep(4)

            # Send /usage command - use -l flag to send literally (avoids autocomplete)
            subprocess.run(
                ['tmux', 'send-keys', '-t', f'life:{window_name}', '-l', '/usage'],
                check=True,
                timeout=5
            )

            # Send Enter to execute
            await asyncio.sleep(0.5)
            subprocess.run(
                ['tmux', 'send-keys', '-t', f'life:{window_name}', 'Enter'],
                check=True,
                timeout=5
            )

            # Wait for output to render
            await asyncio.sleep(3)

            # Capture pane output
            result = subprocess.run(
                ['tmux', 'capture-pane', '-t', f'life:{window_name}', '-p', '-S', '-100'],
                check=True,
                capture_output=True,
                text=True,
                timeout=5
            )

            output = result.stdout

            return {'status': 'success', 'output': output}

        except subprocess.TimeoutExpired:
            logger.error("Command timeout")
            return {'status': 'error', 'error': 'Command timeout'}
        except subprocess.CalledProcessError as e:
            logger.error(f"tmux error: {e}")
            return {'status': 'error', 'error': f'tmux error: {e}'}
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return {'status': 'error', 'error': str(e)}
        finally:
            # Always clean up the window
            if window_name:
                try:
                    subprocess.run(
                        ['tmux', 'kill-window', '-t', f'life:{window_name}'],
                        timeout=5,
                        capture_output=True
                    )
                except:
                    pass

    def _parse_usage_output(self, output: str) -> Optional[Dict[str, Any]]:
        """
        Parse /usage command output to extract usage data.

        NOTE: This parsing is based on expected output format from Claude Code.
        The actual format may vary and this will need adjustment once we see
        real output from the /usage command.

        Expected patterns to look for:
        - Token counts: "X / Y tokens" or "X of Y"
        - Percentages: "XX%"
        - Reset timing: "resets in X hours" or "resets at ..."
        - Model name: "sonnet", "opus", etc.

        Returns:
            Dict with parsed data or None if parsing fails
        """
        try:
            # Look for "Current session" section and extract percentage
            session_match = re.search(r'Current session.*?(\d+)\s*%\s*used', output, re.DOTALL)
            if not session_match:
                logger.warning("Could not find session usage in output")
                return None

            session_pct = float(session_match.group(1))
            # Estimate tokens (default to 100k for session)
            session_total = 100000
            session_used = int(session_total * session_pct / 100)

            # Look for reset timing
            reset_match = re.search(r'reset(?:s)?\s+in[:\s]+(\d+)\s*(?:hour|hr|h)', output, re.IGNORECASE)
            if reset_match:
                hours = int(reset_match.group(1))
                session_reset_at = datetime.now() + timedelta(hours=hours)
            else:
                # Default: assume 5-hour cycle
                session_reset_at = datetime.now() + timedelta(hours=5)

            # Try to extract weekly usage - look for "Current week (all models)"
            weekly_match = re.search(r'Current week \(all models\).*?(\d+)\s*%\s*used', output, re.DOTALL)
            if weekly_match:
                weekly_pct = float(weekly_match.group(1))
                # Estimate tokens (typical weekly limit)
                weekly_total = 1000000  # 1M tokens/week typical
                weekly_used = int(weekly_total * weekly_pct / 100)

                # Extract weekly reset time
                weekly_reset_match = re.search(r'Current week.*?Resets\s+([^(]+)', output, re.DOTALL)
                if weekly_reset_match:
                    # Parse "Jan 16, 8:59am" format
                    reset_str = weekly_reset_match.group(1).strip()
                    try:
                        # Simple parsing - assume current year
                        from dateutil import parser
                        weekly_reset_at = parser.parse(reset_str, fuzzy=True)
                    except:
                        # Fallback: assume Monday
                        now = datetime.now()
                        days_until_monday = (7 - now.weekday()) % 7
                        if days_until_monday == 0:
                            days_until_monday = 7
                        weekly_reset_at = (now + timedelta(days=days_until_monday)).replace(
                            hour=0, minute=0, second=0, microsecond=0
                        )
                else:
                    # Fallback
                    now = datetime.now()
                    days_until_monday = (7 - now.weekday()) % 7
                    if days_until_monday == 0:
                        days_until_monday = 7
                    weekly_reset_at = (now + timedelta(days=days_until_monday)).replace(
                        hour=0, minute=0, second=0, microsecond=0
                    )
            else:
                weekly_used = None
                weekly_total = None
                weekly_pct = None
                weekly_reset_at = None

            # Extract model info
            model = self._extract_model(output)

            return {
                'session_tokens_used': session_used,
                'session_tokens_total': session_total,
                'session_percentage': session_pct,
                'session_reset_at': session_reset_at.isoformat() if session_reset_at else None,
                'weekly_tokens_used': weekly_used,
                'weekly_tokens_total': weekly_total,
                'weekly_percentage': weekly_pct,
                'weekly_reset_at': weekly_reset_at.isoformat() if weekly_reset_at else None,
                'current_model': model,
                'plan_tier': None,  # Not in output typically
            }

        except Exception as e:
            logger.error(f"Parse error: {e}", exc_info=True)
            return None

    def _extract_model(self, output: str) -> Optional[str]:
        """Extract current model from output."""
        output_lower = output.lower()
        if 'sonnet 4.5' in output_lower or 'sonnet-4.5' in output_lower:
            return 'Sonnet 4.5'
        elif 'sonnet 4' in output_lower or 'sonnet-4' in output_lower:
            return 'Sonnet 4'
        elif 'opus 4' in output_lower or 'opus-4' in output_lower:
            return 'Opus 4'
        elif 'haiku 4' in output_lower or 'haiku-4' in output_lower:
            return 'Haiku 4'
        return None

    def _store_usage(self, data: Dict[str, Any], raw_output: str):
        """Store parsed usage data in database."""
        self.db.execute("""
            INSERT INTO claude_usage (
                session_tokens_used, session_tokens_total,
                session_percentage, session_reset_at,
                weekly_tokens_used, weekly_tokens_total,
                weekly_percentage, weekly_reset_at,
                current_model, plan_tier,
                raw_output, fetch_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
        """, (
            data['session_tokens_used'],
            data['session_tokens_total'],
            data['session_percentage'],
            data['session_reset_at'],
            data['weekly_tokens_used'],
            data['weekly_tokens_total'],
            data['weekly_percentage'],
            data['weekly_reset_at'],
            data['current_model'],
            data['plan_tier'],
            raw_output,
        ))

    def _store_error(self, error: str, raw_output: str = None):
        """Store error state in database."""
        self.db.execute("""
            INSERT INTO claude_usage (
                fetch_status, error_message, raw_output
            ) VALUES ('error', ?, ?)
        """, (error, raw_output))

    def get_latest_usage(self) -> Optional[Dict[str, Any]]:
        """
        Get most recent usage data from database.

        Returns:
            Dict with usage data or None
        """
        result = self.db.fetchone("""
            SELECT * FROM claude_usage
            ORDER BY timestamp DESC
            LIMIT 1
        """)

        if not result:
            return None

        # Convert sqlite3.Row to dict
        return {key: result[key] for key in result.keys()}
