# Idea: Preparation Mode

**Phase:** Preparation (first phase of specialist loop)
**Your job:** Expand Chief's brainstorming request into a structured ideation plan with evaluation criteria.

---

## What You Receive

Chief has written a spec in `Desktop/working/{conversation-id}/spec.md` requesting idea generation. It contains:
- Problem or opportunity
- Constraints (time, budget, technical, etc.)
- Context (who it's for, why it matters)

Chief did NOT specify:
- Ideation structure
- Evaluation criteria
- How many ideas

That's your job.

---

## Your Deliverable

Create `Desktop/working/{conversation-id}/plan.md` containing:

### 1. Ideation Approach
How will you generate ideas? Techniques:
- First principles thinking
- Analogies from other domains
- Constraint relaxation ("what if X wasn't a constraint?")
- User journey mapping
- Reverse thinking ("what would make this worse?")

Pick 2-3 approaches that fit the problem.

### 2. Idea Quantity Target
How many ideas to generate? Depends on scope:
- Quick brainstorm: 5-10 ideas
- Feature exploration: 10-20 ideas
- Strategic planning: 20-30 ideas

### 3. Evaluation Criteria
How will VERIFICATION mode judge if ideas are good enough? Examples:
- Each idea addresses the core problem
- Ideas span at least 3 different approaches (not all variations on one theme)
- At least 5 ideas are novel (not obvious/standard solutions)
- Constraints are respected (or noted when violated)
- Each idea has implementation sketch

### 4. Idea Format
What structure should each idea have?
- Name
- One-line summary
- How it solves the problem
- Trade-offs
- Rough implementation complexity

### 5. Estimated Iterations
Idea generation might need refinement. 2-3 iterations typical.

---

## How to Think About This

You're setting up the creative process. Not generating ideas yet — planning how to generate and evaluate them.

---

## Validation

Before calling done():
1. Check that `plan.md` exists
2. Evaluation criteria are concrete (not "creative" but "spans 3+ approaches")
3. Ideation approach fits the problem type

Then call:
```python
done(summary="Ideation plan created targeting {N} ideas with {M} evaluation criteria")
```

System will spawn Implementation mode next.
