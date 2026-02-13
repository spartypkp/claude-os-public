"""Transcript parser for handoff summarization.

Parses JSONL transcripts into concise, readable format.
Skips noise (thinking, progress, file snapshots, tool results).
Keeps signal (user messages, Claude responses, tool calls).

Features:
- Groups consecutive tool calls to same file (Edit stop.py x3)
- Merges consecutive Claude messages
- Shows timestamps for pacing context
- Preserves interrupts and system warnings
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional


def parse_transcript(path: Path, skip_first_user: bool = True) -> str:
    """
    Parse transcript JSONL into readable format for summarizer.

    Args:
        path: Path to .jsonl transcript file
        skip_first_user: Skip first user message (usually role/mode injection)

    Returns:
        Formatted transcript string
    """
    if not path.exists():
        return "(Transcript not found)"

    raw_items = []  # List of (timestamp, item_type, content)
    first_user_seen = False
    first_timestamp = None
    last_timestamp = None

    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type")
            timestamp = _extract_timestamp(event)

            # Track session duration
            if timestamp:
                if first_timestamp is None:
                    first_timestamp = timestamp
                last_timestamp = timestamp

            # Skip noise
            if event_type in ("progress", "file-history-snapshot", "summary"):
                continue

            if event_type == "user":
                result = _parse_user_event(event, skip_first_user and not first_user_seen)
                first_user_seen = True
                if result:
                    raw_items.append((timestamp, "user", result))

            elif event_type == "assistant":
                results = _parse_assistant_event(event)
                for item in results:
                    raw_items.append((timestamp, "claude" if item.startswith("Claude:") else "tool", item))

            elif event_type == "system":
                # System events (e.g., interrupts) - could add if useful
                pass

    # Post-process: group consecutive tools, merge Claude messages
    processed = _post_process(raw_items)

    # Add session header with timing
    header = _format_session_header(first_timestamp, last_timestamp)
    if header:
        processed.insert(0, header)

    return "\n\n".join(processed)


def _format_session_header(first_ts: Optional[str], last_ts: Optional[str]) -> Optional[str]:
    """Format a session header with start time and duration."""
    if not first_ts or not last_ts:
        return None

    try:
        # Calculate duration
        first_mins = int(first_ts.split(":")[0]) * 60 + int(first_ts.split(":")[1])
        last_mins = int(last_ts.split(":")[0]) * 60 + int(last_ts.split(":")[1])
        duration = last_mins - first_mins
        if duration < 0:
            duration += 24 * 60  # Handle midnight crossing

        return f"=== Session: {first_ts} - {last_ts} ({duration} min) ==="
    except (ValueError, IndexError):
        return f"=== Session: {first_ts} ==="


def _extract_timestamp(event: Dict[str, Any]) -> Optional[str]:
    """Extract timestamp from event, return HH:MM format or None."""
    # Try multiple locations where timestamp might be
    ts = (
        event.get("timestamp")
        or (event.get("snapshot") or {}).get("timestamp")
        or (event.get("message") or {}).get("timestamp")
    )
    if not ts:
        return None
    try:
        # Handle ISO format: 2026-01-21T11:04:55.123Z
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%H:%M")
    except (ValueError, AttributeError):
        return None


def _post_process(items: List[tuple]) -> List[str]:
    """
    Post-process items to group consecutive tool calls and merge Claude messages.

    Args:
        items: List of (timestamp, item_type, content)

    Returns:
        List of formatted strings ready for output
    """
    if not items:
        return []

    result = []
    i = 0
    last_timestamp = None

    while i < len(items):
        timestamp, item_type, content = items[i]

        # Add timestamp marker if significant time passed (5+ min gap)
        if timestamp and last_timestamp:
            try:
                curr_mins = int(timestamp.split(":")[0]) * 60 + int(timestamp.split(":")[1])
                last_mins = int(last_timestamp.split(":")[0]) * 60 + int(last_timestamp.split(":")[1])
                if curr_mins - last_mins >= 5:
                    result.append(f"--- {timestamp} ---")
            except (ValueError, IndexError):
                pass

        if timestamp:
            last_timestamp = timestamp

        if item_type == "tool":
            # Group consecutive identical tool calls
            tool_groups = _group_consecutive_tools(items, i)
            for group_str in tool_groups:
                result.append(group_str)
            i += sum(len(g) for g in _get_tool_groups(items, i))

        elif item_type == "claude":
            # Merge consecutive Claude messages
            merged, count = _merge_claude_messages(items, i)
            result.append(merged)
            i += count

        else:
            result.append(content)
            i += 1

    return result


def _group_consecutive_tools(items: List[tuple], start: int) -> List[str]:
    """
    Group consecutive tool calls, collapsing repeated calls to same file.

    Returns list of formatted tool strings.
    """
    groups = _get_tool_groups(items, start)
    result = []

    for group in groups:
        if len(group) == 1:
            result.append(group[0])
        else:
            # Multiple calls - extract tool name and file
            first = group[0]
            # Pattern: [Edit filename] or [Read filename]
            match = re.match(r'\[(\w+)\s+([^\]]+)\]', first)
            if match:
                tool_name, target = match.groups()
                result.append(f"[{tool_name} {target} x{len(group)}]")
            else:
                # Fallback: just show first with count
                result.append(f"{first} (x{len(group)})")

    return result


def _get_tool_groups(items: List[tuple], start: int) -> List[List[str]]:
    """
    Get groups of consecutive tool calls that can be collapsed.

    Groups by: same tool + same target (e.g., multiple Edit stop.py)
    """
    groups = []
    current_group = []
    current_key = None

    i = start
    while i < len(items):
        timestamp, item_type, content = items[i]

        if item_type != "tool":
            break

        # Extract tool key (tool name + target)
        match = re.match(r'\[(\w+)\s+([^\]]+)\]', content)
        if match:
            key = (match.group(1), match.group(2))
        else:
            key = content  # Use full content as key for non-standard tools

        if key == current_key:
            current_group.append(content)
        else:
            if current_group:
                groups.append(current_group)
            current_group = [content]
            current_key = key

        i += 1

    if current_group:
        groups.append(current_group)

    return groups


def _merge_claude_messages(items: List[tuple], start: int) -> tuple:
    """
    Merge consecutive Claude messages into one.

    Returns: (merged_content, count_consumed)
    """
    messages = []
    count = 0

    i = start
    while i < len(items):
        timestamp, item_type, content = items[i]

        if item_type != "claude":
            break

        # Strip "Claude: " prefix for merging
        text = content[8:] if content.startswith("Claude: ") else content
        messages.append(text)
        count += 1
        i += 1

    if count == 1:
        return items[start][2], 1

    # Merge with paragraph breaks
    merged = "Claude: " + "\n\n".join(messages)
    return merged, count


def _parse_user_event(event: Dict[str, Any], skip: bool) -> str | None:
    """Parse user event. Returns None if should be skipped."""
    msg = event.get("message", {})
    content = msg.get("content", "")

    # Tool results - skip (we show tool_use instead)
    if isinstance(content, list):
        for item in content:
            if item.get("type") == "tool_result":
                return None  # Skip tool results
        # Other list content - extract text
        texts = [item.get("text", "") for item in content if item.get("type") == "text"]
        content = " ".join(texts)

    if not isinstance(content, str):
        return None

    # Skip if it's the first user message (role injection)
    if skip:
        return None

    # Skip very long messages (likely system injections)
    if len(content) > 2000:
        return f"User: [System injection - {len(content)} chars]"

    content = content.strip()
    if not content:
        return None

    # Format special messages distinctly
    if "[Request interrupted by user]" in content:
        return ">>> INTERRUPTED <<<"
    if "[CLAUDE OS SYS:" in content:
        # Extract the key part of system messages
        return f">>> SYSTEM: {_extract_system_message_type(content)} <<<"

    return f"User: {content}"


def _extract_system_message_type(content: str) -> str:
    """Extract the type and brief description from system messages."""
    # Pattern: [CLAUDE OS SYS: TYPE]: Description
    match = re.search(r'\[CLAUDE OS SYS:\s*(\w+)\]:\s*([^\n]+)', content)
    if match:
        msg_type, desc = match.groups()
        return f"{msg_type} - {desc[:50]}"
    return "unknown"


def _parse_assistant_event(event: Dict[str, Any]) -> List[str]:
    """Parse assistant event into list of formatted strings."""
    msg = event.get("message", {})
    blocks = msg.get("content", [])

    results = []
    for block in blocks:
        block_type = block.get("type")

        if block_type == "thinking":
            # Skip thinking blocks
            continue

        elif block_type == "text":
            text = block.get("text", "").strip()
            if text:
                results.append(f"Claude: {text}")

        elif block_type == "tool_use":
            tool_name = block.get("name", "unknown")
            tool_input = block.get("input", {})

            # Format tool call concisely
            tool_summary = _summarize_tool_call(tool_name, tool_input)
            results.append(f"[{tool_summary}]")

    return results


def _summarize_tool_call(name: str, input: Dict[str, Any]) -> str:
    """Create concise summary of tool call."""

    if name == "Read":
        path = input.get("file_path", "?")
        # Just filename, not full path
        filename = Path(path).name if path else "?"
        return f"Read {filename}"

    elif name == "Write":
        path = input.get("file_path", "?")
        filename = Path(path).name if path else "?"
        return f"Write {filename}"

    elif name == "Edit":
        path = input.get("file_path", "?")
        filename = Path(path).name if path else "?"
        return f"Edit {filename}"

    elif name == "Bash":
        cmd = input.get("command", "")
        # First 50 chars of command
        cmd_preview = cmd[:50] + "..." if len(cmd) > 50 else cmd
        return f"Bash: {cmd_preview}"

    elif name == "Glob":
        pattern = input.get("pattern", "?")
        return f"Glob {pattern}"

    elif name == "Grep":
        pattern = input.get("pattern", "?")
        return f"Grep '{pattern}'"

    elif name == "TodoWrite":
        return "Updated todo list"

    elif name == "Task":
        desc = input.get("description", "")
        return f"Task: {desc}"

    elif name == "WebSearch":
        query = input.get("query", "?")
        return f"WebSearch: {query[:40]}"

    elif name == "WebFetch":
        url = input.get("url", "?")
        return f"WebFetch: {url[:40]}"

    # MCP life tools - show operation for tools that have one
    elif name.startswith("mcp__life__"):
        tool = name.replace("mcp__life__", "")
        op = input.get("operation")
        if op:
            return f"MCP: {tool}({op})"
        # Special cases for tools without 'operation'
        if tool == "status":
            text = input.get("text", "")
            return f"MCP: status(\"{text[:30]}\")" if text else "MCP: status"
        if tool == "reset":
            summary = input.get("summary", "")
            return f"MCP: reset(\"{summary[:30]}...\")" if summary else "MCP: reset"
        if tool == "timeline":
            desc = input.get("description", "")
            return f"MCP: timeline(\"{desc[:30]}...\")" if desc else "MCP: timeline"
        return f"MCP: {tool}"

    else:
        return f"Tool: {name}"


# Quick test
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        result = parse_transcript(path)
        print(result)
        print(f"\n--- Total length: {len(result)} chars ---")
