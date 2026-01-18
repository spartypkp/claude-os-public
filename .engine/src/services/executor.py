"""Placeholder scheduled executor that assembles prompts and stores artifacts locally."""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    query,
    HookMatcher,
    HookContext,
    tool,
    create_sdk_mcp_server,
)

from .prompts import PromptAssemblyService, PromptAssemblyError
from .storage import SystemStorage


class ScheduledExecutorService:
    """Executes scheduled tasks by assembling layered prompts.

    This implementation is intentionally local/offline: it writes the assembled
    instructions to `Workspace/async-results` as a stub artifact so we can verify
    the scheduler plumbing before hooking up real Claude calls.
    """

    TASK_DOMAIN_DEFAULTS = {
        "company_research": "Career",
        "morning_brief": "Planning",
        "weekly_migration": "Planning",
        "commitment_check": "Operations",
        "spec_drift": "Career",
    }

    def __init__(
        self,
        repo_root: Path,
        storage: SystemStorage,
        prompts: PromptAssemblyService,
        config: Dict[str, Any] | None = None,
    ):
        self.repo_root = repo_root
        self.storage = storage
        self.config = config or {}
        self.prompts = prompts

        # Create worker-tools SDK MCP server FIRST (needed by _build_claude_options)
        self._worker_tools_server = self._create_worker_tools_server()

        self._claude_options = self._build_claude_options(self.config.get("executor") or {})
        # Track active Claude clients for termination support
        self._active_clients: Dict[str, ClaudeSDKClient] = {}
        # Track last SSE emission time per task for throttling (Jan 2026 - worker frontend overhaul)
        self._last_output_event_time: Dict[str, float] = {}

    def _create_worker_tools_server(self):
        """Create an in-process SDK MCP server with worker-specific tools.

        This server provides the report() tool that workers use to submit results.
        It runs in-process (no subprocess) for direct DB access.
        """
        storage = self.storage  # Closure over storage for DB access

        @tool(
            name="report",
            description="Submit your work report. Call this as your final action.",
            input_schema={
                "type": "object",
                "properties": {
                    "worker_id": {
                        "type": "string",
                        "description": "Your worker ID (from your instructions)"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["complete", "needs_clarification", "failed"],
                        "description": "Task outcome"
                    },
                    "summary": {
                        "type": "string",
                        "description": "One-sentence summary of what you accomplished"
                    },
                    "body": {
                        "type": "string",
                        "description": "Full report content (markdown). Include findings, artifacts created, etc."
                    },
                    "artifacts": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Paths to files you created (optional)"
                    }
                },
                "required": ["worker_id", "status", "summary"]
            }
        )
        async def report_tool(args: Dict[str, Any]) -> Dict[str, Any]:
            """Worker report submission tool."""
            worker_id = args.get("worker_id")
            status = args.get("status", "complete")
            summary = args.get("summary", "")
            body = args.get("body", "")
            artifacts = args.get("artifacts", [])

            if not worker_id:
                return {"content": [{"type": "text", "text": "Error: worker_id is required"}]}

            # Build report markdown
            report_md = f"""---
status: {status}
summary: {summary}
artifacts: {json.dumps(artifacts) if artifacts else "[]"}
---

# Worker Report

## Summary
{summary}

"""
            if body:
                report_md += f"""## Details
{body}

"""
            if artifacts:
                report_md += "## Artifacts Created\n"
                for artifact in artifacts:
                    report_md += f"- `{artifact}`\n"

            # Map status to task status
            if status == "complete":
                task_status = "complete"
                attention_kind = "result"
            elif status == "needs_clarification":
                task_status = "awaiting_clarification"
                attention_kind = "clarification"
            else:  # failed
                task_status = "failed"
                attention_kind = "alert"

            # Update worker record in DB
            now = datetime.now(timezone.utc).isoformat()
            try:
                storage.execute("""
                    UPDATE workers
                    SET status = ?,
                        report_md = ?,
                        report_summary = ?,
                        attention_kind = ?,
                        attention_title = ?,
                        completed_at = ?,
                        updated_at = ?
                    WHERE id = ?
                """, (task_status, report_md, summary, attention_kind, summary, now, now, worker_id))

                return {
                    "content": [{
                        "type": "text",
                        "text": f"Report submitted successfully. Status: {status}"
                    }]
                }
            except Exception as e:
                return {
                    "content": [{
                        "type": "text",
                        "text": f"Error submitting report: {str(e)}"
                    }]
                }

        return create_sdk_mcp_server(
            name="worker-tools",
            version="1.0.0",
            tools=[report_tool]
        )

    def _emit_structured_event(self, task_id: Optional[str], event: Dict[str, Any]) -> None:
        """Emit a structured event to live_output as a JSON line.

        Events are JSONL format for easy parsing by the frontend.
        """
        if not task_id:
            return

        import json
        event["timestamp"] = int(datetime.now(timezone.utc).timestamp() * 1000)
        json_line = json.dumps(event) + "\n"
        self._update_live_output(task_id, json_line)

    def _create_tool_hooks(self, task_id: str, metadata: Dict[str, Any]):
        """Create hook functions with task_id bound in closure.

        This is critical for parallel task execution - each task needs its own
        hooks with its own task_id, not a shared instance variable.
        """
        async def track_tool_start(
            input_data: Dict[str, Any],
            tool_use_id: Optional[str],
            context: HookContext
        ) -> Dict[str, Any]:
            """PreToolUse hook - emit tool_start event for real-time UI."""
            tool_name = input_data.get("tool_name")
            tool_input = input_data.get("tool_input", {})

            # Emit tool_start event (task_id captured from closure)
            self._emit_structured_event(task_id, {
                "type": "tool_start",
                "name": tool_name,
                "id": tool_use_id or "",
                "input": self._sanitize_tool_input(tool_name, tool_input),
            })

            return {}  # No modifications

        async def track_tool_use(
            input_data: Dict[str, Any],
            tool_use_id: Optional[str],
            context: HookContext
        ) -> Dict[str, Any]:
            """PostToolUse hook - tracks what async Claude does in real-time."""
            tool_name = input_data.get("tool_name")
            tool_input = input_data.get("tool_input", {})

            # Emit tool_result event (task_id captured from closure)
            tool_output = input_data.get("tool_output", "")
            tool_error = input_data.get("tool_error")
            self._emit_structured_event(task_id, {
                "type": "tool_result",
                "id": tool_use_id or "",
                "success": not tool_error,
                "output": str(tool_output)[:500] if tool_output else "",
            })

            # Track tool usage counts (metadata captured from closure)
            tools_used = metadata.setdefault("tools_used", {})
            tools_used[tool_name] = tools_used.get(tool_name, 0) + 1

            # Track files touched
            if tool_name in ["Edit", "Write"]:
                file_path = tool_input.get("file_path")
                if file_path:
                    files_touched = metadata.setdefault("files_touched", set())
                    files_touched.add(file_path)

            # Track outputs created (files written to output/ folder)
            if tool_name == "Write":
                file_path = tool_input.get("file_path", "")
                if "output/" in file_path:
                    outputs = metadata.setdefault("outputs", set())
                    outputs.add(file_path)

            # Track web searches
            if tool_name == "WebSearch":
                query_text = tool_input.get("query")
                if query_text:
                    searches = metadata.setdefault("web_searches", [])
                    searches.append(query_text)

            return {}  # No modifications to tool execution

        return track_tool_start, track_tool_use

    def _sanitize_tool_input(self, tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize tool input for display (truncate large values, hide sensitive data)."""
        sanitized = {}
        for key, value in tool_input.items():
            if isinstance(value, str):
                # Truncate large strings
                if len(value) > 200:
                    sanitized[key] = value[:200] + "..."
                else:
                    sanitized[key] = value
            elif isinstance(value, (int, float, bool, type(None))):
                sanitized[key] = value
            elif isinstance(value, (list, dict)):
                # Truncate complex objects to avoid huge payloads
                str_repr = str(value)
                if len(str_repr) > 100:
                    sanitized[key] = f"[{type(value).__name__} with {len(value)} items]"
                else:
                    sanitized[key] = value
            else:
                sanitized[key] = str(value)[:100]
        return sanitized

    async def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Assemble instructions and execute task asynchronously."""
        # 1. WRITE EXECUTOR PID MARKER (for instant crash detection)
        # PID markers live in .engine/data/pids/ for crash recovery
        pids_dir = self.repo_root / ".engine" / "data" / "pids"
        pids_dir.mkdir(parents=True, exist_ok=True)
        pid_marker = pids_dir / f"{task['id'][:8]}.pid"
        pid_marker.write_text(f"{os.getpid()}:{task['id']}:{datetime.now(timezone.utc).isoformat()}")

        try:
            # 2. BUILD PROMPT (with worker_id)
            try:
                params = task.get("params") or {}
                # Inject worker_id so worker can call report()
                params["worker_id"] = task["id"]
                prompt = self.prompts.build_async_prompt(
                    task["task_type"],
                    params
                )
            except PromptAssemblyError as exc:
                raise RuntimeError(str(exc)) from exc

            # 3. RUN WORKER (worker calls report() internally when done)
            response, session_id, metadata = await self._run_claude(prompt, task_id=task["id"])

            # 4. FINALIZE (check report was submitted, wake spawner)
            return self._finalize_task(task, session_id)
        finally:
            # CLEANUP: Remove PID marker on completion (success or failure)
            # This ensures crash recovery doesn't see stale PID markers
            pid_marker.unlink(missing_ok=True)

    async def execute_task_resume(self, resume_prompt: str, session_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        """Resume a paused task with an answer to continue execution.

        Args:
            resume_prompt: The prompt containing the answer
            session_id: The SDK session ID to resume from
            task: The original task dict

        Returns:
            Task result dict
        """
        # Resume execution (worker calls report() when done)
        response, new_session_id, metadata = await self._run_claude(resume_prompt, resume_session=session_id)

        return self._finalize_task(task, new_session_id or session_id)

    def _finalize_task(
        self,
        task: Dict[str, Any],
        session_id: Optional[str]
    ) -> Dict[str, Any]:
        """Finalize task after worker execution.

        Workers call report() directly to submit results to DB.
        This method just checks if that happened and handles cleanup.

        Args:
            task: Task dict
            session_id: Session ID from execution

        Returns:
            Task result dict
        """
        task_id = task["id"]

        # 1. CHECK IF REPORT WAS SUBMITTED
        # Worker should have called report() which updates DB directly
        row = self.storage.fetchone(
            "SELECT status, report_md, report_summary FROM workers WHERE id = ?",
            (task_id,)
        )

        if not row or not row["report_md"]:
            # Worker didn't call report() - mark as failed
            now = datetime.now(timezone.utc).isoformat()
            self.storage.execute("""
                UPDATE workers
                SET status = 'failed',
                    report_md = '# Worker Failed\n\nWorker exited without calling report().',
                    report_summary = 'Worker exited without submitting report',
                    attention_kind = 'alert',
                    attention_title = 'Worker failed to report',
                    completed_at = ?,
                    updated_at = ?
                WHERE id = ?
            """, (now, now, task_id))
            status = "failed"
            summary = "Worker exited without submitting report"
        else:
            status = row["status"]
            summary = row["report_summary"] or "Task completed"

        # 2. EMIT EVENT
        try:
            from utils.events import emit_event
            emit_event(
                "worker",
                "completed" if "complete" in status else "failed",
                actor=task_id[:8],
                data={
                    "status": status,
                    "summary": summary,
                    "spawned_by": task.get("spawned_by_session", "")[:8] if task.get("spawned_by_session") else None
                }
            )
        except Exception:
            pass  # Event emission is best-effort

        # 3. WAKE SPAWNER SESSION
        if "complete" in status and task.get("spawned_by_session"):
            self._maybe_wake_session(task["spawned_by_session"])

        # 4. RETURN SIMPLE RESULT
        return {
            "status": status,
            "summary": summary,
        }

    # ------------------------------------------------------------------ helpers
    def _build_claude_options(self, executor_cfg: Dict[str, Any]) -> Dict[str, Any]:
        claude_cfg = (executor_cfg.get("claude") or {}).get("options") or {}
        options = dict(claude_cfg)
        options.setdefault("permission_mode", "bypassPermissions")
        options.setdefault("cwd", str(self.repo_root))

        # Configure MCP servers for workers:
        # 1. "life" - external stdio server for contacts, calendar, email, etc.
        # 2. "worker-tools" - in-process SDK server for report()
        options["mcp_servers"] = {
            "life": {
                "type": "stdio",
                "command": str(self.repo_root / "venv/bin/python"),
                "args": [str(self.repo_root / ".engine/src/life_mcp/server.py")]
            },
            "worker-tools": self._worker_tools_server
        }

        return options

    def _update_live_output(self, task_id: str, output: str) -> None:
        """Update the live_output column for a running task.

        Appends new output to the existing live_output (capped at ~50KB to prevent bloat).
        Jan 2026: Also emits worker.output_updated SSE event (throttled to max 1/sec per task).
        """
        if not task_id:
            return

        try:
            # Get current live_output
            row = self.storage.fetchone(
                "SELECT live_output FROM workers WHERE id = ?",
                (task_id,)
            )
            current = row["live_output"] if row and row["live_output"] else ""

            # Append new output
            new_output = current + output

            # Cap at ~50KB to prevent database bloat
            if len(new_output) > 50000:
                new_output = "...[truncated]...\n" + new_output[-45000:]

            # Update database
            self.storage.execute(
                "UPDATE workers SET live_output = ?, updated_at = ? WHERE id = ?",
                (new_output, datetime.now(timezone.utc).isoformat(), task_id)
            )

            # Emit SSE event (throttled: max 1 event per second per task)
            current_time = time.time()
            last_emit = self._last_output_event_time.get(task_id, 0)
            if current_time - last_emit >= 1.0:
                self._last_output_event_time[task_id] = current_time
                self._emit_output_updated_event(task_id)
        except Exception as e:
            # Non-fatal - just log and continue
            print(f"Warning: Failed to update live_output for task {task_id[:8]}: {e}")

    def _emit_output_updated_event(self, task_id: str) -> None:
        """Emit worker.output_updated SSE event to notify Dashboard of new activity.

        Jan 2026: Replaces 500ms polling with push-based updates.
        Called from _update_live_output with throttling (max 1/sec per task).
        """
        try:
            # Import here to avoid circular dependency
            import asyncio
            from utils.event_bus import event_bus

            # Get or create event loop
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                # No running loop in this thread - skip event (non-critical)
                return

            # Schedule event emission (fire and forget)
            asyncio.create_task(
                event_bus.publish("worker.output_updated", {
                    "worker_id": task_id,
                    "short_id": task_id[:8],
                })
            )
        except Exception as e:
            # Non-fatal - SSE events are nice-to-have, not critical
            print(f"Warning: Failed to emit output_updated event for task {task_id[:8]}: {e}")

    async def _fake_stream_text(self, task_id: str, text: str, chars_per_update: int = 50) -> None:
        """Simulate streaming by progressively revealing text to live_output.

        The Claude Agent SDK delivers complete messages, not token streams.
        This method creates the illusion of streaming by dripping text to the DB.

        Args:
            task_id: Task to update
            text: Complete text to "stream"
            chars_per_update: Characters to reveal per update (default 50)
        """
        if not task_id or not text:
            return

        import asyncio

        # Stream in chunks with delays visible to polling clients
        # Frontend polls at 500ms, so we need chunks to span multiple poll intervals
        for i in range(0, len(text), chars_per_update):
            chunk = text[i:i + chars_per_update]
            self._update_live_output(task_id, chunk)
            # 50 chars at 200ms = ~250 chars/sec (visible streaming for 500ms polls)
            await asyncio.sleep(0.2)

    def _clear_live_output(self, task_id: str) -> None:
        """Clear the live_output column when task completes.

        Final output is stored in report_md, so live_output is no longer needed.
        """
        if not task_id:
            return

        try:
            self.storage.execute(
                "UPDATE workers SET live_output = NULL, updated_at = ? WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), task_id)
            )
        except Exception as e:
            print(f"Warning: Failed to clear live_output for task {task_id[:8]}: {e}")

    async def _run_claude(self, prompt: str, resume_session: Optional[str] = None, task_id: Optional[str] = None) -> tuple[str, Optional[str], Dict[str, Any]]:
        """Run Claude and return (response_text, session_id, metadata).

        Args:
            prompt: The prompt to execute
            resume_session: Optional session ID to resume from
            task_id: Optional task ID for tracking active clients (enables termination)

        Returns:
            Tuple of (response_text, session_id, metadata_dict)
        """
        # Create LOCAL metadata for this execution (not shared across parallel tasks)
        metadata = {
            "files_touched": set(),
            "outputs": set(),
            "tools_used": {},
            "web_searches": [],
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

        claude_options_dict = dict(self._claude_options)
        if resume_session:
            claude_options_dict["resume"] = resume_session

        # Create hooks with task_id and metadata bound in closures
        # This is critical for parallel execution - each task gets its own hooks
        if task_id:
            track_tool_start, track_tool_use = self._create_tool_hooks(task_id, metadata)
            claude_options_dict["hooks"] = {
                "PreToolUse": [HookMatcher(hooks=[track_tool_start])],
                "PostToolUse": [HookMatcher(hooks=[track_tool_use])],
            }

        claude_options = ClaudeAgentOptions(**claude_options_dict)

        client = ClaudeSDKClient(options=claude_options)

        # Track client if we have a task_id (enables termination)
        if task_id:
            self._active_clients[task_id] = client

        # Initialize live output with starting event
        if task_id:
            self._emit_structured_event(task_id, {
                "type": "progress",
                "step": 0,
                "description": "Starting execution...",
            })

        try:
            async with client:
                await client.query(prompt)

                parts: List[str] = []
                session_id: Optional[str] = None

                async for message in client.receive_response():
                    if isinstance(message, AssistantMessage):
                        for block in message.content:
                            if isinstance(block, TextBlock):
                                text = block.text.strip()
                                if text:
                                    parts.append(text)
                                    # Emit structured text event for live viewing
                                    if task_id:
                                        self._emit_structured_event(task_id, {
                                            "type": "text",
                                            "content": text[:2000],  # Truncate very long text
                                        })
                    elif isinstance(message, ResultMessage):
                        session_id = message.session_id

                # Finalize metadata
                metadata["ended_at"] = datetime.now(timezone.utc).isoformat()

                # Calculate duration
                started = datetime.fromisoformat(metadata["started_at"])
                ended = datetime.fromisoformat(metadata["ended_at"])
                duration_seconds = (ended - started).total_seconds()
                metadata["duration_minutes"] = round(duration_seconds / 60, 2)

                # Convert sets to lists for JSON serialization
                metadata_json = {
                    "files_touched": sorted(list(metadata.get("files_touched", set()))),
                    "outputs": sorted(list(metadata.get("outputs", set()))),
                    "tools_used": metadata.get("tools_used", {}),
                    "web_searches": metadata.get("web_searches", []),
                    "duration_minutes": metadata.get("duration_minutes", 0),
                    "started_at": metadata.get("started_at"),
                    "ended_at": metadata.get("ended_at"),
                }

                return "\n\n".join(parts).strip(), session_id, metadata_json
        finally:
            # Clean up client tracking
            if task_id and task_id in self._active_clients:
                del self._active_clients[task_id]
            # Note: Keep live_output for completed tasks so dashboard can show final output
            # It will be cleared when task is acknowledged or archived


    async def terminate_task(self, task_id: str) -> bool:
        """Terminate a running task by interrupting its Claude client.

        Args:
            task_id: The task ID to terminate

        Returns:
            True if terminated successfully, False if not running or not found
        """
        client = self._active_clients.get(task_id)
        if not client:
            # Task not running or already finished
            return False

        try:
            # Use SDK's built-in interrupt mechanism
            await client.interrupt()
            # Close the connection gracefully
            await client.disconnect()
            return True
        except Exception as e:
            # Log error but consider termination successful
            # (client may have already disconnected)
            print(f"Error terminating task {task_id[:8]}: {e}")
            # Clean up tracking anyway
            if task_id in self._active_clients:
                del self._active_clients[task_id]
            return False

    def log_failure(self, task: Dict[str, Any], *, error: str) -> str:
        """Record task failure in database.

        No filesystem logs anymore - all info is in DB.
        Returns empty string for backwards compatibility.
        """
        # Store error info in report_md and report_summary
        error_report = f"""---
status: failed
summary: Task failed: {error}
---

# Task Failed

**Error:** {error}

**Task:** {task['task_type']} ({task['id'][:8]})
"""
        self.storage.execute(
            """
            UPDATE workers
            SET report_md = ?, report_summary = ?, status = 'failed',
                attention_kind = 'alert', attention_title = ?, completed_at = ?
            WHERE id = ?
            """,
            (error_report, f"Task failed: {error}", f"Task failed: {error}", datetime.now().isoformat(), task["id"])
        )
        return ""  # No log path anymore

    def _maybe_wake_session(self, session_id: str) -> None:
        """Wake up an Interactive Claude session if all its Background Workers are complete.

        Called after each Background Worker completes. Only triggers wake-up when ALL
        tasks for the session are done, preventing premature notifications.

        Jan 2026: Uses conversation_id to find current session (survives resets).
        The spawned_by_session might be ended due to reset - we find the
        *current* active session in the same conversation to wake.
        """
        # First, get the conversation_id for this worker's original session
        original_session = self.storage.fetchone("""
            SELECT conversation_id FROM sessions WHERE session_id = ?
        """, (session_id,))
        
        conversation_id = original_session["conversation_id"] if original_session else None
        
        # Check remaining workers by conversation_id (or fall back to session_id)
        if conversation_id:
            row = self.storage.fetchone("""
                SELECT COUNT(*) as remaining
                FROM workers
                WHERE conversation_id = ?
                  AND status IN ('running', 'pending')
            """, (conversation_id,))
        else:
            # Fallback for legacy workers
            row = self.storage.fetchone("""
                SELECT COUNT(*) as remaining
                FROM workers
                WHERE spawned_by_session = ?
                  AND status IN ('running', 'pending')
            """, (session_id,))

        if row and row["remaining"] > 0:
            # Still have tasks running, don't wake yet
            return

        # Find the CURRENT active session for this conversation (Jan 2026)
        # This is the key change: the original session_id might have ended due to reset,
        # but we need to wake the *current* session in the same conversation.
        if conversation_id:
            current_session = self.storage.fetchone("""
                SELECT session_id, tmux_pane FROM sessions
                WHERE conversation_id = ? AND ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
            """, (conversation_id,))
        else:
            # Fallback: use original session
            current_session = self.storage.fetchone("""
                SELECT session_id, tmux_pane FROM sessions
                WHERE session_id = ? AND ended_at IS NULL
            """, (session_id,))

        if not current_session or not current_session["tmux_pane"]:
            # Conversation not active in tmux
            return

        # Trigger wake-up via MessagingService
        try:
            from services.messaging import get_messaging
            messaging = get_messaging(self.storage.db_path)
            messaging.wake_conversation(conversation_id)
        except Exception as e:
            # Log warning but don't fail - wake-up is best-effort
            current_sid = current_session["session_id"] if current_session else session_id
            print(f"Warning: Failed to wake session {current_sid[:8]}: {e}")


__all__ = ["ScheduledExecutorService"]
