"""Telegram Service - Bridge between Telegram and Chief's Claude session.

Bidirectional integration:
- Outgoing: Watch Chief's transcript, forward text responses to Telegram
- Incoming: Receive messages from Telegram, inject into Chief's tmux session

Architecture matches Dashboard - Telegram is just another interface to Chief.

BotFather Command Setup:
1. Open @BotFather in Telegram
2. Send /setcommands
3. Select your bot
4. Paste the following:

calendar - Show today's schedule
priorities - Show active priorities
status - Check Claude's current status
spawn - Spawn a specialist (builder/researcher)

This registers the commands so they appear with autocomplete in Telegram.
"""

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict

import aiohttp
from bs4 import BeautifulSoup

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    MessageHandler,
    CommandHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)
from telegram.constants import ParseMode

from services.sessions import SessionManager
from services.transcript import stream_transcript
from services.storage import SystemStorage
from utils.tmux import inject_message
from config import settings

logger = logging.getLogger(__name__)

# Telegram message length limit
MAX_MESSAGE_LENGTH = 4096

# Config from environment
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
AUTHORIZED_USER_ID = os.getenv("TELEGRAM_USER_ID")


class TelegramService:
    """Telegram bot service that bridges Telegram with Chief's Claude session."""

    def __init__(self):
        """Initialize the Telegram service."""
        self.bot_token = BOT_TOKEN
        self.authorized_user_id = int(AUTHORIZED_USER_ID) if AUTHORIZED_USER_ID else None
        self.session_manager = SessionManager()
        self.application: Optional[Application] = None
        self._stop_event = asyncio.Event()
        self._transcript_task: Optional[asyncio.Task] = None

        # Initialize services for command handlers
        self.storage = SystemStorage(settings.db_path)

        # State for multi-step conversations (e.g., /spawn waiting for spec)
        self.conversation_state: Dict[int, dict] = {}  # user_id -> state dict

    async def start(self):
        """Start the Telegram service (polling + transcript watching)."""
        if not self.bot_token:
            logger.warning("TELEGRAM_BOT_TOKEN not set - Telegram service disabled")
            return

        if not self.authorized_user_id:
            logger.warning("TELEGRAM_USER_ID not set - Telegram service disabled")
            return

        logger.info("Starting Telegram service...")

        # Build the Application
        self.application = (
            Application.builder()
            .token(self.bot_token)
            .build()
        )

        # Register command handlers
        self.application.add_handler(CommandHandler("calendar", self.calendar_command))
        self.application.add_handler(CommandHandler("priorities", self.priorities_command))
        self.application.add_handler(CommandHandler("status", self.status_command))
        self.application.add_handler(CommandHandler("spawn", self.spawn_command))

        # Register callback query handler (for inline buttons)
        self.application.add_handler(CallbackQueryHandler(self.handle_callback_query))

        # Register message handlers
        self.application.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_telegram_message)
        )
        self.application.add_handler(
            MessageHandler(filters.PHOTO, self.handle_photo_message)
        )
        self.application.add_handler(
            MessageHandler(filters.LOCATION, self.handle_location_message)
        )

        # Start polling in background
        await self.application.initialize()
        await self.application.start()
        await self.application.updater.start_polling(drop_pending_updates=True)

        logger.info("Telegram bot polling started")

        # Start transcript watching
        self._transcript_task = asyncio.create_task(self._watch_chief_transcript())

        logger.info("Telegram service started successfully")

    async def stop(self):
        """Stop the Telegram service gracefully."""
        logger.info("Stopping Telegram service...")
        self._stop_event.set()

        if self._transcript_task:
            self._transcript_task.cancel()
            try:
                await self._transcript_task
            except asyncio.CancelledError:
                pass

        if self.application:
            await self.application.updater.stop()
            await self.application.stop()
            await self.application.shutdown()

        logger.info("Telegram service stopped")

    async def handle_telegram_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming messages from Telegram.

        Validates user, then injects message into Chief's tmux session.
        """
        if not update.message or not update.message.text:
            return

        user_id = update.message.from_user.id
        message_text = update.message.text

        # Authentication check
        if user_id != self.authorized_user_id:
            logger.warning(f"Unauthorized Telegram user attempted access: {user_id}")
            await update.message.reply_text(
                "⚠️ Unauthorized. This bot is private."
            )
            return

        logger.info(f"Received Telegram message: {message_text[:100]}...")

        # Check if user is in a conversation flow (e.g., waiting to provide spec for /spawn)
        if user_id in self.conversation_state:
            state = self.conversation_state[user_id]
            if state.get("waiting_for") == "spawn_spec":
                # User is providing spec for /spawn command
                role = state.get("role")
                await self._handle_spawn_spec(update, role, message_text)
                del self.conversation_state[user_id]  # Clear state
                return

        # Enrich URLs in message before sending to Chief
        message_text = await self._extract_and_enrich_urls(message_text)

        # Find Chief's session
        chief_session = self._get_chief_session()
        if not chief_session:
            logger.error("Chief session not found - cannot inject message")
            await update.message.reply_text(
                "⚠️ Chief session not active. Cannot send message."
            )
            return

        # Inject into Chief's tmux pane with Telegram source tag
        success = inject_message(
            target=chief_session.tmux_pane,
            message=message_text,
            submit=True,
            source="Telegram"
        )

        if success:
            logger.info("Message injected into Chief's session successfully")
            # Don't send confirmation to avoid clutter - user will see Chief's response
        else:
            logger.error("Failed to inject message into Chief's tmux pane")
            await update.message.reply_text(
                "⚠️ Failed to send message to Chief. Check logs."
            )

    async def handle_photo_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming photo messages from Telegram.

        Downloads photo, saves to /tmp/telegram-photos/, and injects path to Chief.
        """
        if not update.message or not update.message.photo:
            return

        user_id = update.message.from_user.id

        # Authentication check
        if user_id != self.authorized_user_id:
            logger.warning(f"Unauthorized Telegram user attempted to send photo: {user_id}")
            await update.message.reply_text(
                "⚠️ Unauthorized. This bot is private."
            )
            return

        try:
            # Get the largest photo (best quality)
            photo = update.message.photo[-1]

            # Download photo
            file = await context.bot.get_file(photo.file_id)

            # Create tmp directory if needed
            tmp_dir = Path("/tmp/telegram-photos")
            tmp_dir.mkdir(parents=True, exist_ok=True)

            # Generate unique filename
            photo_id = str(uuid.uuid4())[:8]
            photo_path = tmp_dir / f"{photo_id}.jpg"

            # Download to local filesystem
            await file.download_to_drive(photo_path)

            logger.info(f"Downloaded photo to: {photo_path}")

            # Extract caption if present
            caption = update.message.caption or ""

            # Find Chief's session
            chief_session = self._get_chief_session()
            if not chief_session:
                logger.error("Chief session not found - cannot inject photo")
                await update.message.reply_text(
                    "⚠️ Chief session not active. Cannot send photo."
                )
                return

            # Build message for Chief with photo path
            if caption:
                message = f"I received a photo: {photo_path}\n\nCaption: {caption}"
            else:
                message = f"I received a photo: {photo_path}"

            # Inject into Chief's tmux pane
            success = inject_message(
                target=chief_session.tmux_pane,
                message=message,
                submit=True,
                source="Telegram"
            )

            if success:
                logger.info("Photo message injected into Chief's session successfully")
            else:
                logger.error("Failed to inject photo message into Chief's tmux pane")
                await update.message.reply_text(
                    "⚠️ Failed to send photo to Chief. Check logs."
                )

        except Exception as e:
            logger.error(f"Error handling photo message: {e}")
            await update.message.reply_text(
                "⚠️ Error processing photo. Check logs."
            )

    async def handle_location_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming location messages from Telegram.

        Extracts coordinates and injects to Chief with location context.
        """
        if not update.message or not update.message.location:
            return

        user_id = update.message.from_user.id

        # Authentication check
        if user_id != self.authorized_user_id:
            logger.warning(f"Unauthorized Telegram user attempted to share location: {user_id}")
            await update.message.reply_text(
                "⚠️ Unauthorized. This bot is private."
            )
            return

        try:
            # Extract coordinates
            latitude = update.message.location.latitude
            longitude = update.message.location.longitude

            logger.info(f"Received location: {latitude}, {longitude}")

            # Find Chief's session
            chief_session = self._get_chief_session()
            if not chief_session:
                logger.error("Chief session not found - cannot inject location")
                await update.message.reply_text(
                    "⚠️ Chief session not active. Cannot send location."
                )
                return

            # Build message for Chief
            message = f"[Location shared] Latitude: {latitude}, Longitude: {longitude}"

            # Inject into Chief's tmux pane
            success = inject_message(
                target=chief_session.tmux_pane,
                message=message,
                submit=True,
                source="Telegram"
            )

            if success:
                logger.info("Location message injected into Chief's session successfully")
            else:
                logger.error("Failed to inject location message into Chief's tmux pane")
                await update.message.reply_text(
                    "⚠️ Failed to send location to Chief. Check logs."
                )

        except Exception as e:
            logger.error(f"Error handling location message: {e}")
            await update.message.reply_text(
                "⚠️ Error processing location. Check logs."
            )

    async def calendar_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /calendar command - show today's events."""
        if not self._check_auth(update):
            return

        try:
            # Import calendar service
            from apps.calendar.service import CalendarService

            calendar_service = CalendarService(self.storage)
            today = datetime.now().strftime("%Y-%m-%d")

            # Get events for today
            events = calendar_service.list_events(from_date=today, to_date=today)

            if not events:
                await update.message.reply_text("📅 No events scheduled for today")
                return

            # Format events for mobile (concise, scannable)
            lines = ["📅 <b>Today's Schedule</b>\n"]
            for event in events:
                start_time = datetime.fromisoformat(event.start_time).strftime("%H:%M")
                lines.append(f"• {start_time} — {event.title}")

            response = "\n".join(lines)
            await update.message.reply_text(response, parse_mode=ParseMode.HTML)

        except Exception as e:
            logger.error(f"Error in calendar_command: {e}")
            await update.message.reply_text("⚠️ Error fetching calendar events")

    async def priorities_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /priorities command - show today's priorities."""
        if not self._check_auth(update):
            return

        try:
            # Import priorities service
            from apps.priorities.service import PrioritiesService

            priorities_service = PrioritiesService(self.storage)
            today = datetime.now().strftime("%Y-%m-%d")

            # Get priorities for today
            all_priorities = priorities_service.list_by_date(today)

            if not all_priorities:
                await update.message.reply_text("📋 No priorities for today")
                return

            # Format priorities by level
            lines = ["📋 <b>Today's Priorities</b>\n"]

            for level in ["critical", "medium", "low"]:
                level_priorities = [p for p in all_priorities if p.level == level and not p.completed]
                if level_priorities:
                    level_emoji = {"critical": "🔴", "medium": "🟡", "low": "🟢"}[level]
                    level_name = level.capitalize()
                    lines.append(f"\n<b>{level_emoji} {level_name}</b>")
                    for p in level_priorities:
                        checkbox = "☐"
                        lines.append(f"{checkbox} {p.content}")

            response = "\n".join(lines)
            await update.message.reply_text(response, parse_mode=ParseMode.HTML)

        except Exception as e:
            logger.error(f"Error in priorities_command: {e}")
            await update.message.reply_text("⚠️ Error fetching priorities")

    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /status command - show Claude's current status."""
        if not self._check_auth(update):
            return

        try:
            # Get all active sessions
            sessions = self.session_manager.get_active_sessions()

            chief_session = None
            specialists = []

            for session in sessions:
                if session.role == "chief":
                    chief_session = session
                else:
                    specialists.append(session)

            # Format status
            lines = ["🤖 <b>Claude Status</b>\n"]

            if chief_session:
                status_text = chief_session.status or "Active"
                lines.append(f"<b>Chief:</b> {status_text}")
            else:
                lines.append("<b>Chief:</b> Not active")

            if specialists:
                lines.append(f"\n<b>Active Specialists:</b>")
                for spec in specialists:
                    role = spec.role.capitalize()
                    spec_id = spec.conversation_id[:8] if spec.conversation_id else spec.session_id[:8]
                    lines.append(f"• {role} (ID: {spec_id})")
            else:
                lines.append("\n<i>No active specialists</i>")

            response = "\n".join(lines)

            # Add quick action buttons
            keyboard = [
                [
                    InlineKeyboardButton("📅 Calendar", callback_data="action:calendar"),
                    InlineKeyboardButton("📋 Priorities", callback_data="action:priorities")
                ]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)

            await update.message.reply_text(
                response,
                parse_mode=ParseMode.HTML,
                reply_markup=reply_markup
            )

        except Exception as e:
            logger.error(f"Error in status_command: {e}")
            await update.message.reply_text("⚠️ Error fetching status")

    async def spawn_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle /spawn command - spawn a specialist.

        Usage: /spawn builder or /spawn researcher
        """
        if not self._check_auth(update):
            return

        user_id = update.message.from_user.id

        # Parse arguments
        args = context.args
        if not args or args[0] not in ["builder", "researcher"]:
            await update.message.reply_text(
                "Usage: /spawn <role>\n\nAvailable roles:\n• builder\n• researcher"
            )
            return

        role = args[0]

        # Set conversation state to wait for spec
        self.conversation_state[user_id] = {
            "waiting_for": "spawn_spec",
            "role": role
        }

        await update.message.reply_text(
            f"📝 Spawning {role}.\n\nPlease send the spec for this {role}:"
        )

    async def _handle_spawn_spec(self, update: Update, role: str, spec_text: str):
        """Handle spec submission for /spawn command."""
        try:
            # Write spec to working directory
            import uuid
            spec_id = str(uuid.uuid4())[:8]
            spec_filename = f"telegram-spawn-{role}-{spec_id}.md"

            from pathlib import Path
            repo_root = Path(__file__).parent.parent.parent.parent
            spec_path = repo_root / "Desktop" / "working" / spec_filename

            # Write spec
            spec_path.write_text(spec_text)

            # Spawn specialist via team tool (import inline to avoid circular deps)
            from life_mcp.tools.core import team

            result = team(
                operation="spawn",
                role=role,
                spec_path=str(spec_path)
            )

            if result.get("success"):
                session_id = result.get("session_id", "unknown")[:8]
                await update.message.reply_text(
                    f"✅ {role.capitalize()} spawned (ID: {session_id})"
                )
            else:
                error = result.get("error", "Unknown error")
                await update.message.reply_text(
                    f"⚠️ Failed to spawn {role}: {error}"
                )

        except Exception as e:
            logger.error(f"Error in _handle_spawn_spec: {e}")
            await update.message.reply_text(
                f"⚠️ Error spawning {role}: {str(e)}"
            )

    async def handle_callback_query(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle inline keyboard button callbacks.

        Callback data format: action:command[:param]
        Examples:
        - action:calendar
        - action:priorities
        - action:mark_done:abc123
        """
        query = update.callback_query
        await query.answer()  # Acknowledge the callback

        if not query.from_user.id == self.authorized_user_id:
            return

        try:
            # Parse callback data
            callback_data = query.data
            parts = callback_data.split(":")

            if len(parts) < 2:
                return

            action_type = parts[0]
            command = parts[1]

            if action_type == "action":
                if command == "calendar":
                    # Fetch calendar events
                    from apps.calendar.service import CalendarService
                    calendar_service = CalendarService(self.storage)
                    today = datetime.now().strftime("%Y-%m-%d")
                    events = calendar_service.list_events(from_date=today, to_date=today)

                    if not events:
                        await query.message.reply_text("📅 No events scheduled for today")
                        return

                    lines = ["📅 <b>Today's Schedule</b>\n"]
                    for event in events:
                        start_time = datetime.fromisoformat(event.start_time).strftime("%H:%M")
                        lines.append(f"• {start_time} — {event.title}")

                    response = "\n".join(lines)
                    await query.message.reply_text(response, parse_mode=ParseMode.HTML)

                elif command == "priorities":
                    # Fetch priorities
                    from apps.priorities.service import PrioritiesService
                    priorities_service = PrioritiesService(self.storage)
                    today = datetime.now().strftime("%Y-%m-%d")
                    all_priorities = priorities_service.list_by_date(today)

                    if not all_priorities:
                        await query.message.reply_text("📋 No priorities for today")
                        return

                    lines = ["📋 <b>Today's Priorities</b>\n"]
                    for level in ["critical", "medium", "low"]:
                        level_priorities = [p for p in all_priorities if p.level == level and not p.completed]
                        if level_priorities:
                            level_emoji = {"critical": "🔴", "medium": "🟡", "low": "🟢"}[level]
                            level_name = level.capitalize()
                            lines.append(f"\n<b>{level_emoji} {level_name}</b>")
                            for p in level_priorities:
                                checkbox = "☐"
                                lines.append(f"{checkbox} {p.content}")

                    response = "\n".join(lines)
                    await query.message.reply_text(response, parse_mode=ParseMode.HTML)

                elif command == "mark_done":
                    # Mark priority as done
                    if len(parts) >= 3:
                        priority_id = parts[2]
                        from apps.priorities.service import PrioritiesService
                        priorities_service = PrioritiesService(self.storage)

                        try:
                            priorities_service.complete(priority_id)
                            await query.message.reply_text(f"✅ Priority marked complete")
                        except Exception as e:
                            await query.message.reply_text(f"⚠️ Error: {str(e)}")

        except Exception as e:
            logger.error(f"Error in handle_callback_query: {e}")
            await query.message.reply_text("⚠️ Error processing button action")

    async def _extract_and_enrich_urls(self, message_text: str) -> str:
        """Detect URLs in message and enrich with content where possible.

        Enriches:
        - Twitter/X URLs with tweet content
        - Google Maps URLs with location name
        - General URLs with preview note

        Falls back to raw URL if enrichment fails.
        """
        # URL regex pattern
        url_pattern = r'https?://[^\s]+'
        urls = re.findall(url_pattern, message_text)

        if not urls:
            return message_text

        enriched_text = message_text

        for url in urls:
            try:
                # Twitter/X enrichment
                if 'x.com' in url or 'twitter.com' in url:
                    enriched = await self._fetch_twitter_content(url)
                    if enriched:
                        # Replace URL with enriched content
                        enriched_text = enriched_text.replace(
                            url,
                            f"{enriched}\n\nOriginal: {url}"
                        )
                    continue

                # Google Maps enrichment
                if 'maps.google.com' in url or 'maps.app.goo.gl' in url:
                    enriched = await self._parse_google_maps_url(url)
                    if enriched:
                        enriched_text = enriched_text.replace(
                            url,
                            f"{enriched}\n{url}"
                        )
                    continue

                # General URLs - add note for Chief to use WebFetch if needed
                # Don't modify, just note availability

            except Exception as e:
                logger.error(f"Error enriching URL {url}: {e}")
                # Fall back to raw URL - don't crash

        return enriched_text

    async def _fetch_twitter_content(self, url: str) -> Optional[str]:
        """Fetch tweet content using Twitter oEmbed API.

        Returns formatted tweet string or None if fetch fails.
        """
        try:
            # Twitter oEmbed API (free, no auth, no rate limits)
            oembed_url = f"https://publish.x.com/oembed?url={url}"

            async with aiohttp.ClientSession() as session:
                async with session.get(oembed_url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status != 200:
                        logger.warning(f"Twitter oEmbed returned status {response.status}")
                        return None

                    data = await response.json()

                    # Extract author and HTML
                    author = data.get('author_name', 'Unknown')
                    html = data.get('html', '')

                    if not html:
                        return None

                    # Parse HTML to extract tweet text
                    soup = BeautifulSoup(html, 'html.parser')
                    blockquote = soup.find('blockquote')

                    if blockquote:
                        # Get text from blockquote, remove the tweet link at the end
                        tweet_text = blockquote.get_text(separator=' ', strip=True)
                        # Remove trailing "— @username date" pattern if present
                        tweet_text = re.sub(r'\s*—\s*@\w+.*$', '', tweet_text)
                        return f"[Tweet from @{author}] {tweet_text}"

                    return None

        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching Twitter content for {url}")
            return None
        except Exception as e:
            logger.error(f"Error fetching Twitter content: {e}")
            return None

    async def _parse_google_maps_url(self, url: str) -> Optional[str]:
        """Parse Google Maps URL to extract location name.

        Returns formatted location string or None if parsing fails.
        """
        try:
            # For shortened goo.gl links, we could follow redirect, but often
            # the location name is in the destination URL parameters.
            # For now, just note that location was shared.

            # Try to extract location from URL if it's a full maps.google.com URL
            if 'maps.google.com' in url:
                # Look for q= or query= parameter
                import urllib.parse
                parsed = urllib.parse.urlparse(url)
                params = urllib.parse.parse_qs(parsed.query)

                location_name = params.get('q', [None])[0] or params.get('query', [None])[0]

                if location_name:
                    return f"[Location shared] {location_name}"

            # For goo.gl links or if we can't parse, just note it's a location
            return "[Location shared via Google Maps]"

        except Exception as e:
            logger.error(f"Error parsing Google Maps URL: {e}")
            return None

    def _check_auth(self, update: Update) -> bool:
        """Check if user is authorized. Send error message if not."""
        if not update.message:
            return False

        user_id = update.message.from_user.id
        if user_id != self.authorized_user_id:
            logger.warning(f"Unauthorized Telegram user attempted command: {user_id}")
            asyncio.create_task(
                update.message.reply_text("⚠️ Unauthorized. This bot is private.")
            )
            return False

        return True

    def _get_emoji_indicator(self, text: str) -> str:
        """Determine emoji indicator based on message content.

        Returns emoji prefix for message context:
        - 🔴 Critical priority or urgent
        - 🟡 Medium priority
        - 🟢 Low priority or informational
        - 🤖 From specialist/subagent
        - ⏰ Time-sensitive (approaching event)
        """
        text_lower = text.lower()

        # Check for specialist/subagent messages
        if any(word in text_lower for word in ["builder", "researcher", "specialist", "subagent", "verification"]):
            return "🤖"

        # Check for time-sensitive indicators
        if any(word in text_lower for word in ["in 30 minutes", "in 1 hour", "starting soon", "reminder"]):
            return "⏰"

        # Check for priority level indicators
        if any(word in text_lower for word in ["critical", "urgent", "emergency", "asap"]):
            return "🔴"

        if any(word in text_lower for word in ["medium priority", "important"]):
            return "🟡"

        # Default to informational
        return "🟢"

    def _add_quick_actions(self, text: str) -> Optional[InlineKeyboardMarkup]:
        """Add quick action buttons based on message context.

        Returns:
            InlineKeyboardMarkup if buttons should be added, None otherwise
        """
        text_lower = text.lower()

        # After status-related messages
        if any(word in text_lower for word in ["status", "working on", "current task"]):
            keyboard = [
                [
                    InlineKeyboardButton("📅 Calendar", callback_data="action:calendar"),
                    InlineKeyboardButton("📋 Priorities", callback_data="action:priorities")
                ]
            ]
            return InlineKeyboardMarkup(keyboard)

        # No buttons for this message
        return None

    async def _watch_chief_transcript(self):
        """Watch Chief's transcript and forward text responses to Telegram."""
        while not self._stop_event.is_set():
            try:
                # Find Chief's session
                chief_session = self._get_chief_session()
                if not chief_session:
                    logger.warning("Chief session not found - waiting 10s before retry")
                    await asyncio.sleep(10)
                    continue

                if not chief_session.transcript_path:
                    logger.warning("Chief transcript path not set - waiting 10s")
                    await asyncio.sleep(10)
                    continue

                transcript_path = Path(chief_session.transcript_path)
                logger.info(f"Watching Chief's transcript: {transcript_path}")

                # Stream transcript events (from current position, not history)
                async for event in stream_transcript(
                    transcript_path,
                    include_thinking=False,  # Don't forward thinking blocks
                    from_beginning=False  # Start from current position
                ):
                    if self._stop_event.is_set():
                        break

                    # Only forward "text" events (Chief's responses)
                    if event.get("type") == "text":
                        content = event.get("content", "")
                        if content:
                            await self._forward_to_telegram(content)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in transcript watcher: {e}")
                await asyncio.sleep(10)  # Wait before retry

    async def _forward_to_telegram(self, text: str):
        """Forward Chief's text response to Telegram.

        Handles:
        - Markdown → HTML conversion
        - Message chunking (4096 char limit)
        - Rate limiting (100ms delay between chunks)
        """
        if not self.application or not self.authorized_user_id:
            return

        try:
            # Convert markdown to HTML for Telegram
            html_text = self._markdown_to_html(text)

            # Chunk if needed
            chunks = self._chunk_message(html_text)

            # Send chunks with delay
            for i, chunk in enumerate(chunks):
                try:
                    await self.application.bot.send_message(
                        chat_id=self.authorized_user_id,
                        text=chunk,
                        parse_mode=ParseMode.HTML
                    )
                    logger.info(f"Forwarded chunk {i+1}/{len(chunks)} to Telegram")

                    # Rate limiting - 100ms delay between chunks
                    if i < len(chunks) - 1:
                        await asyncio.sleep(0.1)

                except Exception as e:
                    logger.error(f"Failed to send chunk {i+1}: {e}")

        except Exception as e:
            logger.error(f"Error forwarding to Telegram: {e}")

    async def send_photo(self, photo_bytes: bytes, caption: str = None):
        """Send a photo to the authorized user.

        Args:
            photo_bytes: PNG image as bytes
            caption: Optional caption text

        Returns:
            True if sent successfully, False otherwise
        """
        if not self.application or not self.authorized_user_id:
            logger.warning("Cannot send photo - Telegram not initialized")
            return False

        try:
            # Send photo
            await self.application.bot.send_photo(
                chat_id=self.authorized_user_id,
                photo=photo_bytes,
                caption=caption,
                parse_mode=ParseMode.HTML if caption else None
            )
            logger.info("Photo sent to Telegram successfully")
            return True
        except Exception as e:
            logger.error(f"Error sending photo to Telegram: {e}")
            return False

    def _get_chief_session(self):
        """Get Chief's current session."""
        sessions = self.session_manager.get_active_sessions()
        for session in sessions:
            if session.role == "chief":
                return session
        return None

    def _chunk_message(self, text: str, max_length: int = MAX_MESSAGE_LENGTH) -> list[str]:
        """Split text into chunks preserving code blocks and paragraphs.

        Algorithm:
        1. Try to keep code blocks intact
        2. Split on paragraph boundaries when possible
        3. Hard split if individual paragraphs exceed limit
        """
        if len(text) <= max_length:
            return [text]

        chunks = []
        current = ""

        # Split by code blocks first (preserve them)
        # Pattern: <pre><code>...</code></pre>
        parts = re.split(r'(<pre>.*?</pre>)', text, flags=re.DOTALL)

        for part in parts:
            # Check if this part is a code block
            is_code_block = part.startswith('<pre>')

            if is_code_block:
                # Code block - try to keep intact
                if len(current) + len(part) <= max_length:
                    current += part
                else:
                    # Flush current chunk
                    if current:
                        chunks.append(current.strip())
                        current = ""

                    # If code block itself is too long, split it
                    if len(part) > max_length:
                        # Extract code content
                        code_match = re.match(r'<pre><code[^>]*>(.*?)</code></pre>', part, re.DOTALL)
                        if code_match:
                            code_content = code_match.group(1)
                            # Split code by lines
                            lines = code_content.split('\n')
                            temp_code = ""
                            for line in lines:
                                if len(temp_code) + len(line) + 1 <= max_length - 25:  # Reserve space for tags
                                    temp_code += line + "\n"
                                else:
                                    if temp_code:
                                        chunks.append(f"<pre><code>{temp_code}</code></pre>")
                                    temp_code = line + "\n"
                            if temp_code:
                                chunks.append(f"<pre><code>{temp_code}</code></pre>")
                        else:
                            # Fallback: hard split
                            chunks.append(part[:max_length])
                            current = part[max_length:]
                    else:
                        current = part
            else:
                # Regular text - split on paragraphs
                paragraphs = part.split('\n\n')
                for para in paragraphs:
                    if not para.strip():
                        continue

                    if len(current) + len(para) + 2 <= max_length:
                        current += para + "\n\n"
                    else:
                        # Flush current chunk
                        if current:
                            chunks.append(current.strip())
                            current = ""

                        # If paragraph itself is too long, hard split
                        if len(para) > max_length:
                            while len(para) > max_length:
                                chunks.append(para[:max_length])
                                para = para[max_length:]
                            current = para + "\n\n" if para else ""
                        else:
                            current = para + "\n\n"

        # Add final chunk
        if current.strip():
            chunks.append(current.strip())

        return chunks if chunks else [text[:max_length]]

    def _markdown_to_html(self, text: str) -> str:
        """Convert markdown to Telegram HTML.

        Telegram supports a subset of HTML:
        - <b>bold</b>, <strong>bold</strong>
        - <i>italic</i>, <em>italic</em>
        - <code>inline code</code>
        - <pre><code class="language-python">code block</code></pre>
        - <a href="URL">text</a>
        """
        html = text

        # Code blocks: ```lang\ncode\n``` → <pre><code class="language-lang">code</code></pre>
        def replace_code_block(match):
            lang = match.group(1) or ""
            code = match.group(2)
            # Escape HTML entities in code
            code = code.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            if lang:
                return f'<pre><code class="language-{lang}">{code}</code></pre>'
            else:
                return f'<pre><code>{code}</code></pre>'

        html = re.sub(r'```(\w+)?\n(.*?)\n```', replace_code_block, html, flags=re.DOTALL)

        # Inline code: `code` → <code>code</code>
        html = re.sub(r'`([^`]+)`', r'<code>\1</code>', html)

        # Bold: **text** or __text__ → <b>text</b>
        html = re.sub(r'\*\*([^\*]+)\*\*', r'<b>\1</b>', html)
        html = re.sub(r'__([^_]+)__', r'<b>\1</b>', html)

        # Italic: *text* or _text_ → <i>text</i>
        html = re.sub(r'\*([^\*]+)\*', r'<i>\1</i>', html)
        html = re.sub(r'_([^_]+)_', r'<i>\1</i>', html)

        # Links: [text](url) → <a href="url">text</a>
        html = re.sub(r'\[([^\]]+)\]\(([^\)]+)\)', r'<a href="\2">\1</a>', html)

        return html
