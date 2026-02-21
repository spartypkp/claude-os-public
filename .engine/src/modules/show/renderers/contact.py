"""Contact renderer — dark theme card layout."""

from typing import Any, Dict, List
import logging

from .base import BaseRenderer

logger = logging.getLogger(__name__)


class ContactRenderer(BaseRenderer):
    """Renderer for contact cards."""

    INFO_LINE_HEIGHT = 34
    TAG_HEIGHT = 28

    def render_telegram(self, contact: Dict[str, Any]) -> bytes:
        """Render contact as a dark-themed PNG card."""
        # Calculate dynamic height
        height = 0
        height += 40   # top padding
        height += 30   # "Contact" label
        height += 48   # name
        height += 36   # role/company subtitle (or gap)
        height += 20   # divider gap

        # Info fields
        info_fields = self._get_info_fields(contact)
        if info_fields:
            height += len(info_fields) * self.INFO_LINE_HEIGHT + 24  # card with padding

        # Tags
        tags = contact.get("tags")
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        if tags:
            height += self.TAG_HEIGHT + 20

        # Description
        description = contact.get("description")
        if description:
            height += 70  # description card

        height += 30  # bottom padding

        img, draw = self._create_image(height)

        # Header area
        y = self.PADDING

        # "Contact" label
        self._draw_text_centered(draw, "CONTACT", y, self.fonts["tiny"], self.COLOR_TEXT_DIM)
        y += 28

        # Name (large, centered)
        name = contact.get("name", "Unknown")
        self._draw_text_centered(draw, name, y, self.fonts["title"], self.COLOR_TEXT)
        y += 42

        # Role / Company subtitle
        company = contact.get("company")
        role = contact.get("role")
        if company or role:
            parts = []
            if role:
                parts.append(role)
            if company:
                parts.append(company)
            subtitle = " at ".join(parts) if len(parts) == 2 else parts[0]
            self._draw_text_centered(draw, subtitle[:60], y, self.fonts["body"], self.COLOR_ACCENT)
            y += 32
        else:
            y += 8

        # Divider
        div_x1 = self.PADDING + 60
        div_x2 = self.WIDTH - self.PADDING - 60
        draw.line([(div_x1, y), (div_x2, y)], fill=self.COLOR_DIVIDER, width=1)
        y += 20

        # Info card
        if info_fields:
            card_x1 = self.PADDING
            card_x2 = self.WIDTH - self.PADDING
            card_h = len(info_fields) * self.INFO_LINE_HEIGHT + 24
            card_y1 = y
            card_y2 = y + card_h

            self._draw_rounded_rect(draw, (card_x1, card_y1, card_x2, card_y2), radius=self.CARD_RADIUS, fill=self.COLOR_CARD)

            info_y = card_y1 + 12
            for icon, value in info_fields:
                draw.text(
                    (card_x1 + 20, info_y),
                    icon,
                    font=self.fonts["body"],
                    fill=self.COLOR_TEXT_MUTED,
                )
                draw.text(
                    (card_x1 + 50, info_y),
                    value,
                    font=self.fonts["body"],
                    fill=self.COLOR_TEXT,
                )
                info_y += self.INFO_LINE_HEIGHT

            y = card_y2 + 16

        # Tags as colored pills
        if tags:
            tag_x = self.PADDING
            for tag in tags[:6]:
                tag_text = f"#{tag}"
                bbox = draw.textbbox((0, 0), tag_text, font=self.fonts["small"])
                tw = bbox[2] - bbox[0]
                pill_w = tw + 16
                pill_h = self.TAG_HEIGHT

                if tag_x + pill_w > self.WIDTH - self.PADDING:
                    break  # don't overflow

                # Pill background
                self._draw_rounded_rect(
                    draw,
                    (tag_x, y, tag_x + pill_w, y + pill_h),
                    radius=pill_h // 2,
                    fill=self.COLOR_CARD,
                )
                draw.text(
                    (tag_x + 8, y + 5),
                    tag_text,
                    font=self.fonts["small"],
                    fill=self.COLOR_ACCENT,
                )
                tag_x += pill_w + 8

            y += self.TAG_HEIGHT + 16

        # Description card
        if description:
            desc_text = description[:140] + "..." if len(description) > 140 else description
            card_x1 = self.PADDING
            card_x2 = self.WIDTH - self.PADDING

            self._draw_accent_card(
                draw,
                (card_x1, y, card_x2, y + 52),
                self.COLOR_TEXT_DIM,
            )

            draw.text(
                (card_x1 + self.ACCENT_BAR_WIDTH + self.CARD_PADDING + 4, y + 16),
                desc_text,
                font=self.fonts["small"],
                fill=self.COLOR_TEXT_MUTED,
            )

        return self._to_png_bytes(img)

    def _get_info_fields(self, contact: Dict[str, Any]) -> list[tuple[str, str]]:
        """Extract non-empty info fields as (icon, value) pairs."""
        fields = []
        if contact.get("phone"):
            fields.append(("\u260E", contact["phone"]))
        if contact.get("email"):
            fields.append(("\u2709", contact["email"][:50]))
        if contact.get("location"):
            fields.append(("\u25C9", contact["location"]))
        if contact.get("relationship"):
            fields.append(("\u2194", contact["relationship"].title()))
        return fields
