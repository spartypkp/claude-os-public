"""Handoff service - manages handoff document creation.

Flow:
1. Create template file at the right location (skeleton with guidance comments)
2. Read context files (TODAY.md, MEMORY.md, role/mode files)
3. Run summarizer with all context injected (no Read calls needed)
"""

from datetime import datetime
from pathlib import Path

from .templates import get_template
from .summarizer import run as run_summarizer


class HandoffService:
    """
    Handoff service - orchestrates handoff document generation.

    Folder conventions:
    - Chief: conversations/chief/handoff-HHMM.md
    - Specialists: conversations/MMDD-HHMM-{role}-{id}/handoff-NN.md
    """

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.conversations_dir = repo_root / "Desktop" / "conversations"

    def _read_file(self, path: Path) -> str:
        """Read file content, return empty string if not found."""
        try:
            return path.read_text()
        except FileNotFoundError:
            return f"(File not found: {path})"

    def _read_context_files(self, role: str, mode: str) -> dict:
        """Read all context files for summarizer."""
        return {
            "today_content": self._read_file(self.repo_root / "Desktop" / "TODAY.md"),
            "memory_content": self._read_file(self.repo_root / "Desktop" / "MEMORY.md"),
            "role_content": self._read_file(self.repo_root / ".claude" / "roles" / role / "role.md"),
            "mode_content": self._read_file(self.repo_root / ".claude" / "roles" / role / f"{mode}.md"),
        }

    def create_chief_handoff(
        self,
        transcript: str,
        session_id: str = None,
    ) -> Path:
        """
        Create handoff for Chief reset.

        1. Creates template at conversations/chief/handoff-HHMM.md
        2. Reads context files
        3. Runs summarizer with all context injected

        Args:
            transcript: Session transcript text
            session_id: Session being handed off (for summarizer identity)

        Returns:
            Path to handoff document
        """
        # Ensure chief folder exists
        chief_dir = self.conversations_dir / "chief"
        chief_dir.mkdir(parents=True, exist_ok=True)

        # Create output path with timestamp
        timestamp = datetime.now().strftime("%H%M")
        handoff_path = chief_dir / f"handoff-{timestamp}.md"

        # Get template and format it
        template = get_template(role="chief")
        formatted = template.format(
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
            role="Chief",
        )

        # Write template skeleton
        handoff_path.write_text(formatted)

        # Read context files
        context = self._read_context_files(role="chief", mode="interactive")

        # Run summarizer with all context injected
        run_summarizer(
            transcript=transcript,
            handoff_path=handoff_path,
            parent_session_id=session_id,
            conversation_id="chief",
            role="chief",
            **context,
        )

        return handoff_path

    def create_specialist_handoff(
        self,
        transcript: str,
        role: str,
        conversation_id: str,
        mode: str = "interactive",
        session_id: str = None,
        spec_path: str = None,
    ) -> Path:
        """
        Create handoff for specialist reset.

        1. Creates template at conversations/{conversation_id}/handoff-NN.md
        2. Reads context files
        3. Runs summarizer with all context injected

        Args:
            transcript: Session transcript text
            role: Specialist role (builder, writer, etc.)
            conversation_id: Folder name (MMDD-HHMM-{role}-{id} format)
            mode: Session mode (interactive, autonomous, preparation, etc.)
            session_id: Session being handed off (for summarizer identity)
            spec_path: Path to the spec on Desktop (passed to summarizer for context)

        Returns:
            Path to handoff document
        """
        # Ensure conversation folder exists
        folder = self.conversations_dir / conversation_id
        folder.mkdir(parents=True, exist_ok=True)

        # Count existing handoffs to get next number
        existing = list(folder.glob("handoff-*.md"))
        next_num = len(existing) + 1
        handoff_path = folder / f"handoff-{next_num:02d}.md"

        # Get template and format it
        template = get_template(role=role, mode=mode)
        formatted = template.format(
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M"),
            role=role.title(),
        )

        # Write template skeleton
        handoff_path.write_text(formatted)

        # Read context files
        context = self._read_context_files(role=role, mode=mode)

        # Run summarizer with all context injected
        run_summarizer(
            transcript=transcript,
            handoff_path=handoff_path,
            parent_session_id=session_id,
            conversation_id=conversation_id,
            role=role,
            spec_path=spec_path,
            **context,
        )

        return handoff_path
