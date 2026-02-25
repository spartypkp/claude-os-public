"""Email classification pipeline — intelligence analyst approach.

Agentic classifier using Claude Sonnet with full MCP tool access.
The agent investigates each email with taste — matching effort to signal.
Produces personalized summaries for the user and intel briefings for Chief.
Proactively enriches contacts and notifies Chief of action-needed items.

Supports:
- Filesystem-based classifier prompt (Desktop/email/classifier-prompt.md)
- Three-tier sender rules (always/never/suggest) with dynamic injection
- Content extraction for newsletters/digests
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# Default prompt used when filesystem prompt is missing
_DEFAULT_PROMPT_PATH = Path(__file__).resolve().parents[4] / "Desktop" / "email" / "classifier-prompt.md"

# Fallback hardcoded prompt (only if file doesn't exist)
_FALLBACK_PROMPT = """You are an email classifier for Claude OS. Classify this email.

**From:** {sender}
**Subject:** {subject}
**Message ID:** {message_id}
**Account:** {account_id}

{content_section}

Call email("classify", message_id="{message_id}", account="{account_id}", category="...", summary="...", display_name="...", reasoning="...")
"""

# Regex to detect thread subjects (Re:/RE:/Fwd:/FW:)
_THREAD_PREFIX_RE = re.compile(r'^(?:Re|RE|Fwd|FW|Fw|re):\s*', re.IGNORECASE)


class EmailPipeline:
    """Background email classification pipeline.

    Polls for unclassified emails, pre-fetches sender history,
    matches sender rules, and runs each through an agentic classifier
    that investigates and writes classifications via MCP tool call.
    """

    MAX_WORKERS = 3  # Concurrent classification agents

    def __init__(self, db_path: str, poll_interval: int = 60):
        self._db_path = db_path
        self._poll_interval = poll_interval
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._semaphore = asyncio.Semaphore(self.MAX_WORKERS)

        # Prompt cache
        self._prompt_cache: Optional[str] = None
        self._prompt_mtime: float = 0.0

    # ── Prompt loading ──────────────────────────────────────────────

    def _load_prompt(self) -> str:
        """Load classifier prompt from filesystem with mtime cache.

        Reads Desktop/email/classifier-prompt.md. Caches content and
        reloads only when file is modified. Falls back to hardcoded
        default if file doesn't exist.
        """
        prompt_path = _DEFAULT_PROMPT_PATH

        try:
            stat = prompt_path.stat()
            if self._prompt_cache and stat.st_mtime == self._prompt_mtime:
                return self._prompt_cache

            self._prompt_cache = prompt_path.read_text()
            self._prompt_mtime = stat.st_mtime
            logger.info(f"Loaded classifier prompt from {prompt_path}")
            return self._prompt_cache
        except FileNotFoundError:
            logger.warning(f"Classifier prompt not found at {prompt_path}, using fallback")
            return _FALLBACK_PROMPT

    def _get_prompt_version(self) -> str:
        """Get current prompt file mtime as version string."""
        try:
            return str(_DEFAULT_PROMPT_PATH.stat().st_mtime)
        except FileNotFoundError:
            return "fallback"

    # ── Sender rules ────────────────────────────────────────────────

    def _extract_sender_email(self, sender: str) -> str:
        """Extract email address from sender string like 'Name <email>'."""
        match = re.search(r'<(.+?)>', sender)
        return match.group(1) if match else sender

    def _extract_sender_domain(self, sender_email: str) -> str:
        """Extract domain from email address."""
        parts = sender_email.split("@")
        return parts[1].lower() if len(parts) == 2 else ""

    def _match_rules(self, sender: str) -> List[Dict[str, Any]]:
        """Find all enabled sender rules matching this sender.

        Returns rules sorted by specificity: sender > domain,
        then by rule type priority: always > never > suggest.
        """
        sender_email = self._extract_sender_email(sender).lower()
        sender_domain = self._extract_sender_domain(sender_email)

        conn = self._get_conn()
        try:
            rows = conn.execute(
                """SELECT id, match_type, match_value, rule_type, category,
                          instructions, extract_content
                   FROM email_sender_rules
                   WHERE enabled = 1
                   ORDER BY
                       CASE match_type WHEN 'sender' THEN 0 ELSE 1 END,
                       CASE rule_type WHEN 'always' THEN 0 WHEN 'never' THEN 1 ELSE 2 END
                """,
            ).fetchall()

            matched = []
            for row in rows:
                match_type = row["match_type"]
                match_value = row["match_value"].lower()

                if match_type == "sender" and sender_email == match_value:
                    matched.append(dict(row))
                elif match_type == "domain" and sender_domain == match_value:
                    matched.append(dict(row))

            return matched
        finally:
            conn.close()

    def _increment_rule_applied(self, rule_id: str) -> None:
        """Increment the times_applied counter for a rule."""
        conn = self._get_conn()
        try:
            conn.execute(
                "UPDATE email_sender_rules SET times_applied = times_applied + 1, updated_at = ? WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), rule_id),
            )
            conn.commit()
        finally:
            conn.close()

    def _build_rules_section(self, rules: List[Dict[str, Any]]) -> str:
        """Build the rules section to inject into the prompt."""
        if not rules:
            return ""

        lines = ["## Sender-Specific Instructions", ""]
        lines.append("The following rules apply to this sender. Follow them.")
        lines.append("")

        for rule in rules:
            rule_type = rule["rule_type"]
            category = rule["category"]
            instructions = rule.get("instructions") or ""

            if rule_type == "always":
                lines.append(f"**REQUIRED:** Classify this email as `{category}`. This is non-negotiable.")
            elif rule_type == "never":
                lines.append(f"**FORBIDDEN:** Do NOT classify this email as `{category}`. Choose a different category.")
            elif rule_type == "suggest":
                lines.append(f"**Suggestion:** This sender's emails typically belong in `{category}`. Use your judgment.")

            if instructions:
                lines.append(f"\n{instructions}")
            lines.append("")

        # Check for content extraction
        extract_rules = [r for r in rules if r.get("extract_content")]
        if extract_rules:
            instructions_text = ""
            for r in extract_rules:
                if r.get("instructions"):
                    instructions_text += r["instructions"] + "\n"

            lines.append("## Content Extraction Required")
            lines.append("")
            lines.append("This email matches a content extraction rule. In addition to classifying,")
            lines.append("you MUST extract the key content from this email.")
            lines.append("")
            lines.append("Include the `extracted_content` parameter in your email(\"classify\", ...) call.")
            lines.append("Format each item as: **Headline** — 1-2 sentence summary.")
            lines.append("")
            if instructions_text:
                lines.append(instructions_text)

        return "\n".join(lines)

    def _auto_classify(
        self, msg_id: str, acct_id: str, category: str, rule_id: str,
        sender: str, subject: str, snippet: str, received_at: str
    ) -> None:
        """Instant classification for always-rules without instructions.

        Skips the Sonnet agent entirely. Used for known spam domains
        and other cases where investigation adds no value.
        """
        now = datetime.now(timezone.utc).isoformat()

        # Build a simple display_name from sender
        display_name = sender
        if "<" in sender:
            display_name = sender.split("<")[0].strip().strip('"')
        if not display_name or display_name == sender:
            domain = self._extract_sender_domain(self._extract_sender_email(sender))
            display_name = domain.split(".")[0].capitalize() if domain else "Unknown"

        conn = self._get_conn()
        try:
            conn.execute(
                """INSERT OR REPLACE INTO email_classifications
                   (id, email_message_id, account_id, category, summary,
                    briefing, display_name, sender, subject, preview,
                    processing_time_ms, received_at, classified_at,
                    handled, rule_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()), msg_id, acct_id, category,
                    subject or "(no subject)",  # Use subject as summary
                    f"Auto-classified by sender rule. No agent investigation.",
                    display_name, sender, subject, snippet,
                    0, received_at, now,
                    1 if category == "noise" else 0,
                    rule_id,
                ),
            )
            conn.execute(
                "UPDATE email_metadata SET classified = 1, last_updated_at = ? WHERE email_message_id = ? AND account_id = ?",
                (now, msg_id, acct_id),
            )
            conn.commit()
            logger.info(f"Auto-classified {msg_id} as {category} (rule {rule_id})")
        finally:
            conn.close()

        # Mark as read in Apple Mail (noise is auto-handled, no need to see it)
        try:
            from .service import EmailService
            from core.storage import SystemStorage
            storage = SystemStorage(self._db_path)
            svc = EmailService(storage)
            svc.mark_as_read(msg_id, "INBOX", acct_id)
        except Exception:
            pass  # Non-critical

        self._increment_rule_applied(rule_id)

    # ── Core pipeline ───────────────────────────────────────────────

    async def start(self, stop_event: asyncio.Event = None):
        """Start the classification polling loop."""
        self._running = True
        logger.info("Email classification pipeline started")

        # Phase 1: Initial setup — mark all current inbox emails as "seen"
        # so we never reprocess history. Only runs once (checks a flag).
        try:
            await self._ensure_initialized()
        except Exception as e:
            logger.error(f"Pipeline initialization failed: {e}")

        # Phase 2: Normal operation — discover new emails, classify them
        while self._running:
            if stop_event and stop_event.is_set():
                break

            # Discover new emails (INSERT OR IGNORE — only new IDs get classified=0)
            try:
                await self._discover_new_emails()
            except Exception as e:
                logger.error(f"Pipeline discovery failed: {e}")

            try:
                await self._classify_pending()
            except Exception as e:
                logger.error(f"Pipeline classification pass failed: {e}")

            # Wait for next poll
            try:
                if stop_event:
                    await asyncio.wait_for(stop_event.wait(), timeout=self._poll_interval)
                    break
                else:
                    await asyncio.sleep(self._poll_interval)
            except asyncio.TimeoutError:
                pass

        logger.info("Email classification pipeline stopped")

    def stop(self):
        """Signal the pipeline to stop."""
        self._running = False

    def _get_conn(self):
        """Get a database connection."""
        import sqlite3
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    def _ensure_initialized_sync(self):
        """Sync: mark existing inbox as seen. Runs in thread to avoid
        blocking the event loop with Apple Mail AppleScript calls.
        """
        conn = self._get_conn()
        try:
            # Check if we've already initialized
            row = conn.execute(
                "SELECT 1 FROM _migrations WHERE name = 'email_pipeline_initialized'"
            ).fetchone()
            if row:
                return  # Already done

            logger.info("Pipeline initial setup: marking all current inbox emails as seen...")

            from .service import EmailService
            from core.storage import SystemStorage

            storage = SystemStorage(self._db_path)
            svc = EmailService(storage)

            now = datetime.now(timezone.utc).isoformat()
            accounts = svc.get_accounts_with_capabilities()
            total_marked = 0

            for acct in accounts:
                if not acct.get("can_read"):
                    continue

                # Fetch a large batch — we want to capture everything currently in inbox
                messages = svc.get_messages("INBOX", acct["id"], limit=500, unread_only=False)
                for msg in messages:
                    try:
                        conn.execute(
                            """INSERT OR IGNORE INTO email_metadata
                               (email_message_id, account_id, first_seen_at, last_updated_at,
                                received_at, classified)
                               VALUES (?, ?, ?, ?, ?, 1)""",
                            (msg.id, acct["id"], now, now, msg.date_received),
                        )
                        total_marked += 1
                    except Exception:
                        pass

            # Also mark any pre-existing unclassified rows as done
            conn.execute("UPDATE email_metadata SET classified = 1 WHERE classified = 0")

            # Record that initialization is complete
            conn.execute(
                "INSERT OR IGNORE INTO _migrations (name, applied_at) VALUES (?, ?)",
                ("email_pipeline_initialized", now),
            )
            conn.commit()

            logger.info(
                f"Pipeline initialized: {total_marked} inbox emails marked as seen. "
                f"Only new emails from this point forward will be classified."
            )
        finally:
            conn.close()

    async def _ensure_initialized(self):
        """Phase 1: Initial setup. Runs in thread to avoid blocking event loop."""
        await asyncio.to_thread(self._ensure_initialized_sync)

    def _discover_new_emails_sync(self):
        """Sync: discover new emails via Apple Mail. Runs in thread to avoid
        blocking the event loop with AppleScript calls every poll cycle.
        """
        from .service import EmailService
        from core.storage import SystemStorage

        storage = SystemStorage(self._db_path)
        svc = EmailService(storage)

        conn = self._get_conn()
        try:
            now = datetime.now(timezone.utc).isoformat()
            accounts = svc.get_accounts_with_capabilities()

            discovered = 0
            # Track message IDs we've already seen this cycle to deduplicate
            # across accounts (e.g. Exchange + IMAP alias for same mailbox)
            seen_msg_ids: set = set()

            for acct in accounts:
                if not acct.get("can_read"):
                    continue

                # Fetch recent emails — 50 is plenty for 60s poll intervals
                messages = svc.get_messages("INBOX", acct["id"], limit=50, unread_only=False)
                for msg in messages:
                    # Skip if already seen in another account this cycle
                    if msg.id in seen_msg_ids:
                        continue
                    seen_msg_ids.add(msg.id)

                    # Also skip if this message_id exists in ANY account already
                    existing = conn.execute(
                        "SELECT 1 FROM email_metadata WHERE email_message_id = ? LIMIT 1",
                        (msg.id,),
                    ).fetchone()
                    if existing:
                        continue

                    try:
                        result = conn.execute(
                            """INSERT OR IGNORE INTO email_metadata
                               (email_message_id, account_id, first_seen_at, last_updated_at,
                                received_at)
                               VALUES (?, ?, ?, ?, ?)""",
                            (msg.id, acct["id"], now, now, msg.date_received),
                        )
                        if result.rowcount > 0:
                            discovered += 1
                    except Exception:
                        pass

                conn.commit()

            if discovered:
                logger.info(f"Discovered {discovered} new emails")
        finally:
            conn.close()

    async def _discover_new_emails(self):
        """Phase 2: Discover new emails. Runs in thread to avoid blocking event loop."""
        await asyncio.to_thread(self._discover_new_emails_sync)

    def _get_previous_emails(self, sender: str, account_id: str, limit: int = 5) -> List[Dict[str, str]]:
        """Pre-fetch recent emails from the same sender."""
        try:
            from .service import EmailService
            from core.storage import SystemStorage

            storage = SystemStorage(self._db_path)
            svc = EmailService(storage)

            sender_email = self._extract_sender_email(sender)

            results = svc.search_messages(
                sender_email, "INBOX", account_id, limit=limit + 1
            )

            if not results:
                return []

            previous = []
            for msg in sorted(results, key=lambda m: m.date_received or "", reverse=True):
                previous.append({
                    "sender": msg.sender_name or msg.sender or "?",
                    "subject": msg.subject or "(no subject)",
                    "date": msg.date_received or "?",
                    "snippet": (msg.snippet or "")[:200],
                })

            # Return up to `limit`, excluding the current email
            return previous[:limit]

        except Exception as e:
            logger.debug(f"Previous email fetch failed for '{sender}': {e}")
            return []

    def _get_thread_context(self, subject: str, account_id: str) -> Optional[List[Dict[str, str]]]:
        """Get thread context for Re:/Fwd: emails."""
        if not subject or not _THREAD_PREFIX_RE.search(subject):
            return None

        base_subject = _THREAD_PREFIX_RE.sub("", subject).strip()
        if not base_subject:
            return None

        try:
            from .service import EmailService
            from core.storage import SystemStorage

            storage = SystemStorage(self._db_path)
            svc = EmailService(storage)

            related = svc.search_messages(base_subject, "INBOX", account_id, limit=6)

            if not related or len(related) <= 1:
                return None

            thread = []
            for msg in sorted(related, key=lambda m: m.date_received or ""):
                thread.append({
                    "sender": msg.sender_name or msg.sender or "?",
                    "date": msg.date_received or "?",
                    "snippet": (msg.snippet or "")[:200],
                })

            return thread[:5]

        except Exception as e:
            logger.debug(f"Thread context fetch failed for '{subject}': {e}")
            return None

    def _notify_chief(self, category: str, sender: str, summary: str, briefing: str) -> None:
        """Notify Chief about action_needed emails via tmux injection.

        TODAY.md Email Intel is now rendered from DB by today_sync worker.
        This only handles the real-time alert to Chief's tmux pane.
        """
        if category != "action_needed":
            return

        short_sender = sender
        if "<" in sender:
            short_sender = sender.split("<")[0].strip().strip('"')

        try:
            inject_msg = (
                f'[SYSTEM:EMAIL] Action needed from {short_sender} '
                f'— {summary}'
            )
            import subprocess
            subprocess.run(
                ["tmux", "send-keys", "-t", "life:chief", inject_msg, "Enter"],
                capture_output=True, timeout=5,
            )
            logger.info(f"Chief injected about action_needed email from {short_sender}")
        except Exception as e:
            logger.debug(f"Failed to inject to Chief: {e}")

    async def _run_agent(self, prompt: str) -> None:
        """Run the Agent SDK classifier.

        Each agent gets a unique session ID via env override to isolate
        from the parent process and from other concurrent classifiers.
        Uses a lock around env mutation since os.environ is shared state.
        """
        from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

        classifier_id = uuid.uuid4().hex[:8]

        # Build isolated env for this classifier
        env_overrides = {
            "CLAUDE_SESSION_ID": f"classifier-{classifier_id}",
            "CLAUDE_SESSION_MODE": "classifier",
        }
        env_clear = [
            "CLAUDE_CONVERSATION_ID",
            "CLAUDE_SESSION_ROLE",
            "CLAUDE_PARENT_SESSION_ID",
        ]

        options = ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            model="sonnet",
            max_turns=15,
            setting_sources=["project"],
            env={
                **{k: v for k, v in os.environ.items() if k not in env_clear},
                **env_overrides,
            },
        )

        async with ClaudeSDKClient(options=options) as client:
            await client.query(prompt)

            async for message in client.receive_response():
                msg_type = getattr(message, "type", "?")
                if msg_type == "tool_use":
                    tool_name = getattr(message, "name", "?")
                    logger.debug(f"Classifier {classifier_id} tool call: {tool_name}")

    async def _classify_one(self, msg_id: str, acct_id: str) -> None:
        """Classify a single email. Designed to run concurrently."""
        from .service import EmailService
        from core.storage import SystemStorage

        async with self._semaphore:
            storage = SystemStorage(self._db_path)
            svc = EmailService(storage)

            try:
                msg = await asyncio.to_thread(svc.get_message, msg_id, "INBOX", acct_id)

                if not msg:
                    conn = self._get_conn()
                    try:
                        conn.execute(
                            "UPDATE email_metadata SET classified = 1 WHERE email_message_id = ? AND account_id = ?",
                            (msg_id, acct_id),
                        )
                        conn.commit()
                    finally:
                        conn.close()
                    return

                # ── Match sender rules ──────────────────────────────
                matched_rules = self._match_rules(msg.sender or "")
                always_rules = [r for r in matched_rules if r["rule_type"] == "always"]

                # Fast path: always rule with no instructions → skip agent
                if always_rules:
                    first_always = always_rules[0]
                    if not first_always.get("instructions") and not first_always.get("extract_content"):
                        self._auto_classify(
                            msg_id, acct_id, first_always["category"],
                            first_always["id"], msg.sender or "Unknown",
                            msg.subject, msg.snippet, msg.date_received,
                        )
                        # Mark metadata
                        conn = self._get_conn()
                        try:
                            conn.execute(
                                "UPDATE email_metadata SET classified = 1, last_updated_at = ? WHERE email_message_id = ? AND account_id = ?",
                                (datetime.now(timezone.utc).isoformat(), msg_id, acct_id),
                            )
                            conn.commit()
                        finally:
                            conn.close()
                        return

                # ── Build prompt ────────────────────────────────────
                content_section = ""
                body = msg.content or msg.html_content or ""
                if body:
                    truncated = body[:3000]
                    if len(body) > 3000:
                        truncated += "\n... [truncated]"
                    content_section = f"**Body:**\n{truncated}"

                # Pre-fetch previous emails from sender (threaded — Apple Mail call)
                previous_emails = await asyncio.to_thread(
                    self._get_previous_emails, msg.sender or "", acct_id, 5
                )
                previous_emails_section = ""
                if previous_emails:
                    lines = ["## Previous Emails From This Sender (most recent first)"]
                    for pe in previous_emails:
                        lines.append(
                            f"- **{pe['subject']}** ({pe['date']}): {pe['snippet']}"
                        )
                    previous_emails_section = "\n".join(lines) + "\n"

                # Thread context for Re:/Fwd: emails (threaded — Apple Mail call)
                thread_context = await asyncio.to_thread(
                    self._get_thread_context, msg.subject, acct_id
                )
                thread_section = ""
                if thread_context:
                    lines = ["## Thread Context (previous messages in this conversation)"]
                    for tc in thread_context:
                        lines.append(
                            f"- **{tc.get('sender', '?')}** ({tc.get('date', '?')}): "
                            f"{tc.get('snippet', '')}"
                        )
                    thread_section = "\n".join(lines) + "\n"

                # Build rules section
                rules_section = self._build_rules_section(matched_rules)

                # Load prompt from filesystem
                prompt_template = self._load_prompt()

                now_pt = datetime.now(timezone(timedelta(hours=-8)))
                prompt = prompt_template.format(
                    current_datetime=now_pt.strftime("%A, %B %d, %Y, %I:%M %p PT"),
                    sender=msg.sender or "Unknown",
                    subject=msg.subject or "(no subject)",
                    date=now_pt.strftime("%Y-%m-%d %I:%M %p PT"),
                    message_id=msg_id,
                    account_id=acct_id,
                    content_section=content_section,
                    previous_emails_section=previous_emails_section,
                    thread_section=thread_section,
                    rules_section=rules_section,
                )

                # Run the agent
                start = time.monotonic()
                await self._run_agent(prompt)
                elapsed_ms = int((time.monotonic() - start) * 1000)

                # Check if the agent wrote the classification
                conn = self._get_conn()
                try:
                    result = conn.execute(
                        "SELECT category, summary, briefing FROM email_classifications WHERE email_message_id = ? AND account_id = ?",
                        (msg_id, acct_id),
                    ).fetchone()

                    if result:
                        category = result["category"]

                        # Enforce never-rules: if agent picked a forbidden category, override
                        never_rules = [r for r in matched_rules if r["rule_type"] == "never"]
                        for nr in never_rules:
                            if category == nr["category"]:
                                # Override to fyi as safe default
                                category = "fyi"
                                conn.execute(
                                    "UPDATE email_classifications SET category = ? WHERE email_message_id = ? AND account_id = ?",
                                    (category, msg_id, acct_id),
                                )
                                logger.info(f"Never-rule override: {msg_id} changed from {nr['category']} to fyi")
                                break

                        # Track which rule was applied
                        rule_id = matched_rules[0]["id"] if matched_rules else None

                        # Backfill context snapshot + timing + rule_id
                        conn.execute(
                            """UPDATE email_classifications
                               SET sender = ?, subject = ?, preview = ?, processing_time_ms = ?,
                                   received_at = ?, rule_id = ?
                               WHERE email_message_id = ? AND account_id = ?""",
                            (msg.sender, msg.subject, msg.snippet, elapsed_ms,
                             msg.date_received, rule_id, msg_id, acct_id),
                        )
                        conn.commit()

                        logger.info(
                            f"Classified {msg_id}: {category} "
                            f"({elapsed_ms}ms) — {(result['summary'] or '')[:60]}"
                        )

                        # Increment rule counters
                        for rule in matched_rules:
                            self._increment_rule_applied(rule["id"])

                        # Notify Chief
                        self._notify_chief(
                            category,
                            msg.sender or "Unknown",
                            result["summary"] or "",
                            result["briefing"] or "",
                        )

                        # Update morning brief draft
                        try:
                            from .brief_draft import update_draft
                            update_draft(str(self._db_path))
                        except Exception:
                            pass  # Non-critical
                    else:
                        # Agent didn't classify — write fyi fallback
                        logger.warning(f"Agent did not classify {msg_id} — defaulting to fyi")
                        now = datetime.now(timezone.utc).isoformat()
                        conn.execute(
                            """INSERT OR REPLACE INTO email_classifications
                               (id, email_message_id, account_id, category, summary,
                                briefing, sender, subject, preview, processing_time_ms,
                                received_at, classified_at)
                               VALUES (?, ?, ?, 'fyi', ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                str(uuid.uuid4()), msg_id, acct_id,
                                "Classifier did not produce a classification.",
                                "Agent failed to classify this email. Defaulted to FYI.",
                                msg.sender, msg.subject, msg.snippet,
                                elapsed_ms, msg.date_received, now,
                            ),
                        )
                        conn.execute(
                            "UPDATE email_metadata SET classified = 1, last_updated_at = ? WHERE email_message_id = ? AND account_id = ?",
                            (now, msg_id, acct_id),
                        )
                        conn.commit()
                finally:
                    conn.close()

            except Exception as e:
                logger.error(f"Failed to classify {msg_id}: {e}")
                now = datetime.now(timezone.utc).isoformat()
                conn = self._get_conn()
                try:
                    conn.execute(
                        """INSERT OR REPLACE INTO email_classifications
                           (id, email_message_id, account_id, category, summary,
                            briefing, classified_at)
                           VALUES (?, ?, ?, 'fyi', ?, ?, ?)""",
                        (
                            str(uuid.uuid4()), msg_id, acct_id,
                            "Classification error.",
                            f"Error during classification: {str(e)}",
                            now,
                        ),
                    )
                    conn.execute(
                        "UPDATE email_metadata SET classified = 1, last_updated_at = ? WHERE email_message_id = ? AND account_id = ?",
                        (now, msg_id, acct_id),
                    )
                    conn.commit()
                except Exception:
                    pass
                finally:
                    conn.close()

    async def _classify_pending(self):
        """Find and classify unclassified emails (up to 3 concurrently)."""
        conn = self._get_conn()
        try:
            cursor = conn.execute(
                """SELECT em.email_message_id, em.account_id
                   FROM email_metadata em
                   WHERE em.classified = 0
                   ORDER BY em.first_seen_at DESC
                   LIMIT ?""",
                (self.MAX_WORKERS * 3,),  # Fetch enough to keep workers busy
            )
            pending = cursor.fetchall()
        finally:
            conn.close()

        if not pending:
            return

        logger.info(f"Classifying {len(pending)} pending emails ({self.MAX_WORKERS} workers)")

        # Dispatch all concurrently — semaphore limits to MAX_WORKERS at a time
        tasks = [
            self._classify_one(row["email_message_id"], row["account_id"])
            for row in pending
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
