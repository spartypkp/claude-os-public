"""Finder service - File operations for Desktop/."""

from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.config import settings


class FinderService:
    """File operations for Desktop/ folder."""
    
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
    
    def __init__(self, db):
        """Initialize with database connection (unused for now)."""
        self.db = db
        self.desktop_root = settings.repo_root / "Desktop"
    
    def _resolve_path(self, rel_path: str) -> Path:
        """Resolve path relative to Desktop/, ensuring security."""
        if rel_path.startswith("/"):
            rel_path = rel_path[1:]
        
        # Build full path
        full_path = (self.desktop_root / rel_path).resolve()
        
        # Security: ensure path doesn't escape Desktop/
        if not str(full_path).startswith(str(self.desktop_root.resolve())):
            raise ValueError("Invalid path: cannot escape Desktop/")
        
        return full_path
    
    def _get_file_info(self, path: Path) -> Dict[str, Any]:
        """Get file/folder info dictionary."""
        stat = path.stat()
        rel_path = str(path.relative_to(self.desktop_root))
        
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
            "path": rel_path,
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
            "path": rel_path or "/",
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
    
    def create_file(self, rel_path: str, content: str = "") -> Dict[str, Any]:
        """Create a new file."""
        full_path = self._resolve_path(rel_path)
        
        if full_path.exists():
            raise FileExistsError(f"Already exists: {rel_path}")
        
        # Ensure parent directory exists
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write content
        full_path.write_text(content, encoding='utf-8')
        
        return self._get_file_info(full_path)
    
    def create_folder(self, rel_path: str) -> Dict[str, Any]:
        """Create a new folder."""
        full_path = self._resolve_path(rel_path)
        
        if full_path.exists():
            raise FileExistsError(f"Already exists: {rel_path}")
        
        full_path.mkdir(parents=True, exist_ok=True)
        
        return self._get_file_info(full_path)
    
    def rename(self, rel_path: str, new_name: str) -> Dict[str, Any]:
        """Rename a file or folder."""
        full_path = self._resolve_path(rel_path)
        
        if not full_path.exists():
            raise FileNotFoundError(f"Not found: {rel_path}")
        
        # Validate new name
        if "/" in new_name or "\\" in new_name:
            raise ValueError("Invalid name: cannot contain path separators")
        
        new_path = full_path.parent / new_name
        
        if new_path.exists():
            raise FileExistsError(f"Already exists: {new_name}")
        
        full_path.rename(new_path)
        
        return self._get_file_info(new_path)
    
    def move(self, rel_path: str, dest_path: str) -> Dict[str, Any]:
        """Move a file or folder to a new location."""
        source = self._resolve_path(rel_path)
        dest = self._resolve_path(dest_path)
        
        if not source.exists():
            raise FileNotFoundError(f"Not found: {rel_path}")
        
        # If dest is a directory, move inside it
        if dest.is_dir():
            dest = dest / source.name
        
        if dest.exists():
            raise FileExistsError(f"Already exists: {dest_path}")
        
        shutil.move(str(source), str(dest))
        
        return self._get_file_info(dest)
    
    def delete(self, rel_path: str, recursive: bool = False) -> Dict[str, Any]:
        """Delete a file or folder."""
        full_path = self._resolve_path(rel_path)
        
        if not full_path.exists():
            raise FileNotFoundError(f"Not found: {rel_path}")
        
        if full_path.is_dir():
            if not recursive:
                # Check if empty
                children = list(full_path.iterdir())
                if children:
                    raise ValueError(f"Directory not empty: {rel_path}. Use recursive=True to delete.")
                full_path.rmdir()
            else:
                shutil.rmtree(str(full_path))
        else:
            full_path.unlink()
        
        return {"deleted": rel_path}
    
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
    
    def upload_file(self, rel_path: str, content: bytes) -> Dict[str, Any]:
        """Upload a file (supports binary content like images).
        
        Args:
            rel_path: Destination path relative to Desktop/
            content: File content as bytes
        
        Returns:
            File info dict for the created file
        """
        full_path = self._resolve_path(rel_path)
        
        if full_path.exists():
            raise FileExistsError(f"Already exists: {rel_path}")
        
        # Ensure parent directory exists
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write binary content
        full_path.write_bytes(content)
        
        return self._get_file_info(full_path)

