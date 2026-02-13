"""Role-based handoff templates with embedded guidance.

Templates use markdown comments to guide the summarizer on what content
belongs in each section. The summarizer fills in content below each header,
using the comments as guidance.
"""

CHIEF_TEMPLATE = """# Chief Handoff - {timestamp}

## Conversation Arc
<!-- The flow of the session from start to reset.
When did this happen? (morning check-in, evening wind-down, deep work session)
What was discussed? How did topics connect and evolve?
Where is the conversation thread currently?
Capture narrative flow, not bullet points. -->

## User State
<!-- How is the user engaging? Energy level? Mode (focused work vs casual vs tired)?
Stressed or relaxed? Scattered or locked in?
Any emotional context that matters for how to engage? -->

## What Would Be Weird to Forget
<!-- Relational context that creates continuity.
Callbacks, jokes, commitments the user made, things they mentioned in passing.
Promises Claude made that need follow-through.
If the next Claude didn't know this, conversation would feel off. -->

## File Changes
<!-- What files did Claude modify during this session?
List actual changes made: "Updated MEMORY.md → added Ian contact"
This helps fresh Claude know what's new vs what was already there. -->

## Work State & Next Action
<!-- What was Claude actively doing when reset happened?
- Active work: Specific task or just conversing? (e.g., "Implementing feature X", "Researching topic Y", "Casual conversation")
- Phase: Planning, mid-execution, blocked, wrapping up, idle
- Relevant files: What files matter for continuing this work? (specs, code, docs)
- Resume instruction: Clear directive for fresh Claude
  * "Continue autonomously: finish implementing X in file.py"
  * "Wait for user: blocked on decision about Y"
  * "Idle: ready for next request"
  * "Active conversation: User was asking about Z, continue that thread"
-->
"""

SPECIALIST_INTERACTIVE_TEMPLATE = """# {role} Handoff - {timestamp}

## Task & Progress
<!-- What was the task? What's been done? What remains?
Current state of the work - concrete progress markers. -->

## Key Decisions & Context
<!-- Important decisions made with the user during this session.
Technical choices, approach changes, tradeoffs discussed.
Anything that would be weird for fresh Claude not to know. -->

## Resume Instructions
<!-- Clear directive for fresh Claude:
- Continue work: "Resume implementing X in file.py, next step is Y"
- Wait for input: "Blocked on user's decision about Z"
- Complete: "Task done, waiting for user's next request"
Include relevant files needed to continue. -->
"""

SPECIALIST_AUTONOMOUS_TEMPLATE = """# {role} Handoff - {timestamp}

## Task State
<!-- Current phase: Preparation, Implementation, or Verification?
What's completed? What's remaining?
Concrete progress markers and current state. -->

## Key Decisions
<!-- Technical decisions made during this session.
Approach changes, tradeoffs, important choices.
Context that fresh Claude needs to continue coherently. -->

## File Changes
<!-- What files were modified? What was created?
Actual changes made, not planned changes. -->

## Resume Instructions
<!-- Concrete next action for fresh Claude:
"Continue implementation: next step is X in file.py"
"Begin verification: run tests and check Y"
"Task complete: call done() with summary"
Include relevant files and specific next steps. -->
"""


def get_template(role: str, mode: str = "interactive") -> str:
    """
    Get handoff template for a role and mode.

    Args:
        role: Session role (chief, builder, writer, etc.)
        mode: Session mode (interactive, autonomous)

    Returns:
        Template string with guidance comments
    """
    if role == "chief":
        return CHIEF_TEMPLATE
    elif mode == "autonomous":
        return SPECIALIST_AUTONOMOUS_TEMPLATE
    else:
        return SPECIALIST_INTERACTIVE_TEMPLATE
