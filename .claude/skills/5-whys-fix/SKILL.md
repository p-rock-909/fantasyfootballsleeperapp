---
name: 5-whys-fix
description: >
  5 Whys root cause analysis with full quality chain — identify root cause,
  generate 3 solutions, implement the best fix, then /simplify and /verify
  the implementation. Use when "why does this keep breaking", "root cause
  analysis", "5 whys", "find the real problem", "5-whys-fix".
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Agent]
version: 2.0.0
author: Claude
tags: [debugging, root-cause, quality]
---

# 5 Whys Root Cause Analysis & Implementation

Systematically identify the root cause of a problem using the 5 Whys methodology,
generate solutions, implement the best fix, then run /simplify and /verify to
ensure the fix is clean and actually works.

## When to Activate

- "why does this keep breaking", "root cause analysis", "5 whys"
- "find the real problem", "what's causing this", "keep having this issue"
- Explicit: `/5-whys-fix`

---

## Phase 1: Problem Definition

1. Ask the user to clearly describe the problem
2. Document: exact symptoms, when it happens, what's affected
3. Confirm understanding by restating the problem back

If the problem is already described in context (e.g., from a test failure or log output),
skip the question and proceed directly with the evidence.

## Phase 2: 5 Whys Analysis

For each answer, ask "Why?" progressively deeper:

```
Problem: [User's problem]

Why #1: [Immediate cause]
Why #2: [Cause of the first cause]
Why #3: [Deeper underlying cause]
Why #4: [System or pattern level cause]
Why #5: [Root cause — the fundamental issue]
```

**Guidelines:**
- Each "why" must answer the previous "why"
- Look for systemic issues, not just surface symptoms
- The 5th why should point to a fundamental issue (design flaw, missing process, architectural gap)
- Stop early if root cause is found before Why #5

## Phase 3: Solution Generation

Create 3 distinct solutions. For each:

| Field | Description |
|-------|-------------|
| **Description** | What this solves |
| **Effort** | S (10 min) / M (30 min) / L (2+ hours) |
| **Impact** | High / Medium / Low |
| **Risks** | What could go wrong |
| **Steps** | Numbered implementation steps |

## Phase 4: Recommend

Compare solutions on effort vs impact. Recommend the one that:
1. Eliminates the root cause (not just symptoms)
2. Maximum impact with reasonable effort
3. Feasible given current constraints

Present recommendation to user for approval before implementing.

## Phase 5: Implement

For the approved solution:

1. Read relevant files to understand current code
2. Make changes following existing code patterns
3. Run tests/validation for the specific change
4. Commit with message explaining how this fixes the root cause

## Phase 6: Simplify

Invoke the built-in `/simplify` skill on the changes. This launches 3 parallel agents:

1. **Code Reuse Agent** — flags duplicated functionality
2. **Code Quality Agent** — catches redundant state, copy-paste, leaky abstractions
3. **Efficiency Agent** — finds redundant computations, missed concurrency

```
Skill(skill="simplify")
```

Fix any issues found, then re-validate.

## Phase 7: Verify

Launch an independent verification agent to audit the fix:

```
Agent(subagent_type="Explore", prompt="Verify the 5-Whys fix:

Root cause: [from Phase 2]
Fix applied: [from Phase 5]
Files changed: [list]

Verify:
1. All changed files exist and syntax is valid
2. Tests pass (if applicable)
3. The fix actually addresses the root cause (not just a symptom)
4. No regressions introduced
5. No TODO/FIXME stubs left behind

Return: PASS/FAIL per check and overall verdict.")
```

Handle results:
- **ALL VERIFIED** → Proceed to summary
- **PARTIAL/FAILED** → Fix issues, re-run from Phase 6

## Phase 8: Summary

Present final summary:

```
## 5 Whys Summary

**Problem:** [original problem]
**Root Cause (Why #5):** [fundamental issue]
**Fix Applied:** [what was changed]
**Files Modified:** [list]

### Quality Chain
- [x] 5 Whys analysis — root cause: [one line]
- [x] 3 solutions evaluated — selected: [solution name]
- [x] Implementation complete
- [x] Simplify pass — [N] issues found/fixed
- [x] Verify pass — [verdict]

### Preventative Measures
- [what prevents this from recurring]
```

---

## Rules

- Never skip Phases 6-7 (simplify + verify) — they catch issues the implementer misses
- The verify agent MUST be independent (subagent, not inline review)
- If the root cause is found before Why #5, stop early — don't force 5 levels
- Present the recommendation before implementing — user approves the direction
