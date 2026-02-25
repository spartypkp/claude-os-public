"""tmux utilities - Reliable patterns for interacting with tmux.

Three patterns:

1. send_keys(target, *keys) - Raw send-keys, no timing guarantees
   Use for: Control sequences, simple keys, when you handle timing yourself

2. send_text(target, text, submit=True) - Short text with delayed Enter
   Use for: Commands, short messages, env vars

3. inject_message(target, message) - Long text via load-buffer
   Use for: Multi-line content, Claude prompts, anything over ~100 chars

Reliability: send_text and inject_message deliver content first, then send
Enter after a short delay. This is required because Claude Code's TUI (Ink/
React-based) needs a render cycle to process pasted text before it can handle
the Enter/submit keystroke. Atomic command chaining (`;`) delivers both in
the same byte stream, causing Enter to arrive before the TUI is ready.

"""

import asyncio
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

# Default tmux session name
TMUX_SESSION = "life"

# Per-pane locks prevent concurrent injections from interleaving.
# Without this, two injections to the same pane can interleave:
# injection A pastes content, injection B pastes content within A's
# delay window, A's Enter submits garbled A+B, B's Enter submits empty.
_pane_locks: dict[str, threading.Lock] = {}
_pane_locks_lock = threading.Lock()


def _get_pane_lock(target: str) -> threading.Lock:
    """Get or create a lock for a specific tmux target."""
    with _pane_locks_lock:
        if target not in _pane_locks:
            _pane_locks[target] = threading.Lock()
        return _pane_locks[target]

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
) -> bool:
    """Send short text with delayed Enter.

    Sends text literally via send-keys -l, then sends Enter after a short
    delay. The delay is required because Claude Code's Ink/React TUI needs
    a render cycle to process the text before it can handle Enter/submit.

    Args:
        target: tmux target (e.g., "life:chief")
        text: Text to send (keep under ~100 chars)
        submit: Whether to press Enter after text (default True)

    Returns:
        True if successful, False otherwise

    Example:
        send_text("life:chief", "export FOO=bar")
        send_text("life:chief", "/exit")
    """
    try:
        with _get_pane_lock(target):
            # Send text literally (don't interpret key names)
            send_keys(target, "-l", text)

            if submit:
                # Delay lets Claude Code's TUI process the text before Enter.
                # 300ms handles system load variance (multiple Claude instances,
                # Dashboard, Chrome). 150ms was unreliable under heavy multiplex.
                time.sleep(0.3)
                send_keys(target, "Enter")

        return True
    except Exception:
        return False


def inject_message(
    target: str,
    message: str,
    submit: bool = True,
    cleanup: bool = True,
    source: Optional[str] = None,
    retries: int = 2,
) -> bool:
    """Inject long text via load-buffer pattern.

    The most reliable pattern for multi-line content or Claude prompts.
    Writes message to temp file, loads it into a tmux buffer, pastes it,
    then sends Enter after a short delay.

    The delay between paste and Enter is critical: Claude Code's TUI
    (Ink/React-based) needs a render cycle to process pasted text before
    it can handle the Enter/submit keystroke. Without the delay, Enter
    arrives in the same byte stream as the content and gets dropped.

    Uses named buffers (unique per injection) to prevent race conditions
    when multiple injections happen concurrently.

    Args:
        target: tmux target (e.g., "life:chief")
        message: Message content (can be multi-line, any length)
        submit: Whether to press Enter after paste (default True)
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
                with _get_pane_lock(target):
                    # Step 1: Load buffer and paste content into the pane.
                    # -d deletes the named buffer after pasting.
                    # No -p flag — bracket paste is unnecessary (Claude Code
                    # doesn't opt into bracket paste mode) and the sequences
                    # can interfere with TUI input parsing.
                    cmd = [
                        "tmux",
                        "load-buffer", "-b", buffer_name, str(msg_file),
                        ";",
                        "paste-buffer", "-b", buffer_name, "-d", "-t", target,
                    ]

                    subprocess.run(
                        cmd,
                        check=True,
                        capture_output=True,
                        timeout=5,
                    )

                    # Step 2: Send Enter after a delay.
                    # The delay lets Claude Code's Ink/React TUI complete a
                    # render cycle to process the pasted text before receiving
                    # the submit keystroke. 300ms handles system load variance
                    # (multiple Claude instances, Dashboard, Chrome).
                    if submit:
                        time.sleep(0.3)
                        send_keys(target, "Enter")

                return True

            finally:
                if cleanup:
                    msg_file.unlink(missing_ok=True)
                # Clean up buffer if it wasn't deleted by -d (e.g., paste failed)
                try:
                    subprocess.run(
                        ["tmux", "delete-buffer", "-b", buffer_name],
                        capture_output=True,
                        timeout=2,
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
) -> bool:
    """Async wrapper for send_text."""
    return await asyncio.to_thread(send_text, target, text, submit=submit)


async def inject_message_async(
    target: str,
    message: str,
    submit: bool = True,
    cleanup: bool = True,
    source: Optional[str] = None,
) -> bool:
    """Async wrapper for inject_message."""
    return await asyncio.to_thread(
        inject_message,
        target,
        message,
        submit=submit,
        cleanup=cleanup,
        source=source,
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
