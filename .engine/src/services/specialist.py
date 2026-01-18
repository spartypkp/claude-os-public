#!/usr/bin/env python3
"""
Specialist Service - Autonomous execution with verification loops.

Implements the 3-mode specialist flow for Claude OS:
- Workspace scaffolding for background specialists
- Verification system with multiple check types
- Iteration tracking and progress logging

Usage:
    from services.specialist import scaffold_specialist_workspace, run_verification

    # On spawn
    workspace = scaffold_specialist_workspace(
        conversation_id="builder-abc123",
        spec_path="Desktop/working/my-spec.md",
        role="builder"
    )

    # On done() call
    result = run_verification(workspace)
    if result.passed:
        # Accept completion
    else:
        # Continue iteration
"""

import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Repository paths
REPO_ROOT = Path(__file__).resolve().parents[3]
SPECIALIST_TEMPLATES = REPO_ROOT / ".claude" / "specialist-templates"


@dataclass
class CheckResult:
    """Result of a single verification check."""
    name: str
    type: str
    passed: bool
    required: bool = True
    details: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class VerificationResult:
    """Result of running all verification checks."""
    passed: bool
    checks: List[CheckResult]
    summary: str
    timestamp: str
    iteration: int = 1

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "passed": self.passed,
            "checks": [
                {
                    "name": c.name,
                    "type": c.type,
                    "passed": c.passed,
                    "required": c.required,
                    "details": c.details,
                    "error": c.error,
                }
                for c in self.checks
            ],
            "summary": self.summary,
            "timestamp": self.timestamp,
            "iteration": self.iteration,
        }


def scaffold_specialist_workspace(
    conversation_id: str,
    spec_path: str,
    role: str = "builder",
    verification: Optional[Dict] = None,
    max_iterations: int = 10,
) -> Path:
    """Create specialist workspace for an autonomous session.

    Args:
        conversation_id: Session conversation ID (used for workspace folder name)
        spec_path: Path to spec markdown file (relative to REPO_ROOT)
        role: Role name (for template selection)
        verification: Optional verification config (if not in spec)
        max_iterations: Max loop iterations before giving up

    Returns:
        Path to created workspace

    Raises:
        FileNotFoundError: If spec_path doesn't exist
        ValueError: If spec_path is invalid
    """
    # Use first 8 chars of conversation_id for folder name
    workspace_id = conversation_id[:8] if len(conversation_id) > 8 else conversation_id
    workspace = REPO_ROOT / "Desktop" / "working" / workspace_id

    # Clean up existing workspace if present
    if workspace.exists():
        shutil.rmtree(workspace)

    workspace.mkdir(parents=True, exist_ok=True)

    # 1. Copy spec into workspace
    spec_source = REPO_ROOT / spec_path
    if not spec_source.exists():
        raise FileNotFoundError(f"Spec file not found: {spec_path}")

    spec_dest = workspace / "spec.md"
    shutil.copy(spec_source, spec_dest)

    # 2. Extract or create verification.yaml
    if verification:
        verification_config = verification.copy()
    else:
        verification_config = extract_verification_from_spec(spec_dest)

    verification_config["max_iterations"] = max_iterations

    # Write verification config
    verification_path = workspace / "verification.yaml"
    try:
        import yaml
        with open(verification_path, "w") as f:
            yaml.dump(verification_config, f, default_flow_style=False)
    except ImportError:
        # Fallback to JSON if yaml not available
        verification_path = workspace / "verification.json"
        with open(verification_path, "w") as f:
            json.dump(verification_config, f, indent=2)

    # 3. Copy role-specific prompt template
    template_path = SPECIALIST_TEMPLATES / role / "prompt.md"
    if not template_path.exists():
        template_path = SPECIALIST_TEMPLATES / "default" / "prompt.md"

    if template_path.exists():
        shutil.copy(template_path, workspace / "prompt.md")
    else:
        # Create minimal prompt if no template exists
        (workspace / "prompt.md").write_text(_default_specialist_prompt())

    # 4. Create empty progress.txt
    (workspace / "progress.txt").write_text("")

    # 5. Create config
    config = {
        "version": "1.0",
        "role": role,
        "conversation_id": conversation_id,
        "spawned_at": datetime.now(timezone.utc).isoformat(),
        "spec_source": spec_path,
        "max_iterations": max_iterations,
        "current_iteration": 1,
    }
    with open(workspace / ".specialist-config.json", "w") as f:
        json.dump(config, f, indent=2)

    # 6. Create artifacts directory
    (workspace / "artifacts").mkdir(exist_ok=True)

    return workspace


def extract_verification_from_spec(spec_path: Path) -> Dict[str, Any]:
    """Extract verification checks from spec markdown.

    Looks for ## Verification section and parses:
    - Code blocks (bash/sh) as command checks
    - Requirements checkboxes as documentation

    Args:
        spec_path: Path to spec.md file

    Returns:
        Dict with checks list and requirements
    """
    content = spec_path.read_text()
    checks: List[Dict] = []
    requirements: List[str] = []

    # Find ## Verification section
    verification_match = re.search(
        r"##\s+Verification\s*\n(.*?)(?=\n##\s|\Z)",
        content,
        re.DOTALL | re.IGNORECASE
    )

    if verification_match:
        verification_section = verification_match.group(1)

        # Parse code blocks as commands
        code_blocks = re.findall(
            r"```(?:bash|sh)?\s*\n(.*?)\n```",
            verification_section,
            re.DOTALL
        )
        for block in code_blocks:
            for line in block.strip().split("\n"):
                line = line.strip()
                if line and not line.startswith("#"):
                    checks.append({
                        "type": "command",
                        "name": f"Run: {line[:50]}",
                        "command": line,
                        "required": True,
                    })

        # Parse bullet points as additional checks
        bullets = re.findall(r"^[-*]\s+(.+)$", verification_section, re.MULTILINE)
        for bullet in bullets:
            # Check for file existence patterns
            file_match = re.search(r"[Ff]ile exists?:\s*[`']?([^`'\n]+)", bullet)
            if file_match:
                checks.append({
                    "type": "file_exists",
                    "name": f"File exists: {file_match.group(1)}",
                    "path": file_match.group(1),
                    "required": True,
                })
                continue

            # Check for file contains patterns
            contains_match = re.search(
                r"[Ff]ile contains?:\s*[`']?([^`'\n]+)[`']?\s+pattern:\s*[`']?([^`'\n]+)",
                bullet
            )
            if contains_match:
                checks.append({
                    "type": "file_contains",
                    "name": f"File contains: {contains_match.group(2)}",
                    "path": contains_match.group(1),
                    "pattern": contains_match.group(2),
                    "required": True,
                })

    # Parse requirements checkboxes from full content
    checkbox_matches = re.findall(r"- \[ \] (.+)", content)
    requirements = checkbox_matches

    return {
        "checks": checks,
        "requirements": requirements,
    }


def run_verification(
    workspace: Path,
    project_path: Optional[Path] = None
) -> VerificationResult:
    """Run all verification checks for a specialist workspace.

    Args:
        workspace: Path to specialist workspace
        project_path: Optional project root (for commands with cwd)

    Returns:
        VerificationResult with pass/fail and details
    """
    # Load verification config
    config_path = workspace / "verification.yaml"
    if not config_path.exists():
        config_path = workspace / "verification.json"

    if not config_path.exists():
        return VerificationResult(
            passed=False,
            checks=[],
            summary="No verification config found",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    # Load config
    if config_path.suffix == ".yaml":
        try:
            import yaml
            config = yaml.safe_load(config_path.read_text())
        except ImportError:
            return VerificationResult(
                passed=False,
                checks=[],
                summary="yaml module not available",
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
    else:
        config = json.loads(config_path.read_text())

    # Load specialist config for iteration count
    specialist_config_path = workspace / ".specialist-config.json"
    iteration = 1
    if specialist_config_path.exists():
        specialist_config = json.loads(specialist_config_path.read_text())
        iteration = specialist_config.get("current_iteration", 1)

    # Run checks
    checks = config.get("checks", [])
    results: List[CheckResult] = []
    cwd = project_path or REPO_ROOT

    for check in checks:
        check_type = check.get("type")
        required = check.get("required", True)

        if check_type == "command":
            result = _run_command_check(check, cwd)
        elif check_type == "file_exists":
            result = _run_file_exists_check(check, REPO_ROOT)
        elif check_type == "file_contains":
            result = _run_file_contains_check(check, REPO_ROOT)
        else:
            result = CheckResult(
                name=check.get("name", "unknown"),
                type=check_type or "unknown",
                passed=False,
                required=required,
                error=f"Unknown check type: {check_type}",
            )

        result.required = required
        results.append(result)

    # Determine overall pass/fail
    required_checks = [r for r in results if r.required]
    all_required_passed = all(r.passed for r in required_checks)

    summary = _generate_summary(results)

    return VerificationResult(
        passed=all_required_passed,
        checks=results,
        summary=summary,
        timestamp=datetime.now(timezone.utc).isoformat(),
        iteration=iteration,
    )


def update_iteration(workspace: Path) -> int:
    """Increment the iteration counter and return new value."""
    config_path = workspace / ".specialist-config.json"
    if not config_path.exists():
        return 1

    config = json.loads(config_path.read_text())
    new_iteration = config.get("current_iteration", 1) + 1
    config["current_iteration"] = new_iteration

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    return new_iteration


def append_progress(
    workspace: Path,
    iteration: int,
    summary: str,
    verification_result: VerificationResult,
    passed: bool = False,
) -> None:
    """Append iteration details to progress.txt.

    Args:
        workspace: Path to specialist workspace
        iteration: Current iteration number
        summary: Summary of what was attempted
        verification_result: The verification result
        passed: Whether verification passed
    """
    progress_path = workspace / "progress.txt"

    status = "PASSED ✓" if passed else "FAILED"
    entry = f"""
=== Iteration {iteration} at {verification_result.timestamp} ===
Status: Verification {status}
Attempted: {summary}

Verification Results:
{verification_result.summary}

"""
    with open(progress_path, "a") as f:
        f.write(entry)


def get_specialist_workspace(conversation_id: str) -> Optional[Path]:
    """Get specialist workspace path for a conversation ID, if it exists."""
    workspace_id = conversation_id[:8] if len(conversation_id) > 8 else conversation_id
    workspace = REPO_ROOT / "Desktop" / "working" / workspace_id

    if workspace.exists() and (workspace / ".specialist-config.json").exists():
        return workspace
    return None


def get_specialist_config(workspace: Path) -> Optional[Dict]:
    """Load specialist config from workspace."""
    config_path = workspace / ".specialist-config.json"
    if config_path.exists():
        return json.loads(config_path.read_text())
    return None


# =============================================================================
# Check Runners
# =============================================================================


def _run_command_check(check: Dict, cwd: Path) -> CheckResult:
    """Run a shell command and check exit code."""
    command = check.get("command", "")
    timeout = check.get("timeout", 300)  # 5 min default
    name = check.get("name", command[:50])

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

        passed = result.returncode == 0

        # Truncate output to avoid huge responses
        stdout = result.stdout[-1000:] if len(result.stdout) > 1000 else result.stdout
        stderr = result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr

        return CheckResult(
            name=name,
            type="command",
            passed=passed,
            details={
                "exit_code": result.returncode,
                "stdout": stdout,
                "stderr": stderr,
                "command": command,
            },
        )

    except subprocess.TimeoutExpired:
        return CheckResult(
            name=name,
            type="command",
            passed=False,
            error=f"Command timed out after {timeout}s",
            details={"command": command},
        )
    except Exception as e:
        return CheckResult(
            name=name,
            type="command",
            passed=False,
            error=str(e),
            details={"command": command},
        )


def _run_file_exists_check(check: Dict, root: Path) -> CheckResult:
    """Check if a file exists."""
    path_str = check.get("path", "")
    name = check.get("name", f"File exists: {path_str}")

    # Handle both relative and absolute paths
    if path_str.startswith("/"):
        path = Path(path_str)
    else:
        path = root / path_str

    exists = path.exists()

    return CheckResult(
        name=name,
        type="file_exists",
        passed=exists,
        details={"path": str(path), "exists": exists},
    )


def _run_file_contains_check(check: Dict, root: Path) -> CheckResult:
    """Check if file contains pattern."""
    path_str = check.get("path", "")
    pattern = check.get("pattern", "")
    name = check.get("name", f"File contains: {pattern}")

    # Handle both relative and absolute paths
    if path_str.startswith("/"):
        path = Path(path_str)
    else:
        path = root / path_str

    if not path.exists():
        return CheckResult(
            name=name,
            type="file_contains",
            passed=False,
            error="File does not exist",
            details={"path": str(path), "pattern": pattern},
        )

    try:
        content = path.read_text()
        matches = re.search(pattern, content, re.IGNORECASE)

        return CheckResult(
            name=name,
            type="file_contains",
            passed=bool(matches),
            details={
                "path": str(path),
                "pattern": pattern,
                "found": bool(matches),
            },
        )
    except Exception as e:
        return CheckResult(
            name=name,
            type="file_contains",
            passed=False,
            error=str(e),
            details={"path": str(path), "pattern": pattern},
        )


def _generate_summary(results: List[CheckResult]) -> str:
    """Generate human-readable summary of verification results."""
    required = [r for r in results if r.required]
    optional = [r for r in results if not r.required]

    required_passed = sum(1 for r in required if r.passed)
    required_total = len(required)

    optional_passed = sum(1 for r in optional if r.passed)
    optional_total = len(optional)

    summary = f"Required: {required_passed}/{required_total} passed"
    if optional_total > 0:
        summary += f" | Optional: {optional_passed}/{optional_total} passed"

    # Add details of failures
    failures = [r for r in required if not r.passed]
    if failures:
        summary += "\n\nFailures:"
        for f in failures:
            summary += f"\n  - {f.name}"
            if f.error:
                summary += f": {f.error}"
            elif "exit_code" in f.details:
                summary += f" (exit {f.details['exit_code']})"
                if f.details.get("stderr"):
                    # First line of stderr
                    first_line = f.details["stderr"].strip().split("\n")[0][:100]
                    summary += f"\n    {first_line}"

    return summary


def _default_specialist_prompt() -> str:
    """Return default specialist prompt if no template exists."""
    return """# Specialist Loop Instructions

You are in specialist mode — iterative execution until verified complete.

## Your Goal

Implement the requirements in `spec.md` and iterate until all verification checks pass.

## How to Operate

1. **Read the spec**: Open `spec.md` and understand ALL requirements
2. **Check past attempts**: Read `progress.txt` for learnings from previous iterations
3. **Implement incrementally**: Don't try to do everything at once
4. **Call done() to verify**: When you think you're complete, call `done()`
5. **If verification fails**:
   - Read the failure details carefully
   - Adjust your approach
   - Continue implementing
6. **If verification passes**: You're done ✓

## Context Management

If your context is filling up (>60%), call `reset()` with handoff notes.
Write handoff to `Desktop/working/{your-workspace}/handoff.md`.

## Critical Rules

- **NEVER call done() without attempting implementation**
- **NEVER ignore verification failures** — each failure is data
- Read progress.txt at start of EVERY iteration
"""
