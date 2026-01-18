"""Roles service - business logic for role management"""

from pathlib import Path
from typing import List, Dict, Optional
import yaml
from config import settings

# Protected roles that cannot be deleted or have their core structure modified
PROTECTED_ROLES = {'chief', 'builder', 'deep-work', 'idea', 'project'}

ROLES_DIR = settings.repo_root / '.claude' / 'roles'


class RoleInfo:
    """Information about a role"""
    def __init__(self, slug: str, name: str, auto_include: List[str], content: str, is_protected: bool, modes: List[str], display: Optional[Dict] = None):
        self.slug = slug
        self.name = name
        self.auto_include = auto_include
        self.content = content
        self.is_protected = is_protected
        self.modes = modes
        self.display = display or {}

    def to_dict(self) -> Dict:
        return {
            'slug': self.slug,
            'name': self.name,
            'auto_include': self.auto_include,
            'content': self.content,
            'is_protected': self.is_protected,
            'modes': self.modes,
            'display': self.display,
        }


class ModeInfo:
    """Information about a mode file"""
    def __init__(self, name: str, content: str):
        self.name = name
        self.content = content

    def to_dict(self) -> Dict:
        return {
            'name': self.name,
            'content': self.content,
        }


def list_roles() -> List[RoleInfo]:
    """List all available roles"""
    roles = []

    if not ROLES_DIR.exists():
        return roles

    # Iterate over role directories
    for role_dir in sorted(ROLES_DIR.iterdir()):
        if not role_dir.is_dir():
            continue

        slug = role_dir.name
        role_file = role_dir / "role.md"

        if not role_file.exists():
            continue

        content = role_file.read_text()

        # Parse frontmatter
        auto_include = []
        display = {}
        name = slug.title()

        if content.startswith('---'):
            # Extract frontmatter
            parts = content.split('---', 2)
            if len(parts) >= 3:
                frontmatter = parts[1].strip()
                try:
                    fm_data = yaml.safe_load(frontmatter)
                    if fm_data:
                        if 'auto_include' in fm_data:
                            auto_include = fm_data['auto_include'] or []
                        if 'display' in fm_data:
                            display = fm_data['display'] or {}
                except yaml.YAMLError:
                    pass

        # Extract name from first header
        for line in content.split('\n'):
            if line.startswith('# '):
                name = line[2:].strip()
                break

        # Check for modes - they're now in the same directory as role.md
        modes = []
        for mode_file in sorted(role_dir.glob('*.md')):
            if mode_file.name != 'role.md':
                modes.append(mode_file.stem)

        is_protected = slug in PROTECTED_ROLES

        roles.append(RoleInfo(
            slug=slug,
            name=name,
            auto_include=auto_include,
            content=content,
            is_protected=is_protected,
            modes=modes,
            display=display,
        ))

    return roles


def get_role(slug: str) -> Optional[RoleInfo]:
    """Get a specific role by slug"""
    role_dir = ROLES_DIR / slug
    role_file = role_dir / "role.md"

    if not role_file.exists():
        return None

    content = role_file.read_text()

    # Parse frontmatter
    auto_include = []
    display = {}
    name = slug.title()

    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            frontmatter = parts[1].strip()
            try:
                fm_data = yaml.safe_load(frontmatter)
                if fm_data:
                    if 'auto_include' in fm_data:
                        auto_include = fm_data['auto_include'] or []
                    if 'display' in fm_data:
                        display = fm_data['display'] or {}
            except yaml.YAMLError:
                pass

    # Extract name from first header
    for line in content.split('\n'):
        if line.startswith('# '):
            name = line[2:].strip()
            break

    # Check for modes - they're now in the same directory as role.md
    modes = []
    for mode_file in sorted(role_dir.glob('*.md')):
        if mode_file.name != 'role.md':
            modes.append(mode_file.stem)

    is_protected = slug in PROTECTED_ROLES

    return RoleInfo(
        slug=slug,
        name=name,
        auto_include=auto_include,
        content=content,
        is_protected=is_protected,
        modes=modes,
        display=display,
    )


def get_mode(role_slug: str, mode_name: str) -> Optional[ModeInfo]:
    """Get a specific mode file"""
    mode_file = ROLES_DIR / role_slug / f"{mode_name}.md"

    if not mode_file.exists():
        return None

    content = mode_file.read_text()
    return ModeInfo(name=mode_name, content=content)


def create_role(slug: str, name: str, content: str, auto_include: Optional[List[str]] = None, display: Optional[Dict] = None) -> RoleInfo:
    """Create a new role"""
    if slug in PROTECTED_ROLES:
        raise ValueError(f"Cannot create role with protected name: {slug}")

    role_dir = ROLES_DIR / slug
    role_file = role_dir / "role.md"

    if role_file.exists():
        raise ValueError(f"Role already exists: {slug}")

    # Ensure role directory exists
    role_dir.mkdir(parents=True, exist_ok=True)

    # Build frontmatter
    frontmatter = {}
    if auto_include is not None:
        frontmatter['auto_include'] = auto_include
    if display is not None:
        frontmatter['display'] = display

    # Construct file content
    if frontmatter:
        fm_yaml = yaml.safe_dump(frontmatter, default_flow_style=False)
        full_content = f"---\n{fm_yaml}---\n\n{content}"
    else:
        full_content = content

    # Write file
    role_file.write_text(full_content)

    return RoleInfo(
        slug=slug,
        name=name,
        auto_include=auto_include or [],
        content=full_content,
        is_protected=False,
        modes=[],
        display=display or {},
    )


def update_role(slug: str, content: str, auto_include: Optional[List[str]] = None) -> RoleInfo:
    """Update an existing role"""
    if slug in PROTECTED_ROLES:
        # Protected roles can have their content updated but we preserve basic structure
        pass

    role_file = ROLES_DIR / slug / "role.md"

    if not role_file.exists():
        raise ValueError(f"Role not found: {slug}")

    # Build frontmatter
    frontmatter = {}
    if auto_include is not None:
        frontmatter['auto_include'] = auto_include

    # Construct file content
    if frontmatter:
        fm_yaml = yaml.safe_dump(frontmatter, default_flow_style=False)
        full_content = f"---\n{fm_yaml}---\n\n{content}"
    else:
        full_content = content

    # Write file
    role_file.write_text(full_content)

    # Get updated info
    role = get_role(slug)
    if not role:
        raise ValueError(f"Failed to retrieve updated role: {slug}")

    return role


def delete_role(slug: str) -> bool:
    """Delete a role (if not protected)"""
    if slug in PROTECTED_ROLES:
        raise ValueError(f"Cannot delete protected role: {slug}")

    role_dir = ROLES_DIR / slug

    if not role_dir.exists():
        raise ValueError(f"Role not found: {slug}")

    # Delete all files in role directory
    for file in role_dir.glob('*.md'):
        file.unlink()

    # Delete the directory
    role_dir.rmdir()

    return True


def create_mode(role_slug: str, mode_name: str, content: str) -> ModeInfo:
    """Create a new mode for a role"""
    role_dir = ROLES_DIR / role_slug
    role_dir.mkdir(parents=True, exist_ok=True)

    mode_file = role_dir / f"{mode_name}.md"

    if mode_file.exists():
        raise ValueError(f"Mode already exists: {role_slug}/{mode_name}")

    mode_file.write_text(content)

    return ModeInfo(name=mode_name, content=content)


def update_mode(role_slug: str, mode_name: str, content: str) -> ModeInfo:
    """Update an existing mode"""
    mode_file = ROLES_DIR / role_slug / f"{mode_name}.md"

    if not mode_file.exists():
        raise ValueError(f"Mode not found: {role_slug}/{mode_name}")

    mode_file.write_text(content)

    return ModeInfo(name=mode_name, content=content)


def delete_mode(role_slug: str, mode_name: str) -> bool:
    """Delete a mode"""
    mode_file = ROLES_DIR / role_slug / f"{mode_name}.md"

    if not mode_file.exists():
        raise ValueError(f"Mode not found: {role_slug}/{mode_name}")

    mode_file.unlink()

    return True
