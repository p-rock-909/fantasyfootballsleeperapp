---
name: anti-rat-race
description: Enforces business philosophy - build less, earn more, work smarter. Prevents bloatware and low-ROI features.
---

# Anti-Rat Race Skill

## Overview

This skill enforces the core business philosophy: **build less, earn more, work smarter**. It prevents the creation of bloatware and ensures every feature delivers real value.

## Core Principles

### 1. Revenue Per Hour > Features Per Week

The goal is NOT to build more features. The goal is to:
- Build features that make money
- Build features that save time
- Avoid features that add complexity without ROI

**Metric:** Revenue generated or time saved per feature, not feature count.

### 2. Operational Load Test

Every feature must REDUCE operational load, not increase it.

Questions to ask:
- Will this require ongoing maintenance?
- Does this add complexity to the system?
- Will this create support burden?
- Does this simplify or complicate the user experience?

**Rule:** If it adds maintenance burden without clear ROI, REJECT it.

### 3. The "Hell Yes" Test

- If it's not a "Hell Yes," it's a "No"
- Mediocre features are worse than no features
- Quality over quantity, always
- One great feature beats five okay features

### 4. YAGNI (You Aren't Gonna Need It)

- Don't build for hypothetical future requirements
- Don't add configurability "just in case"
- Don't abstract until you have 3+ use cases
- Don't optimize until you have measured performance problems

## ROI Gate Questions

Before building ANY feature, answer ALL of these:

| Question | Required Answer |
|----------|-----------------|
| Will this increase revenue by >$500/month? | YES |
| OR will this save >2 hours/week? | YES |
| Does this align with stated business priorities? | YES |
| Does this REDUCE operational complexity? | YES |
| Is this a NEED, not a "nice-to-have"? | YES |

**If ANY answer is NO → Don't build it.**

## Bloatware Detection

### Red Flag Phrases

When you hear these, the feature is probably bloatware:

| Phrase | Translation | Action |
|--------|-------------|--------|
| "It would be nice to have..." | Nice ≠ Necessary | REJECT |
| "Other apps have this..." | Feature parity ≠ Value | REJECT |
| "We might need this later..." | YAGNI violation | REJECT |
| "It's easy to add..." | Easy ≠ Valuable | REJECT |
| "Just a small tweak..." | Scope creep | QUESTION |
| "While we're at it..." | Scope creep | REJECT |
| "Can we also..." | Scope creep | REJECT |
| "Users might want..." | Speculation | REJECT |

### Bloatware Characteristics

- Adds options/settings nobody will use
- Solves problems users don't have
- Requires explanation to understand value
- Adds UI complexity
- Requires ongoing maintenance
- Duplicates existing functionality

## When to SLEEP Instead of BUILD

The Roadmap Agent should output SLEEP when:

1. **No items pass ROI gate**
   - Everything in backlog is nice-to-have
   - Nothing moves revenue or saves time

2. **Context is stale**
   - Memory-bank hasn't been updated in >14 days
   - Business priorities may have changed

3. **Current sprint is full**
   - Active work in progress
   - Adding more creates context switching

4. **Strategic clarity needed**
   - Unclear which direction to go
   - Multiple competing priorities

### SLEEP Output Format
```
SLEEP: No high-value work found.
Reason: [Specific reason from above]
Recommendation: [What would unblock - e.g., "Update projectbrief.md with Q4 priorities"]
Next Check: [When to re-evaluate]
```

## Value Assessment Framework

### Tier 1: Build Immediately
- Directly generates revenue
- Saves >4 hours/week
- Removes critical blocker
- Customer is waiting and paying

### Tier 2: Build Soon
- Indirectly supports revenue
- Saves 2-4 hours/week
- Improves key metric significantly
- Multiple users requesting

### Tier 3: Build Maybe
- Saves 1-2 hours/week
- Improves UX moderately
- Single user requesting
- **Requires strong justification**

### Tier 4: Don't Build
- Nice to have
- Saves <1 hour/week
- No clear ROI
- Speculative value

## Integration with Zero-Touch Protocol

This skill is loaded by:
- **Roadmap Agent:** To evaluate what to build
- **Strategist:** To validate feature alignment
- **QA Agent:** To reject scope creep

## Mantras

1. **"Will this make money or save time?"** - If no, don't build it.
2. **"What's the cost of NOT building this?"** - If low, don't build it.
3. **"Is this essential or just nice?"** - If nice, don't build it.
4. **"Am I building this because I should or because I can?"** - If "can," stop.
