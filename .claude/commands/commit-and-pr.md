---
description: COMMIT AND PR WORKFLOW
---

# Agent Workflow: Commit, Build, Test, and PR

Use this workflow when the user asks to "finalize", "push", or "create a PR" for the current changes.

## 1. Pre-Check & Validation

Before committing, ensure the codebase is healthy.

- **Lint**: Run `pnpm lint`.
- **Test**: Run `pnpm test`.

## 2. Commit on Feature Branch

Commit all changes on the current feature branch.

- **Check Status**: `git status` to see what changed.
- **Stage**: `git add .` (or specific files).
- **Commit**: Use a semantic commit message (e.g., `feat: ...`, `fix: ...`, `refactor: ...`).

## 3. Merge to Master & Build (Local Verification)

**Critical**: This step verifies the merge will succeed on `master` by actually merging and building locally.

**Command Sequence:**

```bash
# Save current branch
CURRENT_BRANCH=$(git branch --show-current)

# Checkout master and merge
git checkout master
git merge --no-ff "$CURRENT_BRANCH"

# Run build and capture output
pnpm build > build.log 2>&1
BUILD_EXIT_CODE=$?

# Capture last 10 lines of build output
BUILD_OUTPUT=$(tail -n 10 build.log)

# Capture diff stats (last 10 lines)
DIFF_PREVIEW=$(git diff HEAD~1 --stat | tail -n 10)
```

**Now branch based on build result:**

### ✅ If Build Succeeds (`$BUILD_EXIT_CODE == 0`)

```bash
# Reset master to previous state
git reset --hard HEAD~1

# Return to feature branch
git checkout "$CURRENT_BRANCH"

# Push feature branch to remote
git push
# Or: git push -u origin "$CURRENT_BRANCH" (if first push)

# Proceed to Step 4 (Create PR)
```

### ❌ If Build Fails (`$BUILD_EXIT_CODE != 0`)

```bash
# Reset master to previous state
git reset --hard HEAD~1

# Return to feature branch
git checkout "$CURRENT_BRANCH"

# Display error to user
echo "❌ Build failed after merge. Please fix the issues and try again."
echo "Build output:"
cat build.log

# DO NOT create PR
# Agent should wait for user to fix issues, then restart from Step 1
```

## 4. Create Pull Request (via GitHub CLI)

**Only proceed here if build succeeded in Step 3.**

Use the `gh` CLI to create the PR efficiently.

**PR Title Convention:**

- Title format: `<type>: <description>` (e.g. `feat: add hardcoded string scanner`)

**Command Template:**

```bash
BRANCH_NAME=$(git branch --show-current)
TITLE="<type>: <Semantic Description>"

gh pr create \
  --base master \
  --head "$BRANCH_NAME" \
  --title "$TITLE" \
  --body "## Description
<Brief summary of changes>

## Files Changed (Preview)
\`\`\`
$DIFF_PREVIEW
\`\`\`

## Build Output
\`\`\`
$BUILD_OUTPUT
\`\`\`"
```

---

## Workflow Checklist for Agent

### Pre-Flight

1.  [ ] Did I run pre-checks (lint + test) and verify they passed?
2.  [ ] Did I commit changes on the feature branch with a semantic message?

### Build Verification

3.  [ ] Did I merge to master locally?
4.  [ ] Did I run `pnpm build` and capture the exit code?
5.  [ ] Did I capture diff stats and build output (last 10 lines)?

### Conditional Branch

6.  [ ] **If build succeeded**: Did I reset master, push feature branch, and create PR?
7.  [ ] **If build failed**: Did I reset master, return to feature branch, and inform user?

---

## Example Interaction

**User**: "OK, push this and create a PR."

**Agent (Success Path)**:

1. ✅ Runs `pnpm lint` and `pnpm test` → All pass
2. ✅ Commits changes: `git commit -m "feat: add hardcoded string scanner"`
3. ✅ Merges to master: `git checkout master && git merge --no-ff feature/hardcoded-string-detection`
4. ✅ Builds: `pnpm build` → Success (exit code 0)
5. ✅ Captures diff stats and build output
6. ✅ Resets master: `git reset --hard HEAD~1`
7. ✅ Returns to feature branch: `git checkout feature/hardcoded-string-detection`
8. ✅ Pushes: `git push`
9. ✅ Creates PR: `gh pr create` with diff and build output
10. ✅ Responds: "PR created successfully: [link]"
