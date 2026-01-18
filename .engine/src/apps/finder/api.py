"""Finder API routes."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter()

# Service injection (set by __init__.py)
_service = None


def set_service(service):
    global _service
    _service = service


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


class CreateFolderRequest(BaseModel):
    path: str


class RenameRequest(BaseModel):
    new_name: str


class MoveRequest(BaseModel):
    dest_path: str


class DeleteRequest(BaseModel):
    recursive: bool = False


class SearchRequest(BaseModel):
    query: str
    path: str = ""


@router.get("/list")
async def list_root():
    """List root Desktop/ directory."""
    try:
        return _service.list_directory("")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/{path:path}")
async def list_directory(path: str):
    """List contents of a directory."""
    try:
        return _service.list_directory(path)
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
        return _service.get_file_info(path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/read/{path:path}")
async def read_file(path: str):
    """Read file content."""
    try:
        return _service.read_file(path)
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
        full_path = _service._resolve_path(path)

        # If file not found, try fuzzy matching for Unicode space variants
        # (macOS uses narrow no-break space \u202f in screenshot filenames)
        if not full_path.exists():
            parent = full_path.parent
            name = full_path.name
            if parent.exists():
                # Try to find a file with similar name (normalize spaces)
                import unicodedata
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

        # For PDFs and images, use inline display (not download)
        # Sanitize filename for HTTP headers (ASCII only, replace special chars)
        safe_filename = full_path.name.encode('ascii', 'replace').decode('ascii')

        # For PDFs and images, display inline (no filename = no Content-Disposition: attachment)
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
        return _service.create_file(request.path, request.content)
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
        return _service.create_folder(request.path)
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
        return _service.rename(path, request.new_name)
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
        return _service.move(path, request.dest_path)
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
        return _service.delete(path, recursive)
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
        results = _service.search(request.query, request.path)
        return {"query": request.query, "results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    dest_path: str = Form(default="")
):
    """Upload a file to the Desktop. Supports binary files (images, etc.).
    
    Args:
        file: The file to upload (multipart form data)
        dest_path: Optional destination path within Desktop/ (default: root)
    
    Returns:
        File info for the created file
    """
    try:
        # Construct full path
        filename = file.filename or "uploaded_file"
        if dest_path:
            full_path = f"{dest_path}/{filename}"
        else:
            full_path = filename
        
        # Read file content
        content = await file.read()
        
        # Use service to write file (supports binary)
        return _service.upload_file(full_path, content)
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

