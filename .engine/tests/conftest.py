"""
Pytest fixtures for .engine tests.

Provides:
- Test database (isolated from production)
- MCP server test client
- Session fixtures
- Mock tmux (for unit tests)
"""

import os
import sys
import tempfile
import sqlite3
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient

# Add .engine/src to path
ENGINE_ROOT = Path(__file__).parent.parent
SRC_DIR = ENGINE_ROOT / "src"
REPO_ROOT = ENGINE_ROOT.parent

sys.path.insert(0, str(SRC_DIR))


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """Repository root path."""
    return REPO_ROOT


@pytest.fixture(scope="session")
def engine_root() -> Path:
    """Engine root path."""
    return ENGINE_ROOT


@pytest.fixture
def test_db(tmp_path: Path) -> Generator[Path, None, None]:
    """Create an isolated test database.

    Yields path to a temporary SQLite database with schema applied.
    """
    db_path = tmp_path / "test_system.db"

    # Read and apply schema
    schema_path = ENGINE_ROOT / "config" / "schema.sql"
    if schema_path.exists():
        schema = schema_path.read_text()
        conn = sqlite3.connect(db_path)
        conn.executescript(schema)
        conn.close()
    else:
        # Create minimal schema for tests
        conn = sqlite3.connect(db_path)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                role TEXT,
                mode TEXT,
                tmux_pane TEXT,
                status_text TEXT,
                current_state TEXT DEFAULT 'idle',
                conversation_id TEXT,
                mission_execution_id TEXT,
                started_at TEXT,
                ended_at TEXT,
                last_seen_at TEXT,
                updated_at TEXT,
                created_at TEXT
            );

            CREATE TABLE IF NOT EXISTS handoffs (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                role TEXT,
                mode TEXT,
                tmux_pane TEXT,
                handoff_path TEXT,
                reason TEXT,
                conversation_id TEXT,
                status TEXT DEFAULT 'pending',
                requested_at TEXT,
                created_at TEXT,
                updated_at TEXT
            );
        """)
        conn.close()

    yield db_path


@pytest.fixture
def mock_env(test_db: Path, tmp_path: Path) -> Generator[dict, None, None]:
    """Set up environment variables for testing.

    Mocks the environment that MCP tools expect.
    """
    old_env = os.environ.copy()

    test_env = {
        "CLAUDE_SESSION_ID": "test-session-123",
        "CLAUDE_SESSION_ROLE": "builder",
        "CLAUDE_SESSION_MODE": "implementation",
        "CLAUDE_CONVERSATION_ID": "test-conversation",
        "PROJECT_ROOT": str(REPO_ROOT),
        "WORKSPACE": str(tmp_path / "workspace"),
    }

    os.environ.update(test_env)

    # Create workspace
    workspace = tmp_path / "workspace"
    workspace.mkdir(exist_ok=True)

    yield test_env

    # Restore original environment
    os.environ.clear()
    os.environ.update(old_env)


@pytest.fixture
def mcp_server():
    """Get the MCP server instance for testing.

    Returns the FastMCP server with all tools mounted.
    """
    from adapters.life_mcp.server import mcp
    return mcp


class MockTmux:
    """Mock tmux for unit tests that don't need real tmux."""

    def __init__(self):
        self.windows = {}
        self.sent_keys = []
        self.captured_panes = {}

    def create_window(self, name: str, cwd: str = None):
        self.windows[name] = {"cwd": cwd, "content": ""}

    def send_keys(self, target: str, keys: str):
        self.sent_keys.append({"target": target, "keys": keys})

    def capture_pane(self, target: str) -> str:
        return self.captured_panes.get(target, "")

    def set_pane_content(self, target: str, content: str):
        self.captured_panes[target] = content


@pytest.fixture
def mock_tmux() -> MockTmux:
    """Provide a mock tmux for unit tests."""
    return MockTmux()


@pytest.fixture
def app(test_db: Path):
    """FastAPI app configured for tests."""
    from app import create_app
    from core import config as config_module

    original_db_path = config_module.settings.db_path
    config_module.settings.db_path = test_db
    try:
        app_instance = create_app(testing=True)
        yield app_instance
    finally:
        config_module.settings.db_path = original_db_path


@pytest.fixture
def client(app):
    """FastAPI test client."""
    return TestClient(app)
