---
name: memory-bank
description: How to navigate and update the memory-bank documentation system
---

# Memory-Bank Navigation Skill

## Overview

The memory-bank is the project's persistent knowledge store. It contains business context, technical decisions, and project state that survives across sessions.

## Directory Structure

```
memory-bank/
├── startHere.md          # Navigation hub - START HERE
├── projectbrief.md       # Business goals and priorities
├── activeContext.md      # Current focus and recent work
├── progress.md           # Milestone tracking
├── techContext.md        # Technical decisions and patterns
├── systemPatterns.md     # Architecture patterns
└── guides/
    ├── memory-bank-rules.md
    └── documentation-framework.md
```

## Navigation Protocol

### Always Start Here
Before any task, read `memory-bank/startHere.md` to understand:
- Current project context
- Active priorities
- Quick reference paths

### Task-Specific Paths

| Task Type | Read First | Then Read |
|-----------|------------|-----------|
| New feature | projectbrief.md | activeContext.md |
| Bug fix | activeContext.md | techContext.md |
| Architecture | systemPatterns.md | techContext.md |
| Documentation | guides/ | activeContext.md |

## Update Protocol

### When to Update
- After completing significant work
- When discovering new patterns
- When priorities change
- When user requests "update memory bank"

### How to Update

1. **activeContext.md** - Update for any work session changes
2. **progress.md** - Update for milestone completions
3. **techContext.md** - Update for technical decisions
4. **projectbrief.md** - Rarely update (core business goals)

### Update Format
Use consistent section headers:
```markdown
## Section Name
- **Date:** YYYY-MM-DD
- **Change:** Brief description
```

## File Size Guidelines

| Status | Lines | Action |
|--------|-------|--------|
| 🟢 Good | <400 | Normal operation |
| 🟡 Warning | 400-600 | Consider splitting |
| 🔴 Critical | >600 | Must refactor |

## Cross-References

Always link related content:
```markdown
See [Related Topic](./other-file.md#section)
```

## Integration with Zero-Touch Protocol

The memory-bank provides context for:
- **Roadmap Agent:** projectbrief.md for priorities
- **Strategist:** activeContext.md for current state
- **Secretary:** Updates activeContext.md on completion
