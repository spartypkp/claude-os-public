"""Handoff summarizer using Claude Agent SDK.

Agentic summarizer that edits the pre-created template file to fill it in.
All context (TODAY.md, MEMORY.md, role/mode files) is injected directly
to minimize latency - no Read tool calls needed.

The template file must exist before calling. Summarizer fills in the sections.
"""

import asyncio
import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)


def _set_summarizer_env(
    parent_session_id: str = None,
    conversation_id: str = None,
    role: str = None,
):
    """Set env vars so the Agent SDK registers as its own session.

    Without this, the Agent SDK inherits the parent session's CLAUDE_SESSION_ID
    from the environment, and the startup hook's UPSERT overwrites the real
    session's transcript_path with the summarizer's tiny JSONL.

    By setting a fresh session ID and mode='summarizer', the startup hook
    creates a NEW session record. The real session's transcript is preserved.
    """
    summarizer_id = uuid.uuid4().hex[:8]
    os.environ["CLAUDE_SESSION_ID"] = summarizer_id
    os.environ["CLAUDE_SESSION_MODE"] = "summarizer"

    if role:
        os.environ["CLAUDE_SESSION_ROLE"] = role
    if conversation_id:
        os.environ["CLAUDE_CONVERSATION_ID"] = conversation_id
    if parent_session_id:
        os.environ["CLAUDE_PARENT_SESSION_ID"] = parent_session_id

    logger.info(
        f"Summarizer env: session_id={summarizer_id}, "
        f"parent={parent_session_id}, conversation={conversation_id}"
    )

SUMMARIZER_PROMPT = """You're writing a handoff document for a fresh Claude session that will continue this work. The fresh session has NO context except what you provide.

The handoff file already exists at: {handoff_path}

It has section headers with HTML comments explaining what belongs in each section. Your job: EDIT the handoff file to fill in each section. Replace the comments with actual content.

---

## CRITICAL: Work Continuation

This is NOT just a conversational handoff. Fresh Claude needs to know:
- What work was being done when reset happened
- Whether to resume autonomously or wait for the user
- What files are relevant to continue the work
- Concrete next action (not vague "continue seamlessly")

The goal: Fresh Claude picks up and continues working WITHOUT dropping the thread.

---

## Key Principles

**Work state matters most:**
- Was Claude mid-task? Idle? In active conversation?
- What's the concrete next step?
- What files does fresh Claude need to re-read?

**Capture relational texture:**
- Conversational flow and how topics evolved
- Callbacks, jokes, commitments that create continuity
- What would be weird for fresh Claude not to know

**Be specific on file changes:**
- List actual modifications made (not planned changes)
- This helps fresh Claude know what's new vs what existed before

**Be concise but complete:**
- Preserve what matters, cut what doesn't
- Operational facts are in TODAY.md/MEMORY.md - focus on what's NOT in those files

---

## Role Definition
{role_content}

---

## Mode Definition
{mode_content}

---

## TODAY.md
{today_content}

---

## MEMORY.md
{memory_content}

---

## Transcript
{transcript}

---

Now edit {handoff_path} to fill in all sections. When done, just say "Done." """


def run(
    transcript: str,
    handoff_path: Path,
    role_content: str,
    mode_content: str,
    today_content: str,
    memory_content: str,
    *,
    parent_session_id: str = None,
    conversation_id: str = None,
    role: str = None,
    spec_path: str = None,
) -> None:
    """
    Run summarizer to fill in a handoff template.

    Args:
        transcript: Session transcript text
        handoff_path: Path to the pre-created template file (must exist)
        role_content: Contents of .claude/roles/{role}/role.md
        mode_content: Contents of .claude/roles/{role}/{mode}.md
        today_content: Contents of TODAY.md
        memory_content: Contents of MEMORY.md
        parent_session_id: Session ID of the session being handed off
        conversation_id: Conversation this summarizer belongs to
        role: Role of the parent session
        spec_path: Path to the spec on Desktop (for specialist context)

    The summarizer edits the file in place. No return value needed.
    """
    if not handoff_path.exists():
        raise ValueError(f"Handoff template must exist before running summarizer: {handoff_path}")

    prompt = SUMMARIZER_PROMPT.format(
        handoff_path=handoff_path,
        transcript=transcript,
        role_content=role_content,
        mode_content=mode_content,
        today_content=today_content,
        memory_content=memory_content,
    )

    logger.info(f"Running summarizer for {handoff_path}, transcript_len={len(transcript)}")

    try:
        _set_summarizer_env(parent_session_id, conversation_id, role)
        asyncio.run(_run_agent(prompt))
        logger.info(f"Summarizer complete: {handoff_path}")
    except Exception as e:
        logger.error(f"Summarizer failed: {e}", exc_info=True)
        # File still exists with template - better than nothing
        raise


async def _run_agent(prompt: str) -> None:
    """Run Claude Agent SDK to edit handoff file."""
    from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

    options = ClaudeAgentOptions(
        permission_mode="bypassPermissions",
        model="sonnet",
        setting_sources=["project"],  # Auto-load CLAUDE.md
    )

    logger.info("Starting summarizer agent")

    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)

        async for message in client.receive_response():
            if hasattr(message, 'type'):
                if message.type == 'tool_use':
                    logger.info(f"Summarizer using: {getattr(message, 'name', 'unknown')}")

    logger.info("Summarizer agent completed")
