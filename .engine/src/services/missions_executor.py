"""Mission Executor Service - Agent SDK based mission execution.

Missions are automated system agents spawned by custom apps, loops, or triggers.
Unlike workers (user-initiated research), missions are system-initiated automation.

Key differences from workers:
- Track in mission_executions table (separate from workers)
- Load mission definitions from .claude/missions/
- Support template variable injection ({{email_id}}, etc.)
- Get both life_mcp AND mission-tools MCP servers

Architecture:
- Uses Agent SDK (invisible execution, no Claude Code window)
- Missions can define custom tools via mission-tools server
- All missions inherit standard tools from life_mcp
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    HookMatcher,
    HookContext,
    tool,
    create_sdk_mcp_server,
)

from .storage import SystemStorage


class MissionExecutorService:
    """Executes missions via Agent SDK (invisible, no UI).

    Missions are system-initiated automated agents. They execute invisibly
    using the Agent SDK, with access to life_mcp tools plus mission-specific tools.
    """

    def __init__(
        self,
        repo_root: Path,
        storage: SystemStorage,
        config: Dict[str, Any] | None = None,
    ):
        self.repo_root = repo_root
        self.storage = storage
        self.config = config or {}

        # Create mission-tools SDK MCP server
        self._mission_tools_server = self._create_mission_tools_server()

        # Build Claude options
        self._claude_options = self._build_claude_options(self.config.get("missions") or {})

    def _create_mission_tools_server(self):
        """Create an in-process SDK MCP server with mission-specific tools.

        This server provides the mission_complete() tool that missions use
        to report completion. It runs in-process for direct DB access.
        """
        storage = self.storage  # Closure over storage for DB access

        @tool(
            name="mission_complete",
            description="Mark mission as complete and submit results. Call this as your final action.",
            input_schema={
                "type": "object",
                "properties": {
                    "execution_id": {
                        "type": "string",
                        "description": "Your execution ID (from your instructions)"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["complete", "failed"],
                        "description": "Mission outcome"
                    },
                    "summary": {
                        "type": "string",
                        "description": "One-sentence summary of what you accomplished"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Optional metadata (JSON object)"
                    }
                },
                "required": ["execution_id", "status", "summary"]
            }
        )
        async def mission_complete_tool(args: Dict[str, Any]) -> Dict[str, Any]:
            """Mission completion tool."""
            execution_id = args.get("execution_id")
            status = args.get("status", "complete")
            summary = args.get("summary", "")
            metadata = args.get("metadata", {})

            if not execution_id:
                return {"content": [{"type": "text", "text": "Error: execution_id is required"}]}

            # Map status
            final_status = "completed" if status == "complete" else "failed"

            # Update mission_executions record in DB
            now = datetime.now(timezone.utc).isoformat()
            try:
                # Get started_at to calculate duration
                exec_row = storage.fetchone(
                    "SELECT started_at FROM mission_executions WHERE id = ?",
                    (execution_id,)
                )

                if exec_row:
                    started = datetime.fromisoformat(exec_row["started_at"])
                    ended = datetime.now(timezone.utc)
                    duration_seconds = int((ended - started).total_seconds())
                else:
                    duration_seconds = 0

                storage.execute("""
                    UPDATE mission_executions
                    SET status = ?,
                        output_summary = ?,
                        ended_at = ?,
                        duration_seconds = ?
                    WHERE id = ?
                """, (final_status, summary, now, duration_seconds, execution_id))

                # TODO: Emit SSE event for Dashboard updates
                # await event_bus.publish("mission.completed", {...})

                return {
                    "content": [{
                        "type": "text",
                        "text": f"Mission marked as {final_status}. Summary: {summary}"
                    }]
                }
            except Exception as e:
                return {
                    "content": [{
                        "type": "text",
                        "text": f"Error updating mission: {str(e)}"
                    }]
                }

        return create_sdk_mcp_server(
            name="mission-tools",
            version="1.0.0",
            tools=[mission_complete_tool]
        )

    def _build_claude_options(self, config: Dict[str, Any]) -> ClaudeAgentOptions:
        """Build Claude SDK options for mission execution.

        Missions get:
        - life_mcp MCP server (calendar, contacts, email, log, etc.)
        - mission-tools MCP server (mission_complete())
        """
        # Get MCP server paths
        server_config_path = self.repo_root / ".mcp" / "servers.json"

        mcp_servers = {}
        if server_config_path.exists():
            try:
                server_config = json.loads(server_config_path.read_text())
                # Include life MCP server for standard tools
                if "life" in server_config.get("mcpServers", {}):
                    mcp_servers["life"] = server_config["mcpServers"]["life"]
            except Exception:
                pass

        # Add in-process mission-tools server
        mcp_servers["mission-tools"] = self._mission_tools_server

        return ClaudeAgentOptions(
            model=config.get("model", "claude-sonnet-4-5-20250929"),
            max_turns=config.get("max_turns", 50),
            mcp_servers=mcp_servers,
            permission_mode='bypassPermissions',  # Missions run autonomously
        )

    def _load_mission_definition(self, mission_slug: str) -> str:
        """Load mission definition from .claude/missions/{slug}.md.

        Args:
            mission_slug: Mission slug (e.g., 'email-triage')

        Returns:
            Mission prompt template (may contain {{variables}})

        Raises:
            FileNotFoundError: If mission definition doesn't exist
        """
        mission_path = self.repo_root / ".claude" / "missions" / f"{mission_slug}.md"
        if not mission_path.exists():
            raise FileNotFoundError(f"Mission '{mission_slug}' not found at {mission_path}")

        return mission_path.read_text(encoding="utf-8")

    def _render_template(self, template: str, variables: Dict[str, str]) -> str:
        """Render template by replacing {{variable}} placeholders.

        Args:
            template: Template string with {{var}} placeholders
            variables: Dict of variable name -> value

        Returns:
            Rendered template with variables substituted
        """
        rendered = template
        for key, value in variables.items():
            rendered = rendered.replace(f"{{{{{key}}}}}", str(value))
        return rendered

    async def execute_mission(
        self,
        mission_slug: str,
        mission_id: str,
        variables: Dict[str, str] = None
    ) -> str:
        """Execute a mission asynchronously.

        Args:
            mission_slug: Mission slug (e.g., 'email-triage')
            mission_id: Mission ID from missions table
            variables: Template variables to inject (e.g., {'email_id': '30525'})

        Returns:
            Execution ID for tracking
        """
        # Create execution record
        execution_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        self.storage.execute("""
            INSERT INTO mission_executions (
                id, mission_id, mission_slug,
                started_at, status
            ) VALUES (?, ?, ?, ?, 'running')
        """, (execution_id, mission_id, mission_slug, now))

        # Load and render mission prompt
        try:
            template = self._load_mission_definition(mission_slug)

            # Inject execution_id into variables so mission can call mission_complete()
            vars_with_id = (variables or {}).copy()
            vars_with_id["execution_id"] = execution_id

            prompt = self._render_template(template, vars_with_id)

            # Execute via Agent SDK
            asyncio.create_task(self._execute_async(execution_id, prompt))

            return execution_id

        except Exception as e:
            # Mark execution as failed
            self.storage.execute("""
                UPDATE mission_executions
                SET status = 'failed',
                    error_message = ?,
                    ended_at = ?
                WHERE id = ?
            """, (str(e), datetime.now(timezone.utc).isoformat(), execution_id))

            raise

    async def _execute_async(self, execution_id: str, prompt: str):
        """Execute mission in background (async task).

        This runs the Claude agent via SDK, collecting responses
        and handling completion.
        """
        try:
            client = ClaudeSDKClient(options=self._claude_options)

            async with client:
                await client.query(prompt)

                # Collect response (mission should call mission_complete())
                async for message in client.receive_response():
                    if isinstance(message, AssistantMessage):
                        # Mission is running, tool calls handled automatically
                        pass
                    elif isinstance(message, ResultMessage):
                        # Mission complete
                        pass

        except Exception as e:
            # Mark execution as failed if mission didn't complete
            now = datetime.now(timezone.utc).isoformat()
            self.storage.execute("""
                UPDATE mission_executions
                SET status = 'failed',
                    error_message = ?,
                    ended_at = ?
                WHERE id = ? AND status = 'running'
            """, (str(e), now, execution_id))
