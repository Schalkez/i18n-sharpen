# Phase 3: Framework Parsers + Dispatcher — Plan 03 Summary

**Status:** Completed
**Date:** 2026-06-01

### Objectives Achieved

1. Implemented `parseSvelteFile` in `src/core/scanner/parsers/svelte.ts`.
   - Exports `readSvelteMajor(cwd)` as the version-gate seam (testable via `vi.spyOn`).
   - Gates on `readSvelteMajor(cwd) >= 5`: v5 calls `parse(source, { modern: true })` and walks `ast.fragment`; v4 calls `parse(source)` and walks `ast.html`.
   - Loads `svelte/compiler` (not bare `svelte`) via `loadWorkspaceDep` — missing compiler propagates as fatal `I18nSharpenError` (FW-05).
   - Delegates `ast.instance` and `ast.module` script blocks to `parseTypeScriptFile`, rebasing offsets by `block.start` for document-absolute positions (FW-04).
   - Walks the template via `walkSvelteTemplate`: extracts `matchAttributes` keys from `Attribute` nodes and text content from `Text` nodes as `hardcodedCandidates`; skips `SvelteHead` (v5) / `svelte:head` element (v4) and `SVELTE_SKIP_TAGS`.
   - Wraps `svelteCompiler.parse()` in try/catch — syntax errors collected as `FileParseError`, never thrown (D-17).
2. All Svelte tests GREEN: `pnpm vitest run src/__tests__/parsers/svelte.test.ts` passes 5 tests covering FW-02 (v5 real + v4 mocked-gate dual-mode), FW-04 (line-number assertion), FW-05 (missing compiler), and D-17 (syntax error collected).
