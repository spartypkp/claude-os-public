"""Projects API — Walks Desktop/projects/ tree structure.

Projects are directories containing PROJECT.md (identity + current state) and
HISTORY.md (append-only log). Symlinks inside point to external codebases.
Directories without PROJECT.md are group folders containing child projects.

Tree structure:
  Desktop/projects/
    texas-holdem-llm-suite/     <- project (has PROJECT.md)
      PROJECT.md
      HISTORY.md
      backend -> /external/repo
      frontend -> /external/repo
    Hackathons/                  <- group (no PROJECT.md)
      drone-control-ui/          <- project
        PROJECT.md
        HISTORY.md
        src -> /external/repo
"""
from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from core.config import settings

logger = logging.getLogger("projects")

router = APIRouter(tags=["projects"])

PROJECTS_DIR = settings.desktop_dir / "projects"


# =============================================================================
# PROJECT.MD PARSER
# =============================================================================

def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse YAML frontmatter from PROJECT.md. Returns (frontmatter, body)."""
    if not text.startswith("---"):
        return {}, text

    end = text.find("---", 3)
    if end == -1:
        return {}, text

    fm_text = text[3:end].strip()
    body = text[end + 3:].strip()

    frontmatter: dict[str, Any] = {}
    for line in fm_text.split("\n"):
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()

        # Parse list values: [item1, item2]
        if value.startswith("[") and value.endswith("]"):
            items = [v.strip().strip("'\"") for v in value[1:-1].split(",") if v.strip()]
            frontmatter[key] = items
        else:
            frontmatter[key] = value

    return frontmatter, body


def _extract_description(body: str) -> str | None:
    """Extract first paragraph from PROJECT.md body as description."""
    # Skip the title (# heading)
    lines = body.split("\n")
    desc_lines = []
    past_title = False

    for line in lines:
        if line.startswith("# ") and not past_title:
            past_title = True
            continue
        if not past_title:
            continue
        if line.strip() == "":
            if desc_lines:
                break
            continue
        if line.startswith("## "):
            break
        desc_lines.append(line.strip())

    desc = " ".join(desc_lines).strip()
    if desc == "_Not yet documented._":
        return None
    return desc or None


def _extract_title(body: str) -> str | None:
    """Extract title from first # heading."""
    for line in body.split("\n"):
        if line.startswith("# "):
            return line[2:].strip()
    return None


def _extract_interview_value(body: str) -> tuple[str | None, str | None]:
    """Extract interview value rating and summary from ## Interview Value section.

    Returns (rating, summary) where rating is HIGH/MEDIUM-HIGH/MEDIUM/LOW/NONE
    and summary is the first sentence after the rating.
    """
    # Find the Interview Value section
    match = re.search(r"^## Interview Value\s*\n", body, re.MULTILINE)
    if not match:
        return None, None

    section_start = match.end()
    # Find next ## heading or end of text
    next_section = re.search(r"^## ", body[section_start:], re.MULTILINE)
    section_text = body[section_start:section_start + next_section.start()].strip() if next_section else body[section_start:].strip()

    if not section_text:
        return None, None

    # Extract rating from patterns like **HIGH.**, **HIGH**, HIGH., HIGH
    rating_match = re.search(r"\*{0,2}(HIGH|MEDIUM-HIGH|MEDIUM|LOW|NONE)\b\.?\*{0,2}", section_text, re.IGNORECASE)
    rating = rating_match.group(1).upper() if rating_match else None

    # Extract summary: first meaningful sentence after rating line
    summary = None
    lines = section_text.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Skip the line that contains the rating
        if rating and re.search(r"\*{0,2}" + re.escape(rating), line, re.IGNORECASE):
            # If there's text after the rating on the same line, use it
            after_rating = re.sub(r"^\*{0,2}(HIGH|MEDIUM-HIGH|MEDIUM|LOW|NONE)\b\.?\*{0,2}\.?\s*", "", line, flags=re.IGNORECASE).strip()
            if after_rating:
                summary = after_rating
                break
            continue
        # First non-empty, non-rating line
        if line and not line.startswith("##"):
            summary = line
            break

    # Trim summary to first sentence
    if summary:
        sent_end = re.search(r"[.!?](?:\s|$)", summary)
        if sent_end:
            summary = summary[:sent_end.end()].strip()
        # Remove markdown bold
        summary = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", summary)
        # Cap length
        if len(summary) > 200:
            summary = summary[:197] + "..."

    return rating, summary


# =============================================================================
# GIT METADATA
# =============================================================================

def _git_info(repo_path: Path) -> dict[str, Any] | None:
    """Get git info from a directory with .git."""
    if not (repo_path / ".git").exists():
        return None

    try:
        log_result = subprocess.run(
            ["git", "log", "-1", "--format=%ar|%s|%ct"],
            cwd=repo_path, capture_output=True, text=True, timeout=5,
        )
        if log_result.returncode != 0:
            return None

        parts = log_result.stdout.strip().split("|", 2)
        if len(parts) < 3:
            return None

        last_commit_ago, last_commit_msg, last_commit_unix = parts

        branch_result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=repo_path, capture_output=True, text=True, timeout=5,
        )
        branch = branch_result.stdout.strip() if branch_result.returncode == 0 else None

        status_result = subprocess.run(
            ["git", "status", "--short"],
            cwd=repo_path, capture_output=True, text=True, timeout=5,
        )
        uncommitted = 0
        if status_result.returncode == 0 and status_result.stdout.strip():
            uncommitted = len([l for l in status_result.stdout.strip().split("\n") if l.strip()])

        return {
            "last_commit_ago": last_commit_ago,
            "last_commit_msg": last_commit_msg,
            "last_commit_unix": int(last_commit_unix),
            "branch": branch,
            "uncommitted_count": uncommitted,
        }
    except (subprocess.TimeoutExpired, Exception) as e:
        logger.debug(f"Git metadata failed for {repo_path}: {e}")
        return None


def _collect_repo_git(project_dir: Path) -> list[dict[str, Any]]:
    """Collect git metadata for all symlinked repos in a project directory."""
    repos = []
    try:
        for entry in sorted(project_dir.iterdir()):
            if entry.name in ("PROJECT.md", "HISTORY.md"):
                continue
            if not entry.is_symlink():
                continue
            target = entry.resolve()
            if not target.is_dir():
                continue

            info = _git_info(target)
            if info:
                info["name"] = entry.name
                repos.append(info)
    except PermissionError:
        pass
    return repos


# =============================================================================
# TREE SCANNER
# =============================================================================

def _scan_project(project_dir: Path) -> dict[str, Any]:
    """Scan a single project directory (has PROJECT.md)."""
    project_md_path = project_dir / "PROJECT.md"
    history_md_path = project_dir / "HISTORY.md"

    # Parse PROJECT.md
    text = project_md_path.read_text(encoding="utf-8") if project_md_path.exists() else ""
    frontmatter, body = _parse_frontmatter(text)

    title = _extract_title(body) or project_dir.name
    description = _extract_description(body)

    # Read HISTORY.md
    history_content = ""
    last_history_date = None
    if history_md_path.exists():
        history_content = history_md_path.read_text(encoding="utf-8")
        # Extract most recent date header
        date_match = re.search(r"^## (\d{4}-\d{2}-\d{2})", history_content, re.MULTILINE)
        if date_match:
            last_history_date = date_match.group(1)

    # Collect git metadata per repo symlink
    git_repos = _collect_repo_git(project_dir)

    # Extract interview value
    interview_value, interview_summary = _extract_interview_value(body)

    return {
        "slug": project_dir.name,
        "type": "project",
        "project": {
            "name": title,
            "status": frontmatter.get("status", "active"),
            "category": frontmatter.get("category", "other"),
            "tech": frontmatter.get("tech", []),
            "description": description,
            "has_history": bool(history_content.strip() and history_content.strip() != "# History"),
            "last_history_date": last_history_date,
            "git": git_repos,
            "path": str(project_dir),
            "interview_value": interview_value,
            "interview_summary": interview_summary,
        },
    }


def _scan_group(group_dir: Path) -> dict[str, Any]:
    """Scan a group directory for GROUP.md metadata."""
    group_md_path = group_dir / "GROUP.md"
    name = group_dir.name.replace("-", " ").replace("_", " ").title()
    description = None

    if group_md_path.exists():
        text = group_md_path.read_text(encoding="utf-8")
        fm, body = _parse_frontmatter(text)
        if fm.get("name"):
            name = fm["name"]
        if fm.get("description"):
            description = fm["description"]
        elif not description:
            description = _extract_description(body)

    return {
        "name": name,
        "description": description,
        "has_group_md": group_md_path.exists(),
        "path": str(group_dir),
    }


def _scan_tree(directory: Path) -> list[dict[str, Any]]:
    """Recursively scan a directory, returning tree nodes."""
    nodes = []

    try:
        entries = sorted(directory.iterdir())
    except PermissionError:
        return nodes

    for entry in entries:
        # Skip hidden files, non-directories, and metadata files
        if entry.name.startswith("."):
            continue
        if entry.name in ("SPEC.archive.md", "manifest.yaml"):
            continue
        if not entry.is_dir():
            continue
        # Skip if it's a symlink (symlinks are repo refs inside projects, not tree nodes)
        if entry.is_symlink():
            continue

        if (entry / "PROJECT.md").exists():
            # This is a project
            try:
                nodes.append(_scan_project(entry))
            except Exception as e:
                logger.error(f"Failed to scan project {entry.name}: {e}")
        else:
            # This is a group folder — recurse
            children = _scan_tree(entry)
            group_meta = _scan_group(entry)
            # Include group even if empty (so it shows up for management)
            nodes.append({
                "slug": entry.name,
                "type": "group",
                "group": group_meta,
                "children": children,
            })

    return nodes


def _find_project_in_tree(tree: list[dict], slug: str) -> dict | None:
    """Find a project by slug in the tree (searches recursively)."""
    for node in tree:
        if node["type"] == "project" and node["slug"] == slug:
            return node
        if node["type"] == "group":
            found = _find_project_in_tree(node.get("children", []), slug)
            if found:
                return found
    return None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/")
async def list_projects():
    """List all projects as a tree structure."""
    import asyncio
    tree = await asyncio.to_thread(_scan_tree, PROJECTS_DIR)
    return tree


def _find_project_dir(base: Path, slug: str) -> Path | None:
    """Find a project directory by slug, searching recursively."""
    for entry in base.iterdir():
        if not entry.is_dir() or entry.is_symlink() or entry.name.startswith("."):
            continue
        if entry.name == slug and (entry / "PROJECT.md").exists():
            return entry
        # Check inside group folders
        child = _find_project_dir(entry, slug)
        if child:
            return child
    return None


def _list_groups_sync() -> list:
    """Sync: scan group folders with filesystem I/O."""
    groups = []
    try:
        for entry in sorted(PROJECTS_DIR.iterdir()):
            if entry.name.startswith(".") or not entry.is_dir() or entry.is_symlink():
                continue
            if entry.name in ("SPEC.archive.md", "manifest.yaml"):
                continue
            if not (entry / "PROJECT.md").exists():
                meta = _scan_group(entry)
                child_count = sum(
                    1 for c in entry.iterdir()
                    if c.is_dir() and not c.is_symlink() and (c / "PROJECT.md").exists()
                )
                groups.append({
                    "slug": entry.name,
                    **meta,
                    "project_count": child_count,
                })
    except PermissionError:
        pass
    return groups


@router.get("/groups")
async def list_groups():
    """List available group folders with metadata."""
    import asyncio
    return await asyncio.to_thread(_list_groups_sync)


def _get_group_sync(slug: str) -> dict:
    """Sync: read group details with filesystem I/O."""
    group_dir = PROJECTS_DIR / slug
    if not group_dir.is_dir() or (group_dir / "PROJECT.md").exists():
        raise HTTPException(status_code=404, detail=f"Group '{slug}' not found")

    meta = _scan_group(group_dir)
    group_md_path = group_dir / "GROUP.md"
    meta["group_md"] = group_md_path.read_text(encoding="utf-8") if group_md_path.exists() else ""
    meta["slug"] = slug
    return meta


@router.get("/groups/{slug}")
async def get_group(slug: str):
    """Get a group's full details including GROUP.md content."""
    import asyncio
    return await asyncio.to_thread(_get_group_sync, slug)


def _create_group_sync(body: dict) -> dict:
    """Sync: create group directory + GROUP.md."""
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    slug = name.lower().replace(" ", "-").replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid group name")

    group_dir = PROJECTS_DIR / slug
    if group_dir.exists():
        raise HTTPException(status_code=409, detail=f"Group '{slug}' already exists")

    group_dir.mkdir(parents=True)

    description = body.get("description", "").strip()
    group_md = f"""---
name: {name}
description: {description}
---

# {name}

{description}
"""
    (group_dir / "GROUP.md").write_text(group_md, encoding="utf-8")

    return {"success": True, "slug": slug, "path": str(group_dir)}


@router.post("/groups")
async def create_group(body: dict):
    """Create a new project group folder with GROUP.md."""
    import asyncio
    return await asyncio.to_thread(_create_group_sync, body)


def _update_group_sync(slug: str, body: dict) -> dict:
    """Sync: update GROUP.md content."""
    group_dir = PROJECTS_DIR / slug
    if not group_dir.is_dir() or (group_dir / "PROJECT.md").exists():
        raise HTTPException(status_code=404, detail=f"Group '{slug}' not found")

    content = body.get("content")
    if content is not None:
        (group_dir / "GROUP.md").write_text(content, encoding="utf-8")
        return {"success": True}

    name = body.get("name", "").strip()
    description = body.get("description", "").strip()
    if name or description:
        group_md_path = group_dir / "GROUP.md"
        existing = group_md_path.read_text(encoding="utf-8") if group_md_path.exists() else ""
        fm, md_body = _parse_frontmatter(existing)
        if name:
            fm["name"] = name
        if description:
            fm["description"] = description
        fm_lines = "\n".join(f"{k}: {v}" for k, v in fm.items())
        new_content = f"---\n{fm_lines}\n---\n\n{md_body}" if md_body else f"---\n{fm_lines}\n---\n\n# {fm.get('name', slug)}\n\n{fm.get('description', '')}\n"
        group_md_path.write_text(new_content, encoding="utf-8")
        return {"success": True}

    raise HTTPException(status_code=400, detail="Provide content, name, or description")


@router.put("/groups/{slug}")
async def update_group(slug: str, body: dict):
    """Update a group's GROUP.md content."""
    import asyncio
    return await asyncio.to_thread(_update_group_sync, slug, body)


def _delete_group_sync(slug: str) -> dict:
    """Sync: delete empty group folder."""
    import shutil

    group_dir = PROJECTS_DIR / slug
    if not group_dir.is_dir() or (group_dir / "PROJECT.md").exists():
        raise HTTPException(status_code=404, detail=f"Group '{slug}' not found")

    has_projects = any(
        (c / "PROJECT.md").exists()
        for c in group_dir.iterdir()
        if c.is_dir() and not c.is_symlink()
    )
    if has_projects:
        raise HTTPException(status_code=409, detail="Group is not empty -- move projects out first")

    shutil.rmtree(group_dir)
    return {"success": True}


@router.delete("/groups/{slug}")
async def delete_group(slug: str):
    """Delete an empty group folder."""
    import asyncio
    return await asyncio.to_thread(_delete_group_sync, slug)


@router.get("/{slug}")
async def get_project(slug: str):
    """Get a single project by slug with full content."""
    import asyncio

    project_dir = await asyncio.to_thread(_find_project_dir, PROJECTS_DIR, slug)
    if not project_dir:
        raise HTTPException(status_code=404, detail=f"Project '{slug}' not found")

    node = await asyncio.to_thread(_scan_project, project_dir)

    # Enrich with full file contents
    project_md_path = project_dir / "PROJECT.md"
    history_md_path = project_dir / "HISTORY.md"
    node["project"]["project_md"] = project_md_path.read_text(encoding="utf-8") if project_md_path.exists() else ""
    node["project"]["history_md"] = history_md_path.read_text(encoding="utf-8") if history_md_path.exists() else ""

    return node


@router.post("/{slug}/move")
async def move_project(slug: str, body: dict):
    """Move a project to a different group folder."""
    import asyncio
    import shutil

    target_group = body.get("target_group")
    if not target_group:
        raise HTTPException(status_code=400, detail="target_group is required")

    # Find the project
    project_dir = await asyncio.to_thread(_find_project_dir, PROJECTS_DIR, slug)
    if not project_dir:
        raise HTTPException(status_code=404, detail=f"Project '{slug}' not found")

    # Validate target group exists or is a top-level move
    target_parent = PROJECTS_DIR / target_group
    if target_group == "_root":
        target_parent = PROJECTS_DIR
    elif not target_parent.is_dir():
        raise HTTPException(status_code=404, detail=f"Group '{target_group}' not found")

    destination = target_parent / slug
    if destination.exists():
        raise HTTPException(status_code=409, detail=f"Project '{slug}' already exists in '{target_group}'")

    # Move
    await asyncio.to_thread(shutil.move, str(project_dir), str(destination))

    return {"success": True, "new_path": str(destination)}
