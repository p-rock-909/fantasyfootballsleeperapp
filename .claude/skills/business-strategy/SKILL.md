---
name: business-strategy
description: Business alignment and strategic decision-making framework
---

# Business Strategy Skill

## Overview

This skill provides frameworks for aligning technical work with business objectives.

## Strategic Alignment Framework

### Priority Matrix

| | High Impact | Low Impact |
|--|------------|-----------|
| **Low Effort** | DO FIRST | Do if time |
| **High Effort** | Schedule | DON'T DO |

### ROI Calculation

```
ROI = (Value Generated - Cost) / Cost × 100%

Value Generated:
- Revenue increase ($/month)
- Time saved (hours/week × hourly rate)
- Cost avoided ($/month)

Cost:
- Development time (hours × rate)
- Ongoing maintenance (hours/month × rate)
- Infrastructure ($/month)
```

### Minimum Viable ROI
- Revenue features: >$500/month
- Time-saving features: >2 hours/week
- Cost-avoidance features: >$200/month

## Business Context Files

### projectbrief.md
Primary source for business priorities:
- Company/product goals
- Target audience
- Key metrics
- Current quarter priorities

### activeContext.md
Current state and focus:
- Active projects
- Recent decisions
- Immediate priorities

## Decision Framework

### Feature Evaluation Questions

1. **Strategic Fit**
   - Does this align with stated business goals?
   - Does this serve our target audience?
   - Does this support key metrics?

2. **Resource Justification**
   - What's the development cost?
   - What's the opportunity cost?
   - What's the maintenance burden?

3. **Risk Assessment**
   - What could go wrong?
   - What's the blast radius?
   - Is this reversible?

4. **Timing**
   - Why now?
   - What's blocking this?
   - What does this enable?

### Decision Template

```markdown
## Feature Decision: [Name]

### Strategic Alignment
- Business goal served: [cite projectbrief.md]
- Target user: [who benefits]
- Key metric impacted: [which metric, how]

### ROI Analysis
- Expected value: $[X]/month or [Y] hours/week saved
- Development cost: [Z] hours
- Maintenance cost: [W] hours/month
- Break-even: [timeframe]

### Risk Assessment
- Risks: [list]
- Mitigations: [list]
- Reversibility: [easy/medium/hard]

### Recommendation
[BUILD / DEFER / REJECT]

### Rationale
[2-3 sentences explaining decision]
```

## Priority Levels

### P0: Critical
- Blocking revenue
- Security issue
- Production down
- **Action:** Drop everything

### P1: High
- Direct revenue impact
- Major user pain point
- Strategic initiative
- **Action:** This sprint

### P2: Medium
- Indirect revenue impact
- Nice-to-have improvement
- Technical debt with clear cost
- **Action:** Next sprint

### P3: Low
- Polish
- Edge cases
- Speculative value
- **Action:** Backlog

## Stakeholder Communication

### Status Update Template
```markdown
## [Feature] Status Update

**Status:** [On Track / At Risk / Blocked]
**Progress:** [X]% complete
**ETA:** [date]

### Completed
- [What's done]

### In Progress
- [What's being worked on]

### Blockers
- [What's blocking, who can help]

### Next Steps
- [What's next]
```

### Escalation Criteria
Escalate when:
- Blocked for >2 days
- Scope increased >50%
- Timeline at risk
- New risks discovered
- Dependencies failed

## Metrics That Matter

### Business Metrics
- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Lifetime Value (LTV)
- Churn rate
- Net Promoter Score (NPS)

### Product Metrics
- Daily/Monthly Active Users (DAU/MAU)
- Feature adoption rate
- Time to value
- Support ticket volume
- Error rate

### Engineering Metrics
- Deployment frequency
- Lead time for changes
- Mean time to recovery
- Change failure rate

## Integration with Zero-Touch Protocol

This skill is used by:
- **Roadmap Agent:** To evaluate feature ROI
- **Strategist:** To validate alignment
- **Secretary:** To communicate status

Always reference `memory-bank/projectbrief.md` for current business context.
