---
description: CREATE BRANCH
---

# Agent Workflow: Create New Branch

Use this workflow when the user asks to "start a new task", "create a branch", or "working on a new ticket".

## 1. Naming Convention

The project follows a strict naming convention:
`javascript
<type>/DIFFAPP-<ID>-<short-description>
`

### Components:

- **type**:
  - `feature`: New functionality.
  - `fix`: Bug fixes.
  - `hotfix`: Urgent production fixes.
  - `chore`: Maintenance, config changes (optional, but `feature` or `fix` is preferred if it tracks a ticket).
- **ID**: The Jira/Ticket ID (e.g., `633`, `102`). **Always Required**.
  - _If the user doesn't provide an ID, ASK FOR IT._
- **short-description**: Kebab-case summary (e.g., `responsive-grid-system`, `fix-login-error`).

### Examples:

- ✅ `feature/DIFFAPP-633-responsive-grid-system`
- ✅ `fix/DIFFAPP-469-checksum-null-pointer`
- ❌ `feature/responsive-grid` (Missing ID)
- ❌ `DIFFAPP-633` (Missing type)

## 2. Workflow Steps

1.  **Sync with Base**: Ensure you are on the latest `develop` (or `master` if it's a hotfix).
    ```bash
    git checkout develop
    git pull origin develop
    ```
2.  **Create Branch**:
    ```bash
    git checkout -b <type>/DIFFAPP-<ID>-<description>
    ```
3.  **Confirm**: Notify the user that the branch is created and active.

## 3. Example Interaction

**User**: "Create a branch for user profile UI, ticket 700."

**Agent**:

1.  Identifies Type: `feature` (implied).
2.  Identifies ID: `700` (so `DIFFAPP-700`).
3.  Identifies Slug: `user-profile-ui`.
4.  Runs:
    ```bash
    git checkout develop
    git pull origin develop
    git checkout -b feature/DIFFAPP-700-user-profile-ui
    ```
5.  Responds: "Created branch `feature/DIFFAPP-700-user-profile-ui` from `develop`."
