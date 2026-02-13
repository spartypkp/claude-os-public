"""Calendar repository - database operations for calendar domain.

Handles all SQL queries for calendar settings and configuration.
Uses SystemStorage from core for database access.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from core.database import SystemStorage

logger = logging.getLogger(__name__)


class CalendarRepository:
    """Repository for calendar database operations."""

    def __init__(self, storage: SystemStorage):
        """Initialize calendar repository.

        Args:
            storage: SystemStorage instance for database access.
        """
        self.storage = storage

    # =========================================================================
    # Settings Operations
    # =========================================================================

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get a calendar setting from system DB.

        Args:
            key: Setting key.
            default: Default value if not found.

        Returns:
            Setting value or default.
        """
        try:
            row = self.storage.fetchone(
                "SELECT value FROM calendar_settings WHERE key = ?",
                [key]
            )
            return row["value"] if row else default
        except Exception as e:
            logger.error(f"Failed to get setting {key}: {e}")
            return default

    def set_setting(self, key: str, value: str) -> bool:
        """Set a calendar setting in system DB.

        Args:
            key: Setting key.
            value: Setting value.

        Returns:
            True if successful.
        """
        try:
            with self.storage.transaction() as cursor:
                cursor.execute(
                    """
                    INSERT INTO calendar_settings (key, value, updated_at)
                    VALUES (?, ?, datetime('now'))
                    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
                    """,
                    (key, value, value)
                )
            return True
        except Exception as e:
            logger.error(f"Failed to set setting {key}: {e}")
            return False

    # =========================================================================
    # Account Configuration Operations
    # =========================================================================

    def load_account_calendars(self) -> tuple[List[str], Dict[str, str], Dict[str, str]]:
        """Load calendar preferences from unified accounts table.

        Merges calendar config from all enabled accounts to build:
        - preferred_calendars: All calendars from all accounts
        - aliases: Merged calendar name aliases
        - defaults: Event type defaults based on account config

        Returns:
            Tuple of (preferred_calendars, aliases, defaults)
        """
        try:
            rows = self.storage.fetchall("""
                SELECT email, config_json
                FROM accounts
                WHERE is_enabled = 1
                  AND can_read_calendar = 1
            """)

            preferred_calendars: List[str] = []
            aliases: Dict[str, str] = {}
            defaults: Dict[str, str] = {}

            for row in rows:
                config = json.loads(row['config_json'] or '{}')
                calendar_config = config.get('calendar_config', {})

                # Add preferred calendars
                preferred = calendar_config.get('preferred_calendars', [])
                for cal in preferred:
                    if cal not in preferred_calendars:
                        preferred_calendars.append(cal)

                # Merge aliases
                cal_aliases = calendar_config.get('aliases', {})
                aliases.update(cal_aliases)

                # Map default_for to calendar names
                default_for = calendar_config.get('default_for', [])
                for event_type in default_for:
                    # Use the first calendar from preferred_calendars as default
                    if preferred and event_type not in defaults:
                        defaults[event_type] = preferred[0]

            logger.info(
                f"Loaded calendar config from accounts: "
                f"{len(preferred_calendars)} calendars, "
                f"{len(aliases)} aliases, "
                f"{len(defaults)} defaults"
            )

            return preferred_calendars, aliases, defaults

        except Exception as e:
            logger.error(f"Failed to load account calendars: {e}")
            # Return empty defaults
            return [], {}, {}
