# === CUSTOM APP PATTERN ===
# mcp.py registers MCP tools so Claude can interact with your app.
# Each app creates its own FastMCP instance that gets mounted on the main server.
# The tool function uses the service layer for all business logic.

"""Reading List MCP tool - Manage your reading queue through Claude."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastmcp import FastMCP

from .service import ReadingListService

mcp = FastMCP("life-reading-list")


@mcp.tool()
def reading_list(
    operation: str,
    title: Optional[str] = None,
    author: Optional[str] = None,
    type: Optional[str] = None,
    id: Optional[str] = None,
    status: Optional[str] = None,
    rating: Optional[int] = None,
    notes: Optional[str] = None,
    tags: Optional[List[str]] = None,
    tag: Optional[str] = None,
) -> Dict[str, Any]:
    """Reading list management - track books, articles, and papers.

    Args:
        operation: Operation - 'list', 'add', 'update', 'remove', 'stats'
        title: Item title (required for add)
        author: Author name (optional)
        type: Item type - 'book', 'article', 'paper', 'other' (default book)
        id: Item ID (required for update, remove)
        status: Item status - 'want-to-read', 'reading', 'finished', 'abandoned'
        rating: Rating 1-5 (optional, typically set when finished)
        notes: Notes about the item
        tags: List of tags for organization
        tag: Filter by tag (for list operation)

    Returns:
        Object with success status and operation-specific data

    Examples:
        reading_list("add", title="Thinking Fast and Slow", author="Daniel Kahneman", type="book")
        reading_list("list", status="reading")
        reading_list("update", id="abc12345", status="finished", rating=5)
        reading_list("remove", id="abc12345")
        reading_list("stats")
    """
    try:
        service = ReadingListService()

        if operation == "add":
            if not title:
                return {"success": False, "error": "title required for add"}

            item = service.add(
                title=title,
                author=author,
                type=type or "book",
                tags=tags,
                notes=notes,
            )

            return {
                "success": True,
                "item": item,
                "message": f"Added '{title}' to your reading list",
            }

        elif operation == "list":
            items = service.list(status=status, type=type, tag=tag)

            return {
                "success": True,
                "items": items,
                "count": len(items),
            }

        elif operation == "update":
            if not id:
                return {"success": False, "error": "id required for update"}

            item = service.update(
                item_id=id,
                title=title,
                author=author,
                status=status,
                rating=rating,
                notes=notes,
                tags=tags,
            )

            if not item:
                return {"success": False, "error": f"Item '{id}' not found"}

            return {
                "success": True,
                "item": item,
                "message": f"Updated '{item['title']}'",
            }

        elif operation == "remove":
            if not id:
                return {"success": False, "error": "id required for remove"}

            # Get title before removing for the message
            item = service.get(id)
            if not item:
                return {"success": False, "error": f"Item '{id}' not found"}

            service.remove(id)

            return {
                "success": True,
                "message": f"Removed '{item['title']}' from your reading list",
            }

        elif operation == "stats":
            stats = service.stats()
            return {"success": True, **stats}

        else:
            return {
                "success": False,
                "error": f"Unknown operation: {operation}. Use list, add, update, remove, or stats.",
            }

    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}
