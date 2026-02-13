"""Contact renderer for visual contact cards."""

from typing import Any, Dict
import logging

from .base import BaseRenderer

logger = logging.getLogger(__name__)


class ContactRenderer(BaseRenderer):
    """Renderer for contact cards."""

    def render_telegram(self, contact: Dict[str, Any]) -> bytes:
        """Render contact as PNG image for Telegram.

        Args:
            contact: Contact data

        Returns:
            PNG image as bytes
        """
        # Calculate image height based on content
        base_height = 400
        tags = contact.get("tags", [])
        notes = contact.get("notes", "")

        # Add height for tags and notes
        extra_height = 0
        if tags:
            extra_height += 40
        if notes:
            # Estimate lines (roughly 70 chars per line)
            lines = (len(notes) // 70) + 1
            extra_height += lines * 25

        total_height = base_height + extra_height

        # Create image
        img, draw = self._create_image(total_height)

        # Draw header with emoji
        y = self.PADDING
        self._draw_text_centered(
            draw,
            "👤 Contact",
            y,
            self.fonts["small"],
            self.COLOR_TEXT_LIGHT
        )
        y += 35

        # Draw name (large)
        name = contact.get("name", "Unknown")
        self._draw_text_centered(
            draw,
            name,
            y,
            self.fonts["title"],
            self.COLOR_TEXT
        )
        y += 55

        # Draw company and role
        company = contact.get("company")
        role = contact.get("role")

        if company or role:
            subtitle = []
            if role:
                subtitle.append(role)
            if company:
                subtitle.append(company)
            subtitle_text = " at ".join(subtitle) if len(subtitle) == 2 else subtitle[0]

            self._draw_text_centered(
                draw,
                subtitle_text[:60],  # Truncate if too long
                y,
                self.fonts["body"],
                self.COLOR_ACCENT
            )
            y += 40

        # Draw contact info section
        y += 20

        # Phone
        phone = contact.get("phone")
        if phone:
            draw.text(
                (self.PADDING + 20, y),
                f"📱 {phone}",
                font=self.fonts["body"],
                fill=self.COLOR_TEXT
            )
            y += 35

        # Email
        email = contact.get("email")
        if email:
            draw.text(
                (self.PADDING + 20, y),
                f"✉️  {email[:50]}",  # Truncate long emails
                font=self.fonts["body"],
                fill=self.COLOR_TEXT
            )
            y += 35

        # Location
        location = contact.get("location")
        if location:
            draw.text(
                (self.PADDING + 20, y),
                f"📍 {location}",
                font=self.fonts["body"],
                fill=self.COLOR_TEXT
            )
            y += 35

        # Relationship
        relationship = contact.get("relationship")
        if relationship:
            draw.text(
                (self.PADDING + 20, y),
                f"🤝 {relationship.title()}",
                font=self.fonts["body"],
                fill=self.COLOR_TEXT
            )
            y += 35

        # Tags
        if tags:
            y += 10
            tags_text = " • ".join([f"#{tag}" for tag in tags[:5]])  # Max 5 tags
            draw.text(
                (self.PADDING + 20, y),
                tags_text,
                font=self.fonts["small"],
                fill=self.COLOR_ACCENT
            )
            y += 30

        # Description
        description = contact.get("description")
        if description:
            y += 10
            # Draw in a subtle box
            card_x1 = self.PADDING
            card_x2 = self.WIDTH - self.PADDING
            card_y1 = y
            card_y2 = y + 60

            self._draw_rounded_rect(
                draw,
                (card_x1, card_y1, card_x2, card_y2),
                radius=8,
                fill="#F9FAFB",
                outline="#E5E7EB",
                width=1
            )

            # Draw description text (truncate if too long)
            desc_text = description[:120] + "..." if len(description) > 120 else description
            draw.text(
                (card_x1 + 15, card_y1 + 15),
                desc_text,
                font=self.fonts["small"],
                fill=self.COLOR_TEXT_LIGHT
            )

        # Convert to PNG
        return self._to_png_bytes(img)

    def render_dashboard(self, contact: Dict[str, Any]) -> Dict[str, Any]:
        """Render contact as component data for Dashboard.

        Args:
            contact: Contact data

        Returns:
            Component data dict
        """
        return {
            "type": "contact",
            "contact": contact
        }
