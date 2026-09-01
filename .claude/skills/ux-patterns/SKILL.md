---
name: ux-patterns
description: Common UX patterns and design guidelines
---

# UX Patterns Skill

## Overview

This skill provides common UX patterns and design guidelines for consistent user experiences.

## Core Principles

### 1. Clarity Over Cleverness
- Users should understand immediately what to do
- Avoid jargon and technical terms
- Use familiar patterns

### 2. Feedback Always
- Every action should have visible feedback
- Loading states for async operations
- Success/error messages for submissions

### 3. Forgiveness
- Allow undo where possible
- Confirm destructive actions
- Provide clear error recovery

### 4. Consistency
- Same action = same result everywhere
- Consistent placement of common elements
- Predictable behavior

## Common Patterns

### Navigation

#### Primary Navigation
```
┌────────────────────────────────────────┐
│ Logo    Nav1  Nav2  Nav3    [Profile] │
└────────────────────────────────────────┘
```
- Horizontal top bar for primary nav
- Logo always links to home
- Profile/account in top right

#### Mobile Navigation
```
┌─────────────────────────────────────┐
│ [☰]  Logo              [Profile]   │
└─────────────────────────────────────┘
```
- Hamburger menu on left
- Slide-out drawer pattern
- Bottom tab bar for key actions

### Forms

#### Field Layout
```
Label
┌─────────────────────────────┐
│ Placeholder text            │
└─────────────────────────────┘
Helper text or error message
```

#### Validation
- Validate on blur, not on type
- Show errors inline below field
- Use red for errors, green for success
- Keep error messages specific and helpful

#### Submit Buttons
- Clear action label ("Save", not "Submit")
- Disabled while invalid
- Loading state while processing
- Success confirmation after completion

### Feedback

#### Loading States
```
Skeleton loaders for content areas
Spinners for buttons/small areas
Progress bars for known duration
```

#### Toast Notifications
- Bottom center or top right
- Auto-dismiss after 3-5 seconds
- Allow manual dismiss
- Different colors for success/error/info

#### Empty States
```
┌─────────────────────────────────────┐
│                                     │
│           [Illustration]            │
│                                     │
│        No items yet                 │
│   Get started by adding your first │
│                                     │
│        [Primary Action]             │
│                                     │
└─────────────────────────────────────┘
```

### Modals & Dialogs

#### Confirmation Dialog
```
┌─────────────────────────────────────┐
│ Delete item?                    [X] │
├─────────────────────────────────────┤
│                                     │
│ This action cannot be undone.       │
│                                     │
├─────────────────────────────────────┤
│            [Cancel] [Delete]        │
└─────────────────────────────────────┘
```
- Clear title stating action
- Explain consequences
- Destructive action on right, styled as danger
- Cancel always available

### Tables & Lists

#### Data Table
```
┌──────┬───────────┬─────────┬────────┐
│ ☐    │ Name ↑    │ Status  │ Action │
├──────┼───────────┼─────────┼────────┤
│ ☐    │ Item 1    │ Active  │ [Edit] │
│ ☐    │ Item 2    │ Draft   │ [Edit] │
└──────┴───────────┴─────────┴────────┘
```
- Sortable columns with indicators
- Bulk selection with checkbox
- Row-level actions
- Pagination or infinite scroll

### Cards

#### Content Card
```
┌─────────────────────────────────────┐
│ [Image]                             │
├─────────────────────────────────────┤
│ Title                               │
│ Description text that may wrap      │
│ to multiple lines...                │
├─────────────────────────────────────┤
│ [Action 1]        [Action 2]        │
└─────────────────────────────────────┘
```

## Responsive Patterns

### Desktop → Mobile

| Desktop | Mobile |
|---------|--------|
| Side navigation | Bottom tabs or hamburger |
| Multi-column | Single column |
| Hover states | Tap states |
| Right-click menus | Long-press or explicit buttons |
| Tables | Cards or simplified view |

### Touch Considerations
- Minimum touch target: 44x44px
- Adequate spacing between targets
- No hover-dependent information
- Swipe gestures for common actions

## Accessibility Patterns

### Focus Management
- Visible focus indicators
- Logical tab order
- Focus trap in modals
- Return focus after modal close

### Screen Reader
- Proper heading hierarchy (h1 → h2 → h3)
- Alt text for images
- ARIA labels for icons
- Announce dynamic content changes

### Keyboard Navigation
- All functionality keyboard accessible
- Escape to close modals
- Enter to submit forms
- Arrow keys for menus/lists

## Error Handling

### Error Messages
- Be specific ("Email is required" not "Invalid input")
- Suggest solution ("Enter a valid email like name@example.com")
- Don't blame user ("Please check your email" not "You entered wrong email")

### Error Recovery
- Don't clear form on error
- Focus first error field
- Scroll error into view
- Allow retry without re-entering data

## Performance UX

### Perceived Performance
- Show skeleton loaders immediately
- Optimistic updates for actions
- Progress indicators for long operations
- Background processing with notifications

### Actual Performance
- Lazy load below-fold content
- Infinite scroll vs pagination
- Debounce search inputs
- Cache frequently accessed data
