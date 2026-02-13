"""Priorities renderer for visual priority displays."""

from datetime import datetime
from typing import Any, Dict, List
import logging

from .base import BaseRenderer

logger = logging.getLogger(__name__)


class PrioritiesRenderer(BaseRenderer):
    """Renderer for priority lists."""

    def render_telegram(self, priorities: List[Dict[str, Any]]) -> bytes:
        """Render priorities as PNG image for Telegram.

        Args:
            priorities: List of priority items

        Returns:
            PNG image as bytes
        """
        # Group priorities by level
        critical = [p for p in priorities if p.get("level") == "critical" and not p.get("completed")]
        medium = [p for p in priorities if p.get("level") == "medium" and not p.get("completed")]
        low = [p for p in priorities if p.get("level") == "low" and not p.get("completed")]

        # Calculate image height
        header_height = 100
        section_header_height = 50
        item_height = 60
        footer_height = 40

        total_height = header_height + footer_height
        if critical:
            total_height += section_header_height + (len(critical) * item_height)
        if medium:
            total_height += section_header_height + (len(medium) * item_height)
        if low:
            total_height += section_header_height + (len(low) * item_height)

        # Create image
        img, draw = self._create_image(total_height)

        # Draw header
        self._draw_text_centered(
            draw,
            "📋 Today's Priorities",
            self.PADDING,
            self.fonts["title"],
            self.COLOR_TEXT
        )

        # Draw date subtitle
        today = datetime.now().strftime("%A, %B %d")
        self._draw_text_centered(
            draw,
            today,
            self.PADDING + 45,
            self.fonts["small"],
            self.COLOR_TEXT_LIGHT
        )

        # Draw priorities by level
        y = header_height

        if not critical and not medium and not low:
            # No priorities
            self._draw_text_centered(
                draw,
                "No priorities for today",
                y + 30,
                self.fonts["body"],
                self.COLOR_TEXT_LIGHT
            )
        else:
            if critical:
                y = self._draw_priority_section(
                    draw, critical, y, "🔴 Critical", self.COLOR_CRITICAL
                )

            if medium:
                y = self._draw_priority_section(
                    draw, medium, y, "🟡 Medium", self.COLOR_MEDIUM
                )

            if low:
                y = self._draw_priority_section(
                    draw, low, y, "🟢 Low", self.COLOR_LOW
                )

        # Convert to PNG
        return self._to_png_bytes(img)

    def _draw_priority_section(
        self,
        draw,
        items: List[Dict[str, Any]],
        y: int,
        title: str,
        color: str
    ) -> int:
        """Draw a priority section.

        Args:
            draw: ImageDraw object
            items: Priority items
            y: Y position
            title: Section title
            color: Section color

        Returns:
            New Y position after drawing section
        """
        # Draw section header
        draw.text(
            (self.PADDING, y + 15),
            title,
            font=self.fonts["heading"],
            fill=color
        )
        y += 50

        # Draw items
        for item in items:
            content = item.get("content", "")
            completed = item.get("completed", False)

            # Determine checkbox emoji
            checkbox = "✅" if completed else "☐"

            # Draw item card
            card_x1 = self.PADDING
            card_x2 = self.WIDTH - self.PADDING
            card_y1 = y + 5
            card_y2 = y + 55

            # Light background
            self._draw_rounded_rect(
                draw,
                (card_x1, card_y1, card_x2, card_y2),
                radius=8,
                fill="#F9FAFB",
                outline="#E5E7EB",
                width=1
            )

            # Draw checkbox and content
            text = f"{checkbox}  {content[:70]}"  # Truncate long content
            draw.text(
                (card_x1 + 15, card_y1 + 18),
                text,
                font=self.fonts["body"],
                fill=self.COLOR_TEXT if not completed else self.COLOR_TEXT_LIGHT
            )

            y += 60

        return y

    def render_dashboard(self, priorities: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Render priorities as component data for Dashboard.

        Args:
            priorities: List of priority items

        Returns:
            Component data dict
        """
        return {
            "type": "priorities",
            "items": priorities,
            "date": datetime.now().isoformat()
        }
