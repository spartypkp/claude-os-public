"""Configuration settings for the unified backend."""
from pathlib import Path
from typing import List


def find_repo_root() -> Path:
    """Find repo root by looking for CLAUDE.md marker file."""
    current = Path(__file__).resolve().parent
    for _ in range(10):  # Max 10 levels up
        if (current / "CLAUDE.md").exists():
            return current
        if current.parent == current:
            break
        current = current.parent
    raise RuntimeError("Could not find repo root (no CLAUDE.md found)")


class Settings:
    """Application settings derived from environment/defaults."""

    def __init__(self):
        # Find repo root by marker file (robust to file moves)
        self.repo_root = find_repo_root()
        self.engine_dir = self.repo_root / ".engine"

        # Data paths
        self.data_dir = self.engine_dir / "data"
        self.db_path = self.data_dir / "db" / "system.db"
        self.outputs_dir = self.data_dir / "outputs"
        self.logs_dir = self.data_dir / "logs"

        # Config paths
        self.config_dir = self.engine_dir / "config"
        self.schema_path = self.config_dir / "schema.sql"

        # Server
        self.host = "0.0.0.0"
        self.port = 5001

        # Watcher settings
        # Note: watch_dirs is documentation only - actual paths in loops/watcher.py
        self.watch_dirs: List[str] = [
            "Desktop",              # LIFE-SPEC.md, APP-SPEC.md, contacts/
            ".claude/guides",       # Guide markdown files
            ".engine/data",         # system.db changes
            ".engine/src",          # SYSTEM-SPEC.md files
            ".engine/config",       # SYSTEM-SPEC.md in config/
        ]
        self.watcher_debounce_ms = 1600  # Batch changes within this window

        # Executor settings (Background Workers)
        self.executor_poll_interval = 60  # seconds between polling for new tasks
        self.executor_batch_size = 10  # max concurrent Background Workers

        # File browser settings (Desktop/ includes both user content and protected folders)
        self.root_dirs = ["Desktop"]
        self.allowed_extensions = {
            # Documents
            ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".pdf",
            # Code
            ".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".html",
            # Images
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
            ".heic", ".heif",  # Apple HEIC format
            # Video
            ".mp4", ".webm", ".mov", ".avi", ".mkv",
            # Audio
            ".mp3", ".wav", ".ogg", ".m4a", ".flac",
            # Microsoft Office
            ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            # Data
            ".csv", ".tsv",
            # Archives
            ".zip",
            # Notebooks
            ".ipynb",
        }
        self.skip_patterns = {
            "__pycache__", ".git", "node_modules", ".venv", "venv", ".cache", ".DS_Store", ".next"
        }
        self.max_file_size = 100 * 1024 * 1024  # 100MB (for videos)

        # Claude system files and folders (displayed with orange badge, protected from deletion)
        self.claude_system_files = {
            "TODAY.md", "MEMORY.md", "IDENTITY.md", "SYSTEM-INDEX.md"
        }
        self.claude_system_folders = {
            "sessions", "working", "prepared", "logs"
        }


settings = Settings()
