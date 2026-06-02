# Phase 4: Async Migration (shadow mode on, regex still default) - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `detectUsedKeys` **async** with a bounded-concurrency parse pool and an internal `useAst` flag (default **false**). Cascade `Promise` through `validate` / `extract` / `prune`, the public API (`src/index.ts`), and `cli.ts`. The **regex engine remains the default** so no end-user behavior changes. `fileContents` stays in the return value so `looseKeyMatch` keeps working. The Phase 3 `parseFile()` dispatcher is wired in as the engine **behind the flag** and is exercisable end-to-end before the default is flipped.

**In scope:** ASYNC-01 (async `detectUsedKeys` + return shape), ASYNC-02 (async cascade through commands/public API/CLI), ASYNC-03 (`fileContents` preserved for `looseKeyMatch` + regression test), ASYNC-04 (bounded-concurrency pool, no unbounded `Promise.all`), SHADOW-01 (AST path gated behind a flag; regex stays default).

**Out of scope:** the differential shadow harness, the perf gate, and flipping `useAst` to default true (Phase 5); deleting `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim, relocating `isHardcodedIgnored`, removing the flag (Phase 6). Exposing concurrency or the AST engine as a **public/user-facing** option (deferred — see below). No `package.json` changes expected (peer deps already declared in Phase 1).

</domain>

<decisions>
## Implementation Decisions

### Async cascade (ASYNC-01, ASYNC-02)
- **D-01:** `detectUsedKeys` becomes `async` and returns **`{ usedKeys, fileContents, parsedResults, parseErrors }`**. This extends ASYNC-01's documented 3-field shape (`usedKeys`, `fileContents`, `parsedResults`) with a fourth field **`parseErrors: FileParseError[]`** (see D-12) — intentional, so the collected-and-continue errors have a programmatic home for Phase 5.
- **D-02:** `validate` and `extract` become `async` (return `Promise`). `prune` is **already** async (interactive TUI). `cli.ts` already `await`s `prune`; add `await` to the `validate` and `extract` call sites. `src/index.ts` re-exports them unchanged (the functions are now `Promise`-returning).
- **D-03:** `pnpm tsc --noEmit` must pass with zero errors after every caller is updated; only `I18nSharpenError` is ever thrown (unchanged invariant).

### AST wiring depth — FULL wiring (the central decision)
- **D-04:** When `useAst: true`, `parsedResults` **fully drives `validate`**: used keys, the key→file map (`keyToFilesMap`), dynamic-key findings (`fullyDynamic` + `structuredConcat`), and hardcoded candidates are all derived from `parsedResults[i]` (parallel to `files`). The regex re-scan loop in `validate.ts` (the `buildKeyRegex`/`buildAttrRegex`/`buildDynamicCallRegex` `matchAll` loop at [validate.ts:130-249](../../../src/commands/validate.ts) and the `scanTemplateTextNodes` hardcoded block) runs **only** in regex mode (`useAst: false`).
- **D-05:** `validate` **branches on `useAst`** into two code paths that must produce **equivalent `ValidationResults`**. Roadmap criterion #5 means the existing dynamic-key and hardcoded tests must pass under **both** paths — so the AST branch is real wiring, not a stub. (Whether the branch is an inline `if (useAst)` or extracted helpers is Claude's discretion, provided both paths yield equivalent results.)
- **D-06:** Hardcoded candidates in `parsedResults` are **raw/structural** (Phase 2 D-10). The **caller** still applies `isHardcodedIgnored` quality filtering (Phase 2 D-11 boundary preserved). `--check-hardcoded` still gates the hardcoded work in both modes; `config.hardcoded.ignore` custom globs still applied by the caller.
- **D-07:** `looseKeyMatch` is **independent of `useAst`** — it operates on `fileContents` (string `includes`), which is preserved in both modes (ASYNC-03). A regression test must assert `looseKeyMatch` still finds a key present only in stripped content after the async refactor (criterion #3).

### `useAst` flag surface — INTERNAL only
- **D-08:** `useAst` is an **internal option**, never user-facing in this phase. It lives on the new `detectUsedKeys` `opts` (D-10) and is threaded through `validate`/`extract`/`prune` via their existing `options` params. It is **NOT** added to `I18nSharpenConfig`, the zod config schema, public `src/types.ts`, or `cli.ts`. Default `false` everywhere.
- **D-09:** Tests and the Phase 5 shadow harness flip `useAst` **directly** via the options param. There is **no public / CLI / env-var way** to enable the AST path in Phase 4 — the public surface stays byte-identical to v0.3.0 with the default.

### `detectUsedKeys` signature — HYBRID (3 positional + opts)
- **D-10:** New signature: **`detectUsedKeys(files, matchFunctions, matchAttributes, opts?): Promise<{ usedKeys, fileContents, parsedResults, parseErrors }>`** where `opts = { cwd?: string; useAst?: boolean; maxConcurrency?: number }`. Existing 3-arg call sites add only `await` (and `cwd` via `opts` when AST is needed). The async migration already forces touching every call site, so the marginal churn is just the `await` — ported regex tests keep their 3 positional args. `cwd` is required by `parseFile` for workspace-dependency resolution and is passed through `opts`.

### Concurrency pool — hand-rolled, fixed 4
- **D-11:** A **tiny zero-dependency async worker pool** (N workers draining a shared queue/index over `files`). **No new dependency** (no `p-limit`) — honors the "keep the dep tree tiny / no new runtime deps" constraint. Never use `Promise.all` over all files (ASYNC-04).
- **D-12:** Concurrency is **fixed at 4** internally. `maxConcurrency` exists on `opts` as an **internal override for tests/harness only** — it is **not** user-configurable (no config field, no CLI flag). Default 4.
- **D-13:** The pool runs **only in AST mode**. In regex mode the existing synchronous `readFileSync` + `stripComments` path is preserved unchanged — zero behavioral/perf change, and PERF-02 (no parser cold-start on JSON-only / regex runs) stays intact because `parseFile` is never imported/called when `useAst: false`.

### Parse-error handling (collect-and-continue, ERR-01 made visible)
- **D-14:** `detectUsedKeys` aggregates each `parseFile` call's `errors` array into the returned **`parseErrors: FileParseError[]`** (D-01). `validate`/`extract`/`prune` **log them as warnings** (`log.warn`) so collect-and-continue stays visible even behind the flag. Regex mode produces none (empty array). This gives Phase 5's shadow harness the error data it needs to report. A single bad file never aborts the run; missing-compiler stays fatal (`I18nSharpenError`, Phase 1/3 contract).

### Claude's Discretion
- Internal worker-pool structure (queue vs atomic index counter), file/module location, and naming.
- Whether the `validate` AST branch is inline `if (useAst)` or extracted helper functions — as long as both paths produce equivalent `ValidationResults`.
- Exact `log.warn` wording/format for collected `parseErrors`.
- `opts` field defaulting mechanics (`cwd ?? process.cwd()`, `maxConcurrency ?? 4`, `useAst ?? false`).
- Updating the JSDoc usage examples in `src/index.ts` to show `await validate(...)` / `await extract(...)`.
- How `extract` (uses only `usedKeys`) and `prune` (uses `usedKeys` + `fileContents`) consume the AST path — both are far lighter consumers than `validate`; full wiring there is mostly "derive `usedKeys` from `parsedResults`, keep `fileContents` for `looseKeyMatch`".

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external `docs/` ADRs or design specs exist in this repo — requirements and decisions live entirely in `.planning/` and the source tree.

### Requirements & success criteria
- `.planning/REQUIREMENTS.md` — definitions for **ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04, SHADOW-01** (this phase's reqs); the Out-of-Scope table; deferred **CACHE-01 / STRICT-01**.
- `.planning/ROADMAP.md` §"Phase 4: Async Migration (shadow mode on, regex still default)" — the **5 success criteria** this phase is verified against (async cascade + `tsc` clean; regex-default == v0.3.0; `fileContents`/`looseKeyMatch` regression test; bounded pool max 4, no `Promise.all`; `useAst:true` passes all tests end-to-end).

### Locked contracts (Phases 1–3 — build to these, don't change)
- `src/core/scanner/parsers/index.ts` — **`parseFile(source, filePath, matchFunctions, matchAttributes, cwd): Promise<{ result: ParsedFileResult; errors: FileParseError[] }>`** — the async dispatcher Phase 4 wires in as the engine.
- `src/core/scanner/parsers/types.ts` — `ParsedFileResult { usedKeys, dynamicCalls, hardcodedCandidates }` + `FileParseError` (the shapes the AST branch consumes).
- `src/core/scanner/parsers/resolve.ts` — `loadWorkspaceDep`/`detectPackageManager` (used internally by `parseFile`; missing compiler → fatal `I18nSharpenError`).
- `src/core/scanner/lines.ts` — `computeLineOffsets`/`offsetToLine` (reused unchanged, OFFSET-02; document-absolute offsets from `parsedResults` feed straight in).
- `.planning/phases/02-js-ts-parser-core-golden-cases/02-CONTEXT.md` — Phase 2 detection semantics: D-07 callee matching, D-08 attribute container gain, D-10 structural / D-11 caller-side quality filtering boundary, D-02 dynamic classification parity. **The AST branch must honor D-11 (caller applies `isHardcodedIgnored`).**
- `.planning/phases/03-framework-parsers-dispatcher/03-CONTEXT.md` — Phase 3 dispatcher decisions (D-01..D-03 dispatcher async boundary, D-14/D-15 offset rebasing).
- `.planning/phases/01-foundation-error-model/01-CONTEXT.md` — error-kind taxonomy (fatal `missing-dependency` vs collected `FileParseError`), 0/1/2 exit codes (D-03/D-04), lazy parser loading (PERF-02).

### Behavioral source-of-truth (the files Phase 4 rewires)
- `src/core/scanner/index.ts` — current **synchronous** `detectUsedKeys(files, matchFunctions, matchAttributes) → { usedKeys, fileContents }`; the function being made async (D-10).
- `src/commands/validate.ts` — the **heavy consumer**: the regex re-scan loop building `keyToFilesMap` + dynamic findings (lines ~130-189), `looseKeyMatch` second pass (~191-213), and the `--check-hardcoded` `scanTemplateTextNodes` block (~219-249). This is the code the AST branch must mirror (D-04/D-05/D-06).
- `src/commands/extract.ts` — light consumer (uses only `usedKeys`).
- `src/commands/prune.ts` — already `async`; uses `usedKeys` + `fileContents`.
- `src/cli.ts` — the **sole** `await` + exit-code site; `validate`/`extract` call sites need `await` (`prune` already awaited at line 206).
- `src/core/scanner.test.ts` (line 168) — calls `detectUsedKeys([f], ["t"], [])`; must add `await` after D-10.

### Project decisions & constraints
- `.planning/PROJECT.md` §Constraints + §Key Decisions — **TypeScript Compiler API optional peer dep (not Babel)**; keep the runtime dep tree tiny (drives D-11 hand-rolled pool, no `p-limit`); sub-second perf / ≤100ms overhead budget; additive-only mid-milestone (regex default = no observable change); Node ≥ 20 / ESM; strict ESLint quality gate (`no-explicit-any: error`, `consistent-type-imports: error`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/core/scanner/parsers/index.ts` — `parseFile()`** — the Phase 3 async dispatcher; Phase 4's job is to call it through the bounded pool when `useAst:true` and aggregate `{ result, errors }` into `detectUsedKeys`'s return.
- **`src/core/scanner/parsers/types.ts`** — `ParsedFileResult` + `FileParseError`; the AST-branch data source and the carrier for `parseErrors`.
- **`src/core/scanner/lines.ts`** — `computeLineOffsets`/`offsetToLine`, reused unchanged for both paths.
- **`src/core/scanner/hardcoded.ts` — `isHardcodedIgnored`** — applied by the caller in the AST branch (D-06), exactly as the regex path does today.
- **`src/core/scanner/{regex,text,dynamic}.ts`** — left **untouched**; they remain the live default (regex) path. Deletion/relocation is Phase 6.

### Established Patterns
- **`prune` is already async** — the async cascade is partially done; only `validate`/`extract` and their `cli.ts` call sites change for `await`.
- **`process.exitCode`, never `process.exit()`**; only `I18nSharpenError` thrown; collected file errors are `FileParseError` (never thrown) — preserved by D-14.
- **Additive / no-regression** — regex stays default; AST behind an internal flag; no `package.json` change; PERF-02 cold-start preserved (D-13).
- **Quality gate:** ESM, Node ≥ 20, `tsup`, strict ESLint; every commit passes `pnpm tsc --noEmit && pnpm test && pnpm build`. `@/` path alias in use.

### Integration Points
- **`src/core/scanner/index.ts`** — `detectUsedKeys` async + hybrid signature + bounded pool + `parseErrors` aggregation (the core change).
- **`src/commands/validate.ts`** — branch on `useAst` (full wiring); `await detectUsedKeys`; `log.warn` parseErrors.
- **`src/commands/extract.ts`** — `async`; `await detectUsedKeys`; derive `usedKeys` from AST path when on.
- **`src/commands/prune.ts`** — already async; `await detectUsedKeys`; keep `fileContents` for `looseKeyMatch`.
- **`src/cli.ts`** — `await validate(...)` / `await extract(...)` (lines ~97, ~144).
- **`src/index.ts`** — JSDoc examples updated to `await` (discretion).
- **Tests** — port `detectUsedKeys` call sites to `await`; add the `looseKeyMatch`-after-async regression test (ASYNC-03); add a test that runs the suite with `useAst:true` (criterion #5) and one asserting bounded concurrency / no `Promise.all` (ASYNC-04).

</code_context>

<specifics>
## Specific Ideas

- The phrase that anchors the whole phase: **"no observable behavior change with the regex default."** Every decision optimizes for a byte-identical public surface in default mode, with the AST path fully built and testable behind an internal switch.
- `validate.ts` is the real work — it re-derives key→file map, dynamic findings, and hardcoded candidates from `fileContents` via regex today. Full wiring (D-04) means the AST branch produces those same three from `parsedResults`, so Phase 5's shadow harness diffs *true* end-to-end `ValidationResults`, not a half-wired stub.
- Extending the return with `parseErrors` (D-01) is a deliberate, small superset of ASYNC-01 — it gives the collect-and-continue promise (ERR-01) a visible, programmatic home rather than swallowing errors.
- `maxConcurrency` is intentionally a hidden test/harness override (D-12), not a user knob — exposing it publicly is deferred until real demand on very large repos (ties to CACHE-01-style perf work).

</specifics>

<deferred>
## Deferred Ideas

- **Public `maxConcurrency` config field / CLI flag** — kept internal (D-12); promote only on real large-repo demand (adjacent to deferred CACHE-01).
- **Exposing the AST engine to users** (config field / CLI flag / env var) — rejected for Phase 4 (D-08/D-09); the default flip is Phase 5, and the flag is removed entirely in Phase 6.
- **Shadow differential harness + perf gate + default flip** — Phase 5 (SHADOW-02, SHADOW-03, PERF-01); Phase 5 consumes the `parseErrors` field added here.
- **Deleting `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim, relocating `isHardcodedIgnored` → `text.ts`, removing the `useAst` flag** — Phase 6 (CLEAN-01).
- **`--strict-syntax` mode** (make collected `FileParseError`s fail CI) — deferred STRICT-01; D-14 leaves the hook (errors are now returned + logged).

*(No reviewed-but-deferred todos — `todo match-phase 4` returned none. No scope creep raised during discussion.)*

</deferred>

---

*Phase: 04-async-migration-shadow-mode-on-regex-still-default*
*Context gathered: 2026-06-01*
