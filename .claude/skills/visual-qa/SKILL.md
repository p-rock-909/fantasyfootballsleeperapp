---
name: visual-qa
description: Visual testing patterns using Playwright for UI verification
---

# Visual QA Skill

## Overview

This skill defines patterns for visual testing and UI verification using Playwright.

## Breakpoint Standards

| Name | Width | Height | Use Case |
|------|-------|--------|----------|
| Desktop | 1920px | 1080px | Standard desktop |
| Laptop | 1366px | 768px | Small desktop/laptop |
| Tablet | 768px | 1024px | iPad portrait |
| Mobile | 375px | 667px | iPhone SE |
| Mobile Large | 414px | 896px | iPhone 11 Pro Max |

## Screenshot Capture

### Using Playwright MCP
```
Navigate to: [URL]
Set viewport: [width]x[height]
Wait for: [selector or networkidle]
Screenshot: [filename]
```

### Naming Convention
```
[breakpoint]-[feature]-[state].png

Examples:
- desktop-login-default.png
- mobile-login-error.png
- tablet-dashboard-loading.png
```

## Visual Comparison Checklist

### Layout
- [ ] Elements positioned correctly
- [ ] Proper alignment (left, center, right)
- [ ] Correct spacing between elements
- [ ] No overlapping elements
- [ ] Responsive behavior correct

### Typography
- [ ] Correct font family
- [ ] Correct font size
- [ ] Correct font weight
- [ ] Correct line height
- [ ] No text truncation issues
- [ ] Text readable at all sizes

### Colors
- [ ] Correct brand colors used
- [ ] Sufficient contrast ratio (4.5:1 minimum)
- [ ] Consistent color usage
- [ ] No color-only information

### Interactive Elements
- [ ] Buttons styled correctly
- [ ] Hover states present
- [ ] Focus states visible
- [ ] Disabled states clear
- [ ] Click targets large enough (44x44px minimum)

### Images & Icons
- [ ] Images load correctly
- [ ] Correct aspect ratios
- [ ] Alt text present
- [ ] Icons visible and clear
- [ ] No broken images

### Responsive
- [ ] Desktop layout correct
- [ ] Tablet layout adapts properly
- [ ] Mobile layout adapts properly
- [ ] No horizontal scroll on mobile
- [ ] Touch targets appropriate size

## Accessibility Visual Checks

### Color Contrast
Minimum ratios (WCAG AA):
- Normal text: 4.5:1
- Large text (18px+): 3:1
- UI components: 3:1

### Focus Indicators
- Visible focus ring on all interactive elements
- Focus order follows logical sequence
- No focus traps

### Touch Targets
- Minimum 44x44px
- Adequate spacing between targets

## Error State Verification

Check these states for forms:
- Empty state
- Filled state
- Error state
- Success state
- Loading state
- Disabled state

## Common Visual Issues

### Layout Issues
| Issue | Check |
|-------|-------|
| Overflow | Text/elements spilling outside containers |
| Collapse | Empty containers collapsing unexpectedly |
| Overlap | Elements overlapping incorrectly |
| Misalignment | Elements not aligned to grid |

### Typography Issues
| Issue | Check |
|-------|-------|
| Truncation | "..." appearing unexpectedly |
| Wrapping | Text wrapping incorrectly |
| Orphans | Single words on new lines |
| Size | Text too small to read |

### Responsive Issues
| Issue | Check |
|-------|-------|
| Horizontal scroll | Page wider than viewport |
| Touch targets | Buttons too small on mobile |
| Hidden content | Important content off-screen |
| Stacking | Elements stacking incorrectly |

## Integration with user-experience.md

Visual QA compares screenshots against specs in:
```
features/[feature-name]/user-experience.md
```

Reference specific sections:
- Visual Specifications
- Responsive Breakpoints
- Error States
- Accessibility Requirements

## Severity Levels

| Level | Description | Example | Action |
|-------|-------------|---------|--------|
| Critical | Page unusable | Layout completely broken | Block merge |
| High | Major issue | Button invisible | Block merge |
| Medium | Noticeable | Wrong color | Block if 2+ |
| Low | Minor | 1px misalignment | Note only |

## Report Format

```markdown
## Visual QA Report: [Feature Name]

### Screenshots
- desktop-[feature].png: [PASS/FAIL]
- tablet-[feature].png: [PASS/FAIL]
- mobile-[feature].png: [PASS/FAIL]

### Issues Found
1. [SEVERITY] [Description]
   - Expected: [what spec says]
   - Actual: [what screenshot shows]
   - Screenshot: [filename]
   - Spec reference: user-experience.md line [X]

### Verdict
[VISUAL_APPROVE / VISUAL_REJECT]
```
