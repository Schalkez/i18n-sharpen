# Phase 3: Framework Parsers + Dispatcher — Plan 04 Summary

**Status:** Completed
**Date:** 2026-06-01

### Objectives Achieved

1. Implemented `parseAstroFile` in `src/core/scanner/parsers/astro.ts`.
   - Module-level `let initPromise: Promise<void> | null = null` singleton guards WASM initialization — all concurrent callers `await initPromise` before parsing, so 10 simultaneous first-parses cannot race the WASM startup (FW-03 / D-11).
   - Loads `@astrojs/compiler` via `loadWorkspaceDep` — missing compiler propagates as fatal `I18nSharpenError` (FW-05).
   - Uses `await astroCompiler.parse(source, { position: true })` — wraps in try/catch, mapping errors to `FileParseError` (D-17).
   - Walks the AST via `walkAstroAst`: delegates `frontmatter` node to `parseTypeScriptFile`, using `source.indexOf(node.value, blockStart)` to anchor the true content-start offset for document-absolute rebasing (FW-04 line-2 assertion).
   - Extracts `kind === 'quoted'` attribute keys and `text` node content as `hardcodedCandidates`; skips `ASTRO_SKIP_TAGS`.
   - Maps `diagnostics` with `severity === 1` (error) into `collectedErrors`.
2. All Astro tests GREEN: `pnpm vitest run src/__tests__/parsers/astro.test.ts` passes 4 tests covering FW-03 (10-concurrent identical results), FW-04 (line-2 frontmatter offset), FW-05 (missing compiler), and D-17 (syntax error collected).
