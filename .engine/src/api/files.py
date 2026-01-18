"""File browser endpoints with SSE for real-time sync."""
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from config import settings
from utils.sse_bus import sse_bus

router = APIRouter()


def build_file_tree(path: Path, depth: int = 0, max_depth: int = 8) -> Optional[Dict[str, Any]]:
    """Recursively build a file tree structure."""
    if depth > max_depth:
        return None

    # Skip hidden files and excluded patterns
    if path.name.startswith('.') or path.name in settings.skip_patterns:
        return None

    rel_path = str(path.relative_to(settings.repo_root))

    if path.is_dir():
        children = []
        try:
            for child in sorted(path.iterdir()):
                child_node = build_file_tree(child, depth + 1, max_depth)
                if child_node:
                    children.append(child_node)
        except PermissionError:
            pass

        # Always show directories at depth 0 (root) and depth 1 (Desktop children)
        # For deeper directories, only show if they have children
        if children or depth <= 1:
            is_system = path.name in settings.claude_system_folders
            return {
                "name": path.name,
                "path": rel_path,
                "type": "directory",
                "children": children,
                "isSystem": is_system,
            }
        return None
    else:
        # Check if file extension is allowed
        if path.suffix.lower() not in settings.allowed_extensions:
            return None

        # Skip large files
        try:
            if path.stat().st_size > settings.max_file_size:
                return None
        except (OSError, IOError):
            return None

        is_system = path.name in settings.claude_system_files
        return {
            "name": path.name,
            "path": rel_path,
            "type": "file",
            "isSystem": is_system,
        }


@router.get("/tree")
async def files_tree():
    """Return directory structure for Desktop/ and Workspace/."""
    tree = []
    for dir_name in settings.root_dirs:
        dir_path = settings.repo_root / dir_name
        if dir_path.exists():
            node = build_file_tree(dir_path, depth=0, max_depth=4)
            if node:
                tree.append(node)
    return tree


@router.get("/list/{dir_path:path}")
async def files_list(dir_path: str):
    """Return list of files in a directory."""
    dir_path = unquote(dir_path)

    # Security: ensure path doesn't escape repo
    full_path = (settings.repo_root / dir_path).resolve()
    if not str(full_path).startswith(str(settings.repo_root.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Directory not found")

    if not full_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    files = []
    try:
        for child in sorted(full_path.iterdir()):
            if child.name.startswith('.'):
                continue
            rel_path = str(child.relative_to(settings.repo_root))
            files.append({
                "name": child.name,
                "path": rel_path,
                "type": "directory" if child.is_dir() else "file"
            })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {"files": files}


# =========================================
# SSE ENDPOINT - Real-time file change notifications
# =========================================

@router.get("/events")
async def file_events_stream(request: Request):
    """
    SSE endpoint for real-time filesystem change notifications.

    Pushes events when Desktop/ files are created, modified, or deleted.
    Events include path and mtime for conflict detection.

    Event types: created, modified, deleted, moved
    Data format: {"path": "Desktop/TODAY.md", "mtime": "2026-01-05T10:30:00+00:00"}
    """
    async def event_generator():
        queue = sse_bus.subscribe()
        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break

                try:
                    # Wait for event or timeout for heartbeat
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {
                        "event": event.event_type,
                        "data": event.to_json()
                    }
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"timestamp": datetime.now(timezone.utc).isoformat()})
                    }
        finally:
            sse_bus.unsubscribe(queue)

    return EventSourceResponse(event_generator())


# =========================================
# FILE CONTENT ENDPOINTS
# =========================================

@router.get("/content/{file_path:path}")
async def files_content(file_path: str):
    """Return file content for a given path."""
    file_path = unquote(file_path)

    # Security: ensure path doesn't escape repo
    full_path = (settings.repo_root / file_path).resolve()
    if not str(full_path).startswith(str(settings.repo_root.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if full_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")

    # Check file size
    try:
        if full_path.stat().st_size > settings.max_file_size:
            raise HTTPException(status_code=400, detail="File too large (>100KB)")
    except (OSError, IOError):
        raise HTTPException(status_code=500, detail="Cannot read file")

    # Determine file type
    ext = full_path.suffix.lower()
    if ext == ".md":
        file_type = "markdown"
    elif ext in {".txt", ".log"}:
        file_type = "text"
    else:
        file_type = "code"

    # Read content
    try:
        content = full_path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not text")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read file: {str(e)}")

    # Get mtime for conflict detection
    try:
        stat = full_path.stat()
        mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
    except (OSError, IOError):
        mtime = datetime.now(timezone.utc).isoformat()

    return {
        "path": file_path,
        "content": content,
        "type": file_type,
        "mtime": mtime
    }


from pydantic import BaseModel


class FileUpdateRequest(BaseModel):
    content: str
    expected_mtime: Optional[str] = None  # For conflict detection


@router.put("/content/{file_path:path}")
async def update_file_content(file_path: str, request: FileUpdateRequest):
    """
    Update file content. Only allowed for Desktop/ and Workspace/ files.

    If expected_mtime is provided, checks if file was modified since read.
    Returns 409 Conflict if file was modified externally.
    """
    file_path = unquote(file_path)

    # Security: ensure path doesn't escape repo
    full_path = (settings.repo_root / file_path).resolve()
    if not str(full_path).startswith(str(settings.repo_root.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    # Security: only allow writes to Desktop/ and Workspace/
    allowed_prefixes = ["Desktop/", "Workspace/"]
    if not any(file_path.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Can only edit files in Desktop/ or Workspace/")

    # Don't allow writing to locked sections (check for <!-- BEGIN --> markers)
    if "<!-- BEGIN " in request.content and "<!-- END " in request.content:
        raise HTTPException(status_code=400, detail="Cannot write to files with locked sections")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if full_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")

    # Only allow editing text files
    ext = full_path.suffix.lower()
    if ext not in {".md", ".txt", ".yaml", ".yml", ".json"}:
        raise HTTPException(status_code=400, detail=f"Cannot edit {ext} files")

    # Conflict detection: check if file was modified since read
    if request.expected_mtime:
        try:
            current_mtime = datetime.fromtimestamp(
                full_path.stat().st_mtime, tz=timezone.utc
            ).isoformat()
            if current_mtime != request.expected_mtime:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "conflict",
                        "message": "File was modified externally",
                        "current_mtime": current_mtime,
                        "expected_mtime": request.expected_mtime,
                    }
                )
        except HTTPException:
            raise
        except Exception:
            pass  # If we can't check mtime, proceed with write

    # Write content
    try:
        full_path.write_text(request.content, encoding='utf-8')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot write file: {str(e)}")

    # Return new mtime for subsequent edits
    try:
        new_mtime = datetime.fromtimestamp(
            full_path.stat().st_mtime, tz=timezone.utc
        ).isoformat()
    except (OSError, IOError):
        new_mtime = datetime.now(timezone.utc).isoformat()

    return {"success": True, "path": file_path, "mtime": new_mtime}


# =========================================
# SIMPLE READ/APPEND ENDPOINTS (for Dashboard)
# =========================================

@router.get("/read")
async def read_file_simple(path: str):
    """Simple file read endpoint using query param."""
    # Security: ensure path doesn't escape repo
    full_path = (settings.repo_root / path).resolve()
    if not str(full_path).startswith(str(settings.repo_root.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not full_path.exists():
        return {"content": "", "exists": False}

    if full_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")

    try:
        content = full_path.read_text(encoding='utf-8')
        return {"content": content, "exists": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read file: {str(e)}")


class FileAppendRequest(BaseModel):
    path: str
    content: str


@router.post("/append")
async def append_to_file(request: FileAppendRequest):
    """Append content to a file (creates if doesn't exist)."""
    # Security: ensure path doesn't escape repo
    full_path = (settings.repo_root / request.path).resolve()
    if not str(full_path).startswith(str(settings.repo_root.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    # Security: only allow writes to Desktop/ and Workspace/
    allowed_prefixes = ["Desktop/", "Workspace/"]
    if not any(request.path.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Can only append to files in Desktop/ or Workspace/")

    # Only allow appending to text files
    ext = full_path.suffix.lower()
    if ext not in {".md", ".txt", ".yaml", ".yml", ".json"}:
        raise HTTPException(status_code=400, detail=f"Cannot append to {ext} files")

    try:
        # Create parent directories if needed
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Append content
        with open(full_path, 'a', encoding='utf-8') as f:
            f.write(request.content)
        
        return {"success": True, "path": request.path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot append to file: {str(e)}")
