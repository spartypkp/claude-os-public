"""
Subagent Transcript Discovery & Resolution

Subagent transcripts live alongside parent transcripts:
    {parent-transcript-dir}/subagents/agent-{agentId}.jsonl

This module provides utilities to discover, resolve, and read subagent
transcript files given a parent session's transcript path.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

from .transcript import get_transcript_path_for_session

logger = logging.getLogger(__name__)


def get_subagents_dir(transcript_path: Path) -> Optional[Path]:
    """Derive the subagents directory from a parent transcript path.

    Subagents live at: {transcript_path without .jsonl}/subagents/
    E.g., /path/to/abc123.jsonl -> /path/to/abc123/subagents/
    """
    subagents_dir = transcript_path.with_suffix('') / "subagents"
    if subagents_dir.exists() and subagents_dir.is_dir():
        return subagents_dir
    return None


def list_subagents(transcript_path: Path) -> List[Dict[str, Any]]:
    """List all subagent transcripts for a parent session.

    Returns list of dicts with: agent_id, path, prompt_preview, created_at, file_size
    """
    subagents_dir = get_subagents_dir(transcript_path)
    if not subagents_dir:
        return []

    results = []
    for jsonl_file in sorted(subagents_dir.glob("agent-*.jsonl")):
        agent_id = jsonl_file.stem.replace("agent-", "")
        stat = jsonl_file.stat()

        # Try to extract prompt preview from first line
        prompt_preview = ""
        try:
            with open(jsonl_file, 'r') as f:
                first_line = f.readline().strip()
                if first_line:
                    data = json.loads(first_line)
                    msg = data.get("message", {})
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        prompt_preview = content[:200]
                    elif isinstance(content, list):
                        # Extract text from content blocks
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                prompt_preview = block.get("text", "")[:200]
                                break
        except Exception:
            pass

        results.append({
            "agent_id": agent_id,
            "path": str(jsonl_file),
            "prompt_preview": prompt_preview,
            "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
            "file_size": stat.st_size,
        })

    return results


def find_subagent_by_id(transcript_path: Path, agent_id: str) -> Optional[Path]:
    """Direct file lookup for a subagent by ID.

    Returns path to agent-{agentId}.jsonl if it exists.
    """
    subagents_dir = transcript_path.with_suffix('') / "subagents"
    agent_file = subagents_dir / f"agent-{agent_id}.jsonl"
    if agent_file.exists():
        return agent_file
    return None


def find_subagent_by_prompt(transcript_path: Path, prompt: str) -> Optional[Dict[str, Any]]:
    """Find a subagent by matching the prompt prefix (first 200 chars).

    Reads the first line of each subagent JSONL and compares prompt content.
    Returns the matching subagent dict or None.
    """
    subagents = list_subagents(transcript_path)
    prompt_prefix = prompt[:200]

    for agent in subagents:
        if agent["prompt_preview"] and prompt_prefix in agent["prompt_preview"]:
            return agent

    return None


def get_subagent_transcript_path(
    session_id: str,
    agent_id: str,
    db_path: Path,
) -> Optional[Path]:
    """Resolve a subagent's transcript path from session_id + agent_id.

    Looks up the parent session's transcript_path from DB, then derives
    the subagent path.
    """
    parent_path = get_transcript_path_for_session(session_id, db_path)
    if not parent_path:
        return None

    return find_subagent_by_id(parent_path, agent_id)
