"""Calendar renderer — dark theme timeline layout."""

from datetime import datetime
from typing import Any, Dict, List
import logging

from .base import BaseRenderer

logger = logging.getLogger(__name__)


class CalendarRenderer(BaseRenderer):
    """Renderer for calendar events."""

    EVENT_CARD_HEIGHT = 76
    EVENT_CARD_GAP = 10

    def render_telegram(self, events: List[Dict[str, Any]]) -> bytes:
        """Render calendar as a dark-themed PNG image."""
        # Calculate height
        header_height = 100
        footer_height = 30
        content_height = max(
            60,  # empty state
            len(events) * (self.EVENT_CARD_HEIGHT + self.EVENT_CARD_GAP)
        )
        total_height = header_height + content_height + footer_height

        img, draw = self._create_image(total_height)

        # Header
        today = datetime.now().strftime("%A, %B %d")
        y = self._draw_header(draw, "Today's Schedule", today, self.PADDING)

        if not events:
            self._draw_empty_state(draw, "No events scheduled", y + 20)
        else:
            for event in events:
                self._draw_event(draw, event, y)
                y += self.EVENT_CARD_HEIGHT + self.EVENT_CARD_GAP

        return self._to_png_bytes(img)

    def _draw_event(self, draw, event: Dict[str, Any], y: int):
        """Draw a single event card with accent bar."""
        title = event.get("title", "Untitled")
        start = event.get("start_time")
        end = event.get("end_time")
        location = event.get("location")
        all_day = event.get("all_day", False)

        # Determine accent color
        accent = self.COLOR_PURPLE if all_day else self.COLOR_ACCENT

        # Format time string
        if all_day:
            time_str = "ALL DAY"
        else:
            try:
                if isinstance(start, str):
                    start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
                else:
                    start_dt = start

                if isinstance(end, str):
                    end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
                else:
                    end_dt = end

                time_str = f"{start_dt.strftime('%I:%M %p')} – {end_dt.strftime('%I:%M %p')}"
            except Exception:
                time_str = ""

        # Card bounds
        card_x1 = self.PADDING
        card_x2 = self.WIDTH - self.PADDING
        card_y1 = y
        card_y2 = y + self.EVENT_CARD_HEIGHT

        # Draw accent card
        self._draw_accent_card(draw, (card_x1, card_y1, card_x2, card_y2), accent)

        # Time (accent color, top-left inside card)
        text_x = card_x1 + self.ACCENT_BAR_WIDTH + self.CARD_PADDING + 4
        draw.text(
            (text_x, card_y1 + 12),
            time_str,
            font=self.fonts["small"],
            fill=accent,
        )

        # Title
        draw.text(
            (text_x, card_y1 + 32),
            title[:60],
            font=self.fonts["body"],
            fill=self.COLOR_TEXT,
        )

        # Location (muted, below title)
        if location:
            draw.text(
                (text_x, card_y1 + 54),
                location[:50],
                font=self.fonts["small"],
                fill=self.COLOR_TEXT_MUTED,
            )
