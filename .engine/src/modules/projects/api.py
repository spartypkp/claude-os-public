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
        },
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
            if children:
                nodes.append({
                    "slug": entry.name,
                    "type": "group",
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
