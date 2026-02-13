"""
Unified Activity Stream Service

Merges multiple data sources into a single SSE stream:
- Transcript events (JSONL files)
- Claude status (tmux capture) 
- Task list (todo files)

This provides the frontend with everything it needs in one connection.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Dict, Any, Optional, List

from modules.sessions.transcript import TranscriptWatcher, get_all_events
from modules.sessions.claude_status import get_session_claude_status, ClaudeStatus

logger = logging.getLogger(__name__)

# Constants
TODOS_DIR = Path.home() / ".claude" / "todos"
ACTIVITY_POLL_MS = 100  # Fast polling for responsive feel
STATUS_EMIT_INTERVAL_MS = 500  # Don't spam status updates


@dataclass
class ActivityStreamConfig:
    """Configuration for the activity stream."""
    session_id: str
    transcript_path: Path
    tmux_pane: Optional[str] = None
    claude_session_id: Optional[str] = None
    include_thinking: bool = True


@dataclass
class ActivityState:
    """Current activity state for deduplication."""
    is_thinking: bool = False
    active_task: Optional[str] = None
    last_task: Optional[str] = None  # From pane title - shows even when idle
    elapsed_time: Optional[str] = None
    token_count: Optional[str] = None
    context_warning: bool = False
    context_remaining: Optional[int] = None
    tasks_hash: Optional[int] = None
    model: Optional[str] = None
    cost_usd: Optional[float] = None
    
    def activity_changed(self, status: Optional[ClaudeStatus]) -> bool:
        """Check if activity state changed."""
        if status is None:
            return self.is_thinking or self.active_task is not None or self.last_task is not None
        return (
            self.is_thinking != status.is_thinking or
            self.active_task != status.active_task or
            self.last_task != status.last_task or
            self.elapsed_time != status.elapsed_time or
            self.token_count != status.token_count
        )
    
    def warning_changed(self, status: Optional[ClaudeStatus]) -> bool:
        """Check if warning state changed."""
        if status is None:
            return self.context_warning
        return (
            self.context_warning != status.context_warning or
            self.context_remaining != status.context_remaining
        )
    
    def meta_changed(self, status: Optional[ClaudeStatus]) -> bool:
        """Check if model/cost changed."""
        if status is None:
            return False
        return (
            self.model != status.model or
            self.cost_usd != status.cost_usd
        )
    
    def update_from_status(self, status: Optional[ClaudeStatus]):
        """Update state from status."""
        if status:
            self.is_thinking = status.is_thinking
            self.active_task = status.active_task
            self.last_task = status.last_task
            self.elapsed_time = status.elapsed_time
            self.token_count = status.token_count
            self.context_warning = status.context_warning
            self.context_remaining = status.context_remaining
            self.model = status.model
            self.cost_usd = status.cost_usd
        else:
            self.is_thinking = False
            self.active_task = None
            self.last_task = None
            self.elapsed_time = None
            self.token_count = None


def get_todo_tasks(claude_session_id: str) -> List[Dict[str, Any]]:
    """Read task list from Claude Code's todo file.
    
    Args:
        claude_session_id: Claude Code's internal session UUID
        
    Returns:
        List of task dicts with content and status
    """
    if not TODOS_DIR.exists():
        return []
    
    # Try multiple naming patterns Claude Code uses
    patterns = [
        f"{claude_session_id}-agent-{claude_session_id}.json",
        f"agent-{claude_session_id}.json",
        f"{claude_session_id}.json",
    ]
    
    for pattern in patterns:
        todo_file = TODOS_DIR / pattern
        if todo_file.exists():
            try:
                data = json.loads(todo_file.read_text())
                if isinstance(data, list):
                    return [
                        {
                            "content": item.get("content", ""),
                            "status": item.get("status", "pending"),
                            "activeForm": item.get("activeForm"),
                        }
                        for item in data
                        if isinstance(item, dict)
                    ]
            except Exception as e:
                logger.debug(f"Failed to read todo file {todo_file}: {e}")
    
    return []


async def stream_unified_activity(
    config: ActivityStreamConfig,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Single unified stream that combines all data sources.
    
    Yields events:
    - transcript: New chat events
    - activity: Real-time activity (thinking, active task, elapsed time)
    - context_warning: When Claude Code shows context low warning
    - tasks: Task list updates
    - session_meta: Model and cost info
    
    Args:
        config: Stream configuration
        
    Yields:
        Event dicts ready for SSE transmission
    """
    # Initialize state for deduplication
    state = ActivityState()
    last_status_emit = 0
    
    # Create transcript watcher
    transcript_watcher = TranscriptWatcher(config.transcript_path)
    
    # Queue for transcript events (non-blocking)
    transcript_queue: asyncio.Queue = asyncio.Queue()
    
    async def fill_transcript_queue():
        """Background task to fill transcript queue."""
        try:
            async for event in transcript_watcher.watch(
                include_thinking=config.include_thinking,
                from_beginning=False,
            ):
                await transcript_queue.put(event)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Transcript watcher error: {e}")
    
    # Start transcript watcher as background task
    transcript_task = asyncio.create_task(fill_transcript_queue())
    
    # Send initial connected event
    yield {
        "type": "connected",
        "timestamp": datetime.now().isoformat(),
        "session_id": config.session_id,
    }
    
    poll_interval = ACTIVITY_POLL_MS / 1000
    status_interval = STATUS_EMIT_INTERVAL_MS / 1000
    
    try:
        while True:
            now = asyncio.get_event_loop().time()
            
            # 1. Yield any pending transcript events (high priority)
            events_yielded = 0
            while not transcript_queue.empty() and events_yielded < 10:
                event = await transcript_queue.get()
                yield {"type": "transcript", "event": event}
                events_yielded += 1
            
            # 2. Get real-time activity from tmux (throttled)
            if config.tmux_pane and (now - last_status_emit) >= status_interval:
                try:
                    status = get_session_claude_status(config.tmux_pane)
                    
                    # Emit activity update if changed
                    if state.activity_changed(status):
                        yield {
                            "type": "activity",
                            "data": {
                                "is_thinking": status.is_thinking if status else False,
                                "active_task": status.active_task if status else None,
                                "last_task": status.last_task if status else None,
                                "elapsed_time": status.elapsed_time if status else None,
                                "token_count": status.token_count if status else None,
                            }
                        }
                    
                    # Emit context warning if changed
                    if state.warning_changed(status):
                        if status and status.context_warning:
                            yield {
                                "type": "context_warning",
                                "data": {
                                    "percent_remaining": status.context_remaining,
                                    "percent_used": status.context_percent_used,
                                    "should_warn": True,
                                    "should_force_reset": (status.context_remaining or 100) <= 10,
                                }
                            }
                        elif state.context_warning:
                            # Warning cleared
                            yield {
                                "type": "context_warning",
                                "data": {
                                    "should_warn": False,
                                }
                            }
                    
                    # Emit session meta if changed
                    if state.meta_changed(status):
                        yield {
                            "type": "session_meta",
                            "data": {
                                "model": status.model if status else None,
                                "cost_usd": status.cost_usd if status else None,
                            }
                        }
                    
                    state.update_from_status(status)
                    last_status_emit = now
                    
                except Exception as e:
                    logger.debug(f"Status capture error: {e}")
            
            # 3. Check task list (only if we have claude_session_id)
            if config.claude_session_id:
                try:
                    tasks = get_todo_tasks(config.claude_session_id)
                    tasks_hash = hash(json.dumps(tasks, sort_keys=True))
                    
                    if tasks_hash != state.tasks_hash:
                        state.tasks_hash = tasks_hash
                        yield {
                            "type": "tasks",
                            "data": {"items": tasks}
                        }
                except Exception as e:
                    logger.debug(f"Task list error: {e}")
            
            await asyncio.sleep(poll_interval)
            
    except asyncio.CancelledError:
        pass
    finally:
        transcript_task.cancel()
        try:
            await transcript_task
        except asyncio.CancelledError:
            pass
        transcript_watcher.stop()


def get_history_with_status(
    config: ActivityStreamConfig,
) -> Dict[str, Any]:
    """
    Get initial history + current status for a session.
    
    Used for the initial REST call before SSE connection.
    
    Args:
        config: Stream configuration
        
    Returns:
        Dict with events, status, tasks, and meta
    """
    result: Dict[str, Any] = {
        "events": [],
        "activity": None,
        "context_warning": None,
        "tasks": [],
        "session_meta": None,
    }
    
    # Get transcript history
    if config.transcript_path.exists():
        result["events"] = get_all_events(
            config.transcript_path,
            include_thinking=config.include_thinking,
        )
    
    # Get current status from tmux
    if config.tmux_pane:
        try:
            status = get_session_claude_status(config.tmux_pane)
            if status:
                result["activity"] = {
                    "is_thinking": status.is_thinking,
                    "active_task": status.active_task,
                    "last_task": status.last_task,
                    "elapsed_time": status.elapsed_time,
                    "token_count": status.token_count,
                }
                
                if status.context_warning:
                    result["context_warning"] = {
                        "percent_remaining": status.context_remaining,
                        "percent_used": status.context_percent_used,
                        "should_warn": True,
                        "should_force_reset": (status.context_remaining or 100) <= 10,
                    }
                
                result["session_meta"] = {
                    "model": status.model,
                    "cost_usd": status.cost_usd,
                }
        except Exception as e:
            logger.debug(f"Status capture error: {e}")
    
    # Get task list
    if config.claude_session_id:
        try:
            result["tasks"] = get_todo_tasks(config.claude_session_id)
        except Exception as e:
            logger.debug(f"Task list error: {e}")
    
    return result

