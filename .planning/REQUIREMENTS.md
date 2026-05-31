# Requirements: i18n-sharpen — Milestone v0.4.0 (AST Parser Rewrite)

**Defined:** 2026-05-31
**Core Value:** Keep translation files sharp, tidy, and synchronized — without losing data.

> Scope: replace the regex/state-machine scanner with real per-framework AST parsers, reaching parity-or-better accuracy, behind a shadow-mode safety gate, without regressing safety, CI-friendliness, framework coverage, or performance. This is a **breaking** milestone (sync → async public API) ⇒ semver minor bump to **0.4.0**.
>
> **Ratified decision (this milestone):** the JS/TS/JSX parser is the **TypeScript Compiler API** (`ts.createSourceFile`, parser-only), resolved from the user's workspace as an **optional peer dependency** — chosen over Babel for ~0 added bundle weight, native TS+JSX, always-on error recovery, and to avoid the `@babel/traverse` ESM `.default` interop trap in this TS+ESM+tsup stack. Framework compilers (Vue/Svelte/Astro) are dynamically loaded from the workspace.

## v1 Requirements (Milestone v0.4.0)

### Parser Core & Dispatcher

- [ ] **PARSE-01**: The scanner parses `.ts/.tsx/.js/.jsx` via the TypeScript Compiler API (`ts.createSourceFile`, parser-only — no `Program`/type-checker), resolved from the user's workspace.
- [ ] **PARSE-02**: A single AST traversal extracts static used keys (`t("k")` calls matching configured `matchFunctions`) with document-absolute offsets.
- [ ] **PARSE-03**: The same traversal extracts configured-attribute keys (`matchAttributes`, e.g. `i18nKey="..."`).
- [ ] **PARSE-04**: The same traversal collects dynamic-call candidates (non-static args, e.g. `t(x)`, `t("p."+x)`) classified fully-dynamic vs structured-concat (parity with v0.3.0 dynamic-key warnings).
- [ ] **PARSE-05**: The same traversal collects hardcoded-text candidates (JSX/text nodes + `placeholder/title/alt/aria-label/label`), honoring `isHardcodedIgnored`.
- [ ] **PARSE-06**: An extension-based dispatcher (`parseFile`) routes each file to the correct parser and returns a unified `ParsedFileResult { usedKeys, dynamicCalls, hardcodedCandidates }`.

### Dependency Strategy

- [ ] **DEP-01**: `typescript` and the framework compilers are declared **optional peer dependencies** (not bundled `dependencies`); the CLI's own runtime dep tree stays tiny (no `@babel/*` runtime dep).
- [ ] **DEP-02**: When `typescript` is not resolvable in the user's workspace, scanning JS/TS files emits an actionable `I18nSharpenError` with the exact install command (rather than crashing).

### Framework Compilers (dynamic-loaded)

- [ ] **FW-01**: `.vue` files are parsed via workspace `@vue/compiler-sfc` (+ `@vue/compiler-dom` for the template), covering both `<script setup>` and Options-API `<script>`.
- [ ] **FW-02**: `.svelte` files are parsed via workspace `svelte/compiler`, handling Svelte 5 (`{ modern: true }` → `ast.fragment`) with a version gate for Svelte 4 (`ast.html`).
- [ ] **FW-03**: `.astro` files are parsed via workspace `@astrojs/compiler`, with WASM async initialization awaited and the first parse serialized.
- [ ] **FW-04**: Embedded `<script>` blocks in `.vue/.svelte/.astro` are parsed by the same TS/JS parser (PARSE-01) and merged into the file's `ParsedFileResult`.
- [ ] **FW-05**: A missing framework compiler produces a **fatal**, actionable `I18nSharpenError` naming the package and exact install command.

### Resilient Error Model

- [ ] **ERR-01**: A syntax error in a single file is collected (path + line) and the scan **continues** (collect-and-continue); one bad file never aborts the run.
- [ ] **ERR-02**: A missing compiler/parser dependency is **fatal**, using a distinct `I18nSharpenError` kind from file-parse errors.
- [ ] **ERR-03**: Process exit codes distinguish parse failures from i18n validation failures.

### Offset / Line Correctness

- [ ] **OFFSET-01**: All offsets in `ParsedFileResult` are document-absolute; offsets from embedded `<script>` blocks are rebased by the block's start offset so reported line numbers are correct.
- [ ] **OFFSET-02**: Line reporting reuses the existing `lines.ts` utilities unchanged (callers carry no offset-rebasing logic).

### Async Migration

- [ ] **ASYNC-01**: `detectUsedKeys` becomes async and returns `{ usedKeys, fileContents, parsedResults }`.
- [ ] **ASYNC-02**: `validate`/`extract`/`prune` and the public API (`src/index.ts`) return `Promise`; `cli.ts` awaits them.
- [ ] **ASYNC-03**: `fileContents` (stripped-comments per file) is still returned so the `looseKeyMatch` feature keeps working (covered by a regression test).
- [ ] **ASYNC-04**: File parsing runs through a bounded-concurrency pool (no unbounded `Promise.all` over all files).

### Shadow Mode & Differential Accuracy

- [ ] **SHADOW-01**: The AST path is gated behind a flag/option; the regex engine stays the default until parity is proven.
- [ ] **SHADOW-02**: A differential harness diffs regex vs AST output over a corpus (repo fixtures + ≥1 real OSS project per framework) and reports false-negatives and AST-only gains.
- [ ] **SHADOW-03**: The AST path becomes the default only after the corpus diff shows **zero false-negatives** (no key regex found that AST misses).

### Performance

- [ ] **PERF-01**: A benchmark compares the AST path against the v0.3.0 baseline; a perf gate fails the build on regression beyond the defined budget (≤100 ms overhead).
- [ ] **PERF-02**: The parser is lazy-loaded — no parser cold-start cost for runs that touch no JS/TS files (e.g. JSON-only locales).

### Tests

- [ ] **TEST-01**: Behavioral input→output cases from `scanner.test`/`dynamic.test`/`hardcoded.test` are **ported** onto the AST parser; only regex-internal tests are dropped.
- [ ] **TEST-02**: Golden case — `<m.div>` / `<motion.div>` dot-notation component tags still extract inner text.
- [ ] **TEST-03**: Golden case — `forwardRef<HTMLInputElement, InputProps>(...)` generics are never parsed as JSX (no spurious extraction; tag tracking uncorrupted).
- [ ] **TEST-04**: Integration tests cover the error model (missing compiler fatal; single syntax error continues) and offset/line correctness across embedded blocks.

### Cleanup & Release

- [ ] **CLEAN-01**: After the default flip, delete `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim and remove the shadow flag (move `isHardcodedIgnored` into `text.ts` first; drop the `escapeRegex` re-export from `utils.ts`).
- [ ] **CLEAN-02**: CHANGELOG documents the BREAKING async public API, the new optional peer deps + per-framework install instructions, and the regex→AST engine change.

## Future Requirements (deferred — not in this milestone's roadmap)

### Performance / DX

- **CACHE-01**: Optional mtime/hash-keyed parse cache to skip re-parsing unchanged files. *(Defer until perf demand on very large repos.)*
- **STRICT-01**: `--strict-syntax` mode that makes file parse errors fail CI (non-zero exit). *(Defer until user demand.)*

### Dependency

- **DEPFALL-01**: Bundled slim-Babel fallback (`@babel/parser` only, hand-walked) for projects that have no `typescript`. *(Defer — revisit only if no-TypeScript users report friction; keeps a single parser path for now.)*

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full type-checking via `ts.createProgram` | Orders of magnitude slower; the scanner needs syntax only (`createSourceFile` parser-only). |
| Auto-fix / wrapping hardcoded strings in `t()` | Source-writing is high-risk and violates the "no writing `.ts/.js`" safety contract; stay detection-only. |
| Heuristic i18n-function auto-detection | Guessy and framework-specific; detection stays config-driven via `matchFunctions`/`matchAttributes`. |
| Permanent regex fallback alongside AST | Two engines to maintain; defeats the rewrite. Shadow-mode proves parity, then regex is deleted. |
| Built-in detectors for frameworks beyond the 5 extensions | Scope creep; the dispatcher makes future additions cheap but not in v0.4.0. |
| Writing `.ts/.js/.cjs/.mjs/.tsx` locale files | Still refused for safety (unchanged from v0.2.3). |
| Runtime i18n features | Tool stays build/CI-time only. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARSE-01 | Phase 2 | Pending |
| PARSE-02 | Phase 2 | Pending |
| PARSE-03 | Phase 2 | Pending |
| PARSE-04 | Phase 2 | Pending |
| PARSE-05 | Phase 2 | Pending |
| PARSE-06 | Phase 3 | Pending |
| DEP-01 | Phase 1 | Pending |
| DEP-02 | Phase 1 | Pending |
| FW-01 | Phase 3 | Pending |
| FW-02 | Phase 3 | Pending |
| FW-03 | Phase 3 | Pending |
| FW-04 | Phase 3 | Pending |
| FW-05 | Phase 3 | Pending |
| ERR-01 | Phase 1 | Pending |
| ERR-02 | Phase 1 | Pending |
| ERR-03 | Phase 1 | Pending |
| OFFSET-01 | Phase 2 | Pending |
| OFFSET-02 | Phase 1 | Pending |
| ASYNC-01 | Phase 4 | Pending |
| ASYNC-02 | Phase 4 | Pending |
| ASYNC-03 | Phase 4 | Pending |
| ASYNC-04 | Phase 4 | Pending |
| SHADOW-01 | Phase 4 | Pending |
| SHADOW-02 | Phase 5 | Pending |
| SHADOW-03 | Phase 5 | Pending |
| PERF-01 | Phase 5 | Pending |
| PERF-02 | Phase 1 | Pending |
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 2 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 3 | Pending |
| CLEAN-01 | Phase 6 | Pending |
| CLEAN-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-31*
*Last updated: 2026-05-31 — traceability populated after roadmap creation (33/33 mapped, 0 unmapped)*
