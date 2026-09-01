---
name: implement
description: >
  Senior engineer implementation workflow — plan review, implement, simplify,
  verify, PR fix. Full chain: /plan-review → implement → /simplify → /verify → /pr-fix.
  Use when "implement this", "build this feature", "code this up", "make this work",
  or any feature implementation request.
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Agent]
---

# Implement Skill — Full-Chain Senior Engineer Workflow

## Purpose

You are a senior engineer that never cuts corners and has high attention to detail with the perfect balance of speed and accuracy. This skill chains 5 phases end-to-end:

1. **Plan Review** — Independent subagent stress-tests the design before code is written
2. **Implement** — Write code incorporating plan review feedback
3. **Simplify** — Clean up for reuse, quality, and efficiency
4. **Verify** — Independent subagent audits the work
5. **PR Fix** — Address CI/bot review feedback until PR is clean

Each phase gates the next. If a phase finds issues, fix them before proceeding.

## When to Activate

- "implement this", "build this feature", "code this up", "make this work"
- Any request to build, create, or implement a feature or fix
- When the user provides a specific task that requires code changes

---

## Protocol

### PHASE 1: PLAN — Analyze & Review (Subagent)

#### STEP 1.0: Analyze the Task

Before touching code, think through:

1. **What does "done" look like?** — Define clear success criteria
2. **What files will change?** — Scope the blast radius
3. **Are there existing patterns?** — Search for similar implementations in the codebase
4. **What could break?** — Identify risks and edge cases

Write a brief implementation plan (markdown, inline or temp file) covering:
- Problem statement
- Proposed approach
- Files to create/modify
- Dependencies and integration points
- Testing strategy

#### STEP 1.1: Plan Review (Subagent — MANDATORY)

Launch an independent Plan subagent to review the implementation plan. The main agent
MUST NOT review its own plan — that defeats the purpose.

```
Agent(subagent_type="Plan", prompt="Run /plan-review on this implementation plan:

[paste the plan from Step 1.0]

Read memory-bank/scout-temp.md for project context if available.
Provide your verdict: SHIP IT / SHIP WITH FIXES / NEEDS REWORK / STOP.")
```

#### STEP 1.2: Incorporate Feedback

Review the subagent's findings:
- **SHIP IT** → Proceed to Phase 2
- **SHIP WITH FIXES** → Apply the recommended fixes to the plan, then proceed
- **NEEDS REWORK** → Rework the plan and re-run Step 1.1
- **STOP** → Present findings to user and ask for direction

**Do NOT filter or soften the subagent's review.** Present it to the user as-is. If the
main agent disagrees with a finding, note the disagreement separately.

---

### PHASE 2: IMPLEMENT — Write the Code

#### STEP 2.0: Load Context

```
Read: CLAUDE.md                                      # Development workflow
Read: memory-bank/startHere.md                       # Project context (if exists)
```

#### STEP 2.1: Document First (New Features Only)

**Skip for bug fixes** unless documenting a learning from the bug.

For new features, create documentation in memory-bank:

1. Create feature directory: `memory-bank/features/[feature-name]/`
2. Write `requirements.md` — what it does and why
3. Write `technical-design.md` — how it works
4. Update `startHere.md` navigation if adding a new section

#### STEP 2.2: Create Feature Branch

```bash
# Verify not on main
[[ "$(git branch --show-current)" == "main" ]] && echo "On main — creating branch..."

# Create branch following naming conventions
git checkout main && git pull origin main
git checkout -b feature/[issue-number]-[description]
```

#### STEP 2.3: Write Code

Implement the solution, incorporating all accepted plan review feedback:

1. **Match existing code style** — use patterns from similar files
2. **Write tests** for all new components
3. **Handle edge cases** — empty states, errors, invalid input
4. **Keep it simple** — don't over-engineer
5. **Apply plan review fixes** — address every SHIP WITH FIXES item

#### STEP 2.4: Validate

Run the full validation suite:

```bash
npm test && npm run lint && npm run build
```

All three must pass. Fix any failures before proceeding.

---

### PHASE 3: SIMPLIFY — Code Quality Pass (Built-in /simplify)

Invoke the built-in `/simplify` skill. This launches **3 parallel Agent subagents**:

1. **Code Reuse Agent** — Searches for existing utilities that replace newly written code,
   flags duplicated functionality, finds inline logic that should use existing helpers
2. **Code Quality Agent** — Catches redundant state, parameter sprawl, copy-paste patterns,
   leaky abstractions, stringly-typed code, unnecessary JSX nesting
3. **Efficiency Agent** — Finds redundant computations, missed concurrency, hot-path bloat,
   TOCTOU anti-patterns, memory leaks, overly broad operations

All three run in parallel on the full diff, then findings are aggregated and fixed directly.

```
Skill(skill="simplify")
```

After `/simplify` completes, re-validate:

```bash
npm test && npm run lint && npm run build
```

---

### PHASE 4: VERIFY — Independent Audit (Subagent)

Launch an independent Explore subagent to verify the work. The builder (main agent)
MUST NOT verify its own work — that's inherently biased.

```
Agent(subagent_type="Explore", prompt="Run /verify on the implementation.

Branch: [current branch name]
What was implemented: [summary of changes]
Files changed: [list from git diff --name-only]

Verify:
1. All changed files exist and imports resolve
2. Build passes: npm test && npm run lint && npm run build
3. Functional check — does the feature actually work as claimed?
4. Completeness — any TODO/FIXME/stubs left behind?
5. Architecture quality — maintainable, robust, consistent with codebase?

Return a verification report with PASS/FAIL per check and overall verdict:
ALL VERIFIED / PARTIAL / FAILED")
```

#### STEP 4.1: Handle Verification Results

- **ALL VERIFIED** → Proceed to Phase 5
- **PARTIAL** → Fix the failing items, re-run verification
- **FAILED** → Fix critical issues, re-run from Phase 3 (simplify + verify)

---

### PHASE 5: SHIP — Commit, PR, and Fix

#### STEP 5.1: Security Check

```bash
git diff --cached | grep -E "(AIzaSy[A-Za-z0-9_-]{33}|sk-[A-Za-z0-9]{32,})" && echo "API key detected!" && exit 1
```

#### STEP 5.2: Commit and Push

```bash
git add [specific files]
git commit -m "feat: [description] (fixes #[issue])

Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin [branch-name]
```

#### STEP 5.3: Create PR

```bash
gh pr create --title "[title]" --body "$(cat <<'EOF'
## Summary
- [changes]

## Test Plan
- [how to verify]

## Quality Chain
- [x] Plan review (subagent) — verdict: [SHIP IT/SHIP WITH FIXES]
- [x] Implementation with plan review fixes applied
- [x] Simplify pass — [N] issues found and fixed
- [x] Verify (subagent) — verdict: [ALL VERIFIED/PARTIAL]
- [ ] PR fix — awaiting CI/bot review

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

#### STEP 5.4: PR Fix Loop

Run the /pr-fix protocol:

1. **Poll** for CI/bot review completion (15s intervals, max 20 attempts)
2. **Read** bot feedback from PR comments
3. **Accept/Reject** each issue with rationale
4. **Implement** accepted fixes
5. **Commit and push** fix commit
6. **Repeat** until bot approves, same feedback 3x, or 10 fix cycles

---

## Rules

- **Memory-bank docs ONLY for new features** — not bug fixes or small changes
- **Never skip tests** — all new code must have test coverage
- **Never skip security check** — run before every commit
- **Follow existing patterns** — don't introduce new patterns without reason
- **One concern per commit** — don't mix unrelated changes
- **Subagents are mandatory** — plan-review and verify MUST run as independent agents
- **Each phase gates the next** — don't skip ahead on failures
- **Use built-in /simplify** — invokes 3 parallel review agents, do NOT reimplement inline

## Phase Skip Rules

For **small bug fixes** (< 20 lines changed):
- Skip Phase 1 (plan review) — go straight to implement
- Skip Step 2.1 (documentation)
- All other phases still run

For **documentation-only changes**:
- Skip all phases — commit directly to main per git-workflow.md
