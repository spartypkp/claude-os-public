"""Base renderer for visual content generation — dark theme."""

from abc import ABC, abstractmethod
from typing import Any, Dict
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import logging

logger = logging.getLogger(__name__)


class BaseRenderer(ABC):
    """Abstract base class for content renderers."""

    # Layout
    WIDTH = 900
    PADDING = 40
    CARD_PADDING = 16
    CARD_RADIUS = 12
    ACCENT_BAR_WIDTH = 4

    # Dark palette (Tailwind slate)
    COLOR_BG = "#0F172A"          # slate-900
    COLOR_CARD = "#1E293B"        # slate-800
    COLOR_CARD_BORDER = "#334155" # slate-700
    COLOR_TEXT = "#F1F5F9"        # slate-100
    COLOR_TEXT_MUTED = "#94A3B8"  # slate-400
    COLOR_TEXT_DIM = "#64748B"    # slate-500
    COLOR_DIVIDER = "#334155"     # slate-700

    # Accent colors (bright on dark)
    COLOR_ACCENT = "#60A5FA"      # blue-400
    COLOR_CRITICAL = "#F87171"    # red-400
    COLOR_MEDIUM = "#FBBF24"      # amber-400
    COLOR_LOW = "#34D399"         # emerald-400
    COLOR_PURPLE = "#A78BFA"      # violet-400

    def __init__(self):
        """Initialize renderer."""
        self.fonts = self._load_fonts()

    def _load_fonts(self) -> Dict[str, ImageFont.FreeTypeFont]:
        """Load system fonts with fallbacks."""
        fonts = {}

        font_paths = [
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]

        for name, size in [("title", 28), ("heading", 22), ("body", 17), ("small", 14), ("tiny", 12)]:
            font = None
            for path in font_paths:
                try:
                    font = ImageFont.truetype(path, size)
                    break
                except (OSError, IOError):
                    continue

            if font is None:
                logger.warning(f"Could not load custom font for {name}, using default")
                font = ImageFont.load_default()

            fonts[name] = font

        return fonts

    def _create_image(self, height: int) -> tuple[Image.Image, ImageDraw.Draw]:
        """Create a new image with dark background."""
        img = Image.new('RGB', (self.WIDTH, height), self.COLOR_BG)
        draw = ImageDraw.Draw(img)
        return img, draw

    def _draw_rounded_rect(
        self,
        draw: ImageDraw.Draw,
        xy: tuple[int, int, int, int],
        radius: int,
        fill: str,
        outline: str = None,
        width: int = 1
    ):
        """Draw a rounded rectangle."""
        draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

    def _draw_accent_card(
        self,
        draw: ImageDraw.Draw,
        xy: tuple[int, int, int, int],
        accent_color: str,
    ):
        """Draw a card with a left accent bar.

        Args:
            draw: ImageDraw object
            xy: Bounding box (x1, y1, x2, y2)
            accent_color: Color for the left accent bar
        """
        x1, y1, x2, y2 = xy

        # Card background
        self._draw_rounded_rect(draw, (x1, y1, x2, y2), radius=self.CARD_RADIUS, fill=self.COLOR_CARD)

        # Left accent bar (drawn as a thin rounded rect clipped to the card)
        bar_x2 = x1 + self.ACCENT_BAR_WIDTH
        self._draw_rounded_rect(
            draw,
            (x1, y1, bar_x2 + self.CARD_RADIUS, y2),
            radius=self.CARD_RADIUS,
            fill=accent_color,
        )
        # Fill the right side of the accent bar with card color to clean up
        draw.rectangle((bar_x2, y1 + 1, bar_x2 + self.CARD_RADIUS, y2 - 1), fill=self.COLOR_CARD)

    def _draw_header(
        self,
        draw: ImageDraw.Draw,
        title: str,
        subtitle: str,
        y: int,
    ) -> int:
        """Draw a header block with title and subtitle.

        Returns:
            Y position after the header.
        """
        # Title
        self._draw_text_centered(draw, title, y, self.fonts["title"], self.COLOR_TEXT)
        y += 38

        # Subtitle
        self._draw_text_centered(draw, subtitle, y, self.fonts["small"], self.COLOR_TEXT_MUTED)
        y += 24

        # Divider line
        div_x1 = self.PADDING + 60
        div_x2 = self.WIDTH - self.PADDING - 60
        draw.line([(div_x1, y), (div_x2, y)], fill=self.COLOR_DIVIDER, width=1)
        y += 20

        return y

    def _draw_text_centered(
        self,
        draw: ImageDraw.Draw,
        text: str,
        y: int,
        font: ImageFont.FreeTypeFont,
        color: str
    ):
        """Draw text centered horizontally."""
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        x = (self.WIDTH - text_width) // 2
        draw.text((x, y), text, font=font, fill=color)

    def _draw_empty_state(self, draw: ImageDraw.Draw, text: str, y: int):
        """Draw a centered muted empty-state message."""
        self._draw_text_centered(draw, text, y, self.fonts["body"], self.COLOR_TEXT_DIM)

    def _to_png_bytes(self, img: Image.Image) -> bytes:
        """Convert image to PNG bytes."""
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()

    @abstractmethod
    def render_telegram(self, data: Any) -> bytes:
        """Render content as PNG image for Telegram.

        Args:
            data: Content data to render

        Returns:
            PNG image as bytes
        """
        raise NotImplementedError
