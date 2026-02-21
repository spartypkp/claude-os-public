"""MCP tool modules.

Structure:
- lifecycle.py  — reset, done, status (CRITICAL - Claude's survival)
- system.py     — team, schedule (meta-operations)
- day.py        — day management (timeline logging + priorities)

Domain tools live in modules/*/mcp.py.
App tools live in apps/*/mcp.py.
"""

# Don't import modules here - let server.py import directly
__all__ = []
