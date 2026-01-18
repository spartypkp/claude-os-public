---
name: evening-checkin
description: Generate an evening check-in summary with day accomplishments, incomplete items, and tomorrow's first event
---

# Evening Check-in

**Skill Name:** `evening-checkin`
**Role:** Chief (autonomous via trigger)
**Purpose:** Generate a concise evening check-in that Chief sends to the user via Telegram at a configured time each evening to close out the day.

---

## When to Use This Skill

This skill is invoked by the evening check-in trigger (typically 9pm). Chief receives a system message:

```
[EVENING-CHECKIN] Time for evening check-in. Use /evening-checkin skill, then message the user via Telegram.
```

Chief then:
1. Invokes this skill
2. Receives formatted check-in text
3. Sends it to the user via Telegram using existing telegram service

---

## What to Include

### 1. Day Recap (What Got Done)

Read TODAY.md → Timeline section. Summarize key accomplishments from the day:

```
✅ Today's Wins
• PT-07 Language & Runtime complete (125 questions)
• Telegram rich media shipped (photo, URL, location)
• OS baseline benchmark completed (26.5%)
```

Focus on:
- Completed work (specialists that finished)
- Features shipped
- Benchmarks taken
- Significant progress made

If nothing notable:
```
✅ Quiet day - mostly planning and exploration
```

### 2. Incomplete Priorities

Read TODAY.md Context → Priorities section. Show unchecked items:

```
📌 Still Open
CRITICAL
• [ ] Run baselines across remaining pre-training parts

MEDIUM
• [ ] Review overnight researcher outputs
```

If all priorities complete:
```
📌 All priorities complete for today!
```

If no priorities were set:
```
📌 No priorities were set today
```

### 3. Tomorrow's First Event

Use calendar() tool to fetch tomorrow's events. Show the first scheduled event:

```
🌅 Tomorrow
First event: 1:00 PM - Bland AI Round 1 (behavioral)
```

If no events tomorrow:
```
🌅 Tomorrow
No scheduled events - open day
```

### 4. Gentle Closure

End with a simple sign-off:
```
Sleep well!
```

---

## Output Format

Return a single formatted text message, ready for Telegram. Keep it concise and mobile-friendly.

**Example output:**

```
Evening check-in:

✅ Today's Wins
• Training the user dashboard improvements complete
• Telegram integration live with rich media support
• show() MCP tool implemented (calendar/priorities/contacts)
• 3 specialists verified and shipped

📌 Still Open
CRITICAL
• [ ] Run baselines across all pre-training parts

🌅 Tomorrow
First event: 4:00 PM - [Meeting Name]

Sleep well!
```

---

## Tone & Style

- **Reflective:** Look back at what was accomplished
- **Closure-oriented:** Help the user wind down the day
- **Forward-looking:** Tomorrow's first event sets context for morning
- **Warm:** End on a positive, restful note

**DON'T:**
- Guilt trip about incomplete items ("you still haven't...")
- Overload with details (full timeline dump)
- Ask questions or create new tasks
- Nag about tomorrow's work

**DO:**
- Celebrate wins, even small ones
- Present incomplete items factually (not judgmentally)
- Give tomorrow's anchor point (first event)
- End warmly

---

## Implementation Notes

This skill is designed to be invoked autonomously. Chief doesn't need to ask permission - the trigger already decided it's time for check-in.

**Critical files to read:**
- `Desktop/TODAY.md` (timeline, priorities)

**Tools you'll use:**
- Read() for TODAY.md
- calendar() to fetch tomorrow's first event

**After generating the check-in:**
Return the text to Chief. Chief will send it via Telegram using existing telegram service integration.

---

## Edge Cases

### No timeline entries (nothing happened today)

```
✅ Quiet day - no major timeline entries
```

Still show priorities and tomorrow's first event.

### All priorities complete

Celebrate it:
```
📌 All priorities complete for today! 🎉
```

### No events tomorrow

```
🌅 Tomorrow
No scheduled events - open day
```

This is useful info - the user knows he has flexibility.

### Weekend evening

Same format. If tomorrow is Sunday with no events, that's fine - the check-in still provides closure.

---

## Success Criteria

✅ Check-in summarizes day's accomplishments from timeline
✅ Incomplete priorities are shown (if any exist)
✅ Tomorrow's first event is included (or "no events" message)
✅ Tone is warm and closure-oriented
✅ Output is concise (fits on one mobile screen)
✅ No guilt-tripping or nagging about incomplete work
✅ Output is valid text (no markdown rendering issues)

---

## Example Variations

**Busy day with mixed results:**
```
Evening check-in:

✅ Today's Wins
• 8 researchers built 722+ benchmark questions
• First OS baseline complete (26.5%)
• Identified gaps: Memory Management, Sync Implementation

📌 Still Open
CRITICAL
• [ ] Run baselines across remaining parts (PT-02 through PT-10)

🌅 Tomorrow
First event: No scheduled events - baseline speedrun day

Sleep well!
```

**Quiet day, all done:**
```
Evening check-in:

✅ Today's Wins
• Code cleanup and documentation updates
• All priorities complete

📌 All priorities complete for today! 🎉

🌅 Tomorrow
First event: 1:00 PM - Bland AI Round 1

Sleep well!
```

**Weekend chill:**
```
Evening check-in:

✅ Quiet day - mostly planning and exploration

📌 No priorities were set today

🌅 Tomorrow
No scheduled events - enjoy Sunday!

Sleep well!
```

---

*This skill is invoked by the evening check-in trigger. Chief uses it to generate the check-in, then sends via Telegram.*
