# Agent Workflow: Sync with Develop

Use this workflow when the user asks to "pull develop", "update branch", "sync code", or "merge develop into current branch".

## 1. Context

Keeping feature branches up-to-date with `develop` minimizes merge conflicts later. This workflow ensures we pull the latest changes from the remote `develop` and merge them into our working branch.

## 2. Workflow Steps

1.  **Identify Current Branch**:
    ```bash
    CURRENT_BRANCH=$(git branch --show-current)
    ```
2.  **Checkout & Pull Develop**:
    ```bash
    git checkout develop
    git pull origin develop
    ```
3.  **Merge into Feature Branch**:
    ```bash
    git checkout "$CURRENT_BRANCH"
    git merge develop
    ```
4.  **Handle Conflicts**:
    - **If Auto-merge succeeds**: Proceed to step 5.
    - **If Conflicts occur**:
      - Stop.
      - Notify the User: "There are merge conflicts. Please resolve them or let me know how to proceed."
      - **DO NOT** attempt to resolve complex logic conflicts automatically without explicit instruction.
5.  **Push Updates**:
    ```bash
    git push
    ```

## 3. Example Interaction

**User**: "Pull latest develop and merge here."

**Agent**:

1.  Runs `git checkout develop && git pull origin develop`.
2.  Runs `git checkout feature/DIFFAPP-633...`.
3.  Runs `git merge develop`.
4.  Runs `git push`.
5.  Responds: "Synced `develop` into `feature/DIFFAPP-633...` and pushed."
