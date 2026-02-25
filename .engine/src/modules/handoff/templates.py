"""Role-based handoff templates with embedded guidance.

Templates use markdown comments to guide the summarizer on what content
belongs in each section. The summarizer fills in content below each header,
using the comments as guidance.
"""

CHIEF_TEMPLATE = """# Chief Handoff - {timestamp}

## Immediate Re-read List
<!-- FILES the successor MUST read FIRST before doing anything else.
List exact file paths. Include: spec files being worked on, plan.md, reference docs actively in use.
Example: "- Desktop/context-loading-overhaul-spec.md"
Example: "- .claude/roles/chief/role.md (just updated email section)"
If no specific files needed, write "No specific files - read TODAY.md and MEMORY.md as usual." -->

## Active Skills
<!-- Skills (/morning-reset, /apply-jobs, /evening-checkin, etc.) that were active during this session.
If a skill was being used, name it so successor can re-invoke if needed.
If no skills were active, write "None." -->

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
  * "Active conversation: user was asking about Z, continue that thread"
-->
"""

SPECIALIST_INTERACTIVE_TEMPLATE = """# {role} Handoff - {timestamp}

## Immediate Re-read List
<!-- FILES the successor MUST read FIRST before doing anything else.
List exact file paths: the spec file, plan.md, any reference docs actively in use.
Example: "- Desktop/conversations/chief/some-spec.md"
Example: "- Desktop/conversations/0224-1500-builder-abc123/plan.md" -->

## Active Skills
<!-- Skills (/morning-reset, /leetcode, etc.) active during this session.
If none, write "None." -->

## Conversation Arc
<!-- The flow of this session from start to reset.
What was the user working on? How did the collaboration evolve?
Where is the conversation thread currently?
Capture narrative flow, not bullet points. -->

## Task & Progress
<!-- What was the task? What's been done? What remains?
Current state of the work - concrete progress markers. -->

## What Would Be Weird to Forget
<!-- Relational context that creates continuity.
Preferences the user expressed, things they reacted strongly to, approaches they rejected.
Promises Claude made that need follow-through.
If the next Claude didn't know this, the session would feel off. -->

## Key Decisions & Context
<!-- Important decisions made with the user during this session.
Technical choices, approach changes, tradeoffs discussed. -->

## File Changes
<!-- What files did Claude modify during this session?
List actual changes made: "Updated api.py - added /groups endpoint"
This helps fresh Claude know what's new vs what was already there. -->

## Resume Instructions
<!-- Clear directive for fresh Claude:
- Continue work: "Resume implementing X in file.py, next step is Y"
- Wait for input: "Blocked on user's decision about Z"
- Complete: "Task done, waiting for user's next request"
Include relevant files needed to continue. -->
"""

SPECIALIST_AUTONOMOUS_TEMPLATE = """# {role} Handoff - {timestamp}

## Immediate Re-read List
<!-- FILES the successor MUST read FIRST before doing anything else.
List exact file paths: the spec file, plan.md, progress.md, any reference docs.
Example: "- Desktop/conversations/chief/some-spec.md"
Example: "- Desktop/conversations/0224-1500-builder-abc123/plan.md" -->

## Active Skills
<!-- Skills active during this session. If none, write "None." -->

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
