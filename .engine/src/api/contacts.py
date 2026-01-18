"""Contacts endpoints."""
import re
from typing import Optional
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query

from config import settings

router = APIRouter()

CONTACTS_DIR = settings.repo_root / "Desktop" / "contacts"


def parse_contact_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter from a markdown file."""
    frontmatter = {}
    body = content

    match = re.match(r'^---\s*\n(.*?)\n---\s*\n?(.*)', content, re.DOTALL)
    if match:
        yaml_content = match.group(1)
        body = match.group(2)

        for line in yaml_content.split('\n'):
            line = line.strip()
            if line.startswith('description:'):
                desc = line[len('description:'):].strip()
                if desc.startswith('"') and desc.endswith('"'):
                    desc = desc[1:-1]
                elif desc.startswith("'") and desc.endswith("'"):
                    desc = desc[1:-1]
                frontmatter['description'] = desc
            elif line.startswith('tags:'):
                inline = line[len('tags:'):].strip()
                if inline.startswith('[') and inline.endswith(']'):
                    tags_str = inline[1:-1]
                    frontmatter['tags'] = [t.strip().strip('"\'') for t in tags_str.split(',') if t.strip()]
                else:
                    frontmatter['tags'] = []
            elif line.startswith('- ') and 'tags' in frontmatter:
                tag = line[2:].strip().strip('"\'')
                if tag:
                    frontmatter['tags'].append(tag)

    return frontmatter, body


def filename_to_name(filename: str) -> str:
    """Convert filename like 'ian-martinez.md' to 'Ian Martinez'."""
    name = filename.rsplit('.', 1)[0]
    return ' '.join(word.capitalize() for word in name.replace('-', ' ').split())


@router.get("")
async def contacts_list(search: Optional[str] = Query(None)):
    """Return list of all contacts from Desktop/contacts/*.md."""
    search_query = (search or '').lower().strip()

    contacts = []
    if not CONTACTS_DIR.exists():
        return contacts

    for contact_file in sorted(CONTACTS_DIR.glob('*.md')):
        try:
            content = contact_file.read_text(encoding='utf-8')
            frontmatter, _ = parse_contact_frontmatter(content)

            contact_id = contact_file.stem
            name = filename_to_name(contact_file.name)
            description = frontmatter.get('description', '')
            tags = frontmatter.get('tags', [])

            if search_query and search_query not in name.lower():
                continue

            contacts.append({
                'id': contact_id,
                'name': name,
                'description': description,
                'tags': tags if isinstance(tags, list) else []
            })
        except Exception:
            continue

    return contacts


@router.get("/{contact_id}")
async def contact_detail(contact_id: str):
    """Return full contact file content."""
    contact_id = unquote(contact_id)
    contact_file = CONTACTS_DIR / f"{contact_id}.md"

    if not contact_file.exists():
        raise HTTPException(status_code=404, detail="Contact not found")

    # Security check
    resolved = contact_file.resolve()
    if not str(resolved).startswith(str(CONTACTS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid contact ID")

    try:
        content = contact_file.read_text(encoding='utf-8')
        frontmatter, body = parse_contact_frontmatter(content)

        return {
            'id': contact_id,
            'name': filename_to_name(contact_file.name),
            'description': frontmatter.get('description', ''),
            'tags': frontmatter.get('tags', []),
            'content': body.strip()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read contact: {str(e)}")
