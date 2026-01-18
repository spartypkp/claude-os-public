"""Widgets API routes - widget metadata and configuration."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


# Widget definitions - these are the available widgets
WIDGETS = [
    {
        "id": "calendar",
        "name": "Calendar",
        "description": "Shows today's schedule at a glance",
        "icon": "calendar",
        "category": "core",
        "defaultSize": {"width": 300, "height": 200},
        "minSize": {"width": 200, "height": 150},
        "maxSize": {"width": 500, "height": 400},
        "refreshInterval": 60,  # seconds
    },
    {
        "id": "priorities",
        "name": "Priorities",
        "description": "Current priorities from database",
        "icon": "list-checks",
        "category": "core",
        "defaultSize": {"width": 280, "height": 250},
        "minSize": {"width": 200, "height": 150},
        "maxSize": {"width": 400, "height": 500},
        "refreshInterval": 30,
    },
    {
        "id": "sessions",
        "name": "Active Sessions",
        "description": "Shows active Claude sessions",
        "icon": "users",
        "category": "core",
        "defaultSize": {"width": 250, "height": 180},
        "minSize": {"width": 200, "height": 120},
        "maxSize": {"width": 400, "height": 300},
        "refreshInterval": 10,
    },
    {
        "id": "workers",
        "name": "Background Workers",
        "description": "Shows running background workers",
        "icon": "cog",
        "category": "core",
        "defaultSize": {"width": 280, "height": 200},
        "minSize": {"width": 200, "height": 150},
        "maxSize": {"width": 400, "height": 400},
        "refreshInterval": 5,
    },
    {
        "id": "clock",
        "name": "Clock",
        "description": "Current time with date",
        "icon": "clock",
        "category": "utility",
        "defaultSize": {"width": 200, "height": 100},
        "minSize": {"width": 150, "height": 80},
        "maxSize": {"width": 300, "height": 150},
        "refreshInterval": 1,
    },
    {
        "id": "quicknotes",
        "name": "Quick Notes",
        "description": "Scratch pad for quick thoughts",
        "icon": "sticky-note",
        "category": "utility",
        "defaultSize": {"width": 250, "height": 200},
        "minSize": {"width": 200, "height": 150},
        "maxSize": {"width": 400, "height": 400},
        "refreshInterval": None,  # No auto-refresh
    },
    {
        "id": "leetcode-progress",
        "name": "LeetCode Progress",
        "description": "Problems solved and streak",
        "icon": "code",
        "category": "job-search",
        "app": "job-search",
        "defaultSize": {"width": 250, "height": 180},
        "minSize": {"width": 200, "height": 150},
        "maxSize": {"width": 350, "height": 250},
        "refreshInterval": 300,
    },
    {
        "id": "dsa-weak",
        "name": "Weak Topics",
        "description": "DS&A topics that need practice",
        "icon": "alert-triangle",
        "category": "job-search",
        "app": "job-search",
        "defaultSize": {"width": 250, "height": 200},
        "minSize": {"width": 200, "height": 150},
        "maxSize": {"width": 350, "height": 350},
        "refreshInterval": 600,
    },
]


@router.get("/available")
async def get_available_widgets():
    """Get all available widgets."""
    return {
        "widgets": WIDGETS,
        "categories": [
            {"id": "core", "name": "Core", "description": "Essential system widgets"},
            {"id": "utility", "name": "Utility", "description": "Helpful tools"},
            {"id": "job-search", "name": "Job Search", "description": "Interview prep tracking"},
        ],
    }


@router.get("/widget/{widget_id}")
async def get_widget(widget_id: str):
    """Get widget by ID."""
    for widget in WIDGETS:
        if widget["id"] == widget_id:
            return widget
    return {"error": "Widget not found"}


@router.get("/category/{category}")
async def get_widgets_by_category(category: str):
    """Get widgets by category."""
    widgets = [w for w in WIDGETS if w.get("category") == category]
    return {"widgets": widgets, "count": len(widgets)}

