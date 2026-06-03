---
phase: 06-cleanup-release
plan: 01
status: complete
---

# Plan 01 Summary

**Objective**: Added GAP-01..GAP-08 behavioral tests to `src/__tests__/parsers/typescript.test.ts` to assert that the AST engine matches all `scanTemplateTextNodes` features (attribute extraction, JSX expression string handling, ignoring dynamic attributes, excluding complex JSX logic, excluding comment nodes).

**Results**:
- Added 8 new test cases (`GAP-01` through `GAP-08`) inside the `hardcoded text candidates (PARSE-05 parity)` describe block.
- All new tests passed perfectly against the existing AST parser implementation. No parser fixes were required.
- The full vitest suite passes flawlessly (`pnpm test` and `pnpm tsc --noEmit`).

We are now ready for Wave 1 plans to safely delete `hardcoded.ts` and `hardcoded.test.ts` since the behaviors are fully ported and verified on the AST path.
