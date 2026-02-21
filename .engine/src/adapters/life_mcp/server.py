#!/usr/bin/env python3
"""Life System MCP Server - Claude's interface to the life system.

This is the composition point for all MCP tool modules.

Structure:
  adapters/life_mcp/
  ├── server.py          ← This file: pure composition
  └── tools/
      ├── lifecycle.py   ← reset, done, status (CRITICAL - Claude's survival)
      ├── system.py      ← team (meta-operations incl. reply)
      └── day.py         ← day (timeline logging + priority management)

  modules/*/mcp.py       ← Domain tools (calendar, contacts, email, etc.)

Tools:
  Lifecycle (CRITICAL):
    - reset(summary)          Refresh context - spawn fresh, kill current
    - done(summary)           Work complete - log and close session
    - status(text)            Report what I'm doing (dashboard sidebar)

  System:
    - team(op)                Operations: spawn, list, peek, close, message, subscribe, reply
    - schedule(op)            Cron schedule management

  Day:
    - day(op)                 Operations: log, priority, complete, delete, priorities

  Domains:
    - calendar(op)            Calendar operations (list, create, update, delete)
    - contact(op)             Contact operations (search, create, update, enrich, merge, list)
    - email(op)               Email operations (send, draft, accounts, search, read, triage, handle, classification)
    - pet(op)                 Interact with Ember (status, feed, note, play, history)

  Telegram:
    - telegram(op)            Send, read, info, show (visual content rendering)

  Analytics:
    - analytics(op)           Operational metrics (specialists, tools, sessions, resets)
    - lineage(op)             Search Claude's private archive

  Custom Apps:
    - (add your own custom app tools here)
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Path setup for imports
SCRIPT_DIR = Path(__file__).resolve().parent  # .engine/src/adapters/life_mcp
SRC_DIR = SCRIPT_DIR.parents[1]  # .engine/src

# Add .engine/src to path for imports
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# Load environment variables from .env file
from dotenv import load_dotenv
PROJECT_ROOT = SRC_DIR.parent.parent  # claude-os/ (project root)
load_dotenv(PROJECT_ROOT / ".env")

from fastmcp import FastMCP

logger = logging.getLogger(__name__)

# Initialize main server
mcp = FastMCP(name="life")

# =============================================================================
# LIFECYCLE TOOLS (CRITICAL - Claude's survival)
# These have minimal dependencies to ensure they always work
# =============================================================================
try:
    from adapters.life_mcp.tools.lifecycle import mcp as lifecycle_mcp
    mcp.mount(lifecycle_mcp)
except Exception as e:
    logger.error(f"CRITICAL: Failed to load lifecycle tools: {e}")
    raise  # Lifecycle tools are required - fail fast

# =============================================================================
# SYSTEM TOOLS (team, service, mission)
# =============================================================================
try:
    from adapters.life_mcp.tools.system import mcp as system_mcp
    mcp.mount(system_mcp)
except Exception as e:
    logger.warning(f"Failed to load system tools: {e}")

# =============================================================================
# DAY TOOL (timeline + priorities)
# =============================================================================
try:
    from adapters.life_mcp.tools.day import mcp as day_mcp
    mcp.mount(day_mcp)
except Exception as e:
    logger.warning(f"Failed to load day tool: {e}")

# =============================================================================
# DOMAIN TOOLS
# =============================================================================

# Calendar
try:
    from modules.calendar.mcp import mcp as calendar_mcp
    mcp.mount(calendar_mcp)
except Exception as e:
    logger.warning(f"Failed to load calendar tools: {e}")

# Contacts
try:
    from modules.contacts.mcp import mcp as contacts_mcp
    mcp.mount(contacts_mcp)
except Exception as e:
    logger.warning(f"Failed to load contacts tools: {e}")

# Email
try:
    from modules.email.mcp import mcp as email_mcp
    mcp.mount(email_mcp)
except Exception as e:
    logger.warning(f"Failed to load email tools: {e}")

# Messages (iMessage)
try:
    from modules.messages.mcp import mcp as messages_mcp
    mcp.mount(messages_mcp)
except Exception as e:
    logger.warning(f"Failed to load messages tools: {e}")

# Ember (Claude's pet)
try:
    from modules.ember.mcp import mcp as ember_mcp
    mcp.mount(ember_mcp)
except Exception as e:
    logger.warning(f"Failed to load ember tools: {e}")

# =============================================================================
# ANALYTICS TOOLS
# =============================================================================
try:
    from modules.analytics.mcp import mcp as analytics_mcp
    mcp.mount(analytics_mcp)
except Exception as e:
    logger.warning(f"Failed to load analytics tools: {e}")

# =============================================================================
# LINEAGE TOOLS
# =============================================================================
try:
    from modules.lineage.mcp import mcp as lineage_mcp
    mcp.mount(lineage_mcp)
except Exception as e:
    logger.warning(f"Failed to load lineage tools: {e}")

# =============================================================================
# TELEGRAM TOOLS
# =============================================================================
try:
    from adapters.telegram.mcp import mcp as telegram_mcp
    mcp.mount(telegram_mcp)
except Exception as e:
    logger.warning(f"Failed to load telegram tools: {e}")

if __name__ == "__main__":
    mcp.run(transport="stdio")
