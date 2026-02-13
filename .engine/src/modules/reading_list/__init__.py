# === CUSTOM APP PATTERN ===
# Every custom app follows this structure:
# 1. APP-SPEC.md in Desktop/{app-name}/ defines the blueprint
# 2. This module in .engine/src/modules/{app_name}/ implements the backend
# 3. mcp.py registers tools so Claude can interact with the app
# 4. api.py exposes REST endpoints for the Dashboard UI
# 5. Dashboard/app/{app-name}/ renders the frontend
#
# This reading list app is a complete example of the pattern.
# Use it as a template when building your own custom apps.

"""Reading List module - Track books, articles, and papers.

This module provides:
- Reading list item CRUD operations
- Status tracking (want-to-read, reading, finished, abandoned)
- Tag-based organization
- Reading statistics

Usage:
    from modules.reading_list import ReadingListService

    service = ReadingListService()
    item = service.add(title="Thinking Fast and Slow", author="Daniel Kahneman")
    service.update(item["id"], status="reading")
"""

from .service import ReadingListService

__all__ = ['ReadingListService']
