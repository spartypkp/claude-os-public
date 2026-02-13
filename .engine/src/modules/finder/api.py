"""Finder API - REST endpoints for file browsing and management.

Combines:
- File CRUD (list, read, create, rename, move, delete)
- File tree for recursive browsing
- Trash operations (soft delete with restore)
- Real-time file change notifications (SSE)
- File upload (binary support)
"""
import asyncio
import json
import mimetypes
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from core.config import settings
from core.events import sse_bus

from .service import FinderService
from .trash import TrashService

router = APIRouter(tags=["files"])

# Services (lazy initialized)
_finder_service: Optional[FinderService] = None
_trash_service: Optional[TrashService] = None


def get_finder_service() -> FinderService:
    """Get the finder service, creating if needed."""
    global _finder_service
    if _finder_service is None:
        _finder_service = FinderService()
    return _finder_service


def get_trash_service() -> TrashService:
    """Get the trash service, creating if needed."""
    global _trash_service
    if _trash_service is None:
        _trash_service = TrashService()
    return _trash_service


async def _run_blocking(fn, *args, **kwargs):
    """Run blocking filesystem operations in a thread."""
    return await asyncio.to_thread(fn, *args, **kwargs)


# ============================================
# Pydantic models
# ============================================

class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


class CreateFolderRequest(BaseModel):
    path: str


class RenameRequest(BaseModel):
    new_name: str


class MoveRequest(BaseModel):
    dest_path: str


class SearchRequest(BaseModel):
    query: str
    path: str = ""


class FileUpdateRequest(BaseModel):
    content: str
    expected_mtime: Optional[str] = None  # For conflict detection


class FileAppendRequest(BaseModel):
    path: str
    content: str


class OpenFileRequest(BaseModel):
    path: str
    reveal: bool = False


class TrashRequest(BaseModel):
    path: str


class RestoreRequest(BaseModel):
    dest_path: Optional[str] = None


class EmptyTrashRequest(BaseModel):
    older_than_days: Optional[int] = None


# ============================================
# File tree helper (for recursive view)
# ============================================

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


# ============================================
# File tree endpoints
# ============================================

@router.get("/tree")
async def files_tree(max_depth: int = Query(4, ge=1, le=8)):
    """Return directory structure for Desktop/ and Workspace/."""
    def _build_tree():
        tree = []
        for dir_name in settings.root_dirs:
            dir_path = settings.repo_root / dir_name
            if dir_path.exists():
                node = build_file_tree(dir_path, depth=0, max_depth=max_depth)
                if node:
                    tree.append(node)
        return tree

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _build_tree)


# ============================================
# File CRUD endpoints
# ============================================

@router.get("/list")
async def list_root():
    """List root Desktop/ directory."""
    try:
        return await _run_blocking(get_finder_service().list_directory, "")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/{path:path}")
async def list_directory(path: str):
    """List contents of a directory."""
    try:
        return await _run_blocking(get_finder_service().list_directory, path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info/{path:path}")
async def get_info(path: str):
    """Get detailed info for a file or folder."""
    try:
        return await _run_blocking(get_finder_service().get_file_info, path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/read/{path:path}")
async def read_file(path: str):
    """Read file content."""
    try:
        return await _run_blocking(get_finder_service().read_file, path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/raw/{path:path}")
async def raw_file(path: str):
    """Serve raw file content (for images, PDFs, etc.)."""
    try:
        # URL decode the path (handles %20 for spaces, etc.)
        path = unquote(path)
        service = get_finder_service()
        full_path = await _run_blocking(service._resolve_path, path)

        # If file not found, try fuzzy matching for Unicode space variants
        # (macOS uses narrow no-break space \u202f in screenshot filenames)
        if not full_path.exists():
            parent = full_path.parent
            name = full_path.name
            if parent.exists():
                # Try to find a file with similar name (normalize spaces)
                normalized_name = unicodedata.normalize('NFKC', name)
                for f in parent.iterdir():
                    if unicodedata.normalize('NFKC', f.name) == normalized_name:
                        full_path = f
                        break

        if not full_path.exists():
            raise FileNotFoundError(f"Not found: {path}")
        if full_path.is_dir():
            raise ValueError("Cannot serve directory as raw file")

        # Detect media type
        media_type, _ = mimetypes.guess_type(str(full_path))
        if media_type is None:
            media_type = "application/octet-stream"

        # Sanitize filename for HTTP headers (ASCII only)
        safe_filename = full_path.name.encode('ascii', 'replace').decode('ascii')

        # For PDFs and images, display inline
        inline_types = [
            'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
            'application/pdf',
        ]

        return FileResponse(
            path=str(full_path),
            media_type=media_type,
            filename=None if media_type in inline_types else safe_filename,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/file")
async def create_file(request: CreateFileRequest):
    """Create a new file."""
    try:
        return await _run_blocking(get_finder_service().create_file, request.path, request.content)
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/folder")
async def create_folder(request: CreateFolderRequest):
    """Create a new folder."""
    try:
        return await _run_blocking(get_finder_service().create_folder, request.path)
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/rename/{path:path}")
async def rename_item(path: str, request: RenameRequest):
    """Rename a file or folder."""
    try:
        return await _run_blocking(get_finder_service().rename, path, request.new_name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/move/{path:path}")
async def move_item(path: str, request: MoveRequest):
    """Move a file or folder."""
    try:
        return await _run_blocking(get_finder_service().move, path, request.dest_path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{path:path}")
async def delete_item(path: str, recursive: bool = False):
    """Delete a file or folder."""
    try:
        return await _run_blocking(get_finder_service().delete, path, recursive)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_files(request: SearchRequest):
    """Search for files matching query."""
    try:
        results = await _run_blocking(get_finder_service().search, request.query, request.path)
        return {"query": request.query, "results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    dest_path: str = Form(default="")
):
    """Upload a file to the Desktop. Supports binary files (images, etc.)."""
    try:
        filename = file.filename or "uploaded_file"
        if dest_path:
            full_path = f"{dest_path}/{filename}"
        else:
            full_path = filename

        content = await file.read()

        return await _run_blocking(get_finder_service().upload_file, full_path, content)
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Open file in native macOS app
# ============================================

@router.post("/open")
async def open_in_macos(request: OpenFileRequest):
    """Open a file or folder with the native macOS default application."""
    import subprocess

    # Resolve and validate path
    full_path = (settings.repo_root / request.path).resolve()
    repo_root = settings.repo_root.resolve()

    # Security: must be within repo root
    if not str(full_path).startswith(str(repo_root)):
        raise HTTPException(status_code=400, detail="Invalid path: outside repository")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"Not found: {request.path}")

    try:
        cmd = ["open", "-R", str(full_path)] if request.reveal else ["open", str(full_path)]
        subprocess.run(cmd, check=True, timeout=5)
        return {"success": True, "path": request.path, "reveal": request.reveal}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Failed to open: {str(e)}")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Open command timed out")


# ============================================
# File content endpoints with conflict detection
# ============================================

@router.get("/content/{file_path:path}")
async def files_content(file_path: str):
    """Return file content with mtime for conflict detection."""
    file_path = unquote(file_path)

    def _load_content():
        # Security: ensure path doesn't escape repo
        full_path = (settings.repo_root / file_path).resolve()
        if not str(full_path).startswith(str(settings.repo_root.resolve())):
            raise HTTPException(status_code=400, detail="Invalid path")

        if not full_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        if full_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is a directory")

        try:
            if full_path.stat().st_size > settings.max_file_size:
                raise HTTPException(status_code=400, detail="File too large (>100KB)")
        except (OSError, IOError):
            raise HTTPException(status_code=500, detail="Cannot read file")

        ext = full_path.suffix.lower()
        if ext == ".md":
            file_type = "markdown"
        elif ext in {".txt", ".log"}:
            file_type = "text"
        else:
            file_type = "code"

        try:
            content = full_path.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File is not text")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cannot read file: {str(e)}")

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

    return await _run_blocking(_load_content)


@router.put("/content/{file_path:path}")
async def update_file_content(file_path: str, request: FileUpdateRequest):
    """Update file content with conflict detection."""
    file_path = unquote(file_path)

    def _update_content():
        full_path = (settings.repo_root / file_path).resolve()
        if not str(full_path).startswith(str(settings.repo_root.resolve())):
            raise HTTPException(status_code=400, detail="Invalid path")

        allowed_prefixes = ["Desktop/", "Workspace/"]
        if not any(file_path.startswith(prefix) for prefix in allowed_prefixes):
            raise HTTPException(status_code=403, detail="Can only edit files in Desktop/ or Workspace/")

        if "<!-- BEGIN " in request.content and "<!-- END " in request.content:
            raise HTTPException(status_code=400, detail="Cannot write to files with locked sections")

        if not full_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        if full_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is a directory")

        ext = full_path.suffix.lower()
        if ext not in {".md", ".txt", ".yaml", ".yml", ".json"}:
            raise HTTPException(status_code=400, detail=f"Cannot edit {ext} files")

        # Conflict detection
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
                pass

        try:
            full_path.write_text(request.content, encoding='utf-8')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cannot write file: {str(e)}")

        try:
            new_mtime = datetime.fromtimestamp(
                full_path.stat().st_mtime, tz=timezone.utc
            ).isoformat()
        except (OSError, IOError):
            new_mtime = datetime.now(timezone.utc).isoformat()

        return {"success": True, "path": file_path, "mtime": new_mtime}

    return await _run_blocking(_update_content)


# ============================================
# Simple read/append endpoints
# ============================================

@router.get("/simple-read")
async def read_file_simple(path: str):
    """Simple file read endpoint using query param."""
    def _read_simple():
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

    return await _run_blocking(_read_simple)


@router.post("/append")
async def append_to_file(request: FileAppendRequest):
    """Append content to a file (creates if doesn't exist)."""
    full_path = (settings.repo_root / request.path).resolve()
    if not str(full_path).startswith(str(settings.repo_root.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    allowed_prefixes = ["Desktop/", "Workspace/"]
    if not any(request.path.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Can only append to files in Desktop/ or Workspace/")

    ext = full_path.suffix.lower()
    if ext not in {".md", ".txt", ".yaml", ".yml", ".json"}:
        raise HTTPException(status_code=400, detail=f"Cannot append to {ext} files")

    try:
        def _append():
            full_path.parent.mkdir(parents=True, exist_ok=True)
            with open(full_path, 'a', encoding='utf-8') as f:
                f.write(request.content)
            return {"success": True, "path": request.path}

        return await _run_blocking(_append)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot append to file: {str(e)}")


# ============================================
# SSE endpoint for real-time file changes
# ============================================

@router.get("/events")
async def file_events_stream(request: Request):
    """
    SSE endpoint for real-time filesystem change notifications.

    Pushes events when Desktop/ files are created, modified, or deleted.
    Event types: created, modified, deleted, moved
    """
    async def event_generator():
        queue = sse_bus.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    # Only forward file events; strip "file." prefix for frontend
                    if not event.event_type.startswith("file."):
                        continue
                    yield {
                        "event": event.event_type[5:],  # "file.created" → "created"
                        "data": json.dumps(event.data)   # flat {path, mtime} not wrapped
                    }
                except asyncio.TimeoutError:
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"timestamp": datetime.now(timezone.utc).isoformat()})
                    }
        finally:
            sse_bus.unsubscribe(queue)

    return EventSourceResponse(event_generator())


# ============================================
# Trash endpoints
# ============================================

@router.post("/trash")
async def trash_item(request: TrashRequest):
    """Move a file or folder to trash."""
    try:
        return await _run_blocking(get_trash_service().trash, request.path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trash")
async def list_trash():
    """List all items in trash."""
    try:
        return await _run_blocking(get_trash_service().list_trash)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trash/{trash_id}")
async def get_trash_item(trash_id: str):
    """Get info about a specific trashed item."""
    try:
        return await _run_blocking(get_trash_service().get_trash_info, trash_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trash/{trash_id}/restore")
async def restore_item(trash_id: str, request: RestoreRequest = None):
    """Restore an item from trash."""
    try:
        dest_path = request.dest_path if request else None
        return await _run_blocking(get_trash_service().restore, trash_id, dest_path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/trash/{trash_id}")
async def permanent_delete_item(trash_id: str):
    """Permanently delete a specific item from trash."""
    try:
        return await _run_blocking(get_trash_service().permanent_delete, trash_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trash/empty")
async def empty_trash(request: EmptyTrashRequest = None):
    """Empty the trash (permanently delete all items)."""
    try:
        older_than_days = request.older_than_days if request else None
        return await _run_blocking(get_trash_service().empty_trash, older_than_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
