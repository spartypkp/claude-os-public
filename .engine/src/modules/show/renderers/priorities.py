"""Priorities renderer — dark theme with level-based accent colors."""

from datetime import datetime
from typing import Any, Dict, List
import logging

from .base import BaseRenderer

logger = logging.getLogger(__name__)


class PrioritiesRenderer(BaseRenderer):
    """Renderer for priority lists."""

    SECTION_HEADER_HEIGHT = 44
    ITEM_CARD_HEIGHT = 52
    ITEM_CARD_GAP = 8
    SECTION_GAP = 20

    LEVEL_COLORS = {
        "critical": None,  # filled at render from self constants
        "medium": None,
        "low": None,
    }

    def render_telegram(self, priorities: List[Dict[str, Any]]) -> bytes:
        """Render priorities as a dark-themed PNG image."""
        # Map level colors
        level_colors = {
            "critical": self.COLOR_CRITICAL,
            "medium": self.COLOR_MEDIUM,
            "low": self.COLOR_LOW,
        }

        # Group by level (uncompleted only)
        groups = {}
        for level in ("critical", "medium", "low"):
            items = [p for p in priorities if p.get("level") == level and not p.get("completed")]
            if items:
                groups[level] = items

        # Calculate height
        header_height = 100
        footer_height = 30
        content_height = 0

        if not groups:
            content_height = 60
        else:
            for level, items in groups.items():
                content_height += self.SECTION_HEADER_HEIGHT
                content_height += len(items) * (self.ITEM_CARD_HEIGHT + self.ITEM_CARD_GAP)
                content_height += self.SECTION_GAP

        total_height = header_height + content_height + footer_height
        img, draw = self._create_image(total_height)

        # Header
        today = datetime.now().strftime("%A, %B %d")
        y = self._draw_header(draw, "Today's Priorities", today, self.PADDING)

        if not groups:
            self._draw_empty_state(draw, "No priorities for today", y + 20)
        else:
            for level, items in groups.items():
                color = level_colors[level]
                y = self._draw_section(draw, items, y, level.upper(), color)
                y += self.SECTION_GAP

        return self._to_png_bytes(img)

    def _draw_section(
        self,
        draw,
        items: List[Dict[str, Any]],
        y: int,
        label: str,
        color: str,
    ) -> int:
        """Draw a priority section with colored header bar and item cards."""
        # Section header: colored bar + label
        bar_y = y + 4
        draw.rounded_rectangle(
            (self.PADDING, bar_y, self.PADDING + 6, bar_y + 28),
            radius=3,
            fill=color,
        )
        draw.text(
            (self.PADDING + 16, bar_y + 3),
            label,
            font=self.fonts["small"],
            fill=color,
        )
        y += self.SECTION_HEADER_HEIGHT

        # Item cards
        for item in items:
            content = item.get("content", "")
            completed = item.get("completed", False)

            card_x1 = self.PADDING
            card_x2 = self.WIDTH - self.PADDING
            card_y1 = y
            card_y2 = y + self.ITEM_CARD_HEIGHT

            self._draw_accent_card(draw, (card_x1, card_y1, card_x2, card_y2), color)

            # Checkbox
            text_x = card_x1 + self.ACCENT_BAR_WIDTH + self.CARD_PADDING + 4
            checkbox = "\u2713" if completed else "\u25A1"
            text_color = self.COLOR_TEXT_DIM if completed else self.COLOR_TEXT

            draw.text(
                (text_x, card_y1 + 16),
                f"{checkbox}  {content[:70]}",
                font=self.fonts["body"],
                fill=text_color,
            )

            y += self.ITEM_CARD_HEIGHT + self.ITEM_CARD_GAP

        return y
