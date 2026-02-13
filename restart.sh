#!/bin/bash
#
# Claude OS Restart Script (tmux-first)
# Run: ./restart.sh [--stop]
#

set -euo pipefail

SESSION="life"
MODE="restart"
START_CHIEF="true"

usage() {
    echo "Usage: ./restart.sh [--stop] [--no-chief]"
    echo ""
    echo "Options:"
    echo "  --stop      Stop Claude OS (kill tmux session)"
    echo "  --no-chief  Only restart services, don't touch Chief"
    echo "  --help      Show this help"
}

for arg in "$@"; do
    case "$arg" in
        --stop) MODE="stop" ;;
        --no-chief) START_CHIEF="false" ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: ${arg}"
            usage
            exit 1
            ;;
    esac
done

# Get script directory (handle symlinks)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/.engine/data/logs"

BACKEND_PORT="${CLAUDE_OS_PORT:-5001}"
DASH_PORT="${DASHBOARD_PORT:-3000}"
BACKEND_URL="http://localhost:${BACKEND_PORT}/api/health"
DASHBOARD_URL="http://localhost:${DASH_PORT}/"

BACKEND_CMD="cd \"${SCRIPT_DIR}\" && \"${SCRIPT_DIR}/venv/bin/python\" .engine/src/main.py 2>&1 | tee -a \"${LOG_DIR}/backend.log\""
DASHBOARD_CMD="cd \"${SCRIPT_DIR}/Dashboard\" && npm run dev 2>&1 | tee -a \"${LOG_DIR}/dashboard.log\""
# Custom project services (add your own):
# CUSTOM_PROJECT_DIR="$HOME/Projects/my-project"
# CUSTOM_PROJECT_CMD="cd \"${CUSTOM_PROJECT_DIR}\" && source .venv/bin/activate && python main.py"

mkdir -p "${LOG_DIR}"

has_session() {
    tmux has-session -t "${SESSION}" 2>/dev/null
}

window_exists() {
    local name="$1"
    tmux list-windows -t "${SESSION}" -F "#W" 2>/dev/null | grep -Fxq "${name}"
}

ensure_session() {
    if ! has_session; then
        tmux new-session -d -s "${SESSION}" -n backend -c "${SCRIPT_DIR}"
        # Source local tmux config if it exists (doesn't touch ~/.tmux.conf)
        local tmux_conf="${SCRIPT_DIR}/.claude/tmux.conf"
        if [[ -f "${tmux_conf}" ]]; then
            # Resolve CLAUDE_OS_ROOT placeholder to actual path
            local resolved_conf="/tmp/claude-os-tmux.conf"
            sed "s|CLAUDE_OS_ROOT|${SCRIPT_DIR}/.claude|g" "${tmux_conf}" > "${resolved_conf}"
            tmux source-file "${resolved_conf}" 2>/dev/null || true
        fi
    fi
}

ensure_window() {
    local name="$1"
    local cwd="$2"
    if ! window_exists "${name}"; then
        tmux new-window -t "${SESSION}" -n "${name}" -c "${cwd}"
    fi
}

claude_running_in() {
    # Reliable detection: ask tmux what command is running in the pane
    # Shell (bash/zsh) = no Claude. Anything else = process running.
    local name="$1"
    local cmd
    cmd=$(tmux display-message -t "${SESSION}:${name}" -p "#{pane_current_command}" 2>/dev/null) || return 1
    [[ -n "${cmd}" && "${cmd}" != "bash" && "${cmd}" != "zsh" && "${cmd}" != "-bash" && "${cmd}" != "-zsh" ]]
}

respawn_service() {
    local name="$1"
    local cmd="$2"
    tmux respawn-pane -k -t "${SESSION}:${name}" "${cmd}"
}

wait_for_url() {
    local url="$1"
    local label="$2"
    local retries="${3:-15}"
    local delay="${4:-1}"

    for _ in $(seq 1 "${retries}"); do
        if curl -s --max-time 2 "${url}" >/dev/null 2>&1; then
            echo "✓ ${label} ready"
            return 0
        fi
        sleep "${delay}"
    done

    echo "✗ ${label} did not become healthy"
    return 1
}

print_pane_tail() {
    local name="$1"
    local lines="${2:-50}"
    echo ""
    echo "Last ${lines} lines from ${name} pane:"
    tmux capture-pane -p -t "${SESSION}:${name}" -S "-${lines}" 2>/dev/null || true
}

if [[ "${MODE}" == "stop" ]]; then
    if has_session; then
        tmux kill-session -t "${SESSION}"
        echo "Claude OS stopped."
    else
        echo "Claude OS is not running."
    fi
    exit 0
fi

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║        Restarting Claude OS           ║"
echo "╚═══════════════════════════════════════╝"
echo ""

ensure_session

# Backend (start first — Dashboard depends on it)
ensure_window "backend" "${SCRIPT_DIR}"
respawn_service "backend" "${BACKEND_CMD}"

echo "==> Waiting for backend..."
if ! wait_for_url "${BACKEND_URL}" "Backend"; then
    print_pane_tail "backend" 80
    exit 1
fi

# Dashboard (start after backend is healthy)
ensure_window "dashboard" "${SCRIPT_DIR}"
respawn_service "dashboard" "${DASHBOARD_CMD}"

# Custom project services (add your own):
# ensure_window "my-project-api" "${CUSTOM_PROJECT_DIR}"
# respawn_service "my-project-api" "${CUSTOM_PROJECT_CMD}"

echo "==> Waiting for dashboard..."
if ! wait_for_url "${DASHBOARD_URL}" "Dashboard"; then
    print_pane_tail "dashboard" 80
    exit 1
fi

# Chief window - three paths:
#   1. Window doesn't exist → create + spawn Chief
#   2. Window exists, Claude not running → spawn Chief
#   3. Window exists, Claude running → do nothing
ensure_window "chief" "${SCRIPT_DIR}"

if [[ "${START_CHIEF}" == "true" ]]; then
    if claude_running_in "chief"; then
        echo "✓ Chief already running, skipping"
    else
        echo "==> Starting Chief..."
        "${SCRIPT_DIR}/venv/bin/python" "${SCRIPT_DIR}/.engine/src/adapters/cli/spawn_chief.py" 2>&1 || true
    fi
fi

echo ""
echo "Claude OS services restarted."
echo "  Backend:    http://localhost:${BACKEND_PORT}"
echo "  Dashboard:  http://localhost:${DASH_PORT}"
echo ""
