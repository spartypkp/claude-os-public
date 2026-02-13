"""
Finder module - File browser for Claude OS.

Provides:
- Browse Desktop/ filesystem
- Create, rename, move, delete files and folders
- File preview (markdown, code, text)
- Trash with restore capability
- Real-time file change notifications (SSE)
"""

from .service import FinderService
from .trash import TrashService

__all__ = ['FinderService', 'TrashService']
