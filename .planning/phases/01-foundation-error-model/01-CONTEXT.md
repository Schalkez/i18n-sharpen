# Phase 1: Foundation & Error Model - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

The shared **foundation** every later AST parser stands on — **not** the parsers themselves. This phase delivers four things:

1. **Workspace dependency resolver** + optional-peer-dep declarations (DEP-01, DEP-02).
2. **Error model split** — a distinct *fatal* missing-dependency kind vs a *collected-and-continue* file-parse error, with distinct exit codes (ERR-01, ERR-02, ERR-03).
3. **Lazy parser loading** so JSON-only runs pay zero parser cold-start (PERF-02).
4. **The locked `ParsedFileResult` output contract** that Phase 2/3 parsers build to.

Plus a constraint: line reporting reuses the existing `src/core/scanner/lines.ts` utilities unchanged (OFFSET-02).

**Out of this phase:** actually parsing source into ASTs, extracting keys / dynamic calls / hardcoded candidates (Phase 2), framework compilers + dispatcher (Phase 3), the async migration (Phase 4), shadow comparison + default flip (Phase 5), regex deletion (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Error-kind taxonomy
- **D-01:** Add a new **`missing-dependency`** kind to the `I18nError` union in `src/core/errors.ts`: `{ kind: "missing-dependency"; packageName: string; installCommand: string; message: string }`. It is **fatal** and thrown as `I18nSharpenError` (caught only by `cli.ts`). Distinct from the existing `parse` kind. Used for both a missing `typescript` and a missing framework compiler.
- **D-02:** Collected (non-fatal) file-syntax errors are a **separate lightweight data type** — e.g. `FileParseError { file: string; line?: number; message: string }` — accumulated in the scan result and reported, **never thrown**. This preserves the existing invariant documented in `errors.ts` that the library "only ever throws `I18nSharpenError`." (ERR-01)
- *(ERR-02 satisfied: fatal `missing-dependency` and collected `FileParseError` are distinct types on distinct code paths; both get unit tests per Success Criterion 3.)*

### Exit code scheme (ERR-03)
- **D-03:** ESLint-style exit codes: **`0`** = clean, **`1`** = i18n validation findings (missing keys, active placeholders, cross-locale misalignment, hardcoded strings), **`2`** = tool-fatal (missing dependency/compiler, config error). `cli.ts` remains the single site that maps state → exit code.
- **D-04:** Collected file-parse errors do **not** change the exit code by default — it stays driven by i18n findings (0/1). The future `--strict-syntax` mode (deferred STRICT-01) is the opt-in that would make them fail. Keeps "one bad file ≠ failed CI."

### Install-command UX (DEP-02 / FW-05)
- **D-05:** The `missing-dependency` error's `installCommand` is built by **detecting the user's package manager from their lockfile** — `pnpm-lock.yaml`→`pnpm`, `yarn.lock`→`yarn`, `package-lock.json`→`npm`, `bun.lockb`/`bun.lock`→`bun` — printing the matching `add -D` / `install -D` form. **Fallback to npm** when no lockfile is found.
- **D-06:** Missing `typescript` uses the **same unified resolver and `missing-dependency` error** as a missing framework compiler — only `packageName` differs, no special-casing. The message names the **triggering file extension**, the **missing package**, and the **install command** (mirroring the roadmap success-criteria phrasing, e.g. `Cannot scan .vue files: '@vue/compiler-sfc' is not installed. Run: pnpm add -D @vue/compiler-sfc`).

### Shared type contract
- **D-07:** The `ParsedFileResult` parser-output contract is **locked in this phase** (not deferred to Phase 2): `ParsedFileResult { usedKeys; dynamicCalls; hardcodedCandidates }` with **document-absolute offsets**, giving Phase 2/3 a stable build target (matches the roadmap's "shared types every parser depends on"). The top-level contract is fixed here; exact member field shapes are refined in Phase 2 against PARSE-01..05.
- **D-08:** Parser contracts live in a **new dedicated module `src/core/scanner/parsers/types.ts`**, deliberately kept out of the public `src/types.ts` API surface.

### Claude's Discretion
- **Lazy-load mechanism (PERF-02):** behavior is fixed (zero parser cold-start for JSON-only runs); the mechanism (dynamic `import()` of the parser gated on the first JS/TS file, etc.) is open.
- **Resolver internals:** `createRequire(cwd)` / `require.resolve` with `paths`, plus any caching of resolved modules.
- **Peer-dep declaration mechanics:** `peerDependencies` + `peerDependenciesMeta.optional` vs alternatives — whatever yields **no new bundled `@babel/*`/runtime dep** (Success Criterion 1).
- **Exact field shapes** inside `usedKeys` / `dynamicCalls` / `hardcodedCandidates` (finalized in Phase 2).
- **Test file layout / naming** for the new error + resolver units.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external `docs/` ADRs or design specs exist in this repo — requirements and decisions live entirely in `.planning/`.

### Requirements & scope
- `.planning/REQUIREMENTS.md` — definitions for **DEP-01, DEP-02, ERR-01, ERR-02, ERR-03, OFFSET-02, PERF-02** (this phase's reqs); the Out-of-Scope table; deferred **STRICT-01** / **DEPFALL-01**.
- `.planning/ROADMAP.md` §"Phase 1: Foundation & Error Model" — the **5 success criteria** this phase is verified against.

### Project decisions & constraints
- `.planning/PROJECT.md` §Constraints + §Key Decisions — **TypeScript Compiler API as optional peer dep (not Babel)** ratified; tiny-dependency-tree constraint; safety + CI-friendliness constraints; Node ≥ 20 / ESM.

### Implementation seed (PARTIALLY SUPERSEDED — read with care)
- `.planning/v0.4.0-SEED-PLAN.md` §"Phase 1: Hạ tầng & Interface" — directional sketch of the workspace loader (`resolve.ts`) and `parsers/types.ts`. **WARNING:** its `@babel/parser` / `@babel/traverse` dependency choice and the "bundle size +4.7MB" section are **SUPERSEDED** by the TypeScript Compiler API decision (PROJECT.md). Use only the resolver / types / error-handling *shape*; ignore all Babel specifics and the "Strict Fail-Fast / no fallback" stance (this milestone uses collect-and-continue for file errors, not fail-fast).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/core/errors.ts`** — `I18nSharpenError` + `I18nError` union (`config | filesystem | parse | validation`). This phase **extends** the union with `missing-dependency` (D-01). `src/core/errors.test.ts` shows the established unit-test pattern for the union.
- **`src/cli.ts`** — `reportError()` + the per-command `try/catch` that sets `process.exitCode`. This is the **sole catch site** for `I18nSharpenError` and where the 0/1/2 mapping (D-03) is implemented. It currently sets `1` on any caught error — needs the fatal→`2` distinction.
- **`src/core/scanner/lines.ts`** — `computeLineOffsets()` + `offsetToLine()` (O(log n) binary search). **OFFSET-02** mandates reusing these unchanged; document-absolute offsets in `ParsedFileResult` (D-07) feed straight into `offsetToLine`.
- **`src/core/scanner/files.ts`** — `scanSourceFiles()` / `getFiles()` already walk `config.scanDirs` filtered by `fileExtensions`. The lazy-load boundary (PERF-02) sits between file discovery here and the parser.
- **`src/core/scanner/index.ts`** — current synchronous `detectUsedKeys(files, matchFunctions, matchAttributes) → { usedKeys, fileContents }`. Reworked async in Phase 4; Phase 1 only lays foundations beneath it.
- **`src/types.ts`** — public shared types (`I18nSharpenConfig`, `ValidationResults`, `DynamicKeyFinding`…). Parser contracts deliberately do **not** go here (D-08).

### Established Patterns
- **Discriminated-union errors** — branch on `err.error.kind`; extend the union, don't replace it.
- **`process.exitCode = …` (never `process.exit()`)** so piped stdout drains fully (see LO-01 comment in `cli.ts`) — preserve when adding code `2`.
- **Quality gate:** ESM, Node ≥ 20, `tsup`, strict ESLint (`no-explicit-any: error`, `consistent-type-imports: error`); all commits must pass `pnpm tsc --noEmit && pnpm test && pnpm build`.
- **`@/types` path alias** is in use (see `files.ts`).

### Integration Points
- **`package.json`** — declare `typescript` + framework compilers as **optional peer deps** (DEP-01); verify `pnpm build` adds no new bundled runtime dep.
- **`src/core/errors.ts`** — union extension (`missing-dependency`).
- **`src/cli.ts`** — 0/1/2 exit-code mapping.
- **New `src/core/scanner/parsers/`** — `types.ts` (contract, D-08) + the workspace resolver module.

</code_context>

<specifics>
## Specific Ideas

- "**ESLint-style exit codes**" was the explicit anchor for D-03: `0` ok / `1` findings / `2` fatal — familiar to CI authors.
- The resolver error should read like the roadmap's example: name the extension that can't be scanned, the missing package, and the exact (PM-detected) install command.

</specifics>

<deferred>
## Deferred Ideas

- **`--strict-syntax` mode (STRICT-01)** — make collected file-parse errors fail CI with a non-zero exit. Deferred this milestone; D-04 intentionally leaves the hook for it.
- **Bundled slim-Babel fallback (DEPFALL-01)** — for projects with no `typescript`. Deferred; a single TS-Compiler-API parser path for now.

*(No reviewed-but-deferred todos — `todo match-phase 1` returned none.)*

</deferred>

---

*Phase: 01-foundation-error-model*
*Context gathered: 2026-05-31*
