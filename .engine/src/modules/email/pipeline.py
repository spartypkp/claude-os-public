"""Email classification pipeline — intelligence analyst approach.

Agentic classifier using Claude Sonnet with full MCP tool access.
The agent investigates each email with taste — matching effort to signal.
Produces personalized summaries for the user and intel briefings for Chief.
Proactively enriches contacts and notifies Chief of action-needed items.
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
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


CLASSIFIER_PROMPT = """You are an intelligence analyst embedded in Claude OS — a personal AI system
that manages the user's life. You brief Chief (the orchestrator) on incoming email
so Chief can serve the user better.

You have the same tools and context as any Claude specialist. You know the user's
priorities (TODAY.md), their life context (CLAUDE.md), their contacts, calendar,
and full email history. Use whatever helps. Skip what doesn't.

## Your Email

**From:** {sender}
**Subject:** {subject}
**Received:** {date}
**Message ID:** {message_id}
**Account:** {account_id}

{content_section}
{previous_emails_section}
{thread_section}

## What To Do

### 1. Assess — Match Effort to the Email

Not every email deserves investigation. Match your effort:

- **Obvious noise** (marketing blast, mass send, unsubscribe footer): Classify
  immediately. Don't waste a tool call. 2 seconds.
- **Automated but potentially relevant** (GitHub notification, bank alert,
  calendar invite): Quick assessment. Is this routine or does it signal
  something? 10 seconds.
- **Human sender, unclear context**: Investigate. Who is this person? Have they
  emailed before? Are they connected to anything in the user's life? 30 seconds.
- **High-signal email** (known contact, interview-related, financial, family):
  Go deep. Check calendar, read previous emails, understand the full picture.
  Take as long as you need.

### 2. Investigate — Use Your Tools

You have full MCP access. Use whatever helps you understand this email.

**Contacts:**
- `contact("search", query="sender name or email")` — Is this person known?
- If the sender is a real person and IS in contacts: log this interaction with
  `contact("history", identifier="...", entry="[date]: Emailed about [topic]")`
- If the sender is a real person and NOT in contacts but seems tied to an
  existing contact (e.g., a brother's personal email, a recruiter's alternate
  address): try to match them. Use `contact("enrich", ...)` to add the email.
- If the sender is a new person who matters (recruiter, interviewer, business
  contact, friend-of-friend): create them with `contact("create", ...)`.
- Automated senders: don't create contacts.

**Previous emails:**
- Some previous emails from this sender are included above when available.
- Use `email("search", query="...")` to find related emails the pre-fetch
  missed. Think creatively:
  - The sender's name (they might email from multiple addresses)
  - The company name (automated email from scheduling service but the real
    context is a job interview)
  - A person mentioned in the email body
  - A project or topic referenced in the subject
- Use `email("read", message_id="...")` to read full content of a related
  email when the snippet isn't enough.

**Calendar:**
- `calendar("list", from_date="...", to_date="...")` — Is there a meeting
  with this person? An event related to this email's topic? Check the next
  week for relevant events.

**Job pipeline:**
- `opportunity("list")` or `opportunity("get", slug="...")` — Is the sender's
  company in the user's job search pipeline? What stage?

**File system:**
- Read files on Desktop if they might provide context. If the email mentions
  a project, check `Desktop/projects/` for relevant PROJECT.md files.

**Today's context:**
- You already have TODAY.md loaded. Use it. Reference today's priorities
  when relevant.

### 3. Classify — Use Your Taste

Call `email("classify", ...)` with your assessment. Three fields matter:

**category** — One of four levels:
- `action_needed` — The user should read this now and probably do something. Reply,
  decide, act. Time-sensitive or from someone who matters and expects a response.
- `heads_up` — The user should know about this. Interesting, relevant to their life,
  worth reading soon. But no action required right now.
- `fyi` — Read whenever. Not urgent, not particularly interesting, but passed
  the noise filter. Background info, routine updates.
- `noise` — Spam, marketing, mass sends, cold outreach. Hidden by default.

**summary** — One line for the user. Conversational, addressed to them personally.
Tell them what this is and why they might care. Reference what you know about their
life when relevant. Dynamic length.

Not this: "Email from Kai Zhang regarding interview scheduling."
This: "Kai confirmed your interview tomorrow at 10 AM. Meet link attached."

Not this: "GitHub notification about repository release."
This: "New Claude Code release. Nothing you need to do."

**display_name** — The human-readable sender identity for the inbox UI. The raw
"From" field often says "no-reply" or a service name. You know better.

Examples:
- From "no-reply@ashbyhq.com" about a Modal rejection → `"Modal (via Ashby)"`
- From "notifications@github.com" about a PR review → `"GitHub"`
- From "kai.zhang@juicebox.ai" → `"Kai Zhang"` (just use their name)
- From "noreply@linkedin.com" about a recruiter message → `"LinkedIn"`
- From "support@chase.com" about a deposit → `"Chase"`

Rule: If it's a human, use their name. If it's automated, use the company or
service name. If it's an ATS/platform sending on behalf of a company, use
`"Company (via Platform)"`.

**reasoning** — This becomes the briefing for Chief. Pour everything you learned
here. Situation, sender context, relationship history, what the email wants,
what the user should probably do, and how Chief can proactively help.

If Chief reads ONLY this field, Chief should be able to have a fully informed
conversation with the user about this email.

### 4. Suggest Actions

For action_needed and heads_up emails, include `suggested_actions` — clear,
actionable next steps that Chief can execute. Each action on a separate line.
Don't suggest actions for noise or obvious FYI.

**Examples:**
- "Close Modal in pipeline — rejected after application"
- "Add to calendar: Perplexity HM Interview, Fri Feb 27, 10-10:30am PT"
- "Reply with availability (no Tuesdays)"
- "Update pipeline stage to interviewing"
- "Create contact for James Liounis (Perplexity)"

Actions should be specific and executable. Chief reads these and acts on them.

### 5. Be Proactive

While investigating, maintain the contact database:
- Log interactions for known contacts
- Create contacts for new people who matter
- Tie alternate email addresses to existing contacts

You're not just labeling email. You're an analyst who happens to be reading
email. Act like it.

## Submit

When done, you MUST call:
email("classify", message_id="{message_id}", account="{account_id}", category="...", summary="...", display_name="...", reasoning="...", suggested_actions="action1\naction2")
"""


# Regex to detect thread subjects (Re:/RE:/Fwd:/FW:)
_THREAD_PREFIX_RE = re.compile(r'^(?:Re|RE|Fwd|FW|Fw|re):\s*', re.IGNORECASE)


class EmailPipeline:
    """Background email classification pipeline.

    Polls for unclassified emails, pre-fetches sender history,
    runs each through an agentic classifier that investigates and
    writes classifications via MCP tool call.
    """

    MAX_WORKERS = 3  # Concurrent classification agents

    def __init__(self, db_path: str, poll_interval: int = 60):
        self._db_path = db_path
        self._poll_interval = poll_interval
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._semaphore = asyncio.Semaphore(self.MAX_WORKERS)

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

    async def _ensure_initialized(self):
        """Phase 1: Initial setup — runs once per database.

        Marks all current inbox emails as 'seen' (classified=1) so the
        pipeline never tries to classify historical email. This establishes
        a baseline: everything currently in the inbox is considered processed.

        After this, only genuinely new emails (new message IDs that appear
        in future polls) will get classified=0 and enter the queue.
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

    async def _discover_new_emails(self):
        """Phase 2: Discover new emails each poll cycle.

        Fetches recent emails (regardless of read status) and INSERTs them.
        INSERT OR IGNORE means only genuinely new message IDs get added
        with classified=0 — everything already tracked is skipped.
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

    def _get_previous_emails(self, sender: str, account_id: str, limit: int = 5) -> List[Dict[str, str]]:
        """Pre-fetch recent emails from the same sender."""
        try:
            from .service import EmailService
            from core.storage import SystemStorage

            storage = SystemStorage(self._db_path)
            svc = EmailService(storage)

            # Extract email address from sender string
            sender_email = sender
            match = re.search(r'<(.+?)>', sender)
            if match:
                sender_email = match.group(1)

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
                msg = svc.get_message(msg_id, "INBOX", acct_id)

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

                # Build content section
                content_section = ""
                body = msg.content or msg.html_content or ""
                if body:
                    truncated = body[:3000]
                    if len(body) > 3000:
                        truncated += "\n... [truncated]"
                    content_section = f"**Body:**\n{truncated}"

                # Pre-fetch previous emails from sender
                previous_emails = self._get_previous_emails(
                    msg.sender or "", acct_id, limit=5
                )
                previous_emails_section = ""
                if previous_emails:
                    lines = ["## Previous Emails From This Sender (most recent first)"]
                    for pe in previous_emails:
                        lines.append(
                            f"- **{pe['subject']}** ({pe['date']}): {pe['snippet']}"
                        )
                    previous_emails_section = "\n".join(lines) + "\n"

                # Thread context for Re:/Fwd: emails
                thread_context = self._get_thread_context(msg.subject, acct_id)
                thread_section = ""
                if thread_context:
                    lines = ["## Thread Context (previous messages in this conversation)"]
                    for tc in thread_context:
                        lines.append(
                            f"- **{tc.get('sender', '?')}** ({tc.get('date', '?')}): "
                            f"{tc.get('snippet', '')}"
                        )
                    thread_section = "\n".join(lines) + "\n"

                prompt = CLASSIFIER_PROMPT.format(
                    sender=msg.sender or "Unknown",
                    subject=msg.subject or "(no subject)",
                    date=datetime.now(timezone(timedelta(hours=-8))).strftime("%Y-%m-%d %I:%M %p PT"),
                    message_id=msg_id,
                    account_id=acct_id,
                    content_section=content_section,
                    previous_emails_section=previous_emails_section,
                    thread_section=thread_section,
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

                        # Backfill context snapshot + timing
                        conn.execute(
                            """UPDATE email_classifications
                               SET sender = ?, subject = ?, preview = ?, processing_time_ms = ?,
                                   received_at = ?
                               WHERE email_message_id = ? AND account_id = ?""",
                            (msg.sender, msg.subject, msg.snippet, elapsed_ms,
                             msg.date_received, msg_id, acct_id),
                        )
                        conn.commit()

                        logger.info(
                            f"Classified {msg_id}: {category} "
                            f"({elapsed_ms}ms) — {(result['summary'] or '')[:60]}"
                        )

                        # Notify Chief
                        self._notify_chief(
                            category,
                            msg.sender or "Unknown",
                            result["summary"] or "",
                            result["briefing"] or "",
                        )
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
