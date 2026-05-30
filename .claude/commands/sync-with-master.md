# Agent Workflow: Sync with Master

Use this workflow when the user asks to "pull master", "update branch", "sync code", or "merge master into current branch".

## 1. Context

Keeping feature branches up-to-date with `master` minimizes merge conflicts later. This workflow ensures we pull the latest changes from the remote `master` and merge them into our working branch.

## 2. Workflow Steps

1.  **Identify Current Branch**:
    ```bash
    CURRENT_BRANCH=$(git branch --show-current)
    ```
2.  **Checkout & Pull Master**:
    ```bash
    git checkout master
    git pull origin master
    ```
3.  **Merge into Feature Branch**:
    ```bash
    git checkout "$CURRENT_BRANCH"
    git merge master
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

**User**: "Pull latest master and merge here."

**Agent**:

1.  Runs `git checkout master && git pull origin master`.
2.  Runs `git checkout feature/hardcoded-string-detection`.
3.  Runs `git merge master`.
4.  Runs `git push`.
5.  Responds: "Synced `master` into `feature/hardcoded-string-detection` and pushed."
