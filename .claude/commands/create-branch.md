---
description: CREATE BRANCH
---

# Agent Workflow: Create New Branch

Use this workflow when the user asks to "start a new task", "create a branch", or "working on a new ticket".

## 1. Naming Convention

The project follows a standard branch naming convention:
```
<type>/<description>
```

### Components:

- **type**:
  - `feature`: New functionality.
  - `fix`: Bug fixes.
  - `hotfix`: Urgent production fixes.
  - `chore`: Maintenance, config changes.
- **description**: Kebab-case summary of the task (e.g., `hardcoded-string-detection`, `fix-sorting-bug`).

### Examples:

- ✅ `feature/hardcoded-string-detection`
- ✅ `fix/missing-keys-sorting`

## 2. Workflow Steps

1.  **Sync with Base**: Ensure you are on the latest `master` branch.
    ```bash
    git checkout master
    git pull origin master
    ```
2.  **Create Branch**:
    ```bash
    git checkout -b <type>/<description>
    ```
3.  **Confirm**: Notify the user that the branch is created and active.

## 3. Example Interaction

**User**: "Create a branch for hardcoded string detection."

**Agent**:

1.  Identifies Type: `feature` (implied).
2.  Identifies Slug: `hardcoded-string-detection`.
3.  Runs:
    ```bash
    git checkout master
    git pull origin master
    git checkout -b feature/hardcoded-string-detection
    ```
4.  Responds: "Created branch `feature/hardcoded-string-detection` from `master`."
