#!/usr/bin/env python3
"""Session lifecycle hook dispatcher.

Routes hook events to specialized handlers in the session_lifecycle package.

Events handled:
- SessionStart: Register session + load context
- UserPromptSubmit: Task notifications + heartbeat
- Stop: Transcript extraction + proactive task surfacing
- SessionEnd: Mark session as ended
"""

import json
import sys
from pathlib import Path
from datetime import datetime

from session_lifecycle import start, prompt, stop, end

# Debug log (repo_root/.engine/state/)
DEBUG_LOG = Path(__file__).parent.parent.parent / ".engine/state/hook-dispatcher-debug.log"


def log_debug(msg: str):
    """Append debug message to log file."""
    try:
        with open(DEBUG_LOG, "a") as f:
            timestamp = datetime.now().isoformat()
            f.write(f"[{timestamp}] {msg}\n")
    except Exception:
        pass


HANDLERS = {
    "SessionStart": start.handle,
    "UserPromptSubmit": prompt.handle,
    "Stop": stop.handle,
    "SessionEnd": end.handle,
}


def main():
    try:
        input_data = json.load(sys.stdin)
        event = input_data.get("hook_event_name", "")

        log_debug(f"Dispatcher received event: {event}")

        handler = HANDLERS.get(event)
        if handler:
            log_debug(f"Routing to handler: {handler.__module__}.{handler.__name__}")
            handler(input_data)
        else:
            log_debug(f"No handler for event: {event}")
            # Unknown event - pass through
            sys.exit(0)

    except Exception as e:
        log_debug(f"Dispatcher error: {e}")
        print(f"Session lifecycle hook error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
