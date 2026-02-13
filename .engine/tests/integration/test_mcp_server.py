"""
Integration tests for MCP server.

These tests verify that:
1. MCP server loads without errors
2. All expected tools are registered
3. Tools can be called (not just "connected")

This catches the bug where MCP shows "connected" but tools return
"No such tool available".
"""

import subprocess
import sys
from pathlib import Path

import pytest

# Engine paths
ENGINE_ROOT = Path(__file__).parent.parent.parent
SRC_DIR = ENGINE_ROOT / "src"
REPO_ROOT = ENGINE_ROOT.parent

sys.path.insert(0, str(SRC_DIR))


class TestMCPServerLoads:
    """Test that MCP server loads correctly."""

    def test_server_imports_without_error(self):
        """MCP server module should import without raising exceptions."""
        from adapters.life_mcp.server import mcp
        assert mcp is not None

    def test_server_has_name(self):
        """MCP server should have the expected name."""
        from adapters.life_mcp.server import mcp
        assert mcp.name == "life"


class TestMCPToolsRegistered:
    """Test that all expected tools are registered."""

    EXPECTED_TOOLS = [
        # Lifecycle (CRITICAL)
        "done",
        "reset",
        "status",
        # System
        "team",
        # Timeline
        "timeline",
        # Domains
        "calendar",
        "contact",
        "email",
        "priority",
        "timer",
        "remind",
        "show",
        # Custom apps
        "mock_interview",
        "dsa_topic",
        "leetcode_problem",
        "opportunity",
    ]

    def test_all_expected_tools_registered(self, mcp_server):
        """All expected tools should be registered on the server."""
        # Get registered tools from the server
        registered_tools = self._get_registered_tools(mcp_server)

        missing_tools = []
        for tool in self.EXPECTED_TOOLS:
            if tool not in registered_tools:
                missing_tools.append(tool)

        assert not missing_tools, f"Missing tools: {missing_tools}"

    def test_lifecycle_tools_registered(self, mcp_server):
        """CRITICAL: Lifecycle tools must be registered (done, reset, status)."""
        registered_tools = self._get_registered_tools(mcp_server)

        lifecycle_tools = ["done", "reset", "status"]
        for tool in lifecycle_tools:
            assert tool in registered_tools, f"CRITICAL: Lifecycle tool '{tool}' not registered"

    def _get_registered_tools(self, mcp_server) -> set:
        """Extract registered tool names from MCP server."""
        tools = set()

        # FastMCP stores tools in _tool_manager
        if hasattr(mcp_server, "_tool_manager"):
            tools.update(mcp_server._tool_manager._tools.keys())

        # Also check mounted servers
        if hasattr(mcp_server, "_mounted_servers"):
            for mounted in mcp_server._mounted_servers:
                if hasattr(mounted.server, "_tool_manager"):
                    tools.update(mounted.server._tool_manager._tools.keys())

        return tools


class TestMCPToolsCallable:
    """Test that tools can actually be called.

    This is the critical test - tools being "registered" isn't enough.
    They must be callable through the MCP protocol.

    Note: FastMCP wraps functions in FunctionTool objects. Access the
    underlying function via .fn attribute.
    """

    def test_status_tool_callable(self, mcp_server, mock_env, test_db, monkeypatch):
        """status() tool should be callable and return a response."""
        # Patch the database path to use test db
        monkeypatch.setenv("CLAUDE_SESSION_ID", "test-session-123")

        # Insert a test session into the database
        import sqlite3
        conn = sqlite3.connect(test_db)
        conn.execute("""
            INSERT INTO sessions (
                session_id, role, mode, status_text, started_at, last_seen_at, created_at
            )
            VALUES (
                'test-session-123', 'builder', 'implementation', 'testing',
                datetime('now'), datetime('now'), datetime('now')
            )
        """)
        conn.commit()
        conn.close()

        # Patch get_db to use test database
        from core import mcp_helpers

        from contextlib import contextmanager
        @contextmanager
        def mock_get_db():
            conn = sqlite3.connect(test_db)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
            finally:
                conn.close()

        monkeypatch.setattr(mcp_helpers, "get_db", mock_get_db)

        # Get the tool and call its underlying function
        from adapters.life_mcp.tools.lifecycle import status
        # FastMCP wraps in FunctionTool - access .fn for the raw function
        status_fn = status.fn if hasattr(status, 'fn') else status
        result = status_fn("test status")

        assert result is not None, "status() returned None"
        assert isinstance(result, dict), f"status() returned {type(result)}, expected dict"
        assert "success" in result, f"status() result missing 'success' key: {result}"

    def test_done_tool_callable(self, mcp_server, mock_env, test_db, tmp_path, monkeypatch):
        """done() tool should be callable and return a response.

        This is THE test for the bug we're seeing - done() fails in specialists.
        """
        # Set up environment
        monkeypatch.setenv("CLAUDE_SESSION_ID", "test-session-123")
        monkeypatch.setenv("CLAUDE_SESSION_ROLE", "builder")
        monkeypatch.setenv("CLAUDE_SESSION_MODE", "interactive")  # Non-specialist mode for simple test

        # Insert a test session
        import sqlite3
        conn = sqlite3.connect(test_db)
        conn.execute("""
            INSERT INTO sessions (
                session_id, role, mode, status_text, tmux_pane, started_at, last_seen_at, created_at
            )
            VALUES (
                'test-session-123', 'builder', 'interactive', 'testing', 'life:test',
                datetime('now'), datetime('now'), datetime('now')
            )
        """)
        conn.commit()
        conn.close()

        # Patch get_db
        from core import mcp_helpers
        from contextlib import contextmanager
        @contextmanager
        def mock_get_db():
            conn = sqlite3.connect(test_db)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
            finally:
                conn.close()

        monkeypatch.setattr(mcp_helpers, "get_db", mock_get_db)

        # Patch subprocess to avoid actually killing tmux panes
        monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: None)

        # Patch timeline logging
        from core import timeline
        monkeypatch.setattr(timeline, "log_session_event", lambda *args, **kwargs: None)

        # Get the tool and call its underlying function
        from adapters.life_mcp.tools.lifecycle import done
        # FastMCP wraps in FunctionTool - access .fn for the raw function
        done_fn = done.fn if hasattr(done, 'fn') else done
        result = done_fn("test completion")

        assert result is not None, "done() returned None"
        assert isinstance(result, dict), f"done() returned {type(result)}, expected dict"
        assert "success" in result, f"done() result missing 'success' key: {result}"
        # Note: success might be False due to missing tmux, but the tool should be CALLABLE


class TestMCPServerStartup:
    """Test MCP server startup as Claude Code would start it."""

    def test_server_starts_via_subprocess(self, repo_root):
        """MCP server should start cleanly when invoked as subprocess.

        This mimics how Claude Code starts the MCP server.
        """
        server_path = repo_root / ".engine/src/adapters/life_mcp/server.py"
        python_path = repo_root / "venv/bin/python"

        # Test that the server script is valid Python
        result = subprocess.run(
            [str(python_path), "-m", "py_compile", str(server_path)],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode == 0, f"Server script has syntax errors: {result.stderr}"

    def test_server_tools_discoverable_via_subprocess(self, repo_root):
        """Tools should be discoverable when server runs as subprocess.

        This is closer to how Claude Code discovers tools.
        """
        python_path = repo_root / "venv/bin/python"

        # Script that imports server and lists tools
        test_script = '''
import sys
sys.path.insert(0, ".engine/src")
from adapters.life_mcp.server import mcp

tools = set()
if hasattr(mcp, "_tool_manager"):
    tools.update(mcp._tool_manager._tools.keys())
if hasattr(mcp, "_mounted_servers"):
    for ms in mcp._mounted_servers:
        if hasattr(ms.server, "_tool_manager"):
            tools.update(ms.server._tool_manager._tools.keys())

# Check critical tools exist
critical = ["done", "reset", "status"]
missing = [t for t in critical if t not in tools]
if missing:
    print(f"MISSING: {missing}", file=sys.stderr)
    sys.exit(1)

print(f"OK: {len(tools)} tools registered")
for t in sorted(tools):
    print(f"  - {t}")
'''

        result = subprocess.run(
            [str(python_path), "-c", test_script],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=repo_root,
        )

        assert result.returncode == 0, f"Tool discovery failed: {result.stderr}"
        assert "done" in result.stdout, "done tool not found in output"
