---
name: changelog
description: Standards for maintaining CHANGELOG.md following Keep a Changelog format
---

# Changelog Skill

## Overview

This skill defines standards for maintaining the CHANGELOG.md file following the [Keep a Changelog](https://keepachangelog.com/) format.

## File Location

```
/CHANGELOG.md
```

## Format

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New feature description (#issue-number)

### Changed
- Modified behavior description (#issue-number)

### Deprecated
- Feature that will be removed (#issue-number)

### Removed
- Removed feature description (#issue-number)

### Fixed
- Bug fix description (#issue-number)

### Security
- Security fix description (#issue-number)

## [1.0.0] - 2024-01-15

### Added
- Initial release features
```

## Change Categories

| Category | Use For | Example |
|----------|---------|---------|
| **Added** | New features | "Add user authentication" |
| **Changed** | Changes to existing features | "Update dashboard layout" |
| **Deprecated** | Features to be removed | "Deprecate legacy API" |
| **Removed** | Removed features | "Remove unused endpoints" |
| **Fixed** | Bug fixes | "Fix login redirect loop" |
| **Security** | Security patches | "Patch XSS vulnerability" |

## Writing Good Entries

### DO:
```markdown
### Added
- Add dark mode toggle to settings page (#123)
- Add export to CSV functionality for reports (#124)

### Fixed
- Fix memory leak in WebSocket connection (#125)
- Fix incorrect date formatting in user profile (#126)
```

### DON'T:
```markdown
### Added
- stuff  <!-- Too vague -->
- Fixed things  <!-- Wrong category -->
- WIP feature  <!-- Incomplete work -->
```

## Guidelines

### 1. User-Focused
Write for users, not developers:
- ❌ "Refactor UserService class"
- ✅ "Improve login performance"

### 2. Link Issues
Always reference the issue/PR:
- ✅ "Add search functionality (#42)"
- ❌ "Add search functionality"

### 3. Present Tense
Use imperative present tense:
- ✅ "Add feature"
- ❌ "Added feature"

### 4. One Line Per Change
Keep entries concise:
- ✅ "Add user avatar upload"
- ❌ "Add user avatar upload with support for JPG, PNG, GIF formats, automatic resizing, and cloud storage integration"

### 5. Group Related Changes
```markdown
### Added
- Add user management dashboard
  - User list view
  - User detail view
  - User edit functionality
```

## When to Update

Update CHANGELOG.md when:
- Merging a feature branch
- Releasing a new version
- Making any user-facing change

## Version Numbering

Follow Semantic Versioning:
- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features (backward compatible)
- **PATCH** (1.0.0 → 1.0.1): Bug fixes (backward compatible)

## Release Process

When releasing:

1. Move [Unreleased] items to new version section
2. Add release date
3. Create new empty [Unreleased] section

```markdown
## [Unreleased]

## [1.2.0] - 2024-02-01

### Added
- Features that were in Unreleased
```

## Integration with Zero-Touch Protocol

The Secretary Agent updates CHANGELOG.md:
1. Adds entry under [Unreleased]
2. Uses appropriate category
3. Links to GitHub issue
4. Uses proper formatting
