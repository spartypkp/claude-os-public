"""
Analytics module - metrics, patterns, and usage tracking.

Provides:
- Work rhythm and session metrics
- Priority completion analytics
- Claude Code usage tracking
"""

from .usage_tracker import UsageTracker

__all__ = [
    "UsageTracker",
]
