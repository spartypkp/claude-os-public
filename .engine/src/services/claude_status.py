"""
Service for parsing Claude Code status from tmux panes.

We ONLY track authoritative signals from Claude Code's native UI:
1. "Context low (X% remaining)" - Claude Code's internal warning
2. "✳ Task description..." - The active task message  
3. Thinking state indicators

We deliberately IGNORE the custom statusline.sh output (ctx:XX%) because
it uses an inaccurate calculation that underreports by ~15-20%.
"""

import re
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class ClaudeStatus:
    """Parsed Claude Code status from tmux - authoritative signals only."""
    
    # Context warning - ONLY from Claude Code's native warning
    context_warning: bool = False
    context_remaining: Optional[int] = None  # Percent remaining (e.g., 10 means 90% used)
    context_percent_used: Optional[int] = None  # Computed: 100 - remaining
    
    # Activity - the "cute message"
    active_task: Optional[str] = None  # e.g., "Creating backend Roles Core App" (when actively working)
    last_task: Optional[str] = None  # From pane title - persists even when idle
    is_thinking: bool = False
    elapsed_time: Optional[str] = None  # e.g., "1m 40s"
    token_count: Optional[str] = None  # e.g., "2.4k tokens"
    
    # Model info (from statusline, but just for reference)
    model: Optional[str] = None
    cost_usd: Optional[float] = None
    
    def to_dict(self) -> dict:
        return {
            "context_warning": self.context_warning,
            "context_remaining": self.context_remaining,
            "context_percent_used": self.context_percent_used,
            "active_task": self.active_task,
            "last_task": self.last_task,  # Pane title - shows even when idle
            "is_thinking": self.is_thinking,
            "elapsed_time": self.elapsed_time,
            "token_count": self.token_count,
            "model": self.model,
            "cost_usd": self.cost_usd,
        }


def capture_pane(pane_target: str, lines: int = 100) -> Optional[str]:
    """Capture tmux pane content.
    
    Args:
        pane_target: Tmux pane identifier (e.g., "life:chief", "%21")
        lines: Number of lines to capture
        
    Returns:
        Pane content as string, or None on error
    """
    try:
        result = subprocess.run(
            ["tmux", "capture-pane", "-t", pane_target, "-p", "-S", f"-{lines}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout
        return None
    except Exception:
        return None


def capture_pane_title(pane_target: str) -> Optional[str]:
    """Capture tmux pane title.
    
    The pane title contains Claude Code's "cute message" even when idle.
    Format: "✳ Backend Restart Methods" or just the task description.
    
    Args:
        pane_target: Tmux pane identifier
        
    Returns:
        Pane title string, or None on error
    """
    try:
        result = subprocess.run(
            ["tmux", "display-message", "-t", pane_target, "-p", "#{pane_title}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except Exception:
        return None


def parse_claude_status(pane_content: str) -> ClaudeStatus:
    """Parse Claude Code status from tmux pane content.
    
    We ONLY track authoritative signals:
    1. "Context low (X% remaining)" - Claude Code's native warning
    2. "✳ Task..." - The cute active task message
    3. Thinking/elapsed/token indicators
    
    We deliberately IGNORE the custom statusline ctx:XX% because it's inaccurate.
    
    Args:
        pane_content: Raw tmux pane output
        
    Returns:
        ClaudeStatus with parsed values
    """
    status = ClaudeStatus()
    
    # 1. Context warning - ONLY from Claude Code's native warning
    # Pattern: Context low (X% remaining)
    context_low_match = re.search(r'Context low \((\d+)% remaining\)', pane_content)
    if context_low_match:
        status.context_warning = True
        status.context_remaining = int(context_low_match.group(1))
        status.context_percent_used = 100 - status.context_remaining
    
    # 2. Active task - the "cute message"
    # Pattern: <icon> TaskName… (ctrl+c to interrupt · metadata)
    # The "to interrupt" phrase is ALWAYS present - use that as anchor
    # Icon varies (✳ ✢ ✽ ⏺ etc) - don't enumerate, just match any non-space before task
    # Note: Claude Code changed from "(esc to interrupt" to "(ctrl+c to interrupt" in Jan 2026
    task_match = re.search(
        r'^\s*\S+\s+([^…\.\(\n]+)[…\.]?\s*\((?:esc|ctrl\+c) to interrupt([^\)]*)',
        pane_content,
        re.MULTILINE
    )
    if task_match:
        status.active_task = task_match.group(1).strip()
        status.is_thinking = True
        # Parse metadata from remainder of parentheses
        if task_match.group(2):
            metadata = task_match.group(2)
            # Check for elapsed time (e.g., "1m 40s")
            time_match = re.search(r'(\d+m\s*\d*s?)', metadata)
            if time_match:
                status.elapsed_time = time_match.group(1).strip()
            # Check for token count (e.g., "↓ 2.4k tokens")
            token_match = re.search(r'↓\s*([\d.]+k?\s*tokens?)', metadata)
            if token_match:
                status.token_count = token_match.group(1).strip()
    
    # Also check for simpler thinking indicator
    if '· thinking)' in pane_content or '· thinking' in pane_content:
        status.is_thinking = True
    
    # 3. Model/cost from statusline (just for reference, not context %)
    # Pattern: [Model Name] ctx:XX% $X.XX
    status_match = re.search(
        r'\[([^\]]+)\]\s+ctx:\d+%\s+\$(\d+\.?\d*)',
        pane_content
    )
    if status_match:
        status.model = status_match.group(1)
        status.cost_usd = float(status_match.group(2))
    
    return status


def get_session_claude_status(tmux_pane: str) -> Optional[ClaudeStatus]:
    """Get Claude status for a session by its tmux pane.
    
    Captures both pane content (for active status) and pane title
    (for the "cute message" even when idle).
    
    Args:
        tmux_pane: Tmux pane identifier
        
    Returns:
        ClaudeStatus or None if pane can't be captured
    """
    content = capture_pane(tmux_pane)
    if content is None:
        return None
    
    status = parse_claude_status(content)
    
    # Also capture pane title - this has the "cute message" even when idle
    pane_title = capture_pane_title(tmux_pane)
    if pane_title:
        # Parse the task from title
        # Format: "<icon> Task Name" where icon is any non-alphanumeric char
        title_clean = pane_title.strip()
        # Strip leading non-alphanumeric character (the activity icon)
        if title_clean and not title_clean[0].isalnum():
            title_clean = title_clean[1:].strip()
        if title_clean and title_clean.lower() not in ('bash', 'zsh', 'sh', 'tmux'):
            status.last_task = title_clean
    
    return status


def get_all_claude_statuses() -> dict[str, ClaudeStatus]:
    """Get Claude status for all tmux panes in the 'life' session.
    
    Returns:
        Dict mapping pane identifier to ClaudeStatus
    """
    statuses = {}
    
    try:
        # List all panes in life session
        result = subprocess.run(
            ["tmux", "list-panes", "-s", "-t", "life", "-F", "#{window_name}:#{pane_index}"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return statuses
            
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            pane_target = f"life:{line}"
            content = capture_pane(pane_target)
            if content:
                status = parse_claude_status(content)
                # Only include if we found Claude status info
                if status.model or status.context_percent is not None:
                    statuses[pane_target] = status
    except Exception:
        pass
    
    return statuses


def should_inject_warning(status: ClaudeStatus) -> Optional[str]:
    """Determine if hooks should inject a context warning message.
    
    We ONLY warn when Claude Code shows its native "Context low" warning.
    This is the authoritative signal that context is critically low.
    
    Args:
        status: Parsed Claude status
        
    Returns:
        Warning message to inject, or None
    """
    if not status.context_warning:
        return None
    
    remaining = status.context_remaining or 10
    used = status.context_percent_used or (100 - remaining)
    
    if remaining <= 10:
        return f"⚠️ CONTEXT CRITICAL: {used}% used ({remaining}% remaining). Consider /compact or reset."
    elif remaining <= 20:
        return f"⚠️ Context low: {used}% used ({remaining}% remaining). Monitor closely."
    
    return f"Context notice: {remaining}% remaining"


def should_force_reset(status: ClaudeStatus) -> bool:
    """Determine if we should force a reset due to context usage.
    
    Only triggers when Claude Code's native warning shows <= 10% remaining.
    
    Args:
        status: Parsed Claude status
        
    Returns:
        True if force reset is recommended
    """
    # Only force reset when Claude Code shows the warning with <= 10% remaining
    return status.context_warning and (status.context_remaining or 100) <= 10


def is_claude_active(status: ClaudeStatus) -> bool:
    """Check if Claude is currently active (thinking/working).
    
    Args:
        status: Parsed Claude status
        
    Returns:
        True if Claude is actively working
    """
    return status.is_thinking or status.active_task is not None

