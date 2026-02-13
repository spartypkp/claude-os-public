"""
Conversation-Level Activity Stream

Streams transcript events for a CONVERSATION (not a session).
Handles session transitions internally - frontend never reconnects.

Key insight: Session is a process. Conversation is what users care about.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Dict, Any, Optional, List

from modules.sessions.transcript import TranscriptWatcher, get_all_events
from modules.sessions.claude_status import get_session_claude_status, ClaudeStatus

logger = logging.getLogger(__name__)

# Constants
TODOS_DIR = Path.home() / ".claude" / "todos"
POLL_INTERVAL_MS = 100
STATUS_INTERVAL_MS = 500
SESSION_CHECK_INTERVAL_MS = 1000  # Check for session changes
SESSION_END_GRACE_PERIOD_S = 10  # Wait before declaring conversation ended (for mode transitions)


@dataclass
class ConversationStreamState:
    """Internal state for deduplication and session tracking."""
    # Current session
    current_session_id: Optional[str] = None
    current_claude_session_id: Optional[str] = None
    current_mode: Optional[str] = None
    current_transcript_path: Optional[Path] = None
    current_tmux_pane: Optional[str] = None

    # Grace period tracking (for mode transitions)
    inactive_since: Optional[float] = None  # When session went inactive

    # Activity state (for deduplication)
    is_thinking: bool = False
    active_task: Optional[str] = None
    last_task: Optional[str] = None
    elapsed_time: Optional[str] = None
    token_count: Optional[str] = None
    context_warning: bool = False
    context_remaining: Optional[int] = None
    tasks_hash: Optional[int] = None
    model: Optional[str] = None
    cost_usd: Optional[float] = None

    def activity_changed(self, status: Optional[ClaudeStatus]) -> bool:
        if status is None:
            return self.is_thinking or self.active_task is not None
        return (
            self.is_thinking != status.is_thinking or
            self.active_task != status.active_task or
            self.last_task != status.last_task or
            self.elapsed_time != status.elapsed_time or
            self.token_count != status.token_count
        )

    def warning_changed(self, status: Optional[ClaudeStatus]) -> bool:
        if status is None:
            return self.context_warning
        return (
            self.context_warning != status.context_warning or
            self.context_remaining != status.context_remaining
        )

    def meta_changed(self, status: Optional[ClaudeStatus]) -> bool:
        if status is None:
            return False
        return (
            self.model != status.model or
            self.cost_usd != status.cost_usd
        )

    def update_from_status(self, status: Optional[ClaudeStatus]):
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


TASKS_DIR = Path.home() / ".claude" / "tasks"


def get_todo_tasks(session_id: str, claude_session_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Read task list from Claude Code's task files.

    Checks new format first (~/.claude/tasks/{uuid}/ with individual JSON files),
    then falls back to old format (~/.claude/todos/{uuid}.json array files).
    """
    # New format: ~/.claude/tasks/{claude_session_id}/ — individual {id}.json files
    if claude_session_id and TASKS_DIR.exists():
        task_dir = TASKS_DIR / claude_session_id
        if task_dir.is_dir():
            tasks = []
            for task_file in sorted(task_dir.glob("*.json")):
                try:
                    item = json.loads(task_file.read_text())
                    if isinstance(item, dict):
                        tasks.append({
                            "id": item.get("id", task_file.stem),
                            "content": item.get("subject", item.get("content", "")),
                            "subject": item.get("subject", ""),
                            "description": item.get("description", ""),
                            "status": item.get("status", "pending"),
                            "activeForm": item.get("activeForm"),
                            "blockedBy": item.get("blockedBy", []),
                        })
                except Exception as e:
                    logger.debug(f"Failed to read task file {task_file}: {e}")
            if tasks:
                return tasks

    # Old format: ~/.claude/todos/ — single JSON array file
    if TODOS_DIR.exists():
        ids_to_try = [claude_session_id, session_id] if claude_session_id else [session_id]
        for sid in ids_to_try:
            if not sid:
                continue
            patterns = [
                f"{sid}-agent-{sid}.json",
                f"agent-{sid}.json",
                f"{sid}.json",
            ]
            for pattern in patterns:
                todo_file = TODOS_DIR / pattern
                if todo_file.exists():
                    try:
                        data = json.loads(todo_file.read_text())
                        if isinstance(data, list):
                            return [
                                {
                                    "id": str(i + 1),
                                    "content": item.get("content", ""),
                                    "subject": item.get("content", ""),
                                    "status": item.get("status", "pending"),
                                    "activeForm": item.get("activeForm"),
                                    "blockedBy": [],
                                }
                                for i, item in enumerate(data)
                                if isinstance(item, dict)
                            ]
                    except Exception as e:
                        logger.debug(f"Failed to read todo file {todo_file}: {e}")

    return []


async def stream_conversation(
    conversation_id: str,
    get_active_session: callable,  # () -> Optional[dict] with session_id, transcript_path, tmux_pane
    include_thinking: bool = True,
    after_uuid: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Stream transcript events for a conversation.

    Handles session transitions internally. When the active session changes
    (due to reset or mode transition), emits a boundary event and continues
    streaming from the new session. Frontend never needs to reconnect.

    Args:
        conversation_id: The conversation to stream
        get_active_session: Callback to get current active session for conversation
        include_thinking: Whether to include thinking events
        after_uuid: Resume streaming after this UUID (cursor-based resumption)

    Yields:
        Event dicts for SSE transmission:
        - connected: Initial connection established
        - transcript: Chat events from transcript
        - activity: Real-time activity (thinking, task, elapsed time)
        - context_warning: Context usage warning
        - tasks: Task list updates
        - session_meta: Model and cost info
        - session_boundary: Session changed (reset, mode transition)
        - conversation_ended: No active session (conversation ended)
    """
    state = ConversationStreamState()
    transcript_watcher: Optional[TranscriptWatcher] = None
    transcript_task: Optional[asyncio.Task] = None
    transcript_queue: asyncio.Queue = asyncio.Queue()

    last_status_emit = 0
    last_session_check = 0
    initial_connection = True  # Track if this is first watcher (use after_uuid) or session transition (start from end)

    # Send initial connected event
    yield {
        "type": "connected",
        "timestamp": datetime.now().isoformat(),
        "conversation_id": conversation_id,
    }

    poll_interval = POLL_INTERVAL_MS / 1000
    status_interval = STATUS_INTERVAL_MS / 1000
    session_check_interval = SESSION_CHECK_INTERVAL_MS / 1000

    async def start_transcript_watcher(transcript_path: Path, resume_after_uuid: Optional[str] = None):
        """Start watching a transcript file."""
        nonlocal transcript_watcher, transcript_task

        # Stop existing watcher
        if transcript_task:
            transcript_task.cancel()
            try:
                await transcript_task
            except asyncio.CancelledError:
                pass
        if transcript_watcher:
            transcript_watcher.stop()

        # Clear queue
        while not transcript_queue.empty():
            try:
                transcript_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Start new watcher - cursor-based resumption
        if resume_after_uuid:
            logger.warning(f"[TRANSCRIPT WATCHER] Resuming from UUID {resume_after_uuid[:8]} in {transcript_path.name}")
        else:
            logger.warning(f"[TRANSCRIPT WATCHER] Starting from end of {transcript_path.name} (new events only)")

        transcript_watcher = TranscriptWatcher(transcript_path)

        async def fill_queue():
            try:
                async for event in transcript_watcher.watch(
                    include_thinking=include_thinking,
                    from_beginning=False,
                    after_uuid=resume_after_uuid,
                ):
                    await transcript_queue.put(event)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Transcript watcher error: {e}")

        transcript_task = asyncio.create_task(fill_queue())

    try:
        while True:
            now = asyncio.get_event_loop().time()

            # 1. Check for session changes (throttled)
            if (now - last_session_check) >= session_check_interval:
                active_session = await get_active_session()

                if active_session:
                    new_session_id = active_session.get("session_id")
                    new_transcript_path = active_session.get("transcript_path")
                    new_tmux_pane = active_session.get("tmux_pane")

                    # Session changed?
                    if new_session_id != state.current_session_id:
                        logger.warning(f"[SESSION TRANSITION] Conversation {conversation_id}: {state.current_session_id} -> {new_session_id}")
                        old_session_id = state.current_session_id
                        old_mode = state.current_mode
                        new_mode = active_session.get("mode")

                        # Determine boundary type
                        if new_mode == "summarizer":
                            boundary_type = "summarizer"
                        elif old_mode == "summarizer":
                            boundary_type = "reset"
                        elif old_mode and new_mode and old_mode != new_mode:
                            boundary_type = "mode_transition"
                        else:
                            boundary_type = "reset"

                        # Emit boundary event
                        if old_session_id is not None:
                            yield {
                                "type": "session_boundary",
                                "timestamp": datetime.now().isoformat(),
                                "old_session_id": old_session_id,
                                "new_session_id": new_session_id,
                                "boundary_type": boundary_type,
                                "prev_mode": old_mode,
                                "mode": new_mode,
                                "new_role": active_session.get("role"),
                                "new_mode": new_mode,
                            }

                        # Update state
                        state.current_session_id = new_session_id
                        state.current_claude_session_id = active_session.get("claude_session_id")
                        state.current_mode = new_mode
                        state.current_tmux_pane = new_tmux_pane
                        state.inactive_since = None  # Reset grace period

                        # Start new transcript watcher
                        if new_transcript_path:
                            path = Path(new_transcript_path)
                            if path.exists():
                                state.current_transcript_path = path
                                logger.warning(f"[SESSION TRANSITION] Starting new transcript watcher: {path}")
                                # Use after_uuid only for initial connection, not session transitions
                                resume_uuid = after_uuid if initial_connection else None
                                await start_transcript_watcher(path, resume_uuid)
                                initial_connection = False
                            else:
                                logger.error(f"[SESSION TRANSITION] Transcript path doesn't exist: {path}")
                        else:
                            logger.error(f"[SESSION TRANSITION] No transcript path for new session {new_session_id}")

                        logger.info(f"Conversation {conversation_id}: switched to session {new_session_id}")

                    # Transcript path became available for current session?
                    elif new_transcript_path and new_transcript_path != str(state.current_transcript_path):
                        path = Path(new_transcript_path)
                        if path.exists():
                            state.current_transcript_path = path
                            # Use after_uuid only for initial connection
                            resume_uuid = after_uuid if initial_connection else None
                            await start_transcript_watcher(path, resume_uuid)
                            initial_connection = False
                            logger.info(f"Conversation {conversation_id}: transcript path available for session {new_session_id}")

                else:
                    # No active session - but might be in mode transition
                    if state.current_session_id is not None:
                        if state.inactive_since is None:
                            # Just went inactive - start grace period
                            state.inactive_since = now
                            logger.info(f"Conversation {conversation_id}: session inactive, starting grace period")
                        elif (now - state.inactive_since) >= SESSION_END_GRACE_PERIOD_S:
                            # Grace period expired - conversation really ended
                            yield {
                                "type": "conversation_ended",
                                "timestamp": datetime.now().isoformat(),
                                "last_session_id": state.current_session_id,
                            }
                            state.current_session_id = None
                            state.current_tmux_pane = None
                            state.inactive_since = None
                            logger.info(f"Conversation {conversation_id}: ended after grace period")

                last_session_check = now

            # 2. Yield transcript events
            events_yielded = 0
            while not transcript_queue.empty() and events_yielded < 10:
                event = await transcript_queue.get()
                logger.info(f"[STREAM] Emitting transcript event: type={event.get('type')} uuid={event.get('uuid', 'none')[:8]}")
                yield {"type": "transcript", "event": event}
                events_yielded += 1

            # 3. Get activity from tmux (throttled)
            if state.current_tmux_pane and (now - last_status_emit) >= status_interval:
                try:
                    status = get_session_claude_status(state.current_tmux_pane)

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
                            yield {
                                "type": "context_warning",
                                "data": {"should_warn": False}
                            }

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

            # 4. Check task list
            if state.current_session_id:
                try:
                    tasks = get_todo_tasks(state.current_session_id, state.current_claude_session_id)
                    tasks_hash = hash(json.dumps(tasks, sort_keys=True))

                    if tasks_hash != state.tasks_hash:
                        state.tasks_hash = tasks_hash
                        yield {"type": "tasks", "data": {"items": tasks}}
                except Exception as e:
                    logger.debug(f"Task list error: {e}")

            await asyncio.sleep(poll_interval)

    except asyncio.CancelledError:
        pass
    finally:
        if transcript_task:
            transcript_task.cancel()
            try:
                await transcript_task
            except asyncio.CancelledError:
                pass
        if transcript_watcher:
            transcript_watcher.stop()
