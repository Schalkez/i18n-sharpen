# Phase 3: Framework Parsers + Dispatcher - Final Summary

**Status:** Completed
**Date:** 2026-06-01

### Objectives Achieved
1. **Wave 1:**
   - Declared framework compilers (`@astrojs/compiler`, `@vue/compiler-sfc`, `svelte`, `typescript`) as optional peerDependencies in `package.json`.
   - Installed framework compilers as devDependencies.
   - Set up test fixtures (`vue-setup.vue`, `vue-legacy.vue`, `component.svelte`, `page.astro`) and wrote RED-state tests.
   - Added `resolve.test.ts` missing dependency fatal error tests.
   - Validated initial RED state (failed on missing parsers as expected).

2. **Wave 2:**
   - Implemented `parseVueFile` in `src/core/scanner/parsers/vue.ts`.
     - Handles `script` and `scriptSetup` blocks by delegating to `parseTypeScriptFile` and rebasing offsets.
     - Performs template AST walking for hardcoded texts and attribute usage keys.
     - Collects `compiler-sfc` parsing errors into `FileParseError` to support "collect-and-continue".
   - Implemented `parseSvelteFile` in `src/core/scanner/parsers/svelte.ts`.
     - Uses `svelte/compiler`.
     - Handles Svelte 4/5 API differences (`isV5`).
     - Delegated `module` and `instance` TS scripts, and walked template fragments.
   - Implemented `parseAstroFile` in `src/core/scanner/parsers/astro.ts`.
     - Handled async compiler load with singleton `initPromise` for WASM.
     - Processed `frontmatter` via TS parser delegation and mapped AST nodes for texts/attributes.
     - Collects Astro parser `diagnostics` with `error` severity into `FileParseError`.

3. **Wave 3:**
   - Implemented `parseFile` in `src/core/scanner/parsers/index.ts` to dispatch routing to the proper framework parser based on lowercase file extensions.
   - Unified async return signatures for all parsers (wrapping synchronous TS parsing in `Promise.resolve()`).
   - Re-verified all parsers via full test suite validation (`pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm build`).

### Verification
- `pnpm vitest run src/__tests__/parsers/*.test.ts`: Passes completely for Vue, Svelte, Astro, TypeScript, Dispatcher, and Resolve modules.
- `pnpm lint`: Cleared all `@typescript-eslint` violations caused by dynamic `any` AST types via scoped ESLint disables and syntax adjustments.
- `pnpm tsc --noEmit` and `pnpm build`: Successful build, indicating no structural regressions.

### Hand-off to Phase 4
- The JS/TS Core and the Framework Parsers are 100% complete and verified against isolation fixtures.
- The next step (Phase 4) is integrating `parseFile` back into the main library scanner, substituting the regex scanner pathways under an AST opt-in flag.
