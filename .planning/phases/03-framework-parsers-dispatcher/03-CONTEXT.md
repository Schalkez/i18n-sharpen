# Phase 3: Framework Parsers + Dispatcher - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Vue SFCs, Svelte 5/4, and Astro files are each parsed by their dynamically-loaded workspace compiler. Embedded `<script>` blocks from each framework file are delegated to the Phase 2 `parseTypeScriptFile` function with correct offset rebasing so reported line numbers point to the right lines in the original file. The extension-based `parseFile()` dispatcher lives in `parsers/index.ts` and routes every supported extension to the correct parser, returning a unified `ParsedFileResult`.

**In scope:** FW-01 (Vue), FW-02 (Svelte 5/4 gate), FW-03 (Astro WASM), FW-04 (embedded script delegation + offset rebasing), FW-05 (missing compiler → fatal error), PARSE-06 (dispatcher), TEST-04 (integration tests for error model + offset/line correctness).

**Out of scope:** Async migration of `detectUsedKeys` / public API (Phase 4); shadow comparison + default flip (Phase 5); regex deletion (Phase 6). The regex engine remains the default throughout this phase — the framework parsers and dispatcher are built and tested standalone, not wired as the engine.

</domain>

<decisions>
## Implementation Decisions

### Dispatcher design (PARSE-06)
- **D-01:** `parseFile()` lives in **`src/core/scanner/parsers/index.ts`** as the natural barrel export for the `parsers/` directory. No separate `dispatcher.ts` file.
- **D-02:** Signature follows the same positional pattern as `parseTypeScriptFile`: `parseFile(source: string, filePath: string, matchFunctions: string[], matchAttributes: string[], cwd: string): Promise<{ result: ParsedFileResult; errors: FileParseError[] }>`. No config-object wrapper — consistent with Phase 2.
- **D-03:** `parseFile()` is **async** (`Promise<ParsedFileResult>`). Astro's WASM compiler cannot be called synchronously; the async boundary belongs here in Phase 3. `detectUsedKeys` (and the `validate`/`extract`/`prune` cascade) stays synchronous/regex until Phase 4. In Phase 3, `parseFile()` is exercised only from tests — it is not yet wired as the default engine.
- **D-04:** The dispatcher wraps `parseTypeScriptFile()` in `Promise.resolve()` for `.ts/.tsx/.js/.jsx` extensions to give a uniform async interface without changing its sync implementation.

### Vue SFC parser (FW-01)
- **D-05:** Parse via **`@vue/compiler-sfc`'s `parse(source)`** to get the `SFCDescriptor`. The `<script>` and `<script setup>` blocks are delegated to `parseTypeScriptFile` for key/dynamic-call/hardcoded extraction (with offset rebasing using `descriptor.script.loc.start.offset` / `descriptor.scriptSetup.loc.start.offset`).
- **D-06:** The `<template>` block is walked for both:
  - **`matchAttributes` keys** — element attributes whose name matches a `matchAttributes` entry (e.g. `i18nKey="some.key"`), extracted as `usedKeys`
  - **Hardcoded text candidates** — raw template text nodes
  Walk `descriptor.template.ast` directly (the template AST provided by `@vue/compiler-sfc`). If `descriptor.template.ast` requires `@vue/compiler-dom` to be loaded (as REQUIREMENTS.md FW-01 specifies), the researcher verifies the exact API and whether a separate `@vue/compiler-dom` dynamic load is needed. No `@vue/compiler-dom.compile()` — only AST walking, not IR compilation.
- **D-07:** Missing `@vue/compiler-sfc` produces a fatal `I18nSharpenError` with `kind: "missing-dependency"` using the unified resolver (D-06, Phase 1). Same pattern as the TS parser.

### Svelte parser (FW-02)
- **D-08:** Load `svelte/compiler` via the existing `loadWorkspaceDep` resolver. Before calling `parse()`, read **`svelte/package.json` `version` field** (via `require("svelte/package.json")`) and parse its semver.
  - Version `>= 5`: call `parse(source, { modern: true })` → walk `ast.fragment`
  - Version `< 5`: call `parse(source)` → walk `ast.html`
  This is explicit, easy to understand in future, and doesn't rely on duck-typing.
- **D-09:** The `<script>` (instance) and `<script context="module">` (module) blocks are delegated to `parseTypeScriptFile` with offset rebasing using `ast.instance.start` / `ast.module.start` (Svelte 4) or the equivalent Svelte 5 positions (researcher verifies exact field names for Svelte 5 `ast.fragment`).
- **D-10:** Template text nodes and `matchAttributes` keys from the Svelte template AST are walked directly on the Svelte AST (same extraction scope as Vue: both `matchAttributes` + hardcoded text).

### Astro parser (FW-03)
- **D-11:** Load `@astrojs/compiler` via `loadWorkspaceDep`. WASM `initialize()` must be awaited before calling `parse()`. Use a **module-level singleton init promise**: `let initPromise: Promise<void> | null = null`. On first call, set `initPromise = initialize()`. All callers `await initPromise` before parsing — parallel calls after init is settled pay no extra cost. This satisfies the "10 concurrent parses, no WASM race" success criterion.
- **D-12:** After WASM init, call `parse(source)` to get the Astro AST. The `frontmatter` script block is delegated to `parseTypeScriptFile` with offset rebasing using the block's start offset from the Astro AST. Researcher verifies the exact field name.
- **D-13:** Template text nodes and `matchAttributes` keys are extracted from the Astro AST body (same extraction scope: both `matchAttributes` + hardcoded text).

### Embedded script offset rebasing (FW-04, OFFSET-01)
- **D-14:** Each framework parser is responsible for rebasing offsets from its own embedded `<script>` block. After calling `parseTypeScriptFile` on the block content, each offset in the returned `ParsedFileResult` is incremented by `scriptBlockStartOffset` (the block's start position within the original file). The result is then merged into the file's unified `ParsedFileResult`.
- **D-15:** No shared rebasing utility — each parser does `result.usedKeys = result.usedKeys.map(k => ({ ...k, offset: k.offset + blockStartOffset }))` (and same for `dynamicCalls` and `hardcodedCandidates`). Simple, explicit, easy to test.

### Error model (FW-05, TEST-04)
- **D-16:** A missing framework compiler always produces a **fatal** `I18nSharpenError` with `kind: "missing-dependency"` (same resolver pattern as Phase 1/2). Message names the extension being scanned, the missing package, and the PM-correct install command.
- **D-17:** A single-file syntax error within a framework file produces a **collected** `FileParseError` (non-fatal, never thrown) — the scan continues for other files. Parity with the TS parser's error model.

### Claude's Discretion
- Internal module structure of each framework parser file (helpers, walker functions, etc.)
- Exact Svelte 5 AST field names for script block positions and template nodes (researcher verifies via Context7/docs)
- Whether `@vue/compiler-dom` needs a separate `loadWorkspaceDep` call, or if `@vue/compiler-sfc` re-exports the template parser (researcher verifies)
- Test fixture file layout and naming for TEST-04 integration tests

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external `docs/` ADRs exist in this repo — requirements and decisions live in `.planning/`.

### Requirements & success criteria
- `.planning/REQUIREMENTS.md` — definitions for **PARSE-06, FW-01, FW-02, FW-03, FW-04, FW-05, TEST-04** (this phase's reqs); the Out-of-Scope table.
- `.planning/ROADMAP.md` §"Phase 3: Framework Parsers + Dispatcher" — the **5 success criteria** this phase is verified against.

### Locked contracts (Phase 1 + Phase 2 — build to these)
- `src/core/scanner/parsers/types.ts` — `ParsedFileResult` + `FileParseError` (locked; don't change)
- `src/core/scanner/parsers/resolve.ts` — `loadWorkspaceDep` / `detectPackageManager` (unified resolver for all workspace deps including framework compilers)
- `src/core/scanner/parsers/typescript.ts` — `parseTypeScriptFile` (the delegated TS/JS/JSX/TSX parser for embedded script blocks; LOCKED SIGNATURE from Phase 2)
- `.planning/phases/01-foundation-error-model/01-CONTEXT.md` — Phase 1 decisions: `missing-dependency` unified resolver (D-06), exit codes, lazy loading
- `.planning/phases/02-js-ts-parser-core-golden-cases/02-CONTEXT.md` — Phase 2 decisions: detection semantics (D-07 callee matching, D-08 attribute container form, D-10 structural emission, D-11 quality filtering in caller)
- `.planning/phases/01-foundation-error-model/01-01-SUMMARY.md` — shipped contracts + resolver API

### Project decisions & constraints
- `.planning/PROJECT.md` §Constraints + §Key Decisions — framework compilers stay dynamically loaded from workspace (never bundled); tiny-dependency-tree; Node ≥ 20 / ESM; strict ESLint quality gate; additive-only in this phase (regex stays default).

### Implementation seed (PARTIALLY SUPERSEDED — read with care)
- `.planning/v0.4.0-SEED-PLAN.md` §"Phase 3: Dispatcher & Integration" — directional sketch of framework parsers and dispatcher shape. **WARNING:** all `@babel/parser`/`@babel/traverse` references and the "async Phase 3" framing for `detectUsedKeys` are SUPERSEDED. Use only the three-file structure (vue.ts, svelte.ts, astro.ts) and the dispatcher routing pattern.

### Behavioral source-of-truth (for parity)
- `src/core/scanner/hardcoded.ts` — `SKIP_TAGS`, attribute allowlist, `flushTextNode` offset convention (the parity target for template extraction)
- `src/core/scanner/lines.ts` — `computeLineOffsets`/`offsetToLine` (reused unchanged, OFFSET-02)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/core/scanner/parsers/resolve.ts`** — `loadWorkspaceDep(packageName, cwd)` + `detectPackageManager(cwd)`. Called by each framework parser to load its compiler with the fatal-error guarantee. Module-level `depCache` is already present.
- **`src/core/scanner/parsers/typescript.ts`** — `parseTypeScriptFile(source, filePath, matchFunctions, matchAttributes, cwd)`. Called by each framework parser to handle embedded `<script>` blocks after offset rebasing.
- **`src/core/scanner/parsers/types.ts`** — `ParsedFileResult` + `FileParseError`. The build target for all framework parsers.
- **`src/core/scanner/lines.ts`** — `computeLineOffsets`/`offsetToLine`. Reused unchanged (OFFSET-02).
- **`src/core/scanner/hardcoded.ts`** — `SKIP_TAGS`, `HARDCODED_ATTRS`, `flushTextNode` offset semantics. The behavioral parity target for template text extraction.

### Established Patterns
- **Unified resolver** — every workspace dep (TS, Vue, Svelte, Astro compilers) uses the same `loadWorkspaceDep`. No special-casing per package.
- **Collect-and-continue errors** — file-level syntax errors are `FileParseError` (never thrown). Missing compilers are fatal `I18nSharpenError`.
- **`process.exitCode`, never `process.exit()`**; only `I18nSharpenError` is ever thrown.
- **Quality gate:** ESM, Node ≥ 20, `tsup`, strict ESLint (`no-explicit-any: error`, `consistent-type-imports: error`); every commit passes `pnpm tsc --noEmit && pnpm test && pnpm build`.
- **`@/` path alias** in use.
- **Additive only** — all existing regex modules remain untouched; `detectUsedKeys` stays sync/regex.

### Integration Points
- **`src/core/scanner/parsers/index.ts`** (new) — exports `parseFile()` as the phase deliverable. Only consumed from tests in Phase 3; wired into `detectUsedKeys` in Phase 4.
- **`src/core/scanner/parsers/vue.ts`** (new) — Vue SFC parser.
- **`src/core/scanner/parsers/svelte.ts`** (new) — Svelte 5/4 parser.
- **`src/core/scanner/parsers/astro.ts`** (new) — Astro WASM parser.
- **`src/__tests__/parsers/`** (extend) — TEST-04 integration tests join `resolve.test.ts` and `typescript.test.ts` already there.
- **`package.json`** — `@vue/compiler-sfc`, `svelte`, `@astrojs/compiler` already declared optional peer deps (Phase 1 DEP-01); no new package.json changes expected.

</code_context>

<specifics>
## Specific Ideas

- The Astro singleton init pattern (`let initPromise: Promise<void> | null = null`) is the cleanest way to satisfy "10 concurrent parses, no WASM initialization race" without a queue. Once the promise resolves, every subsequent `await initPromise` is a no-op microtask.
- Offset rebasing is intentionally kept per-parser (no shared utility) — each framework has a slightly different block-start field name, and keeping the logic local to each parser makes it easier to audit in TEST-04.
- Phase 4 will wrap `parseFile()` into `detectUsedKeys` behind the `useAst` flag. Phase 3's dispatcher is the stable async API that Phase 4 consumes.

</specifics>

<deferred>
## Deferred Ideas

- **`svelte:head` skip tag** — mentioned in `typescript.ts` as "Phase 3 framework-specific." The Svelte parser should add `svelte:head` to the template SKIP_TAGS equivalent during AST walking (analogous to the SKIP_TAGS in the TS parser). Researcher confirms whether this is a first-class AST node or handled via tag name matching.
- **Astro component attribute keys** — Astro's JSX-like syntax may have additional attribute extraction opportunities beyond what the seed plan covers. Researcher flags if scope-relevant.

*(No reviewed-but-deferred todos — `todo match-phase 3` returned none.)*

</deferred>

---

*Phase: 03-framework-parsers-dispatcher*
*Context gathered: 2026-06-01*
