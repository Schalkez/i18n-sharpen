# Project Research Summary

**Project:** i18n-sharpen
**Domain:** Per-framework AST scanner replacing a regex engine in a tiny-dependency TypeScript ESM CLI
**Researched:** 2026-05-31
**Confidence:** HIGH (architecture, pitfalls, features verified against source + official issues); MEDIUM-HIGH on exact dependency versions (re-verify via Context7 at plan-phase).

## Executive Summary

v0.4.0 replaces i18n-sharpen's hand-rolled regex/state-machine scanner with real per-framework AST parsers. The motivation is structural, not cosmetic: hardcoded-string detection needs to know *which element/attribute a text node sits in*, which is true parsing, not pattern-matching. Two discarded regex patches prove the ceiling — `forwardRef<HTMLInputElement, InputProps>(...)` generics misread as JSX tags, and `<m.div>` dot-notation tags — and both are trivially correct under a real parser. The rewrite forces the public API from sync to async (dynamic compiler `import()`), a bounded but breaking change ⇒ semver bump to 0.4.0.

The recommended approach **revises the seed's dependency choice**. The seed mandates `@babel/parser` + `@babel/traverse` (~4.7 MB direct deps), but pitfalls research found `@babel/traverse`'s ESM `.default` interop to be the single highest crash risk. The recommendation: use the **TypeScript Compiler API resolved from the user's workspace as an optional peer dependency** (~0 added bundle weight — this is a TS-first tool whose users already have `typescript`), with a **slim `@babel/parser`-only fallback** (no traverse) for plain-JS projects. Framework compilers (Vue/Svelte/Astro) stay dynamically loaded from the workspace, never bundled — consistent with the existing `jiti` precedent. This must be ratified at requirements (handoff open decision #1).

The dominant risk is shipping a rewrite with silent accuracy regressions. The mitigation is non-negotiable and is the milestone's #1 verification requirement: **shadow mode** — run AST behind a flag, diff its output against regex over a real corpus, reach zero false-negatives, *then* flip the default, and only in a *separate later phase* delete the regex code (porting, not deleting, its behavioral tests). Big-bang rewrite-and-delete is the explicit anti-pattern.

## Key Findings

### Recommended Stack

JS/TS/JSX parsing should move to the **TypeScript Compiler API as a workspace peer dep** (primary) — native TS+JSX, no plugin config, no ESM interop trap, zero common-path bundle cost — with a **slim Babel parser + `@babel/types` hand-walk** (no `@babel/traverse`) as the bundled fallback. Framework compilers are dynamic peer deps.

**Core technologies:**
- **`typescript` Compiler API** (`ts.createSourceFile` parser-only, `forEachChild`) — JS/TS/JSX parsing — already present in target projects; avoids the `@babel/traverse` crash.
- **`@vue/compiler-sfc` + `@vue/compiler-dom`** (3.x) — `.vue` SFC + template — official, workspace-resolved.
- **`svelte/compiler`** (5.x, gate 4.x) — `.svelte` — Svelte 5 AST is `ast.fragment` via `{ modern: true }`.
- **`@astrojs/compiler`** (2.x, WASM async init) — `.astro` — `await` init, serialize first parse.
- **`@babel/parser` + `@babel/types`** (fallback only, no traverse) — JS/TS when `typescript` absent.

See `STACK.md` for the full trade-off table and the "what NOT to use" (`@babel/traverse`, `ts.createProgram`, bundled compilers).

### Expected Features

This is **parity-plus**: match the regex engine, then exceed it. See `FEATURES.md`.

**Must have (parity table stakes):** static used-key extraction; attribute keys; dynamic-call classification (fully-dynamic vs structured-concat); hardcoded-text candidates (text + `placeholder/title/alt/aria-label/label`); all 7 extensions; correct offsets→lines; `fileContents` preserved for `looseKeyMatch`; config-driven detection; namespaces; CI-safe (one bad file never aborts).

**Should have (differentiators — the rewrite's justification):** near-100% accuracy; the two golden cases; single-pass unified `ParsedFileResult`; **shadow-mode differential harness**; bounded-concurrency parse pool (async as a perf win); actionable missing-compiler errors.

**Defer:** delete-regex + remove-shadow-flag (separate phase, post-flip); mtime/hash parse cache; `--strict-syntax` exit mode.

### Architecture Approach

Integrate, don't redesign. A new `src/core/scanner/parsers/` subtree (`types`, `resolve`, the JS/TS parser, `vue`, `svelte`, `astro`, and an extension-dispatcher `index`) produces a document-absolute `ParsedFileResult`. `detectUsedKeys` becomes async and runs a bounded-concurrency pool, still returning `{ usedKeys, fileContents, parsedResults }`. The async cascade is bounded to ~6–8 files (3 commands + `cli.ts` + `index.ts` + their tests). See `ARCHITECTURE.md`.

**Major components:**
1. **Dispatcher (`parsers/index.ts`)** — route by extension → unified `ParsedFileResult`.
2. **JS/TS parser** — single traversal yields used keys + dynamic calls + hardcoded candidates, with an `offsetDelta` for embedded-block rebasing.
3. **Framework parsers** — Vue/Svelte/Astro compilers; delegate `<script>` to the JS/TS parser; rebase offsets.
4. **`detectUsedKeys` (async + pool + error accumulator)** — collect-and-continue; fatal only on missing compiler.
5. **Shadow harness** — `scripts/shadow-compare.ts` diff regex vs AST; gates the flip.

### Critical Pitfalls

1. **`@babel/traverse` ESM `.default` crash** — avoid the package entirely (TS API primary; `@babel/types` hand-walk in fallback). *(Drives the stack decision.)*
2. **`errorRecovery` still throws on some errors** — always wrap `parse()` in try/catch; collect-and-continue; never abort the run.
3. **Svelte 5 `ast.fragment` vs Svelte 4 `ast.html`** — detect major version after dynamic import and branch (`{ modern: true }`).
4. **Astro WASM async init race** — await a cached init promise; serialize the first parse.
5. **Offset rebasing for embedded `<script>` blocks** — parser returns document-absolute offsets; callers unchanged.
6. **`fileContents` dropped in the async refactor** → `looseKeyMatch` silently breaks — keep it returned; add a regression test.

Plus the two **golden must-pass tests**: `<m.div>` dot-notation extracts inner text; `forwardRef<A,B>()` is never JSX. See `PITFALLS.md` for the full list, the "looks done but isn't" checklist, and the pitfall→phase map.

## Implications for Roadmap

Research strongly supports a **6-phase structure** (numbering reset to 1 per `--reset-phase-numbers`), derived from ARCHITECTURE's build order. Shadow-mode-before-delete is the spine: parsing is built and proven behind a flag before anything old is removed.

### Phase 1: Foundation & Error Model
**Rationale:** Interfaces and the error-kind split must exist before any parser. Choosing the traversal strategy (avoid `@babel/traverse`) is a Phase-1 decision — changing it later rewrites every visitor.
**Delivers:** `parsers/types.ts` (`ParsedFileResult`); `parsers/resolve.ts` (`loadWorkspaceDep` via `createRequire`, fatal-on-missing); distinct `I18nSharpenError` kinds for `missing-compiler` (fatal) vs `file-parse-error` (collected); deps/peer-deps declared.
**Addresses:** dependency-strategy ratification; actionable missing-compiler errors.
**Avoids:** Pitfalls #1 (traverse), #7 (fail-fast).

### Phase 2: JS/TS Parser Core + Golden Cases
**Rationale:** Every framework parser delegates its `<script>` here; build it first. This phase *is* the accuracy proof.
**Delivers:** the JS/TS parser (used keys + dynamic calls + hardcoded candidates in one pass, `offsetDelta` param); `parsers/babel|ts` tests porting `scanner`/`dynamic` behavioral cases + named golden tests (`<m.div>`, `forwardRef<A,B>`).
**Uses:** TS Compiler API (or slim Babel fallback) from `STACK.md`.
**Avoids:** Pitfalls #2 (errorRecovery throws), #6 (offsets); Golden A/B.

### Phase 3: Framework Parsers + Dispatcher
**Rationale:** With the JS/TS core proven, add Vue/Svelte/Astro and the extension router.
**Delivers:** `vue.ts` (`scriptSetup ?? script` + template compile), `svelte.ts` (v5 `fragment`, gate v4), `astro.ts` (WASM init), `parsers/index.ts` dispatcher; per-framework fixture tests incl. offset-correctness.
**Avoids:** Pitfalls #3 (Svelte 5), #4 (Astro WASM), #5 (Vue scriptSetup), #6 (rebasing).

### Phase 4: Async Migration (shadow mode on, regex still default)
**Rationale:** Wire the engine in behind a flag without changing default behavior; do the breaking API change in isolation.
**Delivers:** async `detectUsedKeys` + bounded-concurrency pool + `useAst` flag (default false → regex); async `validate`/`extract`/`prune`, public API, `cli.ts`; `fileContents` preserved; tests add `await` + `expect.hasAssertions()`.
**Avoids:** Pitfalls #8 (`fileContents`), #9 (async cascade / unawaited tests).

### Phase 5: Shadow Comparison, Perf Gate & Default Flip
**Rationale:** Prove parity-or-better on a real corpus before trusting AST.
**Delivers:** `scripts/shadow-compare.ts`; corpus diff with zero false-negatives; `vitest bench` perf gate (≤100 ms vs v0.3.0); flip `useAst` default to true; full suite green with AST driving.
**Addresses:** the #1 verification requirement (differential accuracy).
**Avoids:** big-bang anti-pattern; perf-regression trap.

### Phase 6: Cleanup & Release (separate from the flip)
**Rationale:** Only after the flip is proven safe.
**Delivers:** delete `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim (move `isHardcodedIgnored` to `text.ts` first); remove `escapeRegex` re-export; port-delete regex-internal tests (confirm behavioral cases live in `parsers/`); remove shadow flag; BREAKING CHANGELOG (async API, peer deps, per-framework install instructions).

### Phase Ordering Rationale
- **Dependency order:** framework parsers need the JS/TS core; the pool needs async; the flip needs the harness; delete needs the flip.
- **Risk isolation:** the breaking async change (P4) is separate from new parsing logic (P2–P3) and from deletion (P6), so regressions are attributable.
- **Verification-gated:** P5 is a hard gate between "AST exists" and "AST is trusted/old code removed."

### Research Flags
Phases likely needing deeper plan-phase research:
- **Phase 3:** compiler-version pinning + exact AST shapes (Svelte 5 `fragment`, Astro WASM init API) — verify via Context7 (handoff open decision #2).
- **Phase 5:** corpus selection — pick + pin specific OSS projects per framework (handoff open decision #3).

Phases with standard patterns (lighter research):
- **Phase 1, 4, 6:** well-understood interface/async/cleanup work against a known codebase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | APIs/ecosystem HIGH; exact latest versions to re-verify at plan-phase. Dependency strategy is a *recommendation* pending requirements ratification. |
| Features | HIGH | Parity targets derived directly from shipped source. |
| Architecture | HIGH | All integration points verified against actual source files. |
| Pitfalls | HIGH | Verified against official Babel/Svelte/Astro/Vue issues + source. |

**Overall confidence:** HIGH for *what to build and in what order*; the one open call is the JS/TS parser dependency (TS API vs slim Babel), to be ratified at requirements.

### Gaps to Address
- **Dependency strategy ratification** (open #1): decide TS-API-peer vs slim-Babel-bundled (or hybrid) at requirements; documents the bundle/peer trade-off.
- **Compiler version pins** (open #2): resolve in Phase 3 planning via Context7.
- **Differential corpus** (open #3): choose + pin OSS projects in Phase 5 planning.

## Sources

### Primary (HIGH confidence)
- Direct source inspection: `src/core/scanner/*`, `src/commands/*`, `src/cli.ts`, `src/index.ts`, `src/core/errors.ts`.
- Official issues/docs: babel/babel #13093/#15269/#16371/#12074/#14054 (traverse interop, errorRecovery); svelte compiler docs (`modern`/`fragment`); `@astrojs/compiler` (WASM async); `@vue/compiler-sfc` (descriptor/scriptSetup).
- `.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS}.md`.

### Secondary (MEDIUM confidence)
- Exact current package versions (to re-verify via Context7 at plan-phase).
- `babel-walk` / `astray` as faster traverse alternatives.

---
*Research completed: 2026-05-31*
*Ready for roadmap: yes*
