---
description: Commit and push changes to existing PR (no new PR creation)
---

# Commit and Push Workflow

**Use this workflow when:**

- Making fixes to an existing PR
- Adding small improvements to current branch
- No need to create a new PR

**DO NOT use this for:**

- Creating new PRs (use `COMMIT_AND_PR_WORKFLOW.md` instead)

---

## Workflow Steps

### 1. Pre-Check & Validation

**Agent must verify:**

- [ ] Current branch is NOT `master`
- [ ] Changes are staged or ready to commit

**Run checks BEFORE any git commands:**

- [ ] Build passes: `pnpm build` (**capture/save output**, at least last 10-15 lines)
- [ ] Lint passes: `pnpm lint`
- [ ] Tests pass: `pnpm test`

### 2. Commit Changes

**Semantic commit message:**

```bash
git add -A
git commit -m "<type>: <description>

<optional body>"
```

**Commit types:** `feat`, `fix`, `refactor`, `style`, `test`, `docs`, `chore`

**Example:**

```bash
git commit -m "fix: resolve tag attributes parsing issue

- Fixed regex to handle multiple attributes correctly
- Added unit tests for empty attribute values"
```

### 3. Push to Remote

**Regular push (NEVER force push):**

```bash
git push
```

**If branch has no upstream:**

```bash
git push --set-upstream origin <branch-name>
```

---

## Agent Checklist

- [ ] Verified not on `master`
- [ ] Ran `pnpm lint` - 0 errors
- [ ] Ran `pnpm test` - all passing
- [ ] Created semantic commit message
- [ ] Pushed with regular `git push` (NO force push)
- [ ] Confirmed push successful

---

## Example Interaction

**USER:** "fix cái bug và push lên"

**AGENT:**

```bash
# 1. Check current branch
git branch --show-current
# Output: feature/hardcoded-string-detection

# 2. Run pre-checks
pnpm lint
# ✅ 0 errors

# 3. Commit
git add -A
git commit -m "fix: resolve tag attributes parsing issue"

# 4. Push
git push
# ✅ Pushed successfully
```

**AGENT:** "✅ Changes committed and pushed to `feature/hardcoded-string-detection`"

---

## Safety Rules

❌ **NEVER:**

- Force push (`git push --force` or `--force-with-lease`)
- Push to `master` directly
- Skip lint/test checks

✅ **ALWAYS:**

- Use semantic commit messages
- Run pre-checks before commit
- Use regular `git push`
