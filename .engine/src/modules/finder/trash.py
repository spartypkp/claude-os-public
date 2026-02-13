"""Trash service - Soft delete with restore capability."""

from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.config import settings


class TrashService:
    """
    Manages soft-deleted files in a .trash folder with a manifest.

    Structure:
        Desktop/.trash/
        ├── manifest.json    # Tracks original paths, deletion times
        └── {uuid}/          # Each trashed item gets unique folder
            └── {original_name}
    """
    
    # Days before auto-emptying (0 = never)
    AUTO_EMPTY_DAYS = 30
    
    def __init__(self, db=None):
        """Initialize trash service."""
        self.db = db
        self.trash_root = settings.repo_root / "Desktop" / ".trash"
        self.manifest_path = self.trash_root / "manifest.json"
        self.desktop_root = settings.repo_root / "Desktop"
        
        # Ensure trash folder exists
        self.trash_root.mkdir(parents=True, exist_ok=True)
        
        # Initialize manifest if needed
        if not self.manifest_path.exists():
            self._write_manifest([])
    
    def _read_manifest(self) -> List[Dict[str, Any]]:
        """Read the trash manifest."""
        try:
            return json.loads(self.manifest_path.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, FileNotFoundError):
            return []
    
    def _write_manifest(self, items: List[Dict[str, Any]]) -> None:
        """Write the trash manifest."""
        self.manifest_path.write_text(
            json.dumps(items, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )
    
    def _resolve_desktop_path(self, rel_path: str) -> Path:
        """Resolve path relative to Desktop/, ensuring security."""
        if rel_path.startswith("/"):
            rel_path = rel_path[1:]
        
        # Strip "Desktop/" prefix if present (frontend sends full paths)
        if rel_path.startswith("Desktop/"):
            rel_path = rel_path[8:]  # len("Desktop/") = 8
        
        full_path = (self.desktop_root / rel_path).resolve()
        
        if not str(full_path).startswith(str(self.desktop_root.resolve())):
            raise ValueError("Invalid path: cannot escape Desktop/")
        
        return full_path
    
    def trash(self, rel_path: str) -> Dict[str, Any]:
        """
        Move a file or folder to trash.
        
        Returns info about the trashed item including its trash ID for restore.
        """
        source = self._resolve_desktop_path(rel_path)
        
        if not source.exists():
            raise FileNotFoundError(f"Not found: {rel_path}")
        
        # Generate unique ID for this trash operation
        trash_id = str(uuid.uuid4())[:8]
        
        # Create folder for this item
        item_folder = self.trash_root / trash_id
        item_folder.mkdir(parents=True, exist_ok=True)
        
        # Move to trash
        dest = item_folder / source.name
        shutil.move(str(source), str(dest))
        
        # Get item info
        stat = dest.stat()
        is_dir = dest.is_dir()
        
        # Calculate size (recursively for folders)
        if is_dir:
            size = sum(f.stat().st_size for f in dest.rglob('*') if f.is_file())
        else:
            size = stat.st_size
        
        # Create manifest entry
        entry = {
            "id": trash_id,
            "name": source.name,
            "original_path": rel_path,
            "type": "folder" if is_dir else "file",
            "size": size,
            "trashed_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Update manifest
        manifest = self._read_manifest()
        manifest.append(entry)
        self._write_manifest(manifest)
        
        return entry
    
    def restore(self, trash_id: str, dest_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Restore an item from trash.
        
        Args:
            trash_id: The ID of the trashed item
            dest_path: Optional new path (defaults to original path)
        
        Returns info about the restored item.
        """
        manifest = self._read_manifest()
        
        # Find the item
        entry = None
        for item in manifest:
            if item["id"] == trash_id:
                entry = item
                break
        
        if not entry:
            raise FileNotFoundError(f"Trash item not found: {trash_id}")
        
        # Find the trashed file
        item_folder = self.trash_root / trash_id
        if not item_folder.exists():
            # Remove from manifest if folder is gone
            manifest = [i for i in manifest if i["id"] != trash_id]
            self._write_manifest(manifest)
            raise FileNotFoundError(f"Trash data missing for: {trash_id}")
        
        # Find the actual file/folder in the item folder
        trashed_items = list(item_folder.iterdir())
        if not trashed_items:
            raise FileNotFoundError(f"Trash folder empty: {trash_id}")
        
        source = trashed_items[0]  # Should only be one item
        
        # Determine destination
        if dest_path:
            dest = self._resolve_desktop_path(dest_path)
        else:
            dest = self._resolve_desktop_path(entry["original_path"])
        
        # Handle conflicts
        if dest.exists():
            # Add suffix to avoid overwrite
            base = dest.stem
            ext = dest.suffix
            counter = 1
            while dest.exists():
                dest = dest.parent / f"{base} ({counter}){ext}"
                counter += 1
        
        # Ensure parent exists
        dest.parent.mkdir(parents=True, exist_ok=True)
        
        # Move back
        shutil.move(str(source), str(dest))
        
        # Clean up item folder
        item_folder.rmdir()
        
        # Update manifest
        manifest = [i for i in manifest if i["id"] != trash_id]
        self._write_manifest(manifest)
        
        # Return info about restored item
        rel_path = str(dest.relative_to(self.desktop_root))
        return {
            "id": trash_id,
            "name": dest.name,
            "restored_to": rel_path,
            "original_path": entry["original_path"],
        }
    
    def list_trash(self) -> Dict[str, Any]:
        """List all items in trash."""
        manifest = self._read_manifest()
        
        # Validate entries (remove any with missing files)
        valid_items = []
        changed = False
        
        for entry in manifest:
            item_folder = self.trash_root / entry["id"]
            if item_folder.exists() and list(item_folder.iterdir()):
                valid_items.append(entry)
            else:
                changed = True
        
        if changed:
            self._write_manifest(valid_items)
        
        # Sort by trashed_at (newest first)
        valid_items.sort(key=lambda x: x["trashed_at"], reverse=True)
        
        # Calculate total size
        total_size = sum(item.get("size", 0) for item in valid_items)
        
        return {
            "items": valid_items,
            "count": len(valid_items),
            "total_size": total_size,
        }
    
    def empty_trash(self, older_than_days: Optional[int] = None) -> Dict[str, Any]:
        """
        Permanently delete items from trash.
        
        Args:
            older_than_days: Only delete items older than this. None = delete all.
        
        Returns count of deleted items.
        """
        manifest = self._read_manifest()
        deleted_count = 0
        remaining = []
        
        now = datetime.now(timezone.utc)
        
        for entry in manifest:
            should_delete = True
            
            if older_than_days is not None:
                trashed_at = datetime.fromisoformat(entry["trashed_at"])
                age_days = (now - trashed_at).days
                should_delete = age_days >= older_than_days
            
            if should_delete:
                # Delete the folder
                item_folder = self.trash_root / entry["id"]
                if item_folder.exists():
                    shutil.rmtree(str(item_folder))
                deleted_count += 1
            else:
                remaining.append(entry)
        
        self._write_manifest(remaining)
        
        return {
            "deleted_count": deleted_count,
            "remaining_count": len(remaining),
        }
    
    def permanent_delete(self, trash_id: str) -> Dict[str, Any]:
        """Permanently delete a specific item from trash."""
        manifest = self._read_manifest()
        
        # Find and remove from manifest
        entry = None
        remaining = []
        for item in manifest:
            if item["id"] == trash_id:
                entry = item
            else:
                remaining.append(item)
        
        if not entry:
            raise FileNotFoundError(f"Trash item not found: {trash_id}")
        
        # Delete the folder
        item_folder = self.trash_root / trash_id
        if item_folder.exists():
            shutil.rmtree(str(item_folder))
        
        self._write_manifest(remaining)
        
        return {
            "deleted": trash_id,
            "name": entry["name"],
        }
    
    def get_trash_info(self, trash_id: str) -> Dict[str, Any]:
        """Get info about a specific trashed item."""
        manifest = self._read_manifest()
        
        for entry in manifest:
            if entry["id"] == trash_id:
                return entry
        
        raise FileNotFoundError(f"Trash item not found: {trash_id}")

