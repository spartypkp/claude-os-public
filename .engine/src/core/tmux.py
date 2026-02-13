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

import asyncio
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
    delay: float = 0.15,
    cleanup: bool = True,
    source: Optional[str] = None,
    retries: int = 2,
) -> bool:
    """Inject long text via load-buffer pattern.

    The most reliable pattern for multi-line content or Claude prompts.
    Writes message to temp file, loads into a named tmux buffer, pastes, then submits.

    Uses named buffers (unique per injection) to prevent race conditions when
    multiple injections happen concurrently — tmux's default paste buffer is
    shared and concurrent load-buffer calls would clobber each other.

    Args:
        target: tmux target (e.g., "life:chief")
        message: Message content (can be multi-line, any length)
        submit: Whether to press Enter after paste (default True)
        delay: Seconds to wait before Enter (default 0.15)
        cleanup: Delete temp file after (default True)
        source: Optional source label (e.g., "Dashboard", "Telegram")
                If provided, prepends "[{source} HH:MM] " to message
        retries: Number of retry attempts on failure (default 2)

    Returns:
        True if successful, False otherwise

    Example:
        inject_message("life:chief", "[WAKE] Time for check-in")
        inject_message("life:chief", "Hello", source="Dashboard")  # -> "[Dashboard 13:45] Hello"
        inject_message("life:focus", long_task_description)
    """
    # Add source timestamp prefix if provided
    if source:
        from datetime import datetime
        timestamp = datetime.now().strftime("%H:%M")
        message = f"[{source} {timestamp}] {message}"

    for attempt in range(1 + retries):
        try:
            # Create temp file
            TMP_DIR.mkdir(parents=True, exist_ok=True)
            msg_id = uuid.uuid4().hex[:8]
            msg_file = TMP_DIR / f"msg-{msg_id}.txt"
            msg_file.write_text(message)

            # Use a named buffer unique to this injection to prevent
            # race conditions with concurrent injections
            buffer_name = f"inject-{msg_id}"

            try:
                # Load into named tmux buffer
                load_result = subprocess.run(
                    ["tmux", "load-buffer", "-b", buffer_name, str(msg_file)],
                    check=True,
                    capture_output=True,
                    timeout=5
                )

                # Paste from named buffer to target, -d deletes buffer after paste
                paste_result = subprocess.run(
                    ["tmux", "paste-buffer", "-b", buffer_name, "-d", "-t", target],
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
                # Clean up buffer if it wasn't deleted by -d (e.g., paste failed)
                try:
                    subprocess.run(
                        ["tmux", "delete-buffer", "-b", buffer_name],
                        capture_output=True,
                        timeout=2
                    )
                except Exception:
                    pass

        except Exception:
            if attempt < retries:
                time.sleep(0.1 * (attempt + 1))  # Back off slightly
                continue
            return False

    return False


async def send_keys_async(target: str, *keys: str, check: bool = True) -> subprocess.CompletedProcess:
    """Async wrapper for send_keys."""
    return await asyncio.to_thread(send_keys, target, *keys, check=check)


async def send_text_async(
    target: str,
    text: str,
    submit: bool = True,
    delay: float = 0.1
) -> bool:
    """Async wrapper for send_text."""
    return await asyncio.to_thread(send_text, target, text, submit=submit, delay=delay)


async def inject_message_async(
    target: str,
    message: str,
    submit: bool = True,
    delay: float = 0.3,
    cleanup: bool = True,
    source: Optional[str] = None
) -> bool:
    """Async wrapper for inject_message."""
    return await asyncio.to_thread(
        inject_message,
        target,
        message,
        submit,
        delay,
        cleanup,
        source
    )


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


async def send_escape_to_pane_async(target: str) -> bool:
    """Async wrapper for send_escape_to_pane."""
    return await asyncio.to_thread(send_escape_to_pane, target)


def display_message(
    target: str,
    message: str,
    duration: int = 5000
) -> bool:
    """Display a temporary message in tmux status line.

    Uses tmux display-message for non-intrusive notifications.
    The message appears briefly and disappears automatically.

    Args:
        target: tmux target (e.g., "life:chief")
        message: Message to display
        duration: Display time in milliseconds (default 5000 = 5 seconds)

    Returns:
        True if successful
    """
    try:
        subprocess.run(
            ["tmux", "display-message", "-t", target, "-d", str(duration), message],
            capture_output=True,
            timeout=5
        )
        return True
    except Exception:
        return False


async def display_message_async(
    target: str,
    message: str,
    duration: int = 5000
) -> bool:
    """Async wrapper for display_message."""
    return await asyncio.to_thread(display_message, target, message, duration)
