#!/usr/bin/env python3
"""Service management for the Life System.

Manages: Backend (FastAPI + watcher + executor), Dashboard (Next.js)

SAFE RESTART MECHANISM:
- Uses PID files to track exactly which processes WE started
- Only kills processes we started (not Chrome, Cursor, or anything else)
- Falls back to graceful checks before any kill operation

Usage:
    python .engine/src/cli/services.py status
    python .engine/src/cli/services.py start-backend
    python .engine/src/cli/services.py stop-backend
    python .engine/src/cli/services.py restart-backend
    python .engine/src/cli/services.py start-dashboard
    python .engine/src/cli/services.py stop-dashboard
    python .engine/src/cli/services.py restart-dashboard
    python .engine/src/cli/services.py start-all
    python .engine/src/cli/services.py stop-all

Note: MCP servers are managed by Claude Code, not this script.
"""
import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

# Paths
REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_SCRIPT = REPO_ROOT / ".engine" / "src" / "backend" / "main.py"
DASHBOARD_DIR = REPO_ROOT / "Applications" / "dashboard-next"
VENV_PYTHON = REPO_ROOT / "venv" / "bin" / "python"

# PID files - track what WE started
STATE_DIR = REPO_ROOT / ".engine" / "state"
BACKEND_PID_FILE = STATE_DIR / "backend.pid"
DASHBOARD_PID_FILE = STATE_DIR / "dashboard.pid"

# Ports (for status checks only, NOT for killing)
BACKEND_PORT = 5001
DASHBOARD_PORT = 3000


def read_pid_file(pid_file: Path) -> int | None:
    """Read PID from file, return None if doesn't exist or invalid."""
    try:
        if pid_file.exists():
            pid = int(pid_file.read_text().strip())
            # Verify process exists
            os.kill(pid, 0)  # Signal 0 = check existence without killing
            return pid
    except (ValueError, ProcessLookupError, PermissionError):
        # PID file exists but process doesn't - clean up stale file
        try:
            pid_file.unlink()
        except:
            pass
    return None


def write_pid_file(pid_file: Path, pid: int):
    """Write PID to file."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    pid_file.write_text(str(pid))


def remove_pid_file(pid_file: Path):
    """Remove PID file."""
    try:
        pid_file.unlink()
    except FileNotFoundError:
        pass


def is_port_in_use(port: int) -> bool:
    """Check if port is in use (for status display only)."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def check_backend_health() -> dict | None:
    """Check backend health via HTTP."""
    import urllib.request
    import json

    try:
        with urllib.request.urlopen(f"http://localhost:{BACKEND_PORT}/api/health", timeout=2) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def safe_kill_process(pid: int, name: str) -> bool:
    """Safely kill a specific process by PID. Returns True if successful."""
    try:
        # First try graceful SIGTERM
        print(f"Sending SIGTERM to {name} (PID {pid})...")
        os.kill(pid, signal.SIGTERM)

        # Wait for graceful shutdown
        for _ in range(10):
            time.sleep(0.5)
            try:
                os.kill(pid, 0)  # Check if still exists
            except ProcessLookupError:
                print(f"{name} stopped gracefully")
                return True

        # Still running - try SIGKILL
        print(f"{name} didn't stop gracefully, sending SIGKILL...")
        os.kill(pid, signal.SIGKILL)
        time.sleep(0.5)
        print(f"{name} force-killed")
        return True

    except ProcessLookupError:
        print(f"{name} already stopped")
        return True
    except PermissionError:
        print(f"Permission denied killing {name} (PID {pid})")
        return False
    except Exception as e:
        print(f"Error killing {name}: {e}")
        return False


def status():
    """Show status of all services."""
    print("=" * 50)
    print("LIFE SYSTEM SERVICE STATUS")
    print("=" * 50)

    # Backend
    backend_pid = read_pid_file(BACKEND_PID_FILE)
    backend_health = check_backend_health()
    port_in_use = is_port_in_use(BACKEND_PORT)

    print(f"\n[BACKEND] Port {BACKEND_PORT}")
    if backend_pid:
        print(f"  Status: RUNNING (PID {backend_pid})")
        if backend_health:
            print(f"  Health: OK")
        else:
            print(f"  Health: NOT RESPONDING")
    elif port_in_use:
        print(f"  Status: PORT IN USE (not started by us)")
        print(f"  Note: Something else is using port {BACKEND_PORT}")
    else:
        print(f"  Status: STOPPED")

    # Dashboard
    dashboard_pid = read_pid_file(DASHBOARD_PID_FILE)
    dash_port_in_use = is_port_in_use(DASHBOARD_PORT)

    print(f"\n[DASHBOARD] Port {DASHBOARD_PORT}")
    if dashboard_pid:
        print(f"  Status: RUNNING (PID {dashboard_pid})")
    elif dash_port_in_use:
        print(f"  Status: PORT IN USE (not started by us)")
        print(f"  Note: Something else is using port {DASHBOARD_PORT}")
    else:
        print(f"  Status: STOPPED")

    # MCP note
    print(f"\n[MCP SERVERS]")
    print(f"  Managed by: Claude Code (restart Claude Code to restart MCP)")

    print("\n" + "=" * 50)


def stop_backend():
    """Stop the backend service (only if we started it)."""
    pid = read_pid_file(BACKEND_PID_FILE)
    if not pid:
        print(f"Backend not running (no PID file)")
        if is_port_in_use(BACKEND_PORT):
            print(f"  Note: Port {BACKEND_PORT} is in use by another process")
            print(f"  We won't kill it - it's not ours")
        return True

    result = safe_kill_process(pid, "Backend")
    remove_pid_file(BACKEND_PID_FILE)
    return result


def start_backend(wait: bool = True):
    """Start the backend service."""
    existing_pid = read_pid_file(BACKEND_PID_FILE)
    if existing_pid:
        print(f"Backend already running (PID {existing_pid})")
        return True

    if is_port_in_use(BACKEND_PORT):
        print(f"Port {BACKEND_PORT} already in use by another process")
        print(f"Cannot start backend - stop the other process first")
        return False

    print(f"Starting backend on port {BACKEND_PORT}...")

    # Start in background
    proc = subprocess.Popen(
        [str(VENV_PYTHON), str(BACKEND_SCRIPT), "--no-reload"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

    # Save PID immediately
    write_pid_file(BACKEND_PID_FILE, proc.pid)

    if wait:
        # Wait for startup
        for i in range(20):
            time.sleep(0.5)
            if check_backend_health():
                print(f"Backend started successfully (PID {proc.pid})")
                return True
        print(f"Backend started (PID {proc.pid}) but health check failed")
        return False

    print(f"Backend starting (PID {proc.pid})...")
    return True


def restart_backend():
    """Restart the backend service."""
    stop_backend()
    time.sleep(1)
    return start_backend()


def stop_dashboard():
    """Stop the dashboard service (only if we started it)."""
    pid = read_pid_file(DASHBOARD_PID_FILE)
    if not pid:
        print(f"Dashboard not running (no PID file)")
        if is_port_in_use(DASHBOARD_PORT):
            print(f"  Note: Port {DASHBOARD_PORT} is in use by another process")
            print(f"  We won't kill it - it's not ours")
        return True

    # For npm/node, try to kill the process group
    try:
        pgid = os.getpgid(pid)
        print(f"Stopping dashboard process group (PGID {pgid})...")
        os.killpg(pgid, signal.SIGTERM)
        time.sleep(2)

        # Check if stopped
        try:
            os.kill(pid, 0)
            # Still running - force kill
            os.killpg(pgid, signal.SIGKILL)
            print("Dashboard force-killed")
        except ProcessLookupError:
            print("Dashboard stopped gracefully")
    except (ProcessLookupError, PermissionError):
        # Process already gone or can't get group - try direct kill
        safe_kill_process(pid, "Dashboard")
    except Exception as e:
        print(f"Error stopping dashboard: {e}")
        safe_kill_process(pid, "Dashboard")

    remove_pid_file(DASHBOARD_PID_FILE)
    return True


def start_dashboard():
    """Start the dashboard dev server."""
    existing_pid = read_pid_file(DASHBOARD_PID_FILE)
    if existing_pid:
        print(f"Dashboard already running (PID {existing_pid})")
        return True

    if is_port_in_use(DASHBOARD_PORT):
        print(f"Port {DASHBOARD_PORT} already in use by another process")
        print(f"Cannot start dashboard - stop the other process first")
        return False

    if not DASHBOARD_DIR.exists():
        print(f"Dashboard directory not found: {DASHBOARD_DIR}")
        return False

    print(f"Starting dashboard on port {DASHBOARD_PORT}...")

    # Check if node_modules exists
    if not (DASHBOARD_DIR / "node_modules").exists():
        print("Installing dependencies first...")
        subprocess.run(["npm", "install"], cwd=DASHBOARD_DIR, capture_output=True)

    # Start in background with new session (so we can kill the group later)
    proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=DASHBOARD_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )

    # Save PID immediately
    write_pid_file(DASHBOARD_PID_FILE, proc.pid)

    # Wait briefly for startup
    print(f"Dashboard starting (PID {proc.pid})...")
    time.sleep(3)

    if is_port_in_use(DASHBOARD_PORT):
        print(f"Dashboard ready at http://localhost:{DASHBOARD_PORT}")
        return True

    print("Dashboard may still be starting (Next.js takes a moment)...")
    return True


def restart_dashboard():
    """Restart the dashboard service."""
    stop_dashboard()
    time.sleep(1)
    return start_dashboard()


def start_all():
    """Start all services."""
    print("Starting all services...\n")
    backend_ok = start_backend()
    dashboard_ok = start_dashboard()
    print("\n")
    status()
    return backend_ok and dashboard_ok


def stop_all():
    """Stop all services."""
    print("Stopping all services...\n")
    backend_ok = stop_backend()
    dashboard_ok = stop_dashboard()
    return backend_ok and dashboard_ok


def main():
    parser = argparse.ArgumentParser(description="Manage Life System services")
    parser.add_argument(
        "command",
        choices=[
            "status",
            "start-backend", "stop-backend", "restart-backend",
            "start-dashboard", "stop-dashboard", "restart-dashboard",
            "start-all", "stop-all",
        ],
        help="Command to run",
    )

    args = parser.parse_args()

    commands = {
        "status": status,
        "start-backend": start_backend,
        "stop-backend": stop_backend,
        "restart-backend": restart_backend,
        "start-dashboard": start_dashboard,
        "stop-dashboard": stop_dashboard,
        "restart-dashboard": restart_dashboard,
        "start-all": start_all,
        "stop-all": stop_all,
    }

    result = commands[args.command]()
    sys.exit(0 if result is None or result else 1)


if __name__ == "__main__":
    main()
