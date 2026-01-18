"""tmux utilities - Reliable patterns for interacting with tmux.

The key insight: tmux send-keys is async. If you send text followed immediately
by C-m (Enter), the Enter often fires before the text is fully processed.
This module provides reliable patterns with proper timing.

Three patterns:

1. send_keys(target, *keys) - Raw send-keys, no timing guarantees
   Use for: Control sequences, simple keys, when you handle timing yourself

2. send_text(target, text, submit=True) - Short text with reliable Enter
   Use for: Commands, short messages, env vars

3. inject_message(target, message) - Long text via load-buffer
   Use for: Multi-line content, Claude prompts, anything over ~100 chars
"""

import subprocess
import time
import uuid
from pathlib import Path
from typing import Optional

# Default tmux session name
TMUX_SESSION = "life"

# Temp directory for message files
TMP_DIR = Path("/tmp/life-tmux")


def send_keys(target: str, *keys: str, check: bool = True) -> subprocess.CompletedProcess:
    """Send raw keys to a tmux target.

    Low-level wrapper around tmux send-keys. No timing guarantees.
    Use for control sequences or when handling timing yourself.

    Args:
        target: tmux target (e.g., "life:chief", "life:system-abc123")
        *keys: Keys to send (e.g., "C-c", "C-m", "ls -la")
        check: Raise exception on failure (default True)

    Example:
        send_keys("life:chief", "C-c")  # Cancel current command
        send_keys("life:chief", "ls", "C-m")  # List files + Enter
    """
    cmd = ["tmux", "send-keys", "-t", target] + list(keys)
    return subprocess.run(cmd, capture_output=True, text=True, check=check, timeout=5)


def send_text(
    target: str,
    text: str,
    submit: bool = True,
    delay: float = 0.1
) -> bool:
    """Send short text with reliable Enter.

    For commands and short messages. Adds delay before Enter to prevent
    race condition where Enter fires before text is fully processed.

    Args:
        target: tmux target (e.g., "life:chief")
        text: Text to send (keep under ~100 chars)
        submit: Whether to press Enter after text (default True)
        delay: Seconds to wait before Enter (default 0.1)

    Returns:
        True if successful, False otherwise

    Example:
        send_text("life:chief", "export FOO=bar")
        send_text("life:chief", "/exit")
    """
    try:
        # Send the text
        send_keys(target, text)

        if submit:
            time.sleep(delay)
            send_keys(target, "C-m")

        return True
    except Exception:
        return False


def inject_message(
    target: str,
    message: str,
    submit: bool = True,
    delay: float = 0.3,
    cleanup: bool = True,
    source: Optional[str] = None
) -> bool:
    """Inject long text via load-buffer pattern.

    The most reliable pattern for multi-line content or Claude prompts.
    Writes message to temp file, loads into tmux buffer, pastes, then submits.

    Args:
        target: tmux target (e.g., "life:chief")
        message: Message content (can be multi-line, any length)
        submit: Whether to press Enter after paste (default True)
        delay: Seconds to wait before Enter (default 0.3)
        cleanup: Delete temp file after (default True)
        source: Optional source label (e.g., "Dashboard", "Telegram")
                If provided, prepends "[{source} HH:MM] " to message

    Returns:
        True if successful, False otherwise

    Example:
        inject_message("life:chief", "[WAKE] Time for check-in")
        inject_message("life:chief", "Hello", source="Dashboard")  # -> "[Dashboard 13:45] Hello"
        inject_message("life:focus", long_task_description)
    """
    try:
        # Add source timestamp prefix if provided
        if source:
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M")
            message = f"[{source} {timestamp}] {message}"

        # Create temp file
        TMP_DIR.mkdir(parents=True, exist_ok=True)
        msg_file = TMP_DIR / f"msg-{uuid.uuid4().hex[:8]}.txt"
        msg_file.write_text(message)

        try:
            # Load into tmux buffer
            subprocess.run(
                ["tmux", "load-buffer", str(msg_file)],
                check=True,
                capture_output=True,
                timeout=5
            )

            # Paste to target
            subprocess.run(
                ["tmux", "paste-buffer", "-t", target],
                check=True,
                capture_output=True,
                timeout=5
            )

            if submit:
                time.sleep(delay)
                send_keys(target, "C-m")

            return True

        finally:
            if cleanup:
                msg_file.unlink(missing_ok=True)

    except Exception:
        return False


def window_exists(window_name: str, session: str = TMUX_SESSION) -> bool:
    """Check if a tmux window exists.

    Args:
        window_name: Window name to check
        session: tmux session name (default "life")

    Returns:
        True if window exists
    """
    try:
        result = subprocess.run(
            ["tmux", "list-windows", "-t", session, "-F", "#{window_name}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            windows = result.stdout.strip().split('\n')
            return window_name in windows
    except Exception:
        pass
    return False


def get_target(window_name: str, session: str = TMUX_SESSION) -> str:
    """Build a tmux target string.

    Args:
        window_name: Window name
        session: tmux session name (default "life")

    Returns:
        Target string like "life:chief"
    """
    return f"{session}:{window_name}"


def send_escape_to_pane(target: str) -> bool:
    """Send ESC key to tmux pane (interrupt Claude).

    Like user hitting ESC - interrupts active tool execution.
    Used by context monitor to interrupt Claude before injecting warnings.

    Args:
        target: tmux pane or window (e.g., "life:chief", "%0")

    Returns:
        True if successful

    Example:
        send_escape_to_pane("life:chief")  # Interrupt Chief
    """
    try:
        result = subprocess.run(
            ["tmux", "send-keys", "-t", target, "Escape"],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def display_message(
    target: str,
    message: str,
    duration: int = 5000
) -> bool:
    """Display overlay message without touching input buffer.

    Non-destructive notification that appears as overlay and auto-dismisses.
    Does NOT affect user's input buffer or interrupt typing.

    Args:
        target: tmux pane or window (e.g., "life:chief")
        message: Message to display
        duration: Display time in milliseconds (default 5000 = 5 seconds)

    Returns:
        True if successful

    Example:
        display_message("life:chief", "[WORKER COMPLETE] See Desktop/sessions/", 8000)
    """
    try:
        result = subprocess.run(
            ["tmux", "display-message", "-t", target, "-d", str(duration), message],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False
