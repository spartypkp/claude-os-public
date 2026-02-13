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

from session_lifecycle import start, prompt, stop, end


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

        handler = HANDLERS.get(event)
        if handler:
            handler(input_data)
        else:
            sys.exit(0)

    except Exception as e:
        print(f"Session lifecycle hook error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
