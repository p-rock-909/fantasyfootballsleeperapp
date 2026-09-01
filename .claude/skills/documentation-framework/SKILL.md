---
name: documentation-framework
description: Standards for creating and maintaining project documentation
---

# Documentation Framework Skill

## Overview

This skill provides standards for creating consistent, AI-navigable documentation.

## File Organization

### Feature Documentation
Each feature gets its own directory:
```
features/
└── [feature-name]/
    ├── requirements.md      # User requirements, acceptance criteria
    ├── technical-design.md  # Architecture, APIs, data models
    ├── user-experience.md   # UX flows, visual specs, accessibility
    └── implementation.md    # Implementation notes (optional)
```

### Content Placement Guidelines

| Content Type | Target File | Purpose |
|--------------|-------------|---------|
| User stories | requirements.md | What users need |
| Acceptance criteria | requirements.md | How to verify |
| API contracts | technical-design.md | Interface definitions |
| Data models | technical-design.md | Schema definitions |
| Architecture diagrams | technical-design.md | System design |
| User flows | user-experience.md | Interaction sequences |
| Visual specs | user-experience.md | UI requirements |
| Responsive behavior | user-experience.md | Breakpoint specs |

## Document Templates

### requirements.md
```markdown
# [Feature Name] Requirements

## Overview
[1-2 paragraph description]

## User Stories
- As a [role], I want [goal] so that [benefit]

## Acceptance Criteria
- [ ] [Testable criterion]
- [ ] [Another criterion]

## Constraints
- [Technical or business constraints]

## Out of Scope
- [What this does NOT include]
```

### technical-design.md
```markdown
# [Feature Name] Technical Design

## Architecture Overview
[Description or diagram]

## Components
| Component | Responsibility | Location |
|-----------|----------------|----------|

## Data Model
[TypeScript interfaces or schema]

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|

## Dependencies
- Internal: [modules]
- External: [packages]

## Security Considerations
[Auth, validation, etc.]
```

### user-experience.md
```markdown
# [Feature Name] User Experience

## User Flow
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Visual Specifications

### Desktop (1920x1080)
[Layout description]

### Tablet (768x1024)
[Layout adjustments]

### Mobile (375x667)
[Mobile-specific behavior]

## Accessibility
- WCAG Level: [AA/AAA]
- [Specific requirements]

## Error States
- [Error scenario]: [How to display]
```

## Writing Guidelines

### Be Specific
- ❌ "Make it look nice"
- ✅ "Use 16px font size, #333 color, 1.5 line height"

### Be Testable
- ❌ "Should be fast"
- ✅ "Page load time < 2 seconds on 3G"

### Be Complete
- Include all breakpoints
- Include error states
- Include edge cases

## Section Headers

Use consistent, navigable headers:
```markdown
## Part I: Overview
## Part II: Details
### Section 2.1: Subsection
```

## Cross-Referencing

Link related documents:
```markdown
See [Technical Design](./technical-design.md#api-endpoints)
```
