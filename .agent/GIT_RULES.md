# Git Workflow Rules

## Branch Protection

### ❌ **NEVER Force Push**

- **DO NOT** use `git push --force` or `git push --force-with-lease`
- Force pushing rewrites history and can cause issues for collaborators
- If you need to clean up commits, use interactive rebase BEFORE the first push

### ✅ **Acceptable Practices**

- Regular `git push` for new commits
- `git rebase -i` locally before pushing
- Squash commits during PR merge (via GitHub UI)

### 🔄 **If You Need to Rewrite History**

1. **Before first push**: Use `git rebase -i` freely
2. **After push**:
   - Create a new commit instead
   - Or close PR and create a new one
   - **NEVER** force push to existing PR

## Commit Message Format

Follow conventional commits:

```
<type>: <description>

<body>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `style`: Formatting, styling
- `test`: Adding tests
- `docs`: Documentation
- `chore`: Maintenance

## PR Workflow

1. **Create feature branch** from `master`
2. **Make commits** with clear messages
3. **Run pre-checks**: `pnpm lint && pnpm test`
4. **Push to remote**: `git push`
5. **Create PR** via `gh pr create` or GitHub UI
6. **Squash merge** when merging to `master`

## Branch Naming

Format: `<type>/<description>`

Examples:

- `feature/hardcoded-string-detection`
- `fix/cancel-commit-quota-bug`
- `refactor/cleanup-constants`
