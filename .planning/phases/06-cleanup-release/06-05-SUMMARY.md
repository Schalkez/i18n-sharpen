# Phase 6 Plan 05 Summary

**Objective**: Finalize release artifacts for `v0.4.0` (CLEAN-02) and configure Git tags without publishing.

**Execution**:
- `README.md` was updated:
  - All programmatic API code blocks were updated to use `await` with the new async API.
  - Added a `Migration to 0.4.0` section to document the API change, the new optional peer dependencies, and the AST engine replacement.
  - Updated the installation section to include optional peer dependencies for `typescript`, `@vue/compiler-sfc`, `svelte`, and `@astrojs/compiler`.
- `CHANGELOG.md` received the `[0.4.0]` BREAKING section detailing the async API, peer deps, and AST engine.
- Bumped version in `package.json` to `0.4.0`.
- The `v0.4.0` annotated git tag was created.

**Status**: COMPLETED
