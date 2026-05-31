# Roadmap — i18n-sharpen

## Milestones

- ✅ **v0.3.0 — Developer Experience** — Phases 1-5 (shipped 2026-05-30) → [archive](milestones/v0.3.0-ROADMAP.md)
- 🚧 **v0.4.0 — AST Parser Rewrite** — Phases 1-6 (in progress) — replace regex/state-machine scanner with real AST parsers per framework for ~100% extraction accuracy

## Phases

<details>
<summary>✅ v0.3.0 Developer Experience (Phases 1-5) — SHIPPED 2026-05-30</summary>

- [x] Phase 1: Auto-Sorting Keys + Namespace Hardening (4/4 plans) — 2026-05-28
- [x] Phase 2: Dynamic Key Warnings (3/3 plans) — 2026-05-28
- [x] Phase 3: Interactive Pruning (3/3 plans) — 2026-05-30
- [x] Phase 4: Hardcoded String Detection (2/2 plans) — 2026-05-30
- [x] Phase 5: Deprecation Cleanup (1/1 plan) — 2026-05-30

Full details: [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md)

</details>

### 🚧 v0.4.0 — AST Parser Rewrite

**Milestone Goal:** Replace the regex/state-machine scanner with real per-framework AST parsers (TypeScript Compiler API for JS/TS; dynamic workspace compilers for Vue/Svelte/Astro) so key extraction, dynamic-key classification, and hardcoded-string detection reach near-100% accuracy — without regressing safety, CI-friendliness, framework coverage, or performance.

- [x] **Phase 1: Foundation & Error Model** - Shared types, workspace dep resolver, and the fatal-vs-collected error-kind split that every parser depends on (1/1 plan — 2026-05-31)
- [ ] **Phase 2: JS/TS Parser Core + Golden Cases** - TypeScript Compiler API parser producing a unified `ParsedFileResult` in a single traversal, plus the two golden edge-case tests
- [ ] **Phase 3: Framework Parsers + Dispatcher** - Vue/Svelte/Astro compilers, embedded-block offset rebasing, and the extension-based `parseFile()` dispatcher
- [ ] **Phase 4: Async Migration (shadow mode on, regex still default)** - Async `detectUsedKeys` with bounded-concurrency pool and `useAst` flag; full async cascade to public API; regex remains the default
- [ ] **Phase 5: Shadow Comparison, Perf Gate & Default Flip** - Differential harness proves zero false-negatives on a real corpus; perf gate passes; `useAst` default flipped to true
- [ ] **Phase 6: Cleanup & Release** - Delete regex/dynamic/hardcoded modules, remove shadow flag, BREAKING CHANGELOG, version bump to 0.4.0

## Phase Details

### Phase 1: Foundation & Error Model
**Goal**: The shared interface types, workspace dependency resolver, and distinct error kinds are in place so every subsequent parser can be built on a stable, well-tested foundation
**Depends on**: Nothing (first phase)
**Requirements**: DEP-01, DEP-02, ERR-01, ERR-02, ERR-03, OFFSET-02, PERF-02
**Success Criteria** (what must be TRUE):
  1. `typescript` and framework compilers are declared optional peer deps in `package.json`; `pnpm build` produces no new bundled `@babel/*` runtime dep
  2. Calling any scan command when `typescript` is not present in the user's workspace emits an actionable `I18nSharpenError` naming the exact install command — it does not crash with an unhandled exception
  3. The `I18nSharpenError` discriminated union has distinct `kind` values for missing-compiler (fatal) vs file-parse-error (collected); the two code paths are exercised in unit tests
  4. Process exit codes are documented and verified: missing-compiler exits differently from a pure i18n-key validation failure
  5. The parser is not imported until the first JS/TS file is encountered — a validate run on a JSON-only locale project pays zero parser cold-start cost
**Plans**: 1 plan
- [x] 01-01-PLAN.md — Foundation: ParsedFileResult/FileParseError contracts, missing-dependency error kind, workspace dep resolver, 0/1/2 exit codes, typescript optional peer dep ✅ 2026-05-31

### Phase 2: JS/TS Parser Core + Golden Cases
**Goal**: A single TypeScript Compiler API traversal extracts static used keys, attribute keys, dynamic-call candidates, and hardcoded-text candidates from `.ts/.tsx/.js/.jsx` files with correct document-absolute offsets — and the two golden edge cases that motivated the rewrite both pass
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, OFFSET-01, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. `.ts/.tsx/.js/.jsx` files are parsed via `ts.createSourceFile` (parser-only, no `Program`/type-checker); the TypeScript module is resolved from the user's workspace, not bundled
  2. A single traversal returns `ParsedFileResult { usedKeys, dynamicCalls, hardcodedCandidates }` with all offsets document-absolute; no second pass is required by callers
  3. `<m.div>Hello world</m.div>` — inner text `"Hello world"` appears in `hardcodedCandidates` (dot-notation JSX member-expression tag handled correctly)
  4. `forwardRef<HTMLInputElement, InputProps>(...)` — no spurious keys or hardcoded candidates are extracted from the type parameters; `hardcodedCandidates` contains only `placeholder` attribute values from inside the JSX
  5. All behavioral input/output cases from `scanner.test`, `dynamic.test`, and `hardcoded.test` pass against the new parser (tests ported, not deleted)
**Plans**: 3 plans (3 waves)
- [ ] 02-01-PLAN.md — types.ts dynamicCalls refinement (D-01) + parser spine: createSourceFile, ScriptKind-per-extension map, lazy loadWorkspaceDep, forEachChild visitor skeleton, LOCKED parseTypeScriptFile signature (PARSE-01, OFFSET-01)
- [ ] 02-02-PLAN.md — detection logic in the visitor: callee matching (D-07), static keys (PARSE-02), attribute keys incl. D-08 container gain (PARSE-03), structural dynamic classification incl. chained concat (PARSE-04), hardcoded candidates + SKIP_TAGS (PARSE-05)
- [ ] 02-03-PLAN.md — ported v0.3.0 corpus (TEST-01) + golden cases `<m.div>` (TEST-02) and `forwardRef<A,B>` (TEST-03) + D-08 gain test + full-suite gate

### Phase 3: Framework Parsers + Dispatcher
**Goal**: Vue SFCs, Svelte 5 (with Svelte 4 gate), and Astro files are each parsed by their workspace compiler; embedded `<script>` blocks are delegated to the Phase 2 JS/TS parser with correct offset rebasing; the extension-based `parseFile()` dispatcher routes all supported extensions to the right parser
**Depends on**: Phase 2
**Requirements**: PARSE-06, FW-01, FW-02, FW-03, FW-04, FW-05, TEST-04
**Success Criteria** (what must be TRUE):
  1. A `.vue` file with `<script setup>` produces the same used-key extraction as one with legacy `<script>`; template attribute keys (e.g. `i18nKey="..."`) are also extracted
  2. A `.svelte` file parses correctly under both Svelte 5 (`ast.fragment`, `modern: true`) and Svelte 4 (`ast.html`) without crashing or returning empty results
  3. An `.astro` file parses correctly when 10 Astro files are parsed concurrently — no WASM initialization race; all return consistent results
  4. Offsets for keys found in embedded `<script>` blocks map to the correct line in the original file (not the line within the block); integration tests assert this with specific line-number expectations
  5. A missing framework compiler (e.g. `@vue/compiler-sfc` not installed) produces a fatal `I18nSharpenError` naming the package and the exact `pnpm add -D` install command; a single file with a syntax error does not abort the run — other files continue processing
**Plans**: TBD

### Phase 4: Async Migration (shadow mode on, regex still default)
**Goal**: `detectUsedKeys` becomes async with a bounded-concurrency parse pool and a `useAst` flag (default false); the full async cascade (`validate`/`extract`/`prune`, public API, `cli.ts`) is complete; the regex engine remains the default so no behavioral change is observable to end users; `fileContents` is preserved for `looseKeyMatch`
**Depends on**: Phase 3
**Requirements**: ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04, SHADOW-01
**Success Criteria** (what must be TRUE):
  1. `validate`, `extract`, and `prune` all return `Promise`; `cli.ts` awaits each; `pnpm tsc --noEmit` passes with zero errors after all callers are updated
  2. Running the full test suite with the regex default (`useAst: false`) produces the same results as v0.3.0 — no behavioral regression
  3. `fileContents` (stripped-comment source strings) is still returned by `detectUsedKeys`; a regression test asserts that `looseKeyMatch` still finds a key present only in stripped content after the async refactor
  4. File parsing runs through a bounded-concurrency pool (max 4 concurrent by default); `Promise.all` over all files is not used
  5. With `useAst: true` (the AST flag on), all existing tests still pass — the AST path is wired end-to-end and testable before the default is flipped
**Plans**: TBD

### Phase 5: Shadow Comparison, Perf Gate & Default Flip
**Goal**: The differential harness proves the AST path finds every key the regex path found (zero false-negatives) on a real multi-framework corpus; the perf gate confirms no regression beyond 100ms vs v0.3.0 baseline; only after both gates pass is `useAst` flipped to true as the default
**Depends on**: Phase 4
**Requirements**: SHADOW-02, SHADOW-03, PERF-01
**Success Criteria** (what must be TRUE):
  1. `scripts/shadow-compare.ts` runs the regex path and the AST path over the same corpus (repo fixtures plus at least one real OSS project per framework) and produces a machine-readable diff report
  2. The corpus diff shows zero false-negatives — every key found by the regex path is also found by the AST path; any AST-only gains are documented
  3. `pnpm bench` against a 50-file fixture corpus shows the AST path is no more than 100ms slower than the v0.3.0 regex baseline; the benchmark fails the build if this threshold is exceeded
  4. After flipping `useAst` default to true, the full test suite passes with the AST path as the driver — including all behavioral cases ported in Phase 2
**Plans**: TBD

### Phase 6: Cleanup & Release
**Goal**: The regex scanner modules (`regex.ts`, `dynamic.ts`, `hardcoded.ts`, `scanner.ts` shim) and the shadow flag are deleted now that AST is the verified default; only regex-internal tests are dropped (behavioral cases already live in parser tests); the BREAKING CHANGELOG is written and the version is bumped to 0.4.0
**Depends on**: Phase 5
**Requirements**: CLEAN-01, CLEAN-02
**Success Criteria** (what must be TRUE):
  1. `regex.ts`, `dynamic.ts`, `hardcoded.ts`, and the `scanner.ts` shim are deleted; `isHardcodedIgnored` is moved to `text.ts` first; `escapeRegex` re-export is removed from `utils.ts`; the shadow `useAst` flag is removed from `detectUsedKeys`
  2. The full test suite passes after deletion — all behavioral coverage is confirmed to live in the AST parser tests; only regex-internal unit tests are gone
  3. CHANGELOG contains a BREAKING section documenting: async public API (`validate`/`extract`/`prune` now return `Promise`), new optional peer deps with per-framework install instructions, and the regex-to-AST engine change
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Auto-Sorting Keys + Namespace Hardening | v0.3.0 | 4/4 | Complete | 2026-05-28 |
| 2. Dynamic Key Warnings | v0.3.0 | 3/3 | Complete | 2026-05-28 |
| 3. Interactive Pruning | v0.3.0 | 3/3 | Complete | 2026-05-30 |
| 4. Hardcoded String Detection | v0.3.0 | 2/2 | Complete | 2026-05-30 |
| 5. Deprecation Cleanup | v0.3.0 | 1/1 | Complete | 2026-05-30 |
| 1. Foundation & Error Model | v0.4.0 | 1/1 | Complete | 2026-05-31 |
| 2. JS/TS Parser Core + Golden Cases | v0.4.0 | 0/3 | Planned | - |
| 3. Framework Parsers + Dispatcher | v0.4.0 | 0/? | Not started | - |
| 4. Async Migration | v0.4.0 | 0/? | Not started | - |
| 5. Shadow Comparison, Perf Gate & Default Flip | v0.4.0 | 0/? | Not started | - |
| 6. Cleanup & Release | v0.4.0 | 0/? | Not started | - |

---
*v0.3.0 archived 2026-05-30. v0.4.0 roadmap defined 2026-05-31.*
