---
description: CLEANUP MERGED BRANCH
---

# Agent Workflow: Cleanup Merged Branch

Use this workflow when the user says "branch merged", "cleanup old branch", or "switch to develop and pull".

## 1. Context

After a feature branch is merged into `develop` (or `master`) via PR, the local feature branch is no longer needed. We should switch back to the main branch, update it, and delete the old local branch to keep the workspace clean.

## 2. Workflow Steps

1.  **Identify Feature Branch**:
    ```bash
    FEATURE_BRANCH=$(git branch --show-current)
    ```
    _(Or ask user which branch if already on develop)_
2.  **Switch to Main Branch**:
    ```bash
    git checkout develop
    ```
    _(Or `master` depending on project)_
3.  **Pull Latest Changes**:
    ```bash
    git pull origin develop
    ```
    _This fetches the merged code._
4.  **Delete Local Feature Branch**:
    ```bash
    git branch -d "$FEATURE_BRANCH"
    ```
    _Use `-d` (safe delete). If it warns about unmerged changes (rare if PR was squash-merged properly), confirm with `git branch -D` only if sure._
5.  **Confirm**: "Switched to `develop`, pulled latest code, and deleted `$FEATURE_BRANCH`."

## 3. Example Interaction

**User**: "PR is merged. Cleanup."

**Agent**:

1.  Runs `git checkout develop`.
2.  Runs `git pull origin develop`.
3.  Runs `git branch -d feature/DIFFAPP-123-my-feature`.
4.  Responds: "Updated `develop` and deleted local branch `feature/DIFFAPP-123-my-feature`."
