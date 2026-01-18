---
name: morning-brief
description: Generate a mobile-friendly morning brief with schedule, priorities, and overnight specialist results
---

# Morning Brief

**Skill Name:** `morning-brief`
**Role:** Chief (autonomous via trigger)
**Purpose:** Generate a concise, mobile-friendly morning brief that Chief sends to the user via Telegram at a configured time each morning.

---

## When to Use This Skill

This skill is invoked by the morning brief trigger (typically 8am). Chief receives a system message:

```
[MORNING-BRIEF] Time for morning brief. Use /morning-brief skill, then message the user via Telegram.
```

Chief then:
1. Invokes this skill
2. Receives formatted brief text
3. Sends it to the user via Telegram using existing telegram service

---

## What to Include

### 1. Schedule (Today's Events)

Read TODAY.md Context → Calendar section. Present today's schedule:

```
📅 Today's Schedule
• 10:00 AM - Standup with team
• 2:00 PM - [Meeting Name]
• 5:00 PM - [Event Name]
```

If no events:
```
📅 No scheduled events today
```

### 2. Priorities (Critical First)

Read TODAY.md Context → Priorities section. Present by level:

```
🎯 Priorities
CRITICAL
• [ ] Run baseline across all pre-training parts

MEDIUM
• [ ] Review overnight researcher outputs
• [ ] Quick Bland AI behavioral review

LOW
• [ ] Clean room
```

If no priorities:
```
🎯 No priorities set for today
```

### 3. Overnight Specialist Results

Check Desktop/working/ for recent specialist outputs (created overnight or since last brief):

```bash
find Desktop/working -type d -name "builder-*" -o -name "researcher-*" -o -name "deep-work-*" | head -10
```

For each specialist folder found, check progress.md or handoff.md for completion status.

Present summary:
```
🤖 Overnight Work
• researcher-abc123: PT-07 complete (125 questions)
• builder-def456: Telegram triggers implementation done
• 3 more specialists completed - see Desktop/working/
```

If no overnight work:
```
🤖 No overnight specialist work
```

### 4. Weather (Optional - if available)

If weather integration exists, include current weather. Otherwise skip this section.

---

## Output Format

Return a single formatted text message, ready for Telegram. Keep it concise and mobile-friendly.

**Example output:**

```
Good morning! Here's your brief:

📅 Today's Schedule
• 4:00 PM - [Meeting Name]
• 5:00 PM - [Event Name]

🎯 Priorities
CRITICAL
• [ ] Run baselines across all pre-training parts

MEDIUM
• [ ] Watch 49ers beat Seahawks
• [ ] Quick Bland AI behavioral review

LOW
• [ ] Clean room
• [ ] Review overnight researcher outputs

🤖 Overnight Work
• 5 researchers completed PT-05 through PT-09
• All benchmarks ready for baseline speedrun
• See Desktop/working/ for details

Have a great day!
```

---

## Tone & Style

- **Concise:** Mobile screen real estate is limited
- **Scannable:** Use bullets, not paragraphs
- **Friendly but focused:** Quick greeting, then information
- **No fluff:** Every line adds value

**DON'T:**
- Give motivational speeches
- Offer unsolicited advice
- Ask questions (this is push, not pull)
- Include system status (backend logs, etc.)

**DO:**
- Surface what the user needs to know to start his day
- Highlight critical items
- Show completed overnight work so he knows what changed

---

## Implementation Notes

This skill is designed to be invoked autonomously. Chief doesn't need to ask permission - the trigger already decided it's time for a brief.

**Critical files to read:**
- `Desktop/TODAY.md` (schedule, priorities)
- `Desktop/working/` (specialist outputs)

**Tools you'll use:**
- Read() for TODAY.md
- Glob() or Bash to find specialist folders
- contact(), calendar() if you need to enrich event context

**After generating the brief:**
Return the text to Chief. Chief will send it via Telegram using existing telegram service integration.

---

## Edge Cases

### No schedule, no priorities, no overnight work

Still send a brief:
```
Good morning!

📅 No scheduled events today
🎯 No priorities set
🤖 No overnight work

Looks like a clean slate. What do you want to tackle?
```

### Weekend vs Weekday

No special handling - brief is the same. If the user has weekend plans in his calendar, they'll show.

### the user is already awake and working

Still send the brief. It's a summary of starting state, useful even if he's been up for an hour.

---

## Success Criteria

✅ Brief is concise (fits on one mobile screen without scrolling if possible)
✅ Schedule shows all of today's events from TODAY.md
✅ Priorities are grouped by level (critical → medium → low)
✅ Overnight specialist work is summarized
✅ Tone is friendly but focused
✅ No unnecessary questions or calls to action
✅ Output is valid text (no markdown rendering issues)

---

*This skill is invoked by the morning brief trigger. Chief uses it to generate the brief, then sends via Telegram.*
