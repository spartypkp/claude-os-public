"""
Transcript Watcher Service

Watches Claude Code transcript files for real-time structured output.
Uses watchdog for filesystem events with polling fallback.

Transcript files are written by Claude Code at:
    ~/.claude/projects/{project-hash}/{session-uuid}.jsonl

Schema: Each line is a JSON object with:
    - type: "user" | "assistant" | "system" | "file-history-snapshot" | "queue-operation"
    - uuid: Unique message UUID
    - parentUuid: Parent message UUID (for threading)
    - timestamp: ISO8601 timestamp
    - sessionId: Claude Code's full session UUID
    - message: Content (structure varies by type)
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# Constants
CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"
POLL_INTERVAL_MS = 200


@dataclass
class TranscriptEvent:
    """Parsed transcript event."""
    raw_type: str  # "user", "assistant", "system"
    event_type: str  # "user_message", "thinking", "text", "tool_use", "tool_result", "system"
    timestamp: str
    uuid: str
    parent_uuid: Optional[str]

    # Content fields (vary by event_type)
    content: Optional[str] = None  # For text events
    tool_name: Optional[str] = None  # For tool_use events
    tool_input: Optional[Dict[str, Any]] = None
    tool_result: Optional[str] = None  # For tool_result events
    tool_use_id: Optional[str] = None
    thinking: Optional[str] = None  # For thinking blocks

    # Metadata
    model: Optional[str] = None
    usage: Optional[Dict[str, int]] = None


def parse_transcript_line(line: str) -> List[TranscriptEvent]:
    """Parse a single JSONL line from a transcript file.

    Returns a list of events. Returns empty list for non-content events (queue-operation, file-history-snapshot, etc.)
    """
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return []

    raw_type = data.get("type")
    timestamp = data.get("timestamp", "")
    uuid = data.get("uuid", "")
    parent_uuid = data.get("parentUuid")

    # Skip internal events
    if raw_type in ("queue-operation", "file-history-snapshot"):
        return []

    if raw_type == "user":
        msg = data.get("message", {})
        content = msg.get("content", "")

        # Check if it's a tool result
        if isinstance(content, list):
            for item in content:
                if item.get("type") == "tool_result":
                    return [TranscriptEvent(
                        raw_type=raw_type,
                        event_type="tool_result",
                        timestamp=timestamp,
                        uuid=uuid,
                        parent_uuid=parent_uuid,
                        tool_use_id=item.get("tool_use_id"),
                        tool_result=str(item.get("content", ""))[:500],  # Truncate
                    )]

        # Regular user message
        return [TranscriptEvent(
            raw_type=raw_type,
            event_type="user_message",
            timestamp=timestamp,
            uuid=uuid,
            parent_uuid=parent_uuid,
            content=content if isinstance(content, str) else str(content)[:500],
        )]

    elif raw_type == "assistant":
        msg = data.get("message", {})
        model = msg.get("model")
        usage = msg.get("usage")
        content_blocks = msg.get("content", [])

        # Process ALL content blocks - collect them into a list
        events = []
        for block in content_blocks:
            block_type = block.get("type")

            if block_type == "thinking":
                events.append(TranscriptEvent(
                    raw_type=raw_type,
                    event_type="thinking",
                    timestamp=timestamp,
                    uuid=uuid,
                    parent_uuid=parent_uuid,
                    thinking=block.get("thinking", ""),
                    model=model,
                ))

            elif block_type == "text":
                events.append(TranscriptEvent(
                    raw_type=raw_type,
                    event_type="text",
                    timestamp=timestamp,
                    uuid=uuid,
                    parent_uuid=parent_uuid,
                    content=block.get("text", ""),
                    model=model,
                    usage=usage,
                ))

            elif block_type == "tool_use":
                events.append(TranscriptEvent(
                    raw_type=raw_type,
                    event_type="tool_use",
                    timestamp=timestamp,
                    uuid=uuid,
                    parent_uuid=parent_uuid,
                    tool_name=block.get("name"),
                    tool_use_id=block.get("id"),
                    tool_input=block.get("input"),
                    model=model,
                ))

        return events

    elif raw_type == "system":
        subtype = data.get("subtype", "")
        return [TranscriptEvent(
            raw_type=raw_type,
            event_type="system",
            timestamp=timestamp,
            uuid=uuid,
            parent_uuid=parent_uuid,
            content=subtype,
        )]

    return []


def format_event_for_sse(event: TranscriptEvent, include_thinking: bool = True) -> Optional[Dict[str, Any]]:
    """Format a TranscriptEvent for SSE transmission.

    Returns None if event should be filtered out.
    """
    if event.event_type == "thinking" and not include_thinking:
        return None

    result = {
        "type": event.event_type,
        "timestamp": event.timestamp,
        "uuid": event.uuid,
    }

    if event.parent_uuid:
        result["parentUuid"] = event.parent_uuid

    if event.event_type == "user_message":
        result["content"] = event.content

    elif event.event_type == "thinking":
        result["thinking"] = event.thinking

    elif event.event_type == "text":
        result["content"] = event.content
        if event.model:
            result["model"] = event.model
        if event.usage:
            result["usage"] = event.usage

    elif event.event_type == "tool_use":
        result["toolName"] = event.tool_name
        result["toolUseId"] = event.tool_use_id
        # Truncate large inputs for SSE — but preserve small metadata fields
        if event.tool_input:
            input_str = json.dumps(event.tool_input)
            if len(input_str) > 500:
                # Keep all small fields (<200 chars), drop large ones (like prompt)
                preserved = {}
                for k, v in event.tool_input.items():
                    v_str = json.dumps(v) if not isinstance(v, str) else v
                    if len(v_str) < 200:
                        preserved[k] = v
                preserved["_truncated"] = True
                preserved["preview"] = input_str[:500]
                result["toolInput"] = preserved
            else:
                result["toolInput"] = event.tool_input

    elif event.event_type == "tool_result":
        result["toolUseId"] = event.tool_use_id
        # Truncate large results
        if event.tool_result and len(event.tool_result) > 500:
            result["content"] = event.tool_result[:500] + "..."
        else:
            result["content"] = event.tool_result

    elif event.event_type == "system":
        result["content"] = event.content

    return result


class TranscriptWatcher:
    """Watches a transcript file and yields events as they arrive."""

    def __init__(self, transcript_path: Path):
        self.path = transcript_path
        self.position = 0
        self._stop = False

    async def watch(
        self,
        include_thinking: bool = True,
        from_beginning: bool = False,
        after_uuid: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Async generator that yields transcript events.

        Args:
            include_thinking: If False, filter out thinking blocks
            from_beginning: If True, start from file beginning, else start at end
            after_uuid: If provided, skip events until this UUID is found, then stream from there

        Yields:
            Formatted event dicts ready for SSE transmission
        """
        # Wait for file to appear (for brand new sessions)
        max_wait_seconds = 30
        wait_interval = 0.5
        waited = 0.0

        while not self.path.exists() and waited < max_wait_seconds:
            await asyncio.sleep(wait_interval)
            waited += wait_interval

        if not self.path.exists():
            yield {"type": "error", "message": f"Transcript not found after {max_wait_seconds}s: {self.path}"}
            return

        # Start position - if after_uuid specified, we need to scan from beginning
        if after_uuid or from_beginning:
            self.position = 0
        else:
            self.position = self.path.stat().st_size

        # If after_uuid specified, scan file to find it and skip to that position
        found_after_uuid = after_uuid is None  # If no UUID specified, we're "already found"

        if after_uuid:
            # Scan the file to find the UUID and set position just after it
            with open(self.path, 'r') as f:
                while True:
                    line_start = f.tell()
                    line = f.readline()
                    if not line:
                        # Reached end without finding UUID - start from end (no history)
                        self.position = f.tell()
                        found_after_uuid = True
                        break

                    try:
                        data = json.loads(line)
                        if data.get("uuid") == after_uuid:
                            # Found it - position is now just after this line
                            self.position = f.tell()
                            found_after_uuid = True
                            break
                    except json.JSONDecodeError:
                        continue

        # Send initial connected event
        yield {
            "type": "connected",
            "transcript_path": str(self.path),
            "timestamp": datetime.now().isoformat(),
        }

        poll_interval = POLL_INTERVAL_MS / 1000

        while not self._stop:
            try:
                current_size = self.path.stat().st_size

                if current_size > self.position:
                    # File grew - read new content
                    with open(self.path, 'r') as f:
                        f.seek(self.position)
                        new_content = f.read()
                        self.position = f.tell()

                    # Parse and yield events
                    lines = new_content.strip().split('\n')
                    logger.debug(f"[TRANSCRIPT] Read {len(lines)} new lines from {self.path.name}")
                    for line in lines:
                        if not line.strip():
                            continue

                        events = parse_transcript_line(line)
                        for event in events:
                            formatted = format_event_for_sse(event, include_thinking)
                            if formatted:
                                logger.debug(f"[TRANSCRIPT] Yielding {formatted['type']} event uuid={formatted.get('uuid', 'none')[:8]}")
                                yield formatted

                await asyncio.sleep(poll_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                yield {"type": "error", "message": str(e)}
                break

    def stop(self):
        """Stop the watcher."""
        self._stop = True


async def stream_transcript(
    transcript_path: Path,
    include_thinking: bool = True,
    from_beginning: bool = False,
    after_uuid: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Convenience function to stream transcript events.

    Args:
        transcript_path: Path to the transcript file
        include_thinking: If False, filter out thinking blocks
        from_beginning: If True, include historical events
        after_uuid: If provided, only stream events after this UUID

    Yields:
        Formatted event dicts ready for SSE transmission
    """
    watcher = TranscriptWatcher(transcript_path)
    async for event in watcher.watch(include_thinking, from_beginning, after_uuid):
        yield event


def get_all_events(
    transcript_path: Path,
    include_thinking: bool = True,
) -> List[Dict[str, Any]]:
    """Read all events from a transcript file.

    Args:
        transcript_path: Path to the transcript file
        include_thinking: If False, filter out thinking blocks

    Returns:
        List of formatted event dicts
    """
    if not transcript_path.exists():
        return []

    events = []
    try:
        with open(transcript_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                parsed_events = parse_transcript_line(line)
                for event in parsed_events:
                    formatted = format_event_for_sse(event, include_thinking)
                    if formatted:
                        events.append(formatted)
    except Exception as e:
        logger.error(f"Error reading transcript: {e}")

    return events


def get_transcript_path_for_session(
    session_id: str,
    db_path: Path,
) -> Optional[Path]:
    """Look up transcript path for a session from the database.

    Args:
        session_id: Our 8-char session ID
        db_path: Path to system.db

    Returns:
        Path to transcript file, or None if not found
    """
    import sqlite3

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT transcript_path, claude_session_id, cwd
            FROM sessions
            WHERE session_id = ?
        """, (session_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        # Primary: use stored transcript_path
        if row["transcript_path"]:
            path = Path(row["transcript_path"])
            if path.exists():
                return path

        # Fallback: reconstruct from claude_session_id
        if row["claude_session_id"] and row["cwd"]:
            # Project hash format: replace / with - and prepend -
            cwd = row["cwd"]
            project_hash = "-" + cwd.replace("/", "-")
            fallback_path = CLAUDE_PROJECTS_DIR / project_hash / f"{row['claude_session_id']}.jsonl"
            if fallback_path.exists():
                return fallback_path

        return None

    except Exception as e:
        logger.error(f"Error looking up transcript path: {e}")
        return None
