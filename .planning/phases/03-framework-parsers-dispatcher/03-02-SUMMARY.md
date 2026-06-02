# Phase 3: Framework Parsers + Dispatcher — Plan 02 Summary

**Status:** Completed
**Date:** 2026-06-01

### Objectives Achieved

1. Implemented `parseVueFile` in `src/core/scanner/parsers/vue.ts`.
   - Loads `@vue/compiler-sfc` via `loadWorkspaceDep` — missing compiler propagates as a fatal `I18nSharpenError` (FW-05).
   - Handles both `descriptor.script` (Options API) and `descriptor.scriptSetup` (`<script setup>`) blocks by delegating to `parseTypeScriptFile`.
   - Uses `source.indexOf(block.content, block.loc.start.offset)` to compute the true content-start offset, correcting for the `<script>` tag header (Pitfall 1 / FW-04).
   - Applies `mergeWithRebase` to remap TS-parser-relative offsets to original-file absolute offsets.
   - Walks `descriptor.template.ast` via `walkVueTemplateAst`: extracts `matchAttributes` keys (type-6 props) and text nodes (type-2) as `hardcodedCandidates`, skipping `VUE_SKIP_TAGS`.
   - Collects SFC-level `parseErrors` and script-level `FileParseError`s — never throws for a file-level syntax error (D-17).
2. All Vue tests GREEN: `pnpm vitest run src/__tests__/parsers/vue.test.ts` passes 4 tests covering FW-01 (parity `<script setup>` vs legacy), FW-04 (line-3 offset assertion), FW-05 (missing compiler), and D-17 (syntax error collected).
