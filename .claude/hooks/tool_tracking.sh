#!/bin/bash
# Shell wrapper to run tool_tracking.py with the repo's venv
# If venv doesn't exist, hook fails (setup error)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV_PYTHON="$REPO_ROOT/venv/bin/python"

if [[ ! -x "$VENV_PYTHON" ]]; then
    echo "Error: venv not found at $REPO_ROOT/venv" >&2
    echo "Run: python3 -m venv venv && ./venv/bin/pip install -r requirements.txt" >&2
    exit 1
fi

exec "$VENV_PYTHON" "$SCRIPT_DIR/tool_tracking.py" "$@"
