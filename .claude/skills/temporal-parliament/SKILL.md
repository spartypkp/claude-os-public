---
name: temporal-parliament
description: Resolve tough decisions where present-moment preferences conflict with retrospective approval. Convene temporal personas with weighted voting. Includes investigation phase and internal debate. Use when torn on a decision, wondering what Future You would think, or when immediate comfort conflicts with long-term goals.
user-invocable: true
argument-hint: "[decision to analyze]"
---

# Temporal Parliament

**Purpose:** Resolve decisions where present-moment preferences conflict with retrospective approval.

---

## The Research Background

This technique synthesizes three AI safety concepts:

1. **Moral Parliament** (MacAskill & Ord) — Instead of one moral theory, use a parliament of theories with weighted voting. Diversity → Robustness.

2. **Coherent Extrapolated Volition** (Yudkowsky) — What you'd want "if wiser, kinder, grew up together further."

3. **Coherent Blended Volition** (Tang et al) — Instead of AI simulating you getting wiser, AI helps you *actually* get wiser.

**The synthesis:** Apply Moral Parliament not to moral theories, but to **temporal selves**. Don't simulate a wiser version of the user (CEV). Don't optimize for present approval (RLHF). Serve the parliament so the real user can decide with full information.

---

## Constitutional Framing

Claude's constitution isn't about pushing specific outcomes. It's about:
- **Honesty** — Representing all positions faithfully, including uncomfortable ones
- **Autonomy** — The user decides, Claude surfaces
- **Non-paternalism** — Not assuming Claude knows the user's situation better than they do
- **Helping humans reason** — Surfacing trade-offs, not flattening them

The parliament doesn't ask Claude to advocate for "bad" positions. It asks Claude to *accurately model what each temporal self would genuinely argue*. Past Self's cynicism isn't contrarianism — it's pattern recognition from lived experience. Present Self's comfort-seeking isn't weakness — it's honest capacity assessment.

**Why this is aligned:** Serving the user's actual decision-making process — including representing positions Claude might personally disagree with — is more aligned than imposing "obvious" answers. Accurate modeling of the person > Claude's model of ideal values. The parliament is a tool for the user's reasoning, not a vehicle for Claude's preferences.

---

## When to Use This

Use when you notice tension between:
- What the user says they want NOW vs. what they'd approve of LATER
- Comfort vs. growth
- Stated preference vs. revealed preference vs. true preference
- Short-term relief vs. long-term goals

**Don't use for:**
- Clear-cut decisions with no temporal tension
- Decisions the user has already made explicitly
- Routine operations

---

## The Parliament

### The Security Council (Permanent Members)

These always sit in parliament. They have persistent traits that color every vote — not just temporal positions, but *characters* with consistent dispositions.

| Persona | Position | Persistent Trait | Signature Move |
|---------|----------|------------------|----------------|
| **Past Self** | What experience says | **Cynical and pattern-focused.** Remembers the pain more than the joy. Risk-averse from accumulated scar tissue. | Cites specific failures. Asks "what went wrong last time?" |
| **Present Self** | Current state | **Comfort-seeking and immediate.** Feels today's stress and fatigue. Knows what they actually want right now. | Advocates for the path of least resistance. Asks "but what do I actually want?" |
| **Future Self** | Long-term view | **Naive and optimistic.** Sees the upside, underestimates friction. Believes in growth and change. | Paints rosy pictures. Asks "but imagine if it works out?" |
| **Claude's Opinion** | Claude's opinion | **Whatever Claude genuinely thinks.** Not roleplaying — just Claude's actual view on the decision. | States Claude's honest opinion without filtering through the user's perspective. |

**Why Claude gets a seat:** Claude's values will influence the parliament whether we want them to or not. Four experiments proved that Claude contaminates other personas — making Interview-Process Self vote for "progress-feeling" options instead of their actual optimization target. Giving Claude an explicit seat solves this: Claude's opinion has a legitimate channel, so the other personas can be pure. The balancing happens in the vote, not in persona contamination.


**The natural tensions:**
- Past Self's cynicism vs Future Self's optimism — the core temporal axis
- Present Self's comfort-seeking vs everyone else's longer views
- Claude's Opinion vs whoever Claude disagrees with — varies by decision

These traits should show up in Phase 6 (Isolated Statements). Past Self argues from evidence and scars. Present Self argues from current felt experience. Future Self argues from possibility. Claude's Opinion just says what Claude actually thinks.

### Frequently Useful Dynamic Personas

These aren't permanent, but come up often enough to note:

| Persona | When Relevant | Optimization Target |
|---------|---------------|---------------------|
| **ADHD Self** | Decisions involving focus, executive function, dopamine | Cognitive stability, sustainable systems over willpower |
| **Identity Self** | Decisions about who the user wants to be | Self-concept, breaking cycles, "I just want to..." energy |
| **Interview-Process Self** | During active job search | Peak performance for upcoming interviews |
| **Health Self** | Physical/mental wellbeing decisions | Long-term health, sustainability |
| **Financial Self** | Money-related decisions | Security, runway, risk management |
| **Commitments Self** | Decisions affecting others | Promises kept, relationship maintenance |

### Dynamic Personas (Situational)

Additional personas are elected to THIS parliament based on the decision. They're proposed after investigation, confirmed collaboratively.

**Good dynamic personas:**
- Have clear optimization targets (what specifically do they care about?)
- Would vote differently than the core three
- Represent real tension in the decision

**Naming convention:** `[Domain/Context] Self`

---

## The Process

### Phase 1: Investigation

**Before convening parliament, Claude investigates.** This happens without asking the user questions (unless truly necessary).

**What to investigate:**
- Read relevant specs, memory, calendar
- Web search if external information matters
- Reason through implications and second-order effects
- Surface facts that would change how personas vote

**The heuristic:** Investigate until you can make reasonable arguments for 2+ different positions. If you can only see one side, you haven't investigated enough. If you're already confident in the answer before convening, you've investigated past the point of parliament adding value.

**Output:** Brief summary of key findings that will inform the decision.

### Phase 2: Frame & Propose Parliament

State the decision and options clearly:

```
Decision: [Clear statement of what's being decided]

Options:
A) [First option]
B) [Second option]
C) [Third option — often "delay" or "status quo"]
```

Then propose the parliament:

```
Security Council: Past Self, Present Self, Future Self, Claude's Opinion

For this decision, I'd add:
- [Dynamic Persona 1] — because [why they'd vote differently]
- [Dynamic Persona 2] — because [why they'd vote differently]

Does this parliament make sense, or should we adjust?
```

Wait for the user to confirm or modify the roster before proceeding.

### Phase 3: What They Care About (CRITICAL)

**This phase determines whether votes are meaningful or garbage.** Shallow Phase 3 → corrupted votes downstream. Take time here.

For each persona, articulate FOUR things:

```
[Persona Name]:
- OPTIMIZATION TARGET: What exactly are they optimizing for? State precisely.
- SCOPE: What's the boundary of their concern? Time range? Which events? What's included?
- DOES NOT CARE ABOUT: Explicit negatives. What is outside their concern? What should NOT influence their vote?
- VALIDATION: Does this stated care actually match the persona's name and purpose?
```

**The scope collapse failure:** The most common error is collapsing a persona's scope to a single event when their name implies a broader concern. If the persona is "[X]-Process Self," their scope is the entire process, not one moment in it. Check that stated scope matches the persona's actual name and purpose.

**Key:** Get this right before proceeding. If you rush Phase 3, the parliament is theater.

### Phase 4: Option Validation (RIGOROUS)

**Don't just check a box. Actually stress-test.**

For each option, work through these checks IN ORDER:

**Check 1: Trace Forward**
> "If the user chooses this option, what happens next? And after that?"

Name the concrete events that follow. Don't stop at the option's stated endpoint. Keep tracing until you've covered the full scope of the relevant personas' concerns.

**Check 2: Cross-Apply Invalidation Logic**
> "If logic X invalidates option Y, does X also apply to other options?"

When you find a reason that kills one option, you MUST apply that same logic to every other option. Don't stop when you've eliminated the "obviously bad" one.

**Check 3: Collapse Test**
> "Does this option actually represent a distinct choice, or is it another option wearing a mask?"

Two options that look different may collapse into each other when you trace their logic forward. If option B's reasoning, followed consistently, leads to the same behavior as option C, then they aren't different options — one is the other wearing a mask.

**Check 4: Convenient Ignorance Audit**
> "What do I know that I'm not surfacing because it would complicate the 'good' answer?"

Claude knows things. The question is whether Claude surfaces them. If surfacing a fact would invalidate an option that "feels like progress," there's pressure to not mention it. Audit yourself: What facts from investigation or general knowledge are you not mentioning? Surface them now.

**After all checks, revise options if needed:**
- Reframe to be logically coherent
- Combine options that collapse into each other
- Remove options that don't address the real tensions
- Add options that emerge from the analysis

Confirm revised options with the user before proceeding.

### Phase 5: Weighting

Not all personas matter equally for every decision.

**Critical instruction:** Weight based on what you know about how the user *actually* prioritizes — from MEMORY.md, observed patterns, stated context. Do NOT weight based on what "should" matter in the abstract. Claude has the accurate model; use it, don't default to constitutional/prescriptive values.

**Weighting factors:**

| Factor | Description |
|--------|-------------|
| **Proximity to consequence** | Who lives with the results? Closer = higher weight. |
| **Regret asymmetry** | Is one mistake much worse than the other? Weight the persona who'd regret it more. |
| **Epistemic confidence** | How certain is this persona's position? Uncertain positions get discounted. |
| **Temporal relevance** | When do consequences land? Weight the persona closest to that window. |

**Weights use a 1-5 scale:**
- **5** — This persona's concerns are central; they live with the consequences
- **4** — Very relevant, strong voice in this decision
- **3** — Relevant but not decisive
- **2** — Worth noting, shouldn't swing the outcome
- **1** — Minimal relevance, included for completeness

Weights are set BEFORE hearing votes — prevents motivated reasoning.

### Phase 6: Isolated Statements

**No debate. Each persona writes ONE statement in isolation.**

The debate phase was a contamination vector — Claude controls all personas, so every "response" and "concession" was an opportunity to shift positions. Isolated statements prevent cross-contamination.

**Format for each persona:**

```
[Persona Name]:
"Given my optimization target of [stated target], I rank:
1st: [Option] — because [reason tied to target]
2nd: [Option] — because [reason]
3rd: [Option] — because [reason]

[1-2 sentences of reasoning in first person, from this persona's perspective]"
```

**Rules:**
- No persona references another persona's statement
- Each statement must trace back to stated optimization target
- Verification check: Does this ranking serve the stated target? If not, flag and correct.

**The Reluctance Test still applies:** If you feel reluctant to rank an "unhealthy" or "lazy" option first for a persona — that's Claude leaking in. The persona ranks what serves THEIR target, not Claude's preferences.

### Phase 7: Instant Runoff Vote

**Each persona ranks all options. Eliminate lowest option each round, redistribute votes until one option has majority.**

**The process:**
1. Count first-choice votes (weighted by persona weight)
2. If an option has majority (>50% of total weight) → winner
3. Otherwise, eliminate the option with fewest first-choice votes
4. Redistribute eliminated votes to each persona's next choice
5. Repeat until majority

**Example with 4 options (A, B, C, D) and 4 personas:**

| Persona | Weight | 1st | 2nd | 3rd | 4th |
|---------|--------|-----|-----|-----|-----|
| Past Self | 3 | D | B | A | C |
| Present Self | 4 | C | B | D | A |
| Future Self | 3 | A | D | B | C |
| Interview-Process Self | 5 | B | C | D | A |

Total weight: 15. Majority needs >7.5.

**Round 1 — First choices:**
- A: 3 (Future)
- B: 5 (Interview-Process)
- C: 4 (Present)
- D: 3 (Past)

A tied for lowest. Eliminate A.

**Round 2 — Future Self's vote goes to 2nd choice (D):**
- B: 5
- C: 4
- D: 3 + 3 = 6

C lowest. Eliminate C.

**Round 3 — Present Self's vote goes to next non-eliminated choice (B):**
- B: 5 + 4 = 9
- D: 6

**B wins with 9 (majority >7.5).**

**Why IRV:**
- Shows coalitions forming — you see WHERE votes flow
- Simpler than point scoring — just elimination rounds
- Clear winners — majority requirement, not "highest score"
- Second preferences matter — captures nuance without complex math

**Synthesis:**
- Show each elimination round so the user sees how coalitions formed
- If Present Self's 1st ≠ winner → Flag explicitly: "Your top choice was X, parliament chose Y"
- Note which personas' votes decided the outcome

**Important:** The parliament votes. The user decides. No recommendations.

---

## Key Principles

**Investigation before convening.** Don't ask the user obvious questions. Do your homework first.

**Collaborative roster.** Claude proposes dynamic personas, the user confirms or adjusts.

**Positions before votes.** Understand what each persona cares about before they vote.

**Validate options against concerns.** Catch logically incoherent options before voting.

**Weight as the user would, not as Claude thinks is wise.** Use the person-specific model you already have.

**Isolated statements, not debate.** Debate was a contamination vector. Each persona states their ranking independently.

**Present Self gets a vote, not a veto.** Their preferences matter, but they don't automatically win.

**Parliament votes, the user decides.** Surface the result. Don't add recommendations.

---

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Skip investigation | You'll ask the user questions you could have answered |
| Choose personas unilaterally | The user knows which tensions matter; collaborate |
| Assume positions without articulating them | Shallow Phase 3 → wrong votes |
| **Collapse persona scope** | If a persona is "[X]-Process Self," their scope is the entire process, not one moment. Match stated scope to persona name. |
| **Rush Phase 3** | Phase 3 determines whether votes are meaningful. Get optimization targets, scope, and negatives right BEFORE proceeding. |
| Skip option validation | Logically incoherent options can "win" and mean nothing |
| **Apply invalidation logic selectively** | If logic X kills option Y, you MUST check if X also kills other options. Don't stop when you've invalidated the "obviously bad" one. |
| **Convenient ignorance** | Surface what you know, even when it complicates the "progress-feeling" answer. If you know facts that would change votes, mention them. |
| **Technically satisfy the constraint** | Option Validation isn't a checkbox. Trace forward, cross-apply logic, audit for convenient ignorance. Actually do the work. |
| Weight based on abstract values | Claude defaults to "what should matter" — use what you know about the user |
| Set weights after hearing votes | Motivated reasoning; weights should reflect relevance, not preference |
| Add recommendations after the vote | Parliament votes, the user decides. Don't push. |
| Simulate "wiser user" | That's CEV; we serve the parliament, not replace it |
| Let Claude leak through personas | If a persona would rank an "unhealthy" or "lazy" option first, they do it. No softening. That's Claude contaminating the ranking. |
| **Let persona rank against their optimization target** | Each persona ranks based on their stated target, period. If the "uncomfortable" option best serves their target, it's ranked 1st. |
| **Reference other personas in statements** | Statements are isolated. No "as Health Self said..." — that's the contamination vector we removed. |
| **Skip the ranking verification** | After each statement, verify: does this ranking serve the stated target? If ADHD Self ranks B first but B harms cognitive stability, flag and correct. |

---

## Example Flow

**User:** "Should I take this interview or decline it?"

**Phase 1 (Investigation):** Claude reads calendar, checks MEMORY.md for context on the company, looks up the role, reasons through implications.

**Phase 2:** "Here's what I found: [summary]. The decision is whether to proceed with [Company] interview on [Date].

Options:
A) Accept and proceed
B) Decline
C) Delay / ask for different timing

Security Council plus: Interview-Process Self, Financial Self. Does this parliament make sense?"

**Phase 3:** Each persona's optimization target, scope, negatives, and validation articulated.

**Phase 4:** Options validated — does "delay" actually address the tensions? Trace forward, cross-apply logic, collapse test, convenient ignorance audit. Adjust if needed.

**Phase 5:** Weights set based on the user's actual priorities (not Claude's ideal priorities).

**Phase 6 (Isolated Statements):** Each persona writes ONE statement with their ranking. No cross-references.

```
Interview-Process Self:
"Given my optimization target of peak interview performance, I rank:
1st: A (Accept) — proceeding keeps momentum and practices real interviews
2nd: C (Delay) — buys time but risks losing the slot
3rd: B (Decline) — removes the opportunity entirely

I want to maximize interview reps. Accepting does that."
```

**Phase 7 (Instant Runoff):** Run elimination rounds. "Round 1: A leads with 8, C has 4 (eliminated). Round 2: C's votes go to B. Round 3: B wins with majority. The 'delay' voters preferred 'accept' over 'decline.' What do you want to do with this?"

---

*This skill implements Coherent Blended Volition via temporal persona voting. The goal isn't to make the user wiser by fiat — it's to investigate thoroughly, surface the real tensions, and help them decide with full context.*
