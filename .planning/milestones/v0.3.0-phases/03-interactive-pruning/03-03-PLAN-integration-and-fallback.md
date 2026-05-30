---
phase: 03-interactive-pruning
plan: 03
type: execute
wave: 2
depends_on:
  - "03-01"
  - "03-02"
files_modified:
  - src/commands/prune.ts
  - src/commands/prune/plans.ts
  - src/__tests__/prune.test.ts
  - CHANGELOG.md
autonomous: true
requirements:
  - IPRUNE-01
  - IPRUNE-04
  - IPRUNE-05
  - IPRUNE-06
tags:
  - integration
  - tty-detection
  - write-gate
  - changelog
  - integration-tests

must_haves:
  truths:
    - "prune(config, cwd, { interactive: true }) in a TTY launches the Plan 02 TUI and prunes ONLY the keys the user CHECKED (per D-05 toDelete semantics); untoggled keys remain in locale files"
    - "prune --interactive --force in a TTY writes the toggled selection to disk via the existing writeLocaleFilesAtomic path"
    - "prune --interactive WITHOUT --force prints a PRUNE PREVIEW (interactive — no files written) header, lists selected keys, exits dry-run (D-09)"
    - "prune --interactive --dry-run behaves identically to prune --interactive alone — same header, no writes, no error about conflicting flags (D-10)"
    - "prune --interactive in a non-TTY skips the TUI, prints `--interactive requires a TTY; falling back to dry-run preview of all candidates.`, runs the existing dry-run path, exits 0 (D-14, IPRUNE-06)"
    - "prune --interactive --force in a non-TTY refuses to write: prints the two-line D-15 warning verbatim — line 1: `--interactive requires a TTY; --force ignored to avoid unintended bulk prune.` line 2: `Falling back to dry-run preview of all candidates.` — runs dry-run, exits 0 (D-15)"
    - "Empty candidate list short-circuits the TUI: prints the existing `✨ No unused keys` log, no TUI invocation (D-16)"
    - "After a successful interactive write, the summary is preambled with `Interactive selection: kept M keys, removed N keys.` (D-12)"
    - "Esc cancel in TTY: tuiResult.cancelled === true and tuiResult.toDelete is empty; orchestrator sets process.exitCode = 130 and returns without writing (IPRUNE-04 — orchestrator-level surface; Plan 02 owns the renderer-level cancel signal)"
    - "Ctrl+C cancel in TTY: InteractiveCancelledError caught by orchestrator (Plan 02 already called exit(130) inside the renderer); orchestrator sets process.exitCode = 130 defensively and returns without writing (IPRUNE-04 — orchestrator-level surface)"
    - "--clean-empty + --interactive + --force in namespaced layout: empty namespace files are deleted POST-write per Phase 1 D-09 (no new TUI step for ns deletion — D-11)"
    - "Implicit dependency: Plan 01 must land before Plan 03 because cli.ts must already `await` the prune call before prune.ts becomes async. Plan 01 already shipped this — Plan 03 makes NO cli.ts edits."
  artifacts:
    - path: src/commands/prune.ts
      provides: "interactive branch: TTY detection (D-13), non-TTY fallback (D-14/D-15), empty short-circuit (D-16), candidate computation, TUI invocation, selection-to-usedKeys translation, error handling for InteractiveCancelledError, process.exitCode = 130 on both Esc and Ctrl+C paths (IPRUNE-04)"
      contains: "options.interactive"
    - path: src/commands/prune/plans.ts
      provides: "executePrunePlans + pruneFlat + pruneNamespaced all accept an optional `interactiveSummary?: { kept: number; removed: number }` and forward it through to the dry-run header (D-09: `PRUNE PREVIEW (interactive — no files written)`) and the success preamble (D-12: `Interactive selection: kept M keys, removed N keys.`); plus exported helpers `collectFlatCandidates(...)` and `collectNamespacedCandidates(...)` that compute the candidate string[] for the TUI BEFORE the selection filter"
      contains: "Interactive selection:"
    - path: src/__tests__/prune.test.ts
      provides: "7 integration tests from D-18 (the original 6 + a new Test 7 for D-10) — TUI write-on-force, dry-run preview, dry-run-equiv-to-no-force (D-10), empty short-circuit, non-TTY fallback, non-TTY + --force refuses-to-write, --clean-empty + --interactive composition"
      min_lines: 600
    - path: CHANGELOG.md
      provides: "v0.3.0 [Added] entry: `prune --interactive` flag with IPRUNE-01..06 summary; non-TTY safety note for D-15"
      contains: "prune --interactive"
  key_links:
    - from: src/commands/prune.ts
      to: src/commands/prune/interactive.ts
      via: "import { runInteractivePrune, InteractiveCancelledError } from \"./prune/interactive\""
      pattern: "runInteractivePrune"
    - from: src/commands/prune.ts
      to: src/commands/prune/plans.ts
      via: "the interactive branch calls collectFlatCandidates/collectNamespacedCandidates, then re-uses pruneFlat/pruneNamespaced with an augmented usedKeys set and an interactiveSummary param"
      pattern: "collectFlatCandidates\\|collectNamespacedCandidates"
    - from: src/__tests__/prune.test.ts
      to: src/commands/prune.ts
      via: "end-to-end prune() invocation with mocked process.stdin.isTTY and a fake-keystroke driver"
      pattern: "prune\\(config, tempDir"

implicit_dependency:
  note: "Plan 01 ships an `async` `.action(...)` callback in src/cli.ts that already `await`s the synchronous `prune(...)` return. Plan 03 converts `prune()` to async (returning Promise<PruneResult>) WITHOUT touching cli.ts — the await on the caller side is already in place from Plan 01. This is the reason Plan 03's files_modified list does NOT include src/cli.ts."
---

<objective>
Phase 3, Plan 3: Wire Plan 01's flag surface and Plan 02's renderer into `src/commands/prune.ts`. Add TTY detection (D-13), non-TTY fallback semantics (D-14 / D-15), empty-candidate short-circuit (D-16), interactive summary preamble (D-12), `--clean-empty` composition (D-11), and the full integration test matrix from D-18 (now 7 tests — original 6 + new D-10 dry-run-equivalence test).

Purpose: This is the plan that delivers the end-to-end IPRUNE-01..06 phase goal. Plan 01 made the flag passable AND pre-converted the cli.ts action callback to async so cli.ts ownership stays in Plan 01. Plan 02 made the picker work in isolation with a locked `toDelete: Set<string>` result contract. Plan 03 makes `prune --interactive` actually do what the user expects in every flag combination (and refuses to do the wrong thing in the dangerous non-TTY + --force case).

**Cross-plan contracts already locked (do NOT renegotiate):**
- Plan 02 `InteractivePruneResult.toDelete: Set<string>` — checked rows = mark-for-delete (per D-05). Plan 03 consumes this directly: `kept = candidates − tuiResult.toDelete`. No inversion logic in the orchestrator.
- Plan 02 Esc path → resolves with `{ toDelete: empty, cancelled: true }` and does NOT call `exit`. Plan 03 inspects `tuiResult.cancelled` and sets `process.exitCode = 130`.
- Plan 02 Ctrl+C path → rejects with `InteractiveCancelledError` AND calls `exit(130)` (via the injected hook). Plan 03 catches the sentinel error by `instanceof`, sets `process.exitCode = 130` defensively (production `exit(130)` would have already terminated, but tests inject a no-op `exit` so the orchestrator path is reachable), and returns.
- Plan 01 `src/cli.ts` already `await`s `prune(...)` from an `async` action callback. Plan 03 makes `prune()` itself `async` returning `Promise<PruneResult>` without any further cli.ts edit.

Output:
- `src/commands/prune.ts` gains a fully-fledged interactive branch covering: D-13 TTY detection, D-14 non-TTY fallback, D-15 non-TTY + --force refusal, D-16 empty candidate short-circuit, D-12 summary preamble, D-11 --clean-empty composition. `prune()` is converted to `async` and now returns `Promise<PruneResult>`.
- `src/commands/prune/plans.ts` gains: (a) `collectFlatCandidates` / `collectNamespacedCandidates` exported helpers that return the flat `string[]` of unused-key candidates the TUI displays (computed BEFORE the existing pipeline filter, so the TUI's "toDelete" choice can be turned into an augmented usedKeys set); (b) an optional `interactiveSummary` param threaded through `executePrunePlans`, `pruneFlat`, AND `pruneNamespaced` so the interactive dry-run header (D-09) and the success preamble (D-12) fire when the orchestrator passes the param.
- `src/__tests__/prune.test.ts` gains the 7 integration tests (CONTEXT.md D-18 Integration tests bullet's 6 + the new D-10 Test 7), plus every existing `it(...)` is converted to `async () => { ... }` with `await prune(...)`.
- `CHANGELOG.md` gains a v0.3.0 [Added] entry under the existing `## [0.3.0] - Unreleased` heading.

Wave 2: depends on Plan 01 (PruneOptions.interactive + CLI flag + async action+await) and Plan 02 (runInteractivePrune + InteractivePruneResult{toDelete} + InteractiveCancelledError).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-interactive-pruning/03-CONTEXT.md
@.planning/phases/03-interactive-pruning/03-01-SUMMARY.md
@.planning/phases/03-interactive-pruning/03-02-SUMMARY.md
@.planning/phases/01-auto-sorting-keys-namespace-hardening/01-CONTEXT.md
@CLAUDE.md

<interfaces>
<!-- All contracts already shipped by Plans 01 + 02 + prior phases. -->

From Plan 01 (src/types.ts):
```typescript
export interface PruneOptions {
  force?: boolean
  dryRun?: boolean
  interactive?: boolean   // NEW from Plan 01
}
```

From Plan 01 (src/cli.ts) — already shipped, do NOT touch in Plan 03:
```typescript
.action(async (cmdOpts: { ...; interactive?: boolean }) => {
  // ...
  await prune(config, cwd, {
    force: cmdOpts.force === true,
    dryRun: cmdOpts.dryRun === true,
    interactive: cmdOpts.interactive === true
  })
})
```

From Plan 02 (src/commands/prune/interactive.ts) — LOCKED contract:
```typescript
export interface InteractivePruneOptions {
  stdin?: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (b: boolean) => unknown }
  stdout?: NodeJS.WritableStream & { isTTY?: boolean; columns?: number; rows?: number }
  exit?: (code: number) => void
  escDelay?: number  // D-20 — optional; Plan 03 relies on the 50ms default and never passes it
}
export interface InteractivePruneResult {
  /** Candidate keys the user CHECKED — per D-05, checked = mark-for-delete. */
  toDelete: Set<string>
  /** True on Esc (clean). On Ctrl+C the promise rejects instead. */
  cancelled: boolean
}
export class InteractiveCancelledError extends Error { readonly code = 130 }
export function runInteractivePrune(candidates: string[], options?: InteractivePruneOptions): Promise<InteractivePruneResult>
```

From src/commands/prune.ts:17-63 — current orchestrator (Plan 03 converts to async, extends with interactive branch):
```typescript
export function prune(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options: PruneOptions = {}
): PruneResult
```

After Plan 03:
```typescript
export async function prune(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options: PruneOptions = {}
): Promise<PruneResult>
```

Existing dry-run resolution (line 27): `const dryRun = optDryRun ? true : !(optForce || configForce)`.
This stays as the source of truth. The interactive branch produces a *modified usedKeys set* that augments the existing pipeline; the dry-run gate is unchanged except in the D-15 non-TTY-with-force safety override where dryRun is forced true.

From src/commands/prune/plans.ts:
- `executePrunePlans(writePlans, perLocale, dryRun)` lines 32-95 — current success log line 87-89: `Files have been successfully cleaned! Total pruned: N keys.` The D-12 preamble is added BEFORE this line, only when an `interactiveSummary` is passed.
- `pruneFlat(config, localesDirAbs, usedKeys, fileContents, dryRun)` lines 151-251 — receives `usedKeys: Set<string>`; the interactive branch augments this set with the user's keep selection before calling. Task 1 threads `interactiveSummary` through this function.
- `pruneNamespaced(config, localesDirAbs, usedKeys, fileContents, dryRun)` lines 257-408 — same: `usedKeys` is the input; we augment it with namespaced keys (`ns:key.path` form) from the user's selection. Task 1 threads `interactiveSummary` through this function.

From src/utils.ts:62-78 — log helpers (the warning text emitted in D-14 / D-15 goes through `log.warn`).
</interfaces>

<existing_test_pattern>
From src/__tests__/prune.test.ts (the integration-test pattern Plan 03 extends):
```typescript
const tempDir = getTempDir()
createMockProject(tempDir, { "src/index.ts": "t('used')", "locales/en.json": JSON.stringify({...}) })
const result = prune(config, tempDir, { force: true })
expect(result.totalPruned).toBe(N)
// fs reads + log spy assertions
```

The interactive integration tests need ONE extra ingredient: a way to drive the TUI's stdin without a real terminal. Plan 02 already exposed `runInteractivePrune({ stdin, stdout, exit })` for this purpose. For the integration tests, Plan 03 introduces a minimal seam in `prune()`: a module-level `__setInteractiveIOForTests(opts)` exported from `src/commands/prune.ts`. Tests call it in `beforeEach` and reset to `undefined` in `afterEach`. The `prune()` orchestrator passes the override (if set) to `runInteractivePrune(candidates, override)`. The name starts with `__` to signal "not for external consumption" while remaining technically reachable for tests without polluting the typed public API.
</existing_test_pattern>
</context>

<validation_gates>
<!-- D-XX coverage gates for Plan 03 — the integration scope. -->

| D-XX | Decision | Test/grep gate |
|------|----------|-----------------|
| D-09 | --interactive WITHOUT --force → dry-run preview header `PRUNE PREVIEW (interactive — no files written)` | `grep -n "PRUNE PREVIEW (interactive" src/commands/prune/plans.ts` returns ≥1; integration test `prune --interactive without --force` asserts log line contains this string |
| D-10 | --interactive --dry-run no-op equivalent to --interactive alone | Test 7: asserts both produce same header AND `written:false` AND no error log; gate locks the equivalence |
| D-11 | --interactive --clean-empty composes (post-write ns cleanup) | integration test "interactive + cleanEmpty + force in namespaced layout deletes empty ns files" asserts the empty `auth.json` is gone after the run |
| D-12 | Summary preamble `Interactive selection: kept M keys, removed N keys.` on success | `grep -n "Interactive selection:" src/commands/prune/plans.ts` returns ≥1; integration test "interactive force success log includes Interactive selection:" asserts log line |
| D-13 | TTY detection = `process.stdin.isTTY && process.stdout.isTTY` (both) | `grep -nE "stdin\\.isTTY.*stdout\\.isTTY\\|stdout\\.isTTY.*stdin\\.isTTY" src/commands/prune.ts` returns ≥1 hit |
| D-14 | Non-TTY fallback (no --force) warning verbatim | `grep -n "--interactive requires a TTY; falling back to dry-run preview of all candidates." src/commands/prune.ts` returns ≥1 hit; integration test asserts warn spy receives this string |
| D-15 | Non-TTY + --force refuses to write — two-line warning verbatim (line 1 + line 2 together) | `grep -n "--interactive requires a TTY; --force ignored to avoid unintended bulk prune." src/commands/prune.ts` returns ≥1 hit; `grep -n "Falling back to dry-run preview of all candidates." src/commands/prune.ts` returns ≥1 hit; integration test asserts BOTH lines AND `result.written === false` |
| D-16 | Empty candidate list skips TUI | integration test "interactive with no unused keys skips TUI and prints No unused keys" asserts `runInteractivePrune` was NOT called |
| D-17 | SIGINT cleanup is Plan 02's contract — orchestrator catches `InteractiveCancelledError` to suppress stack-trace bleed AND sets process.exitCode = 130 defensively | `grep -n "InteractiveCancelledError" src/commands/prune.ts` returns ≥1 hit |
| D-18 (Integration tests bullet) | All 7 integration tests in src/__tests__/prune.test.ts | each test has a matching `it(...)` block (see Task 3 enumeration) |
| IPRUNE-01 | `prune --interactive` in TTY launches TUI | TTY integration test asserts `runInteractivePrune` mock was called |
| IPRUNE-04 | Esc + Ctrl+C both end with process.exitCode = 130 and no writes | Plan 02 owns the renderer-level cancel signal (resolve-cancelled / reject-Error); Plan 03 owns the orchestrator-level surface — both Esc and Ctrl+C paths set `process.exitCode = 130` and return early with `{ written: false, ... }`. Tested via the existing Plan 02 mockStdio pattern but assertion happens on `process.exitCode` AND `result.written`. |
| IPRUNE-05 | --force is the sole write gate | dry-run-without-force test asserts `result.written === false` even after Enter confirm |
| IPRUNE-06 | Non-TTY graceful skip + warning + fall back to dry-run | non-TTY test asserts warn + `result.written === false` + exit code 0 |
</validation_gates>

<pre_commit_protocol>
**MANDATORY (per CLAUDE.md):** Before EVERY `Commit as ...` step in this plan, run:

```
gitnexus_impact({target: "prune", direction: "upstream"})   # before EDITING prune()
gitnexus_impact({target: "executePrunePlans", direction: "upstream"})   # before EDITING executePrunePlans
gitnexus_detect_changes({repo: "i18n-sharpen"})   # before EACH commit
```

Expected blast radius:
- `prune` function (`src/commands/prune.ts`): direct caller is `src/cli.ts:174` (Plan 01 — already `await`s the call from an async callback) + the integration tests. The orchestrator gains a new internal branch AND converts to async; the existing return shape (`PruneResult`) is preserved inside the Promise. Low risk because cli.ts already awaits.
- `executePrunePlans` / `pruneFlat` / `pruneNamespaced` (`src/commands/prune/plans.ts`): callers are `src/commands/prune.ts` only. The new `interactiveSummary` param is optional and defaults to `undefined` (no behavior change for non-interactive callers).
- HIGH/CRITICAL risk warnings from impact analysis → STOP and report to user before proceeding.

If GitNexus MCP is unavailable on Windows (documented in Phase 1 RESEARCH.md), the grep-based fallback in each task's `<read_first>` is sufficient — proceed with commit.
</pre_commit_protocol>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: plans.ts — candidate-collection helpers + interactiveSummary threaded through executePrunePlans, pruneFlat, AND pruneNamespaced</name>
  <files>src/commands/prune/plans.ts</files>
  <read_first>
    - Run gitnexus_impact({target: "executePrunePlans", direction: "upstream"}) — expected callers: pruneFlat (line 250), pruneNamespaced (line 398). HIGH/CRITICAL warnings → STOP and report. Fallback: `grep -rn "executePrunePlans" src/ --include='*.ts'`.
    - Run gitnexus_impact({target: "pruneFlat", direction: "upstream"}) and gitnexus_impact({target: "pruneNamespaced", direction: "upstream"}) — confirm only `src/commands/prune.ts` consumes these orchestrators. The integration plan composes on top — no signature changes other than the optional `interactiveSummary` param.
    - Read src/commands/prune/plans.ts (full file — understand the two-phase plan-then-write pattern at lines 32-95 and the per-layout key collection at lines 161-247 for flat / 264-388 for namespaced)
    - Read src/core/scanner/isKeyUsed (re-exported via `@/core/scanner`) — confirms how the `usedKeys` set is consulted; the integration branch needs to translate "user did NOT check this key" → "add this key to usedKeys so it survives the filter"
  </read_first>
  <action>
    This task threads `interactiveSummary` through ALL THREE signatures (`executePrunePlans`, `pruneFlat`, `pruneNamespaced`) in plans.ts, so Task 2 (prune.ts orchestrator) only needs to PASS the summary to whichever entry-point it calls. No signature work left for Task 2 on plans.ts.

    Step 1 — Add the `interactiveSummary` optional param to `executePrunePlans`. Update the signature (line 32-36):

    ```diff
     export function executePrunePlans(
       writePlans: WritePlan[],
       perLocale: PruneResult["perLocale"],
    -  dryRun: boolean
    +  dryRun: boolean,
    +  interactiveSummary?: { kept: number; removed: number }
     ): PruneResult {
    ```

    In the success branch (currently around line 86-89), prepend the D-12 line ONLY when `interactiveSummary` is provided:

    ```diff
       } else if (totalPrunedCount > 0) {
    +    if (interactiveSummary) {
    +      log.info(
    +        `Interactive selection: kept ${pc.green(interactiveSummary.kept)} keys, removed ${pc.yellow(interactiveSummary.removed)} keys.`
    +      )
    +    }
         log.success(
           `Files have been successfully cleaned! Total pruned: ${totalPrunedCount} keys.\n`
         )
       }
    ```

    Also add it in the dry-run summary case so the user sees what they SELECTED (not just "would prune N keys"). In the dry-run branch (around line 78-85), modify the header path:

    ```diff
       if (dryRun) {
    +    if (interactiveSummary) {
    +      log.header("PRUNE PREVIEW (interactive — no files written)")
    +    } else {
           log.header(
             writePlans.length === 0
               ? "PRUNE PREVIEW (no changes)"
               : "PRUNE PREVIEW (dry-run — no files written)"
           )
    +    }
    +    if (interactiveSummary) {
    +      log.info(
    +        `Interactive selection: kept ${pc.green(interactiveSummary.kept)} keys, removed ${pc.yellow(interactiveSummary.removed)} keys.`
    +      )
    +    }
       }
    ```

    Note: the existing unconditional header call must be wrapped in an `else` branch since we now want the interactive header to override the default one. Double-check the diff carefully — there is exactly one `log.header(...)` call to keep, but it must be wrapped in `else { ... }`.

    Per D-09, the interactive dry-run footer should also be specific. After the existing `Dry-run: N keys would be removed. Re-run with --force ...` line (around line 81), the interactive case wants the wording `Re-run with --interactive --force to apply.` instead of `Re-run with --force`. Implement:

    ```diff
       if (dryRun) {
         if (totalPrunedCount > 0) {
    -      log.warn(
    -        `Dry-run: ${totalPrunedCount} key${totalPrunedCount === 1 ? "" : "s"} would be removed. Re-run with --force (or set prune.force: true in config) to apply.\n`
    -      )
    +      const reRunHint = interactiveSummary
    +        ? "Re-run with --interactive --force to apply."
    +        : "Re-run with --force (or set prune.force: true in config) to apply."
    +      log.warn(
    +        `Dry-run: ${totalPrunedCount} key${totalPrunedCount === 1 ? "" : "s"} would be removed. ${reRunHint}\n`
    +      )
         } else {
    ```

    Step 2 — Thread `interactiveSummary` through `pruneFlat` and `pruneNamespaced`. Both functions currently have signatures like:
    ```typescript
    export function pruneFlat(
      config: I18nSharpenConfig,
      localesDirAbs: string,
      usedKeys: Set<string>,
      fileContents: string[],
      dryRun: boolean
    ): PruneResult
    ```
    Add an optional 6th param `interactiveSummary?: { kept: number; removed: number }` to BOTH `pruneFlat` and `pruneNamespaced`, and forward it to the `executePrunePlans(writePlans, perLocale, dryRun, interactiveSummary)` call inside each function (currently at lines 250 and 398 respectively).

    ```diff
     export function pruneFlat(
       config: I18nSharpenConfig,
       localesDirAbs: string,
       usedKeys: Set<string>,
       fileContents: string[],
    -  dryRun: boolean
    +  dryRun: boolean,
    +  interactiveSummary?: { kept: number; removed: number }
     ): PruneResult {
       // ... existing body ...
    -  return executePrunePlans(writePlans, perLocale, dryRun)
    +  return executePrunePlans(writePlans, perLocale, dryRun, interactiveSummary)
     }
    ```

    Same diff structure for `pruneNamespaced`.

    Step 3 — Add two exported helpers at the bottom of `plans.ts`. These compute the flat-string-list of unused-key CANDIDATES that the TUI displays. The orchestrator in Task 2 calls these BEFORE building the usedKeys-augmented pipeline.

    ```typescript
    /**
     * Phase 3 D-13/D-16 helper: compute the flat list of candidate unused keys
     * (in the flat layout) that the interactive TUI will display. Mirrors the
     * key-collection logic in `pruneFlat` (lines 158-227) but stops before the
     * write-plan stage — returns just the candidate key strings.
     *
     * Returns an empty array when no candidates exist (D-16 short-circuit).
     */
    export function collectFlatCandidates(
      config: I18nSharpenConfig,
      localesDirAbs: string,
      usedKeys: Set<string>,
      fileContents: string[]
    ): string[] {
      // ... read locale files via findLocaleFile + readLocaleFile + flattenObject
      // ... apply config.looseKeyMatch the same way pruneFlat does
      // ... return Array.from(unusedSet)
    }

    /**
     * Phase 3 D-13/D-16 helper for namespaced layout. Returns candidates as
     * `ns:key.path` strings — the same form the user sees in source code
     * (matches D-07: "Namespaced layout: [ ] auth:login.title").
     */
    export function collectNamespacedCandidates(
      config: I18nSharpenConfig,
      localesDirAbs: string,
      usedKeys: Set<string>,
      fileContents: string[]
    ): string[] {
      // ... mirror pruneNamespaced key collection (lines 264-298)
      // ... return Array.from(unusedSet) in `ns:key.path` form
    }
    ```

    Implementation note: keep the helpers as a thin extract from the existing pruneFlat/pruneNamespaced functions. Do NOT refactor pruneFlat/pruneNamespaced to call the helpers — that would expand the blast radius. The helpers are a separate read-only pass; the existing functions stay untouched apart from the new optional `interactiveSummary` param. Duplication is acceptable here (~30-40 lines per helper) because it keeps prior-phase callers stable.

    Step 4 — run `pnpm tsc --noEmit`. MUST exit 0.

    Step 5 — run `pnpm test`. MUST exit 0 — the new `interactiveSummary` param defaults to undefined; no existing test passes it; no behavior change for non-interactive callers.

    Step 6 — commit as `feat(03-03): add candidate-collection helpers + thread interactiveSummary through plans.ts (executePrunePlans/pruneFlat/pruneNamespaced)`.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "interactiveSummary" src/commands/prune/plans.ts` returns ≥7 hits (3 signatures + 2 use sites in executePrunePlans + 2 forward calls from pruneFlat/pruneNamespaced)
    - `grep -nE "pruneFlat\\([\\s\\S]{0,200}interactiveSummary" src/commands/prune/plans.ts` and `grep -nE "pruneNamespaced\\([\\s\\S]{0,200}interactiveSummary" src/commands/prune/plans.ts` — confirm both signatures accept the param
    - `grep -nE "executePrunePlans\\([^)]*,\\s*interactiveSummary\\)" src/commands/prune/plans.ts` returns exactly 2 hits (forwarded from pruneFlat AND pruneNamespaced)
    - `grep -n "Interactive selection:" src/commands/prune/plans.ts` returns ≥1 hit
    - `grep -n "PRUNE PREVIEW (interactive" src/commands/prune/plans.ts` returns ≥1 hit
    - `grep -n "Re-run with --interactive --force" src/commands/prune/plans.ts` returns ≥1 hit
    - `grep -n "export function collectFlatCandidates" src/commands/prune/plans.ts` returns exactly 1 hit
    - `grep -n "export function collectNamespacedCandidates" src/commands/prune/plans.ts` returns exactly 1 hit
    - `pnpm tsc --noEmit` exits 0
    - `pnpm test` exits 0 with all prior tests still passing (no test relied on the previous `PRUNE PREVIEW` header wording for the interactive case — non-interactive callers pass `undefined` and get the original header)
  </acceptance_criteria>
  <done>
    `executePrunePlans` + `pruneFlat` + `pruneNamespaced` all accept an optional `interactiveSummary`. When provided, the dry-run header becomes the interactive variant (D-09), the dry-run footer hint changes (Re-run with --interactive --force), and the D-12 selection preamble is logged. Two new helpers `collectFlatCandidates` / `collectNamespacedCandidates` are exported, ready for Task 2 to call. Zero behavior change for existing non-interactive callers. Task 2 inherits a fully-threaded plans.ts API surface — no further signature work needed there.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: prune.ts orchestrator — async conversion, TTY detection, non-TTY fallback, TUI invocation, post-TUI filter, error handling</name>
  <files>src/commands/prune.ts</files>
  <read_first>
    - Run gitnexus_impact({target: "prune", direction: "upstream"}) — caller is `src/cli.ts:174` (already `await`s after Plan 01) + integration tests. New internal branch; public signature changes from `PruneResult` to `Promise<PruneResult>`. HIGH/CRITICAL → STOP. Fallback: `grep -rn "from \"@/commands/prune\"\\|from \"./commands/prune\"" src/ --include='*.ts'`.
    - Read src/commands/prune.ts (full file — lines 17-63 is the orchestrator to extend)
    - Read src/commands/prune/interactive.ts (Plan 02 output — confirm the exact import names: `runInteractivePrune`, `InteractiveCancelledError`, `InteractivePruneOptions`, and the LOCKED result field `toDelete`)
    - Read src/commands/prune/plans.ts (Task 1 output — confirm `collectFlatCandidates`, `collectNamespacedCandidates`, and the new `interactiveSummary` param on `executePrunePlans`, `pruneFlat`, AND `pruneNamespaced` — Task 1 already threaded all three)
    - Read 03-CONTEXT.md D-09 through D-17 — re-read the exact wording of the warnings and the preview header (these are verbatim strings)
    - Confirm cli.ts already `await`s the prune call (Plan 01 shipped this) — `grep -n "await prune(" src/cli.ts` should return ≥1 hit. This means converting `prune()` to async is safe — the caller already awaits.
  </read_first>
  <action>
    **Scope:** This task ONLY edits `src/commands/prune.ts`. It does NOT touch `src/cli.ts` (Plan 01 already shipped the async action + await) and does NOT touch `src/commands/prune/plans.ts` (Task 1 already threaded `interactiveSummary`). Single-file responsibility.

    Step 1 — convert `prune()` from synchronous to async. Change the signature:
    ```diff
    -export function prune(
    +export async function prune(
       config: I18nSharpenConfig,
       cwd: string = process.cwd(),
       options: PruneOptions = {}
    -): PruneResult {
    +): Promise<PruneResult> {
    ```

    This is a v0.3.0 milestone change — additive-only contract: callers that previously consumed the synchronous return now consume a Promise. Plan 01 already updated the only production caller (`src/cli.ts`) to `await` the result. Plan 03 Task 3 will update every existing `prune(config, tempDir)` call in `src/__tests__/prune.test.ts` to `await prune(config, tempDir)`. Document this signature change in the CHANGELOG entry in Task 4 under "Changed" (NOT BREAKING — the library is still pre-1.0; the public contract for `prune()` is widened to accommodate the new feature).

    Step 2 — add imports and the test seam at the top of the file:

    ```typescript
    import {
      runInteractivePrune,
      InteractiveCancelledError,
      type InteractivePruneOptions
    } from "./prune/interactive"
    import {
      pruneFlat,
      pruneNamespaced,
      collectFlatCandidates,
      collectNamespacedCandidates
    } from "./prune/plans"

    /** @internal — tests inject a fake stdin/stdout for the interactive branch. */
    let _interactiveIOOverride: InteractivePruneOptions | undefined
    export function __setInteractiveIOForTests(opts: InteractivePruneOptions | undefined): void {
      _interactiveIOOverride = opts
    }
    ```

    Step 3 — add the interactive branch in the orchestrator body. After the existing `detectUsedKeys` call and BEFORE the existing layout dispatch (`if (config.localesLayout === "namespaced") ...`), insert:

    ```typescript
    const wantInteractive = options.interactive === true

    // ───── Non-interactive path (Phases 1-2 behavior, untouched) ─────
    if (!wantInteractive) {
      if (config.localesLayout === "namespaced") {
        return pruneNamespaced(config, localesDirAbs, usedKeys, fileContents, dryRun)
      }
      return pruneFlat(config, localesDirAbs, usedKeys, fileContents, dryRun)
    }

    // ───── Interactive path (Phase 3 D-13..D-17) ─────
    const isTTY =
      process.stdin.isTTY === true && process.stdout.isTTY === true   // D-13: BOTH sides

    // D-14 / D-15: non-TTY fallback
    if (!isTTY) {
      if (optForce || configForce) {
        // D-15 verbatim two-line warning — the safety-critical gate
        log.warn(
          "--interactive requires a TTY; --force ignored to avoid unintended bulk prune.\nFalling back to dry-run preview of all candidates."
        )
      } else {
        // D-14 verbatim single-line warning
        log.warn(
          "--interactive requires a TTY; falling back to dry-run preview of all candidates."
        )
      }
      // Force dry-run regardless of force/configForce (D-15 safety override)
      dryRun = true
      if (config.localesLayout === "namespaced") {
        return pruneNamespaced(config, localesDirAbs, usedKeys, fileContents, dryRun)
      }
      return pruneFlat(config, localesDirAbs, usedKeys, fileContents, dryRun)
    }

    // TTY path: compute candidates and decide short-circuit (D-16) or launch TUI
    const isNamespaced = config.localesLayout === "namespaced"
    const candidates = isNamespaced
      ? collectNamespacedCandidates(config, localesDirAbs, usedKeys, fileContents)
      : collectFlatCandidates(config, localesDirAbs, usedKeys, fileContents)

    if (candidates.length === 0) {
      // D-16: skip TUI entirely — defer to the existing pipeline which logs
      // the standard "✨ No unused keys" message.
      if (isNamespaced) {
        return pruneNamespaced(config, localesDirAbs, usedKeys, fileContents, dryRun)
      }
      return pruneFlat(config, localesDirAbs, usedKeys, fileContents, dryRun)
    }

    // Launch the TUI
    let tuiResult
    try {
      tuiResult = await runInteractivePrune(candidates, _interactiveIOOverride)
    } catch (e) {
      if (e instanceof InteractiveCancelledError) {
        // D-17: Plan 02's SIGINT handler already called exit(130) in production
        // (which terminates the process); in tests the injected `exit` is a no-op
        // so the orchestrator path is reachable. Set process.exitCode = 130
        // defensively so tests can assert the IPRUNE-04 contract.
        process.exitCode = 130
        return { written: false, dryRun: true, perLocale: [], totalPruned: 0 }
      }
      throw e
    }

    // D-05: tuiResult.toDelete holds the keys the user CHECKED — that's the
    // mark-for-delete set. Compute kept = candidates − toDelete and augment
    // usedKeys so the existing pipeline treats kept candidates as used and
    // leaves them in the locale files.
    if (tuiResult.cancelled) {
      // Esc path — IPRUNE-04: process.exitCode = 130, no writes
      process.exitCode = 130
      return { written: false, dryRun: true, perLocale: [], totalPruned: 0 }
    }

    const kept = candidates.filter((c) => !tuiResult.toDelete.has(c))
    const removedCount = tuiResult.toDelete.size

    // Augment usedKeys with every candidate the user did NOT check.
    // The existing pipeline will treat them as used → they survive prune.
    const augmentedUsedKeys = new Set(usedKeys)
    for (const candidate of kept) {
      augmentedUsedKeys.add(candidate)
    }

    const interactiveSummary = { kept: kept.length, removed: removedCount }

    // Run the existing pipeline with augmented usedKeys + interactiveSummary
    // (Task 1 already threaded interactiveSummary through pruneFlat/pruneNamespaced)
    if (isNamespaced) {
      return pruneNamespaced(
        config, localesDirAbs, augmentedUsedKeys, fileContents, dryRun, interactiveSummary
      )
    }
    return pruneFlat(
      config, localesDirAbs, augmentedUsedKeys, fileContents, dryRun, interactiveSummary
    )
    ```

    **Note on `kept` vs `toDelete` (Dimension 9 contract):** Plan 02 ships `InteractivePruneResult.toDelete: Set<string>` with the locked semantic "checked rows = mark-for-delete" (per D-05). Plan 03 consumes this directly:
    - `kept = candidates.filter(c => !tuiResult.toDelete.has(c))` — the set the user did NOT check, which we ADD to usedKeys so the existing pipeline leaves them in place.
    - `removedCount = tuiResult.toDelete.size` — straight count.
    No inversion logic. No "re-read Plan 02 SUMMARY to confirm" footnote. The contract is locked at the Plan 02 boundary; Plan 03 just consumes it.

    Step 4 — run `pnpm tsc --noEmit`. EXPECTED initial failure: every existing prune integration test in `src/__tests__/prune.test.ts` calls `prune(config, tempDir, ...)` synchronously and unpacks `.dryRun` etc. After this change those calls return a Promise. Fix in Task 3 (test file edits) — Task 2 itself just makes the production code change; tests are Task 3's responsibility. **Therefore Task 2 and Task 3 share a commit boundary** — do all production code in Task 2's working tree, then immediately do Task 3's test edits, then run the full verify across both.

    Step 5 — commit as `feat(03-03): wire prune --interactive orchestrator (async, TTY detect, non-TTY fallback, summary, cancel handling)` AFTER Task 3 is also done. Defer this commit until Task 3 makes the test suite green.
  </action>
  <verify>
    <automated>echo "deferred to Task 3 commit boundary"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export async function prune" src/commands/prune.ts` returns exactly 1 hit
    - `grep -n "Promise<PruneResult>" src/commands/prune.ts` returns ≥1 hit (return type)
    - `grep -n "process.stdin.isTTY === true && process.stdout.isTTY === true" src/commands/prune.ts` returns ≥1 hit (D-13)
    - `grep -n -- "--interactive requires a TTY; falling back to dry-run preview of all candidates\\." src/commands/prune.ts` returns ≥1 hit (D-14 verbatim FULL line)
    - `grep -n -- "--interactive requires a TTY; --force ignored to avoid unintended bulk prune\\." src/commands/prune.ts` returns ≥1 hit (D-15 verbatim line 1)
    - `grep -n -- "Falling back to dry-run preview of all candidates\\." src/commands/prune.ts` returns ≥1 hit (D-15 verbatim line 2)
    - `grep -n "InteractiveCancelledError" src/commands/prune.ts` returns ≥1 hit (D-17 catch)
    - `grep -n "process.exitCode = 130" src/commands/prune.ts` returns ≥2 hits (Esc cancel + SIGINT cancel)
    - `grep -n "runInteractivePrune" src/commands/prune.ts` returns exactly 1 hit (the call site)
    - `grep -n "tuiResult.toDelete" src/commands/prune.ts` returns ≥2 hits (the locked Plan 02 contract — filter + size)
    - `grep -n "tuiResult\\.keep\\b" src/commands/prune.ts` returns 0 hits (old field name must NOT appear anywhere)
    - `grep -n "__setInteractiveIOForTests" src/commands/prune.ts` returns exactly 1 hit (test seam export)
    - `grep -n "src/cli\\.ts" src/commands/prune.ts` returns 0 hits (Task 2 must NOT reference cli.ts — Plan 01 owns cli.ts)
    - Verify is deferred — gates above plus Task 3's gates must ALL be green before commit; see Task 3's combined commit step.
  </acceptance_criteria>
  <done>
    Production code for the interactive branch in place. `prune` is now async. cli.ts is UNTOUCHED in this plan (Plan 01 already shipped the async action + await). D-13/14/15/16/17 verbatim semantics implemented. Test seam `__setInteractiveIOForTests` exported. Plan 02's `tuiResult.toDelete` contract consumed directly — no inversion logic. Tests do not yet compile — Task 3 fixes them. Commit deferred to Task 3.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: prune.test.ts — await async prune across existing tests + add 7 integration tests from D-18 (original 6 + new D-10 dry-run-equivalence)</name>
  <files>src/__tests__/prune.test.ts</files>
  <read_first>
    - Read src/__tests__/prune.test.ts (full file — 452 lines; understand the mock-project pattern and the log-spy pattern)
    - Read src/__tests__/interactive.test.ts (Plan 02 output — re-use the `mockStdio()` helper pattern; consider extracting it to a shared test helper if duplication exceeds ~30 LOC)
    - Read src/commands/prune/interactive.ts (Plan 02 output — confirm `InteractivePruneOptions` signature for the injected stdin/stdout AND the locked `toDelete` field on `InteractivePruneResult`)
    - Read src/commands/prune.ts (post-Task 2 — confirm `__setInteractiveIOForTests` export name)
  </read_first>
  <action>
    Step 1 — convert every existing `prune(config, tempDir, ...)` call to `await prune(config, tempDir, ...)`. Every `it("...", () => { ... })` block that calls `prune` must become `it("...", async () => { ... })`. Run a careful pass — there are ~10 existing `it(...)` blocks in this file. Examples:

    ```diff
    -  it("prune is dry-run by default and does not modify files", () => {
    +  it("prune is dry-run by default and does not modify files", async () => {
       // ...
    -    const result = prune(config, tempDir)
    +    const result = await prune(config, tempDir)
    ```

    Step 2 — add the 7 integration tests (CONTEXT.md D-18's 6 + a new Test 7 for D-10). Each is a separate `it(...)` block at the end of the existing `describe("prune: integration", ...)`.

    Test 1: **interactive in TTY with all selections checked writes those keys when --force**
    ```typescript
    it("interactive + force writes only TUI-selected (toDelete) keys", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A",
          "stale.b": "B"
        })
      })
      const config = { /* ... defaultLanguage en, etc */ }
      // Drive the TUI: arrow-down (skip "used.key" if it appeared, though it won't —
      // only stale.a + stale.b are candidates) + space (check stale.a), arrow-down +
      // space (check stale.b), enter. Per Plan 02 contract: checked rows are
      // toDelete, so both stales end up in result.toDelete.
      const io = mockStdio()
      __setInteractiveIOForTests({ stdin: io.stdin, stdout: io.stdout, exit: io.exit })
      setImmediate(() => {
        io.stdin.write(" ")             // space → check candidate 0 (stale.a)
        setImmediate(() => {
          io.stdin.write("\x1b[B")      // arrow-down → cursor on candidate 1 (stale.b)
          setImmediate(() => {
            io.stdin.write(" ")         // space → check candidate 1 (stale.b)
            setImmediate(() => io.stdin.write("\r"))   // enter to confirm
          })
        })
      })
      const result = await prune(config, tempDir, { interactive: true, force: true })
      __setInteractiveIOForTests(undefined)
      expect(result.written).toBe(true)
      const after = readLocaleFile(path.join(tempDir, "locales/en.json"))
      expect(flattenObject(after)).toEqual({ "used.key": "Used" })  // both stales pruned
    })
    ```

    Test 2: **interactive without --force prints preview, no writes**
    Same setup, but call `prune(config, tempDir, { interactive: true })` (NO force). Assert:
    - `result.written === false`
    - `result.dryRun === true`
    - log spy received a line containing `PRUNE PREVIEW (interactive — no files written)`
    - log spy received a line containing `Re-run with --interactive --force to apply.`
    - file on disk unchanged

    Test 3: **interactive with no unused keys skips TUI**
    ```typescript
    it("interactive with no unused keys skips TUI entirely (D-16)", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('only.key')`,
        "locales/en.json": JSON.stringify({ "only.key": "Only" })
      })
      const config = { /* ... */ }
      const io = mockStdio()
      __setInteractiveIOForTests({ stdin: io.stdin, stdout: io.stdout, exit: io.exit })
      // do NOT schedule any keystrokes — the TUI must not start
      const result = await prune(config, tempDir, { interactive: true })
      __setInteractiveIOForTests(undefined)
      expect(result.totalPruned).toBe(0)
      expect(io.getOutput()).toBe("")   // TUI never rendered → no captured stdout
    })
    ```

    Test 4: **non-TTY fallback (no --force)** — D-14 / IPRUNE-06
    ```typescript
    it("non-TTY + interactive falls back to dry-run with D-14 warning", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({ "used.key": "U", "stale": "S" })
      })
      const config = { /* ... */ }
      // Mock process.stdin.isTTY = false
      const originalIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true })
      try {
        const result = await prune(config, tempDir, { interactive: true })
        expect(result.written).toBe(false)
        expect(result.dryRun).toBe(true)
        const warnLog = logSpy.mock.calls
          .map((c) => String(c[0] ?? ""))
          .join("\n")
        expect(warnLog).toContain("--interactive requires a TTY; falling back to dry-run preview of all candidates.")
        expect(warnLog).not.toContain("--force ignored")   // D-15 message absent — D-14 path
      } finally {
        Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true })
      }
    })
    ```

    Test 5: **non-TTY + --force refuses to write — D-15 safety break / IPRUNE-06**
    Similar to Test 4 but pass `{ interactive: true, force: true }`. Assert:
    - `result.written === false` (D-15 — --force IGNORED)
    - warn log contains the FULL two-line string verbatim:
      - line 1: `--interactive requires a TTY; --force ignored to avoid unintended bulk prune.`
      - line 2: `Falling back to dry-run preview of all candidates.`
    - file on disk unchanged

    Test 6: **--interactive --clean-empty --force in namespaced layout deletes empty ns files (D-11)**
    Mirror the existing `"deletes empty namespace file when cleanEmpty is true and force is true (namespaced)"` test (lines 278-311), but add `interactive: true` and drive the TUI to check the lone `stale: "stale value"` key in `auth.json`. Assert:
    - `result.written === true`
    - `locales/en/auth.json` does NOT exist on disk after the run
    - `locales/en/common.json` exists with `{ greeting: "Hello" }`

    **Test 7 (NEW — locks D-10): --interactive --dry-run is equivalent to --interactive alone**
    ```typescript
    it("--interactive --dry-run is equivalent to --interactive alone (D-10)", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A"
        })
      })
      const config = { /* ... */ }
      // Drive the TUI: space to check stale.a, enter to confirm
      const io = mockStdio()
      __setInteractiveIOForTests({ stdin: io.stdin, stdout: io.stdout, exit: io.exit })
      setImmediate(() => {
        io.stdin.write(" ")
        setImmediate(() => io.stdin.write("\r"))
      })

      // Capture file-mtime snapshot before the run
      const beforeMtime = fs.statSync(path.join(tempDir, "locales/en.json")).mtimeMs

      const result = await prune(config, tempDir, { interactive: true, dryRun: true })
      __setInteractiveIOForTests(undefined)

      // Assertions matching Test 2 (interactive without --force)
      expect(result.written).toBe(false)
      expect(result.dryRun).toBe(true)
      const headerLog = logSpy.mock.calls
        .map((c) => String(c[0] ?? ""))
        .join("\n")
      expect(headerLog).toContain("PRUNE PREVIEW (interactive — no files written)")
      // No error/warning about conflicting flags — dryRun + interactive is a no-op
      expect(headerLog).not.toMatch(/conflict|incompatible|cannot/i)

      // Disk unchanged
      const afterMtime = fs.statSync(path.join(tempDir, "locales/en.json")).mtimeMs
      expect(afterMtime).toBe(beforeMtime)
      // Process exit code 0 (set via process.exitCode — D-10 says no-op equivalent,
      // not cancelled, so exitCode stays at its default 0)
      expect(process.exitCode === 0 || process.exitCode === undefined).toBe(true)
    })
    ```

    Step 3 — extract the `mockStdio()` helper from `src/__tests__/interactive.test.ts` if duplication exceeds ~40 LOC. Create `src/__tests__/_helpers/stdio.ts` (new) exporting `mockStdio()` and have both test files import from there. If the duplication is small (<30 LOC), inline it.

    Step 4 — run `pnpm tsc --noEmit`. MUST exit 0.

    Step 5 — run `pnpm test`. MUST exit 0 — all prior tests still pass (now awaited), and the 7 new integration tests pass.

    Step 6 — joint commit for Tasks 2 + 3: `feat(03-03): wire prune --interactive end-to-end with TTY detection, non-TTY safety, and 7 integration tests`. Use a multi-line message body listing the D-XX coverage:
    ```
    Closes IPRUNE-01, IPRUNE-04, IPRUNE-05, IPRUNE-06.
    Covers D-09 (interactive preview header), D-10 (--dry-run no-op equivalence),
    D-11 (--clean-empty composition), D-12 (selection preamble), D-13 (TTY
    both-sides detection), D-14 (non-TTY fallback warning), D-15 (non-TTY +
    --force refuses to write — safety break), D-16 (empty candidate
    short-circuit), D-17 (InteractiveCancelledError catch).

    `prune()` is now async and returns Promise<PruneResult>. cli.ts already
    awaited it from Plan 01. Existing tests converted to async/await.
    No behavior change for non-interactive callers; PruneResult shape unchanged.
    Consumes Plan 02's locked `InteractivePruneResult.toDelete` contract
    directly — no inversion logic.

    Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
    ```
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm test --run prune && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -nE "it\\(.*async \\(\\)" src/__tests__/prune.test.ts` returns ≥10 hits (every it block awaiting prune)
    - `grep -n "await prune(" src/__tests__/prune.test.ts` returns ≥10 hits (every existing call awaited)
    - `grep -n "interactive: true" src/__tests__/prune.test.ts` returns ≥7 hits (one per new integration test minimum)
    - `grep -n "__setInteractiveIOForTests" src/__tests__/prune.test.ts` returns ≥4 hits (used in TUI-driving tests + the new D-10 Test 7)
    - `grep -n "PRUNE PREVIEW (interactive" src/__tests__/prune.test.ts` returns ≥2 hits (Test 2 + Test 7)
    - `grep -n -- "--interactive requires a TTY; falling back to dry-run preview of all candidates\\." src/__tests__/prune.test.ts` returns ≥1 hit (Test 4 — full D-14 verbatim)
    - `grep -n -- "--interactive requires a TTY; --force ignored to avoid unintended bulk prune\\." src/__tests__/prune.test.ts` returns ≥1 hit (Test 5 — D-15 line 1 verbatim)
    - `grep -n -- "Falling back to dry-run preview of all candidates\\." src/__tests__/prune.test.ts` returns ≥1 hit (Test 5 — D-15 line 2 verbatim)
    - `grep -n "dryRun: true" src/__tests__/prune.test.ts` returns ≥1 hit specifically in the D-10 Test 7 (passing both `interactive: true` AND `dryRun: true`)
    - `grep -n "Object.defineProperty(process.stdin, \"isTTY\"" src/__tests__/prune.test.ts` returns ≥2 hits (Tests 4 + 5 mock TTY)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm test --run prune` exits 0 (the prune integration suite is green)
    - `pnpm test` exits 0 (full suite — no regression)
  </acceptance_criteria>
  <done>
    Every existing prune integration test now awaits `prune()`. Seven new integration tests cover the D-18 matrix end-to-end PLUS the new D-10 dry-run-equivalence gate. The `process.stdin.isTTY` mock pattern is in place for non-TTY assertions. The joint Tasks 2+3 commit lands with full CI green.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Document the new flag in CHANGELOG.md</name>
  <files>CHANGELOG.md</files>
  <read_first>
    - Read CHANGELOG.md lines 1-40 (current 0.3.0 section + Keep-a-Changelog format reference)
    - 03-CONTEXT.md "Integration Points" bullet: `CHANGELOG.md — new entry under v0.3.0: "added prune --interactive for hand-picking unused keys (IPRUNE-01..06)". Note that no behavior changes for non-interactive prune.`
  </read_first>
  <action>
    Step 1 — under the existing `## [0.3.0] - Unreleased` heading (line 8), add a new `### Added` section if one does not already exist, and append the Phase 3 entry. Keep the existing `### Changed (notable behavior change)` section from Phase 2 untouched. Final 0.3.0 block:

    ```markdown
    ## [0.3.0] - Unreleased

    ### Added

    - **prune --interactive**: new CLI flag opens an arrow-key TUI in a TTY
      and lets you pick exactly which unused keys to prune via Space-toggle.
      Enter confirms; Esc / Ctrl+C cancels with exit code 130. Honors the
      existing `--force` write-gate: `--interactive` selects WHICH keys;
      `--force` decides WHETHER they are written. In a non-TTY environment
      (CI, piped input) the TUI is skipped, a warning is printed, and the
      run falls back to standard dry-run preview. In the dangerous
      `--interactive --force` combination on a non-TTY, `--force` is
      ignored and the run stays in dry-run to avoid unintended bulk prune.
      Closes IPRUNE-01..06.

    ### Changed (notable behavior change)
    - **validate**: dynamic-key warnings are now emitted as a single grouped summary at the end of the run (sections "Fully-dynamic keys" and "Structured-concat keys") instead of one `log.warn` per call site. Structured-concat keys surface their leading static prefix (e.g. `error.`) and every finding includes a `file:line` location. Configure suppression via `ignoreDynamicKeys: ["error.*", "*"]`. Exit code is unchanged — dynamic findings never cause `validate` to fail. (Phase 2 / D-13)
    - **prune (programmatic API)**: `prune()` now returns `Promise<PruneResult>` instead of `PruneResult`. The CLI awaits it transparently — no change to CLI behavior. Library consumers calling `prune()` directly must `await` the result. Result shape (`{ written, dryRun, perLocale, totalPruned }`) is unchanged. (Phase 3 — required to accommodate the awaited TUI in `--interactive` mode.)
    ```

    Step 2 — commit as `docs(03-03): add CHANGELOG entry for prune --interactive (IPRUNE-01..06)`.
  </action>
  <verify>
    <automated>grep -q "prune --interactive" CHANGELOG.md && grep -q "IPRUNE-01..06" CHANGELOG.md && grep -q "Promise<PruneResult>" CHANGELOG.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "prune --interactive" CHANGELOG.md` returns ≥1 hit
    - `grep -n "IPRUNE-01..06" CHANGELOG.md` returns ≥1 hit
    - `grep -n "Promise<PruneResult>" CHANGELOG.md` returns ≥1 hit (signature change documented)
    - `grep -n "--force is ignored\\|--force.*ignored" CHANGELOG.md` returns ≥1 hit (D-15 non-TTY safety break documented)
    - `grep -n "## \\[0.3.0\\]" CHANGELOG.md` returns ≥1 hit (existing heading still present)
    - No new top-level `## [...]` section added — entries go under the existing 0.3.0 unreleased section.
  </acceptance_criteria>
  <done>
    CHANGELOG.md documents the new `--interactive` flag, the IPRUNE-01..06 coverage, the D-15 non-TTY safety break, and the programmatic API signature change (`prune()` now async). Entries are placed under the existing `## [0.3.0] - Unreleased` heading; no new release section created.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CLI argv → cmdOpts.interactive (boolean) | Commander parses; defensive `=== true` coercion preserved from Plan 01 |
| process.stdin.isTTY / process.stdout.isTTY | OS-level TTY detection — trusted; both sides must be true to enable TUI |
| config.prune.force / options.force / --force | the existing write gate; Plan 03 honors it in TTY mode and REFUSES it in non-TTY (D-15) |
| candidates string[] → runInteractivePrune | derived from existing locale-key collection (already trusted in pruneFlat/pruneNamespaced) |
| tuiResult.toDelete → augmentedUsedKeys | Plan 03's only mutation of the trusted dataflow — confined to `kept = candidates.filter(c => !toDelete.has(c)); augmented = new Set(usedKeys); for (kept) augmented.add(c)` (no other operations) |
| InteractiveCancelledError → orchestrator catch | sentinel error class from Plan 02; orchestrator catches by `instanceof` then sets `process.exitCode = 130` |

## STRIDE Threat Register

| Threat ID  | Category | Component | Disposition | Mitigation Plan |
|------------|----------|-----------|-------------|-----------------|
| T-03-03-01 | Elevation of privilege | non-TTY + --force silently bulk-prunes | **MITIGATE — high severity if missing** | D-15: explicit refusal — `--force` is set aside, the two-line warn is printed verbatim (line 1: `--interactive requires a TTY; --force ignored to avoid unintended bulk prune.` line 2: `Falling back to dry-run preview of all candidates.`), `dryRun` is forced to true, no write path is reached. Test 5 in Task 3 asserts this with `result.written === false` AND both verbatim lines. This is the safety-critical gate of the entire phase. |
| T-03-03-02 | Tampering | TTY mock in tests escapes to production | accept | The test seam `__setInteractiveIOForTests` is intentionally double-underscored to signal "not for public use" and is not re-exported from `src/index.ts`. Tests set it in `beforeEach` and clear in `afterEach`. A leaked override would only affect the TUI's stdin/stdout streams — it cannot inject candidate keys or bypass the write gate. |
| T-03-03-03 | Repudiation | user pruned keys with no audit trail | mitigate | D-12: the `Interactive selection: kept M keys, removed N keys.` line is logged on every successful interactive run (Task 1 implementation). Combined with the per-file `Pruning N unused keys from <file>` log already in `executePrunePlans`, the user has a full audit trail in stdout. |
| T-03-03-04 | Denial of service | infinite TUI hang on broken stdin | mitigate | Plan 02 owns the renderer lifecycle (SIGINT handler, cleanup on every exit path). Plan 03 wraps the `await runInteractivePrune(...)` in a try/catch; an unhandled throw from the renderer bubbles up to `cli.ts:179` where the existing `catch (error) { reportError(error); process.exitCode = 1 }` block handles it cleanly. No new DoS vector. |
| T-03-03-05 | Information disclosure | user-toggled keys leak to stdout when run is piped | accept | If the user pipes prune's stdout to a logger, they are explicitly opting into capturing the audit trail. Same disclosure surface as existing dry-run output. The TUI rendering goes to stdout, so a piped stdout means non-TTY (D-13 catches this — TUI is skipped). |
| T-03-03-06 | Tampering | augmentedUsedKeys gets a key the user DID check | mitigate | The augmentation logic is a single 3-line block consuming Plan 02's locked `toDelete` contract: `const kept = candidates.filter(c => !tuiResult.toDelete.has(c)); const augmented = new Set(usedKeys); for (const k of kept) augmented.add(k)`. Test 1 in Task 3 asserts the end-state: after the run, the locale file contains EXACTLY the un-checked candidates plus the original used keys. Test 2 (dry-run) asserts the preview lists EXACTLY the checked candidates. Both gates close the loop. |
| T-03-03-07 | Spoofing | Plan 02 renderer is replaced by an attacker module | accept | The renderer is imported by relative path `./prune/interactive`. To replace it an attacker needs filesystem write access to the installed package — at which point the package itself is compromised. Same trust model as every other module. |

The HIGH-severity threat in this plan is T-03-03-01 (non-TTY + --force silently bulk-pruning). D-15 is the explicit, tested mitigation. Task 3 Test 5 is the gate that closes it. Phase planning gate `block-on severity: high` is satisfied IFF Test 5 passes — make this a release-blocker.
</threat_model>

<verification>
- `pnpm test --run prune` — full prune integration suite green, including all 7 new D-18 integration tests (original 6 + D-10 Test 7).
- `pnpm test --run interactive` — Plan 02 unit tests still green (no regression from Plan 03 changes).
- `pnpm test` — full suite green; no regression in the 58+ pre-Phase-3 tests after they were converted to async/await.
- `pnpm tsc --noEmit` — types compile; the new async signature, `interactiveSummary` param, and helper exports are all typed.
- `pnpm build` — `node dist/cli.js prune --help` shows the `--interactive` flag with its description (smoke check).
- `grep` gates in each task's `<acceptance_criteria>` — every verbatim warning string and exit-code constant is present in production source.
- Manual smoke (NOT a CI gate; documented in SUMMARY): in a real terminal, run `node dist/cli.js prune --interactive` on a fixture project with 3+ unused keys, verify arrow nav, Space toggle, Enter, Esc behave as designed. Verify Ctrl+C restores cursor visibility and returns exit 130 (`echo $?`).
</verification>

<success_criteria>
- `prune --interactive` in a TTY launches the Plan 02 TUI, prunes ONLY the keys the user CHECKED (`toDelete` per D-05), and writes them when `--force` is also passed (IPRUNE-01, IPRUNE-02, IPRUNE-03, IPRUNE-05).
- `prune --interactive` without `--force` shows the interactive dry-run preview and exits 0 without writing (IPRUNE-05).
- `prune --interactive --dry-run` is a no-op-equivalent to `--interactive` alone — same header, no writes, no error (D-10 / Test 7).
- `prune --interactive` in a non-TTY warns + dry-runs + exits 0 (IPRUNE-06 / D-14).
- `prune --interactive --force` in a non-TTY REFUSES to write, prints the two-line D-15 warning verbatim, exits 0 (the safety-critical gate).
- Esc / Ctrl+C in TTY result in zero writes and `process.exitCode === 130` (IPRUNE-04).
- Empty candidate list short-circuits the TUI (D-16).
- Successful interactive runs print the `Interactive selection: kept M keys, removed N keys.` preamble (D-12).
- `--interactive --clean-empty --force` in namespaced layout deletes empty namespace files post-write (D-11).
- `prune()` is now `Promise<PruneResult>` — every existing test awaits it; cli.ts already awaited from Plan 01; CHANGELOG documents the signature change.
- CHANGELOG.md has a 0.3.0 [Added] entry for the new flag, plus a [Changed] note for the async signature.
- Three commits total in this plan: `feat(03-03): add candidate-collection helpers + thread interactiveSummary through plans.ts (executePrunePlans/pruneFlat/pruneNamespaced)` (Task 1), `feat(03-03): wire prune --interactive end-to-end with TTY detection, non-TTY safety, and 7 integration tests` (Tasks 2 + 3 joint), `docs(03-03): add CHANGELOG entry for prune --interactive (IPRUNE-01..06)` (Task 4).
- `src/cli.ts` is NOT in this plan's `files_modified` — Plan 01 owns cli.ts and already shipped the async action + await.
</success_criteria>

<output>
After completion, create `.planning/phases/03-interactive-pruning/03-03-SUMMARY.md` summarizing:
- Files modified (src/commands/prune.ts, src/commands/prune/plans.ts, src/__tests__/prune.test.ts, CHANGELOG.md). **src/cli.ts is NOT in this list — Plan 01 owned that edit.**
- Production signature changes: `prune()` → `async` returning `Promise<PruneResult>`; `executePrunePlans` + `pruneFlat` + `pruneNamespaced` gain optional `interactiveSummary` param; `collectFlatCandidates` + `collectNamespacedCandidates` exported helpers
- Plan 02 contract consumption: `tuiResult.toDelete` consumed directly via `kept = candidates.filter(c => !toDelete.has(c))`. No inversion logic. No "re-read SUMMARY to confirm" footnote.
- Test count delta: +7 integration tests (original 6 + new D-10 Test 7); ~10 existing tests converted to async/await (count unchanged)
- IPRUNE-01, IPRUNE-04, IPRUNE-05, IPRUNE-06 status: all closed by this phase (IPRUNE-02/03 closed by Plan 02; IPRUNE-04 jointly covered by Plan 02 renderer-level cancel + Plan 03 orchestrator-level process.exitCode)
- D-XX matrix coverage table (D-09 through D-17, plus D-18 integration tests bullet — each ✓ with the integration test that closes it)
- Manual smoke notes (terminal verification of arrow nav + Ctrl+C cursor restore)
- Handoff to STATE.md update via `/gsd-transition`: Phase 3 complete; recommend running `npx gitnexus analyze` after merge to refresh the index given the new module + the async signature change
</output>
