"""Roles API routes"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from . import service

router = APIRouter()


class CreateRoleRequest(BaseModel):
    slug: str
    name: str
    content: str
    auto_include: Optional[List[str]] = None
    display: Optional[dict] = None


class UpdateRoleRequest(BaseModel):
    content: str
    auto_include: Optional[List[str]] = None


class CreateModeRequest(BaseModel):
    mode_name: str
    content: str


class UpdateModeRequest(BaseModel):
    content: str


@router.get("/")
def list_roles():
    """List all roles"""
    roles = service.list_roles()
    return {
        'success': True,
        'roles': [r.to_dict() for r in roles],
    }


@router.get("/{slug}")
def get_role(slug: str):
    """Get a specific role"""
    role = service.get_role(slug)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    return {
        'success': True,
        'role': role.to_dict(),
    }


@router.post("/")
def create_role(req: CreateRoleRequest):
    """Create a new role"""
    try:
        role = service.create_role(
            slug=req.slug,
            name=req.name,
            content=req.content,
            auto_include=req.auto_include,
            display=req.display,
        )
        return {
            'success': True,
            'role': role.to_dict(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{slug}")
def update_role(slug: str, req: UpdateRoleRequest):
    """Update an existing role"""
    try:
        role = service.update_role(
            slug=slug,
            content=req.content,
            auto_include=req.auto_include,
        )
        return {
            'success': True,
            'role': role.to_dict(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{slug}")
def delete_role(slug: str):
    """Delete a role"""
    try:
        service.delete_role(slug)
        return {
            'success': True,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{slug}/modes/{mode_name}")
def get_mode(slug: str, mode_name: str):
    """Get a specific mode"""
    mode = service.get_mode(slug, mode_name)
    if not mode:
        raise HTTPException(status_code=404, detail="Mode not found")

    return {
        'success': True,
        'mode': mode.to_dict(),
    }


@router.post("/{slug}/modes")
def create_mode(slug: str, req: CreateModeRequest):
    """Create a new mode for a role"""
    try:
        mode = service.create_mode(
            role_slug=slug,
            mode_name=req.mode_name,
            content=req.content,
        )
        return {
            'success': True,
            'mode': mode.to_dict(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{slug}/modes/{mode_name}")
def update_mode(slug: str, mode_name: str, req: UpdateModeRequest):
    """Update an existing mode"""
    try:
        mode = service.update_mode(
            role_slug=slug,
            mode_name=mode_name,
            content=req.content,
        )
        return {
            'success': True,
            'mode': mode.to_dict(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{slug}/modes/{mode_name}")
def delete_mode(slug: str, mode_name: str):
    """Delete a mode"""
    try:
        service.delete_mode(slug, mode_name)
        return {
            'success': True,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
