#!/usr/bin/env python3
"""Life System MCP Server - Claude's interface to the life system.

This is the composition point for all MCP tool modules.

Tools:
  Core (tools/core.py):
    - team(op)                Operations: spawn, list, peek, close [Chief only]
    - reset(summary, path)    Refresh context - spawn fresh, kill current
    - done(summary)           Work complete - log and close session
    - status(text)            Report what I'm doing (dashboard sidebar)
    - service(op)             Operations: status, restart, logs
    - mission(op)             Operations: list, get, create, enable, disable, run_now

  Life (tools/life.py):
    - contact(op)             Operations: search, create, update, list
    - priority(op)            Operations: create, delete, complete
    - timer(op)               Operations: start, check, stop, list
    - log(section, content)   Atomic append to TODAY.md sections
    - remind(time, message)   Set dashboard reminder
    - email(op)               Email operations (read, draft, send)
    - calendar(op)            Calendar operations (list, create, update)

Architecture:
  server.py (this file) = slim composition point
  tools/helpers.py      = shared utilities
  tools/core.py         = core session/task/system tools
  tools/life.py         = life management tools
"""

from __future__ import annotations

import sys
from pathlib import Path

# Path setup for imports
# server.py is at .engine/src/life_mcp/server.py
SCRIPT_DIR = Path(__file__).resolve().parent  # .engine/src/life_mcp
SRC_DIR = SCRIPT_DIR.parent  # .engine/src
REPO_ROOT = SCRIPT_DIR.parents[2]  # .engine/src/life_mcp → .engine/src → .engine → repo_root

# Add paths for imports
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

# Add .engine/src to path for custom apps and core imports
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from fastmcp import FastMCP

# Import core tool modules
from tools import core, life

# Initialize main server
mcp = FastMCP(name="life")

# Compose all tool modules (mount establishes dynamic connection)
mcp.mount(core.mcp)
mcp.mount(life.mcp)

if __name__ == "__main__":
    mcp.run(transport="stdio")
