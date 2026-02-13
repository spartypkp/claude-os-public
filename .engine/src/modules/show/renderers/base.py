"""Base renderer for visual content generation."""

from abc import ABC, abstractmethod
from typing import Any, Dict
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import logging

logger = logging.getLogger(__name__)


class BaseRenderer(ABC):
    """Abstract base class for content renderers."""

    # Design constants
    WIDTH = 800  # Image width in pixels (readable on mobile)
    PADDING = 40  # Padding around content
    LINE_HEIGHT = 1.5  # Line height multiplier

    # Colors (hex)
    COLOR_BG = "#FFFFFF"
    COLOR_TEXT = "#1F2937"  # Dark gray
    COLOR_TEXT_LIGHT = "#6B7280"  # Medium gray
    COLOR_ACCENT = "#3B82F6"  # Blue
    COLOR_CRITICAL = "#EF4444"  # Red
    COLOR_MEDIUM = "#F59E0B"  # Amber
    COLOR_LOW = "#10B981"  # Green

    def __init__(self):
        """Initialize renderer."""
        self.fonts = self._load_fonts()

    def _load_fonts(self) -> Dict[str, ImageFont.FreeTypeFont]:
        """Load system fonts with fallbacks."""
        fonts = {}

        # Try to load San Francisco (macOS system font)
        font_paths = [
            "/System/Library/Fonts/SFNS.ttf",  # macOS SF
            "/System/Library/Fonts/Helvetica.ttc",  # macOS fallback
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",  # Linux
        ]

        # Load different sizes
        for name, size in [("title", 32), ("heading", 24), ("body", 18), ("small", 14)]:
            font = None
            for path in font_paths:
                try:
                    font = ImageFont.truetype(path, size)
                    break
                except (OSError, IOError):
                    continue

            if font is None:
                # Fallback to default PIL font
                logger.warning(f"Could not load custom font for {name}, using default")
                font = ImageFont.load_default()

            fonts[name] = font

        return fonts

    def _create_image(self, height: int) -> tuple[Image.Image, ImageDraw.Draw]:
        """Create a new image with white background.

        Args:
            height: Image height in pixels

        Returns:
            Tuple of (image, draw) objects
        """
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
        """Draw a rounded rectangle.

        Args:
            draw: ImageDraw object
            xy: Bounding box (x1, y1, x2, y2)
            radius: Corner radius
            fill: Fill color (hex)
            outline: Outline color (hex), optional
            width: Outline width
        """
        draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

    def _draw_text_centered(
        self,
        draw: ImageDraw.Draw,
        text: str,
        y: int,
        font: ImageFont.FreeTypeFont,
        color: str
    ):
        """Draw text centered horizontally.

        Args:
            draw: ImageDraw object
            text: Text to draw
            y: Y position (top of text)
            font: Font to use
            color: Text color (hex)
        """
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        x = (self.WIDTH - text_width) // 2
        draw.text((x, y), text, font=font, fill=color)

    def _to_png_bytes(self, img: Image.Image) -> bytes:
        """Convert image to PNG bytes.

        Args:
            img: PIL Image

        Returns:
            PNG image as bytes
        """
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

    @abstractmethod
    def render_dashboard(self, data: Any) -> Dict[str, Any]:
        """Render content as component data for Dashboard.

        Args:
            data: Content data to render

        Returns:
            Component data dict
        """
        raise NotImplementedError
