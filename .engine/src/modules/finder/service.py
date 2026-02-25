"""Finder service - File operations with absolute path support.

All paths in the system are absolute. The Desktop/ folder is the primary
browsing root, but any readable path on the machine can be opened.

Security model:
  - Read: any valid path
  - Write/Edit: only within the Claude OS repo root
  - Create/Delete/Move/Rename: only within Desktop/
"""

from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from core.config import settings


class FinderService:
    """File operations with absolute path support."""

    # File type icons (lucide icon names)
    FILE_ICONS = {
        '.md': 'file-text',
        '.txt': 'file-text',
        '.json': 'file-json',
        '.yaml': 'file-cog',
        '.yml': 'file-cog',
        '.py': 'file-code',
        '.ts': 'file-code',
        '.tsx': 'file-code',
        '.js': 'file-code',
        '.jsx': 'file-code',
        '.css': 'file-code',
        '.html': 'file-code',
        '.pdf': 'file',
        '.png': 'image',
        '.jpg': 'image',
        '.jpeg': 'image',
        '.gif': 'image',
        '.webp': 'image',
        '.svg': 'image',
    }

    def __init__(self, db=None):
        """Initialize with optional database connection."""
        self.db = db
        self.desktop_root = settings.repo_root / "Desktop"
        self.repo_root = settings.repo_root

    def _resolve_path(self, path_str: str) -> Path:
        """Resolve a path to an absolute Path.

        Accepts:
          - Absolute paths: $HOME/claude-os/Desktop/foo.md
          - Desktop-relative paths: foo.md, conversations/chief/
          - Repo-relative paths: Desktop/foo.md
        """
        if path_str.startswith("/"):
            # Already absolute
            return Path(path_str).resolve()

        # Check if it starts with Desktop/ (repo-relative)
        if path_str.startswith("Desktop/") or path_str == "Desktop":
            return (self.repo_root / path_str).resolve()

        # Default: resolve relative to Desktop/
        return (self.desktop_root / path_str).resolve()

    def _is_within_repo(self, path: Path) -> bool:
        """Check if a path is within the Claude OS repo."""
        try:
            resolved = path.resolve()
            return str(resolved).startswith(str(self.repo_root.resolve()))
        except (OSError, ValueError):
            return False

    def _is_within_desktop(self, path: Path) -> bool:
        """Check if a path is within Desktop/."""
        try:
            resolved = path.resolve()
            return str(resolved).startswith(str(self.desktop_root.resolve()))
        except (OSError, ValueError):
            return False

    def _require_desktop(self, path: Path, operation: str) -> None:
        """Raise if path is not within Desktop/."""
        if not self._is_within_desktop(path):
            raise ValueError(f"Cannot {operation}: path must be within Desktop/")

    def _get_file_info(self, path: Path) -> Dict[str, Any]:
        """Get file/folder info dictionary. Returns absolute paths."""
        stat = path.stat()
        abs_path = str(path.resolve())

        # Determine type and icon
        is_dir = path.is_dir()
        if is_dir:
            # Check for APP-SPEC.md (Custom App)
            has_app_spec = (path / "APP-SPEC.md").exists()
            # Check for LIFE-SPEC.md (Life Domain)
            has_life_spec = (path / "LIFE-SPEC.md").exists()

            if has_app_spec:
                icon = "layout-grid"  # Custom app icon
                file_type = "app"
            elif has_life_spec:
                icon = "folder-open"  # Life domain folder
                file_type = "domain"
            else:
                icon = "folder"
                file_type = "folder"
        else:
            ext = path.suffix.lower()
            icon = self.FILE_ICONS.get(ext, "file")
            file_type = "file"

        return {
            "name": path.name,
            "path": abs_path,
            "type": file_type,
            "icon": icon,
            "size": stat.st_size if not is_dir else None,
            "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            "created": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
        }

    def list_directory(self, rel_path: str = "") -> Dict[str, Any]:
        """List contents of a directory."""
        full_path = self._resolve_path(rel_path)

        if not full_path.exists():
            raise FileNotFoundError(f"Directory not found: {rel_path}")

        if not full_path.is_dir():
            raise ValueError(f"Not a directory: {rel_path}")

        items = []
        for child in sorted(full_path.iterdir()):
            # Skip hidden files
            if child.name.startswith('.'):
                continue
            # Skip system patterns
            if child.name in settings.skip_patterns:
                continue

            try:
                items.append(self._get_file_info(child))
            except (OSError, IOError):
                continue

        # Sort: folders first, then alphabetically
        items.sort(key=lambda x: (x["type"] not in ("folder", "domain", "app"), x["name"].lower()))

        return {
            "path": str(full_path),
            "items": items,
            "count": len(items),
        }

    def get_file_info(self, rel_path: str) -> Dict[str, Any]:
        """Get detailed info for a file or folder."""
        full_path = self._resolve_path(rel_path)

        if not full_path.exists():
            raise FileNotFoundError(f"Not found: {rel_path}")

        info = self._get_file_info(full_path)

        # Add extra info for folders
        if full_path.is_dir():
            # Count children
            try:
                children = [c for c in full_path.iterdir() if not c.name.startswith('.')]
                info["child_count"] = len(children)
            except (OSError, IOError):
                info["child_count"] = 0

            # Check for spec files
            info["has_app_spec"] = (full_path / "APP-SPEC.md").exists()
            info["has_life_spec"] = (full_path / "LIFE-SPEC.md").exists()

        return info

    def read_file(self, rel_path: str) -> Dict[str, Any]:
        """Read file content."""
        full_path = self._resolve_path(rel_path)

        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {rel_path}")

        if full_path.is_dir():
            raise ValueError(f"Cannot read directory: {rel_path}")

        # Check file size
        stat = full_path.stat()
        if stat.st_size > settings.max_file_size:
            raise ValueError(f"File too large: {stat.st_size} bytes (max {settings.max_file_size})")

        # Determine file type
        ext = full_path.suffix.lower()
        if ext == ".md":
            file_type = "markdown"
        elif ext in {".txt", ".log"}:
            file_type = "text"
        elif ext in {".json", ".yaml", ".yml"}:
            file_type = "config"
        elif ext in {".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".html"}:
            file_type = "code"
        else:
            file_type = "unknown"

        # Read content
        try:
            content = full_path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            raise ValueError("Cannot read binary file")

        return {
            "path": rel_path,
            "content": content,
            "type": file_type,
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        }

    def create_file(self, path_str: str, content: str = "") -> Dict[str, Any]:
        """Create a new file. Must be within Desktop/."""
        full_path = self._resolve_path(path_str)
        self._require_desktop(full_path, "create file")

        if full_path.exists():
            raise FileExistsError(f"Already exists: {path_str}")

        # Ensure parent directory exists
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Write content
        full_path.write_text(content, encoding='utf-8')

        return self._get_file_info(full_path)

    def create_folder(self, path_str: str) -> Dict[str, Any]:
        """Create a new folder. Must be within Desktop/."""
        full_path = self._resolve_path(path_str)
        self._require_desktop(full_path, "create folder")

        if full_path.exists():
            raise FileExistsError(f"Already exists: {path_str}")

        full_path.mkdir(parents=True, exist_ok=True)

        return self._get_file_info(full_path)

    def rename(self, path_str: str, new_name: str) -> Dict[str, Any]:
        """Rename a file or folder. Must be within Desktop/."""
        full_path = self._resolve_path(path_str)
        self._require_desktop(full_path, "rename")

        if not full_path.exists():
            raise FileNotFoundError(f"Not found: {path_str}")

        # Validate new name
        if "/" in new_name or "\\" in new_name:
            raise ValueError("Invalid name: cannot contain path separators")

        new_path = full_path.parent / new_name

        if new_path.exists():
            raise FileExistsError(f"Already exists: {new_name}")

        full_path.rename(new_path)

        return self._get_file_info(new_path)

    def move(self, path_str: str, dest_path: str) -> Dict[str, Any]:
        """Move a file or folder. Both paths must be within Desktop/."""
        source = self._resolve_path(path_str)
        dest = self._resolve_path(dest_path)
        self._require_desktop(source, "move source")
        self._require_desktop(dest, "move destination")

        if not source.exists():
            raise FileNotFoundError(f"Not found: {path_str}")

        # If dest is a directory, move inside it
        if dest.is_dir():
            dest = dest / source.name

        if dest.exists():
            raise FileExistsError(f"Already exists: {dest_path}")

        shutil.move(str(source), str(dest))

        return self._get_file_info(dest)

    def delete(self, path_str: str, recursive: bool = False) -> Dict[str, Any]:
        """Delete a file or folder. Must be within Desktop/."""
        full_path = self._resolve_path(path_str)
        self._require_desktop(full_path, "delete")

        if not full_path.exists():
            raise FileNotFoundError(f"Not found: {path_str}")

        if full_path.is_dir():
            if not recursive:
                # Check if empty
                children = list(full_path.iterdir())
                if children:
                    raise ValueError(f"Directory not empty: {path_str}. Use recursive=True to delete.")
                full_path.rmdir()
            else:
                shutil.rmtree(str(full_path))
        else:
            full_path.unlink()

        return {"deleted": str(full_path)}

    def search(self, query: str, path: str = "") -> List[Dict[str, Any]]:
        """Search for files matching query."""
        start_path = self._resolve_path(path)
        query_lower = query.lower()

        results = []
        for root, dirs, files in os.walk(start_path):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in settings.skip_patterns]

            root_path = Path(root)

            for name in files:
                if query_lower in name.lower():
                    file_path = root_path / name
                    try:
                        results.append(self._get_file_info(file_path))
                    except (OSError, IOError):
                        continue

            for name in dirs:
                if query_lower in name.lower():
                    dir_path = root_path / name
                    try:
                        results.append(self._get_file_info(dir_path))
                    except (OSError, IOError):
                        continue

        # Sort by relevance (exact match first, then contains)
        results.sort(key=lambda x: (
            not x["name"].lower().startswith(query_lower),
            x["name"].lower()
        ))

        return results[:50]  # Limit results

    def upload_file(self, path_str: str, content: bytes) -> Dict[str, Any]:
        """Upload a file (supports binary content like images). Must be within Desktop/.

        Args:
            path_str: Destination path (absolute or Desktop-relative)
            content: File content as bytes

        Returns:
            File info dict for the created file
        """
        full_path = self._resolve_path(path_str)
        self._require_desktop(full_path, "upload")

        if full_path.exists():
            raise FileExistsError(f"Already exists: {path_str}")

        # Ensure parent directory exists
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Write binary content
        full_path.write_bytes(content)

        return self._get_file_info(full_path)
