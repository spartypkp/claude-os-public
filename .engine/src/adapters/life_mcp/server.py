#!/usr/bin/env python3
"""Life System MCP Server - Claude's interface to the life system.

This is the composition point for all MCP tool modules.

Structure:
  adapters/life_mcp/
  ├── server.py          ← This file: pure composition
  └── tools/
      ├── lifecycle.py   ← reset, done, status (CRITICAL - Claude's survival)
      ├── system.py      ← team, service (meta-operations)
      ├── timeline.py    ← timeline logging
      └── helpers.py     ← shared utilities

  modules/*/mcp.py       ← Domain tools (calendar, contacts, email, etc.)

Tools:
  Lifecycle (CRITICAL):
    - reset(summary, path)    Refresh context - spawn fresh, kill current
    - done(summary)           Work complete - log and close session
    - status(text)            Report what I'm doing (dashboard sidebar)

  System:
    - team(op)                Operations: spawn, list, peek, close [Chief only]

  Domains:
    - calendar(op)            Calendar operations (list, create, update, delete)
    - contact(op)             Contact operations (search, create, update, enrich, merge, list)
    - email(op)               Email operations (send, draft, read, search, unread, etc.)
    - priority(op)            Priority operations (create, delete, complete)
    - show(what)              Render visual output (calendar, contact, etc.)
    - timeline(description)   Add entry to day timeline
    - pet(op)                 Interact with Ember (status, feed, note, play, history)

  Custom Apps:
    - mock_interview(op)      Mock interview tracking
    - dsa_topic(op)           DS&A topic confidence + practice
    - leetcode_problem(op)    Problem + attempt tracking
    - opportunity(op)         Job opportunity management
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
# TIMELINE TOOL
# =============================================================================
try:
    from adapters.life_mcp.tools.timeline import mcp as timeline_mcp
    mcp.mount(timeline_mcp)
except Exception as e:
    logger.warning(f"Failed to load timeline tool: {e}")

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

# Priorities
try:
    from modules.priorities.mcp import mcp as priorities_mcp
    mcp.mount(priorities_mcp)
except Exception as e:
    logger.warning(f"Failed to load priorities tools: {e}")

# Show
try:
    from modules.show.mcp import mcp as show_mcp
    mcp.mount(show_mcp)
except Exception as e:
    logger.warning(f"Failed to load show tools: {e}")

# =============================================================================
# CUSTOM APP TOOLS
# =============================================================================

if __name__ == "__main__":
    mcp.run(transport="stdio")
