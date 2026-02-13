"""MCP tool modules.

Structure:
- lifecycle.py  — reset, done, status (CRITICAL - Claude's survival)
- system.py     — team, service (meta-operations)
- timeline.py   — timeline logging
- helpers.py    — shared utilities

Domain tools have moved to modules/*/mcp.py.
App tools have moved to apps/*/mcp.py.
"""

# Don't import modules here - let server.py import directly
__all__ = []
