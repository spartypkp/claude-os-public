"""Calendar renderer for visual calendar displays."""

from datetime import datetime
from typing import Any, Dict, List
import logging

from .base import BaseRenderer

logger = logging.getLogger(__name__)


class CalendarRenderer(BaseRenderer):
    """Renderer for calendar events."""

    def render_telegram(self, events: List[Dict[str, Any]]) -> bytes:
        """Render calendar as PNG image for Telegram.

        Args:
            events: List of calendar events

        Returns:
            PNG image as bytes
        """
        # Calculate image height based on number of events
        header_height = 100
        event_height = 80
        footer_height = 40
        total_height = header_height + (len(events) * event_height) + footer_height

        # Create image
        img, draw = self._create_image(total_height)

        # Draw header
        self._draw_text_centered(
            draw,
            "📅 Today's Schedule",
            self.PADDING,
            self.fonts["title"],
            self.COLOR_TEXT
        )

        # Draw date subtitle
        today = datetime.now().strftime("%A, %B %d, %Y")
        self._draw_text_centered(
            draw,
            today,
            self.PADDING + 45,
            self.fonts["small"],
            self.COLOR_TEXT_LIGHT
        )

        # Draw events
        y = header_height
        if not events:
            # No events today
            self._draw_text_centered(
                draw,
                "No events scheduled",
                y + 30,
                self.fonts["body"],
                self.COLOR_TEXT_LIGHT
            )
        else:
            for event in events:
                self._draw_event(draw, event, y)
                y += event_height

        # Convert to PNG
        return self._to_png_bytes(img)

    def _draw_event(self, draw, event: Dict[str, Any], y: int):
        """Draw a single event.

        Args:
            draw: ImageDraw object
            event: Event data
            y: Y position
        """
        # Parse event data
        title = event.get("summary", "Untitled")
        start = event.get("start")
        end = event.get("end")
        location = event.get("location")
        all_day = event.get("all_day", False)

        # Format time
        if all_day:
            time_str = "All day"
        else:
            # Parse datetime if it's a string
            if isinstance(start, str):
                start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            else:
                start_dt = start

            if isinstance(end, str):
                end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            else:
                end_dt = end

            time_str = f"{start_dt.strftime('%I:%M %p')} - {end_dt.strftime('%I:%M %p')}"

        # Draw event card
        card_x1 = self.PADDING
        card_x2 = self.WIDTH - self.PADDING
        card_y1 = y + 5
        card_y2 = y + 75

        # Light background for event
        self._draw_rounded_rect(
            draw,
            (card_x1, card_y1, card_x2, card_y2),
            radius=8,
            fill="#F9FAFB",
            outline="#E5E7EB",
            width=1
        )

        # Draw time (left side)
        draw.text(
            (card_x1 + 15, card_y1 + 12),
            time_str,
            font=self.fonts["small"],
            fill=self.COLOR_ACCENT
        )

        # Draw title
        draw.text(
            (card_x1 + 15, card_y1 + 32),
            title[:50],  # Truncate long titles
            font=self.fonts["body"],
            fill=self.COLOR_TEXT
        )

        # Draw location if present
        if location:
            draw.text(
                (card_x1 + 15, card_y1 + 55),
                f"📍 {location[:40]}",  # Truncate long locations
                font=self.fonts["small"],
                fill=self.COLOR_TEXT_LIGHT
            )

    def render_dashboard(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Render calendar as component data for Dashboard.

        Args:
            events: List of calendar events

        Returns:
            Component data dict
        """
        return {
            "type": "calendar",
            "events": events,
            "date": datetime.now().isoformat()
        }
