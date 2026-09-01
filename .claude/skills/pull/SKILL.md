---
name: pull
description: >
  Safely syncs the local branch to origin/main with zero data loss — stashes
  uncommitted changes, fetches, rebases, and restores. Use when "pull latest",
  "sync to main", "get latest changes", "pull from main", "update my local",
  "git pull", "sync repo".
allowed-tools: [Bash]
---

# Pull Skill — Safe Sync to Main

## Purpose

Fetch and rebase onto origin/main without losing uncommitted changes, stashes,
or local commits. Single job: sync cleanly. Branch cleanup is out of scope.

---

## Instructions

Execute all steps in sequence. Do NOT skip steps.

### STEP 1: Snapshot Current State

Run in parallel:

```bash
git branch --show-current
git status --porcelain
git stash list
git log --oneline -5
```

Check for detached HEAD:
```bash
git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED"
```

**If detached HEAD:** Stop. Tell the user they're in detached HEAD state and must
checkout a branch before pulling. Do not continue.

Report:
```
Branch:        [name]
Working tree:  [clean | N modified/untracked]
Stashes:       [N] ([labels or "none"])
HEAD:          [hash] [message]
```

### STEP 2: Handle Uncommitted Changes

**If working tree is clean → skip to STEP 3.**

If dirty (modified, staged, or untracked files):

```bash
git status --short
```

Present options — best-guess first:
```
Uncommitted changes detected.
Proposed: stash them as "pull-safety-[timestamp]", restore after pull.
Alternatives: (a) commit first with /push  (b) abort

Proceed with stash? [yes / commit first / abort]
```

On approval:
```bash
git stash push -m "pull-safety-$(date +%Y-%m-%d-%H%M)"
```

**NEVER `git stash` without `-m` label — unlabeled stashes are orphaned work.**

### STEP 3: Fetch + Rebase

```bash
git fetch origin
git rebase origin/main
```

This works identically whether you're on `main` or a feature branch — your local
commits replay cleanly on top of the updated upstream. Report how many commits
were pulled: `git log ORIG_HEAD..HEAD --oneline` after a successful rebase.

**If git rebase exits with conflicts → go to STEP 4.**
**If rebase succeeds cleanly → skip to STEP 5.**

### STEP 4: Handle Rebase Conflicts

```bash
git status --porcelain   # show conflicted files
```

Surface to user:
```
Rebase conflict in: [files]
Options:
  (a) Pause — resolve conflicts manually, then: git rebase --continue
  (b) Abort — restore to pre-pull state: git rebase --abort
  (c) Skip this commit (use carefully — discards your local change)
```

**NEVER auto-resolve conflicts. Always surface to the user.**

If user chooses abort:
```bash
git rebase --abort
```

Then restore stash if one was created in STEP 2:
```bash
git stash pop
```

Report: "Pull aborted. Working tree restored to pre-pull state."
Stop here.

### STEP 5: Restore Stashed Changes

**If nothing was stashed in STEP 2 → skip.**

```bash
git stash pop
```

If pop succeeds:
```
✅ Stash restored — your changes are back on top of the updated branch.
```

If pop produces conflicts:
```bash
git status --short
```

Tell the user:
```
Stash restored with conflicts in: [files]
Resolve manually, then: git add [file] && git stash drop
```

**NEVER auto-resolve stash conflicts.**

### Final Report (inline — no separate step)

After STEP 5 (or STEP 3 if no stash), output:

```
✅ Pull complete
Branch:       [name]  
HEAD:         [hash] [message]
Pulled:       [N commits from origin/main, or "already up to date"]
Working tree: [clean | conflicts to resolve]
Stashes:      [N remaining]
```
