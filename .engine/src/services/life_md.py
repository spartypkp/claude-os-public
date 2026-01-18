"""SYSTEM-INDEX.md generation service - auto-generates complete system directory."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import jinja2
import yaml


class LifeMdService:
    """Generate SYSTEM-INDEX.md with sections: domains, apps, guides, specs, tools, roles, missions."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.template_path = repo_root / ".engine" / "templates" / "SYSTEM-INDEX.md.jinja"

    # ========================================================================
    # 1. Life Domains Extractor
    # ========================================================================

    def extract_life_domains(self) -> List[Dict]:
        """Scan Desktop/ for LIFE-SPEC.md files."""
        domains = []
        desktop_path = self.repo_root / "Desktop"

        if not desktop_path.exists():
            return domains

        for spec_file in desktop_path.glob("*/LIFE-SPEC.md"):
            # Skip hidden directories
            if any(part.startswith('.') for part in spec_file.parts):
                continue

            rel_path = spec_file.relative_to(self.repo_root)
            domain_name = spec_file.parent.name.replace('-', ' ').title()

            # Parse frontmatter
            description, status = self._parse_life_spec_frontmatter(spec_file)

            domains.append({
                'name': domain_name,
                'path': str(rel_path.parent),
                'description': description,
                'status': status
            })

        return sorted(domains, key=lambda d: d['name'])

    def _parse_life_spec_frontmatter(self, spec_file: Path) -> Tuple[str, str]:
        """Parse frontmatter, return (description, status) or defaults."""
        try:
            content = spec_file.read_text(encoding="utf-8")
            match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)

            if not match:
                return "(No description - missing frontmatter)", "unknown"

            frontmatter = yaml.safe_load(match.group(1))
            if not isinstance(frontmatter, dict):
                return "(Invalid frontmatter)", "unknown"

            description = frontmatter.get('description', '(No description)')
            status = frontmatter.get('status', 'unknown')

            return str(description).strip(), str(status).strip()

        except Exception as e:
            return f"(Error: {e})", "unknown"

    # ========================================================================
    # 2. Custom Apps Extractor
    # ========================================================================

    def extract_custom_apps(self) -> List[Dict]:
        """Scan Desktop/ for Custom Applications."""
        apps = []
        desktop_path = self.repo_root / "Desktop"

        if not desktop_path.exists():
            return apps

        for app_dir in desktop_path.iterdir():
            if not app_dir.is_dir():
                continue

            app_spec = app_dir / "APP-SPEC.md"
            if not app_spec.exists():
                continue

            # Load manifest.yaml
            manifest_path = app_dir / "manifest.yaml"
            manifest_data = {}
            if manifest_path.exists():
                try:
                    with open(manifest_path, encoding="utf-8") as f:
                        manifest_data = yaml.safe_load(f) or {}
                except Exception:
                    pass  # Use defaults if manifest fails to load

            # Parse APP-SPEC for MCP tools and fallback description
            tools = self._extract_mcp_tools(app_spec)

            # Get description from manifest, fall back to APP-SPEC frontmatter
            description = manifest_data.get('description', '')
            if not description:
                description = self._extract_app_spec_description(app_spec)

            apps.append({
                'name': manifest_data.get('name', app_dir.name.replace('-', ' ').title()),
                'path': str(app_dir.relative_to(self.repo_root)),
                'route': manifest_data.get('route', f'/{app_dir.name}'),
                'icon': manifest_data.get('icon', 'app'),
                'description': description,
                'tools': tools
            })

        return sorted(apps, key=lambda a: a['name'])

    def _extract_mcp_tools(self, app_spec_path: Path) -> List[str]:
        """Extract MCP tool names from APP-SPEC.md."""
        try:
            content = app_spec_path.read_text(encoding="utf-8")
        except Exception:
            return []

        # Find "## MCP Tools" section
        tools = []
        in_tools_section = False

        for line in content.split('\n'):
            if line.strip() == "## MCP Tools":
                in_tools_section = True
                continue

            if in_tools_section:
                # Stop at next ## header
                if line.startswith("## "):
                    break

                # Extract tool names like: `contact(operation, ...)`
                match = re.search(r'`(\w+)\(', line)
                if match:
                    tools.append(f"{match.group(1)}()")

        return tools

    def _extract_app_spec_description(self, app_spec_path: Path) -> str:
        """Extract description from APP-SPEC.md frontmatter."""
        try:
            content = app_spec_path.read_text(encoding="utf-8")
            match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
            if not match:
                return ''
            frontmatter = yaml.safe_load(match.group(1))
            if isinstance(frontmatter, dict):
                return frontmatter.get('description', '')
            return ''
        except Exception:
            return ''

    # ========================================================================
    # 3. Guides Extractor
    # ========================================================================

    def extract_guides(self) -> List[Dict]:
        """Scan .claude/guides/ for guide files (flat structure with frontmatter)."""
        guides = []
        guides_path = self.repo_root / ".claude" / "guides"

        if not guides_path.exists():
            return guides

        for guide_file in sorted(guides_path.glob("*.md")):
            # Skip README
            if guide_file.stem.lower() == 'readme':
                continue

            # Parse frontmatter
            frontmatter = self._parse_guide_frontmatter(guide_file)

            guides.append({
                'name': guide_file.stem.replace('-', ' ').title(),
                'slug': guide_file.stem,
                'path': str(guide_file.relative_to(self.repo_root)),
                'purpose': frontmatter.get('purpose', ''),
                'status': frontmatter.get('status', 'active'),
            })

        return guides

    def _parse_guide_frontmatter(self, guide_file: Path) -> Dict:
        """Parse YAML frontmatter from guide file."""
        try:
            content = guide_file.read_text(encoding="utf-8")
            match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)

            if not match:
                return {}

            frontmatter = yaml.safe_load(match.group(1))
            return frontmatter if isinstance(frontmatter, dict) else {}

        except Exception:
            return {}

    def _extract_first_content_line(self, file_path: Path) -> Optional[str]:
        """Extract first meaningful content line from markdown file."""
        try:
            content = file_path.read_text(encoding="utf-8")
            lines = content.split('\n')

            # Skip frontmatter if present
            start_index = 0
            if lines and lines[0].strip() == '---':
                for i, line in enumerate(lines[1:], 1):
                    if line.strip() == '---':
                        start_index = i + 1
                        break

            # Find first content line (skip headers, metadata, horizontal rules)
            for line in lines[start_index:]:
                stripped = line.strip()
                # Skip empty, headers, metadata lines (**Key:** Value), and horizontal rules
                if (stripped and 
                    not stripped.startswith('#') and 
                    not stripped.startswith('**') and
                    stripped != '---'):
                    # Truncate if too long
                    return stripped[:100] + '...' if len(stripped) > 100 else stripped

            return None
        except Exception:
            return None

    # ========================================================================
    # 4. System Specs Extractor
    # ========================================================================

    def extract_system_specs(self) -> List[Dict]:
        """Scan for SYSTEM-SPEC.md files."""
        specs = []

        for spec_file in self.repo_root.glob("**/SYSTEM-SPEC.md"):
            # Skip hidden directories and venv
            rel_path = spec_file.relative_to(self.repo_root)
            if any(part.startswith('.') and part != '.engine' and part != '.claude'
                   for part in rel_path.parts):
                continue
            if 'venv' in rel_path.parts:
                continue

            # Determine component name from path
            parent_name = spec_file.parent.name

            if parent_name == ".engine":
                component_name = "Engine"
            elif parent_name == "Dashboard":
                component_name = "Dashboard"
            elif parent_name == ".claude":
                component_name = "Claude Configuration"
            elif parent_name == "life_mcp":
                component_name = "Life MCP"
            else:
                component_name = parent_name.replace('-', ' ').title()

            # Parse file
            try:
                content = spec_file.read_text(encoding="utf-8")
            except Exception:
                continue

            # Extract purpose (first paragraph)
            purpose = self._extract_purpose(content)

            # Extract ## headers
            sections = []
            for line in content.split('\n'):
                if re.match(r'^## ', line):
                    section_name = line.replace('## ', '').strip()
                    sections.append(section_name)

            specs.append({
                'name': component_name,
                'path': str(rel_path),
                'purpose': purpose,
                'sections': sections[:6]  # First 6 sections
            })

        return sorted(specs, key=lambda s: s['name'])

    def _extract_purpose(self, content: str) -> str:
        """Extract purpose from spec (first paragraph after headers)."""
        lines = content.split('\n')

        # Skip frontmatter if present
        start_index = 0
        if lines and lines[0].strip() == '---':
            for i, line in enumerate(lines[1:], 1):
                if line.strip() == '---':
                    start_index = i + 1
                    break

        # First, check for explicit **Purpose:** field
        for line in lines[start_index:]:
            stripped = line.strip()
            if stripped.startswith('**Purpose:**'):
                purpose = stripped.replace('**Purpose:**', '').strip()
                return purpose[:150] + '...' if len(purpose) > 150 else purpose

        # Fall back to first non-empty, non-header, non-rule, non-code line
        for line in lines[start_index:]:
            stripped = line.strip()
            if (stripped and
                not stripped.startswith('#') and
                not stripped.startswith('**') and
                not stripped.startswith('```') and
                stripped != '---'):
                # Truncate if too long
                return stripped[:150] + '...' if len(stripped) > 150 else stripped

        return "System infrastructure documentation"

    # ========================================================================
    # 5. Core Tools Extractor
    # ========================================================================

    def extract_core_tools(self) -> List[Dict]:
        """Parse .engine/config/core.yaml for session tools."""
        core_yaml = self.repo_root / ".engine" / "config" / "core.yaml"
        if not core_yaml.exists():
            return []

        try:
            with open(core_yaml, encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except Exception:
            return []

        tools = data.get('tools', {})
        return [
            {
                'name': name,
                'purpose': info.get('purpose', ''),
                'who': info.get('who', 'All roles'),
                'when': info.get('when', ''),
            }
            for name, info in tools.items()
        ]

    # ========================================================================
    # 6. Core App Tools Extractor
    # ========================================================================

    def extract_core_app_tools(self) -> Dict[str, List[Dict]]:
        """Parse .engine/config/core_apps/*.yaml for app tools."""
        core_apps_dir = self.repo_root / ".engine" / "config" / "core_apps"
        if not core_apps_dir.exists():
            return {}

        result = {}
        for yaml_file in sorted(core_apps_dir.glob("*.yaml")):
            app_name = yaml_file.stem  # e.g., "calendar" from "calendar.yaml"
            try:
                with open(yaml_file, encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
            except Exception:
                continue

            tools = data.get('tools', {})
            if tools:
                result[app_name] = [
                    {
                        'name': name,
                        'purpose': info.get('purpose', ''),
                        'who': info.get('who', 'All roles'),
                        'when': info.get('when', ''),
                    }
                    for name, info in tools.items()
                ]

        return result

    # ========================================================================
    # 7. Custom App Tools Extractor
    # ========================================================================

    def extract_custom_app_tools(self) -> Dict[str, List[Dict]]:
        """Parse .engine/config/custom_apps/*.yaml for custom app tools."""
        custom_apps_dir = self.repo_root / ".engine" / "config" / "custom_apps"
        if not custom_apps_dir.exists():
            return {}

        result = {}
        for yaml_file in sorted(custom_apps_dir.glob("*.yaml")):
            app_name = yaml_file.stem  # e.g., "job-search"
            try:
                with open(yaml_file, encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
            except Exception:
                continue

            tools = data.get('tools', {})
            if tools:
                result[app_name] = [
                    {
                        'name': name,
                        'purpose': info.get('purpose', ''),
                        'who': info.get('who', 'All roles'),
                        'when': info.get('when', ''),
                    }
                    for name, info in tools.items()
                ]

        return result

    # ========================================================================
    # 8. Roles Extractor
    # ========================================================================

    def extract_roles(self) -> List[Dict]:
        """Parse .claude/roles/{role}/role.md for specialist roles."""
        roles_dir = self.repo_root / ".claude" / "roles"
        if not roles_dir.exists():
            return []

        roles = []
        for role_folder in sorted(roles_dir.iterdir()):
            if not role_folder.is_dir():
                continue

            role_name = role_folder.name
            role_file = role_folder / "role.md"

            if not role_file.exists():
                continue

            try:
                content = role_file.read_text(encoding="utf-8")
            except Exception:
                continue

            # Extract purpose and when from the role file
            purpose = self._extract_role_purpose(content)
            when_to_use = self._extract_role_when(content, role_name)

            roles.append({
                'name': role_name.title(),
                'slug': role_name,
                'purpose': purpose,
                'when': when_to_use
            })

        return roles

    def _extract_role_purpose(self, content: str) -> str:
        """Extract purpose from role file (first sentence after header)."""
        lines = content.split('\n')
        for i, line in enumerate(lines):
            # Look for "# Role Name" header
            if line.startswith('# '):
                # Get next non-empty line
                for next_line in lines[i+1:]:
                    stripped = next_line.strip()
                    if stripped and not stripped.startswith('#'):
                        # Take first sentence or first 100 chars
                        first_sentence = stripped.split('.')[0]
                        return first_sentence[:100] if len(first_sentence) > 100 else first_sentence
        return "Specialist role"

    def _extract_role_when(self, content: str, role_name: str) -> str:
        """Extract when to use from role file."""
        # Default based on role name
        defaults = {
            'chief': 'Default role, runs all day',
            'builder': 'Custom Apps, infrastructure, debugging',
            'deep-work': 'Sustained complex tasks (research, writing, analysis)',
            'project': 'External codebases, client work',
            'idea': 'Brainstorming, design, planning',
        }
        return defaults.get(role_name, 'Specialized work')

    # ========================================================================
    # 9. Missions Extractor
    # ========================================================================

    def extract_missions(self) -> List[Dict]:
        """Extract missions from .claude/scheduled/ and DB."""
        missions = []

        # Check scheduled prompt files
        scheduled_dir = self.repo_root / ".claude" / "scheduled"
        if scheduled_dir.exists():
            for prompt_file in sorted(scheduled_dir.glob("*.md")):
                # Skip README and other non-mission files
                if prompt_file.stem.lower() in ('readme', 'overview', 'index'):
                    continue

                mission_name = prompt_file.stem.replace('-', ' ').title()
                description = self._parse_mission_frontmatter(prompt_file)
                missions.append({
                    'name': mission_name,
                    'slug': prompt_file.stem,
                    'source': 'scheduled',
                    'schedule': self._infer_schedule(prompt_file.stem),
                    'required': prompt_file.stem == 'memory-consolidation',
                    'description': description
                })

        return missions

    def _parse_mission_frontmatter(self, mission_file: Path) -> str:
        """Parse YAML frontmatter from mission file, return description."""
        try:
            content = mission_file.read_text(encoding="utf-8")
            match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
            if not match:
                return ''
            frontmatter = yaml.safe_load(match.group(1))
            if isinstance(frontmatter, dict):
                return frontmatter.get('description', '')
            return ''
        except Exception:
            return ''

    def _infer_schedule(self, slug: str) -> str:
        """Infer schedule from mission slug."""
        schedules = {
            'memory-consolidation': '6:00 AM daily',
            'morning-brief': '7:00 AM daily',
            'morning-reset': '7:30 AM daily',
            'dream-mode': '4:00 AM daily',
            'overnight-tasks': '1:00 AM daily',
            'autonomous-dev-work': 'On demand'
        }
        return schedules.get(slug, 'Unknown')

    # ========================================================================
    # 10. Template Rendering
    # ========================================================================

    def generate_life_md(self) -> str:
        """Generate complete SYSTEM-INDEX.md content."""
        try:
            # Load template
            env = jinja2.Environment(
                loader=jinja2.FileSystemLoader(self.repo_root / ".engine" / "templates")
            )
            template = env.get_template("SYSTEM-INDEX.md.jinja")

            # Gather data from all extractors
            data = {
                'domains': self.extract_life_domains(),
                'apps': self.extract_custom_apps(),
                'guides': self.extract_guides(),
                'system_specs': self.extract_system_specs(),
                'core_tools': self.extract_core_tools(),
                'core_app_tools': self.extract_core_app_tools(),
                'custom_app_tools': self.extract_custom_app_tools(),
                'roles': self.extract_roles(),
                'missions': self.extract_missions(),
                'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M PST")
            }

            # Render template
            return template.render(**data)

        except Exception as e:
            # Log error and return fallback
            print(f"Error generating SYSTEM-INDEX.md: {e}")
            return f"## Error\n\nFailed to generate SYSTEM-INDEX.md: {e}"


__all__ = ["LifeMdService"]
