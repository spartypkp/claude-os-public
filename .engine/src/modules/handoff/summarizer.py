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

    # Clear TMUX_PANE so the summarizer doesn't register on the parent's pane.
    # Without this, the startup hook creates a session row with the parent's pane,
    # and the context monitor sees a "new" session at high context → double-fires
    # the reset warning.
    os.environ.pop("TMUX_PANE", None)

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

SUMMARIZER_PROMPT = """## YOUR ONE JOB

You MUST call the Edit tool to fill in the handoff file at: {handoff_path}

This is NOT optional. If you don't edit the file, the next session starts COMPLETELY BLIND with zero context. Every section must be filled in with real content. Do NOT respond with just "Done" without editing. Do NOT skip sections. Call the Edit tool for each section that needs content.

---

## What You're Doing

Writing a handoff document so a fresh Claude can pick up and continue working WITHOUT dropping the thread. The fresh session has NO context about what happened — no memory of the conversation, no sense of the user's current state, no idea what was tried and abandoned. Your handoff is the ONLY bridge.

The file has section headers with HTML comments explaining what belongs in each section. Replace the comments with actual content using the Edit tool.
{spec_section}
---

## HOW TO WRITE A GOOD HANDOFF

**The goal is continuity, not documentation.** A good handoff reads like a briefing from a colleague who was just in the room. A bad handoff reads like a changelog.

**Immediate Re-read List** — The MOST important section. List exact file paths the successor must read FIRST. Include:
- The spec file if one exists (check the transcript for spec_path references)
- plan.md and progress.md if they exist
- Any reference docs, SYSTEM-SPECs, or code files that were actively being used
- This is how the successor avoids wasting 5 minutes re-discovering what you already know

**Active Skills** — Any /skills that were invoked during this session. If a workflow was in progress, name it.

**Conversation Arc** — Tell the story of the session. Not "User asked X, Claude did Y" but the narrative flow: what was the energy like, how did topics connect, where did the thread end up? This is what makes the successor feel like they were in the room.

**Relational texture matters:**
- Preferences the user expressed, things they reacted to strongly, approaches they rejected
- Callbacks, jokes, commitments that create continuity
- If the next Claude didn't know something, would the conversation feel off?

**Work state and resume instructions:**
- Was Claude mid-task? Idle? In active conversation?
- What's the concrete next step?
- Whether to resume autonomously or wait for the user

**Be specific on file changes:**
- List actual modifications made (not planned changes)
- This helps fresh Claude know what's new vs what was already there

**Be concise but complete:**
- Operational facts are in TODAY.md/MEMORY.md — focus on what's NOT in those files
- Don't repeat what's already documented — add what only you witnessed
{previous_handoffs_section}
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

REMINDER: You MUST call the Edit tool to fill in {handoff_path}. Every section needs real content. Do not skip any section. """


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
    previous_handoffs: str = None,
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
        previous_handoffs: Concatenated contents of prior handoff docs in this chain

    The summarizer edits the file in place. No return value needed.
    """
    if not handoff_path.exists():
        raise ValueError(f"Handoff template must exist before running summarizer: {handoff_path}")

    # Build optional sections
    spec_section = ""
    if spec_path:
        spec_section = f"\n**Spec file for this session:** `{spec_path}` — Include this in the Immediate Re-read List.\n"

    previous_handoffs_section = ""
    if previous_handoffs:
        previous_handoffs_section = f"""
---

## Previous Handoffs in This Chain

The following handoff documents were written by earlier sessions in this same conversation. Use them to understand the full arc of work, not just the latest session. Summarize key context from prior handoffs in your handoff so the successor has the full picture.

{previous_handoffs}
"""

    prompt = SUMMARIZER_PROMPT.format(
        handoff_path=handoff_path,
        transcript=transcript,
        role_content=role_content,
        mode_content=mode_content,
        today_content=today_content,
        memory_content=memory_content,
        spec_section=spec_section,
        previous_handoffs_section=previous_handoffs_section,
    )

    logger.info(f"Running summarizer for {handoff_path}, transcript_len={len(transcript)}, has_prev_handoffs={bool(previous_handoffs)}, spec_path={spec_path}")

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
