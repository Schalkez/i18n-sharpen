---
phase: 03-interactive-pruning
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types.ts
  - src/cli.ts
autonomous: true
requirements:
  - IPRUNE-01
tags:
  - cli
  - types
  - flag-wiring

must_haves:
  truths:
    - "PruneOptions exposes an optional interactive?: boolean field on the programmatic API"
    - "The CLI accepts `prune --interactive` and threads it through to options.interactive"
    - "The prune .action(...) callback is async and awaits the prune() call — required so Plan 03 can convert prune() to async without touching cli.ts again"
    - "Plan 01 makes ZERO behavior change — interactive flag is plumbed but never branched on yet (Plan 03 wires the branch); the await is a no-op on a synchronous return value"
    - "Existing prune flag combinations (--force, --dry-run, --sort, --clean-empty) keep their semantics unchanged"
  artifacts:
    - path: src/types.ts
      provides: "interactive?: boolean added to PruneOptions"
      contains: "interactive?: boolean"
    - path: src/cli.ts
      provides: "--interactive option registered on the prune command + interactive: cmdOpts.interactive === true in the prune() call + async .action(...) callback that awaits prune(...)"
      contains: "--interactive"
  key_links:
    - from: src/cli.ts
      to: src/types.ts
      via: "the prune command action destructures cmdOpts.interactive and forwards it as PruneOptions.interactive"
      pattern: "interactive: cmdOpts.interactive"
    - from: src/cli.ts
      to: src/commands/prune.ts
      via: "prune() function call signature accepts PruneOptions.interactive; the .action callback awaits the call so prune() can become async in Plan 03 without further cli.ts edits"
      pattern: "await prune\\(config, cwd, \\{[^}]*interactive"
---

<objective>
Phase 3, Plan 1: Add the `interactive?: boolean` API surface to `PruneOptions`, register the `--interactive` flag on the CLI `prune` command, AND convert the prune `.action(...)` callback to `async` with an `await` on the `prune(...)` call. Pure additive plumbing — no behavior change yet (Plan 03 will branch on `options.interactive`; the `await` on a synchronous return is a no-op).

Purpose: Honors the Claude's Discretion recommendation in CONTEXT.md (D section, sub-bullet: "Whether to add a new `interactive?: boolean` field to `PruneOptions` — recommendation: YES"). Gives Plan 02's renderer (and library consumers of the programmatic `prune()` API) a typed entry point, and gives Plan 03 a flag value to branch on. Pre-converting the action callback to `async` here keeps `src/cli.ts` ownership in this plan; Plan 03 (which converts `prune()` itself to `async` to await the TUI) then only touches `src/commands/prune.ts` and `src/commands/prune/plans.ts` — no cross-plan `files_modified` overlap on `src/cli.ts`. Splitting this surface into its own wave-1 plan lets Plan 02 develop the renderer in parallel without touching `src/cli.ts` / `src/types.ts` (zero file-overlap with Plan 02 — safe wave-1 parallelism).

Output:
- `src/types.ts`: `PruneOptions` gains an `interactive?: boolean` field with a JSDoc comment matching the convention of `force?` / `dryRun?` (lines 103-108).
- `src/cli.ts`: the `prune` command gets a new `.option("--interactive", ...)` declaration mirroring the existing `--force` / `--clean-empty` option calls; its action handler destructures + forwards `cmdOpts.interactive` to the `prune()` call; the callback is `async` and `await`s the `prune(...)` call.
- Build is green, tsc is green, the existing prune integration tests in `src/__tests__/prune.test.ts` continue to pass unchanged (the `await` on a synchronous return is transparent — JavaScript wraps it in `Promise.resolve(...)`, the test harness was never awaiting the action callback directly).
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
@CLAUDE.md

<interfaces>
<!-- Existing contracts. Plan 01 is purely additive on these. -->

From src/types.ts:103-108 — current PruneOptions (extend, do not break):
```typescript
export interface PruneOptions {
  /** Force writes even when config.prune.force is false. */
  force?: boolean
  /** Preview only — never write, regardless of config.prune.force. */
  dryRun?: boolean
}
```

From src/cli.ts:126-184 — current prune command shape (pattern to follow):
```typescript
program
  .command("prune")
  .description("Prune unused translation keys ...")
  .option("--dry-run", "Preview only — never write...", false)
  .option("--force", "Actually write the pruned locale files to disk.", false)
  .option("--sort <mode>", "Override key sorting mode ...")
  .option("--clean-empty", "After pruning (namespaced layout only), delete ...", false)
  .action((cmdOpts: { dryRun?: boolean; force?: boolean; sort?: string; cleanEmpty?: boolean }) => {
    // ...
    prune(config, cwd, {
      force: cmdOpts.force === true,
      dryRun: cmdOpts.dryRun === true
    })
  })
```

From src/commands/prune.ts:17-21 — prune() signature (does NOT change in this plan; the new field rides on the existing options object; the `await` in cli.ts is a no-op on the current synchronous return — Plan 03 will convert prune() to async):
```typescript
export function prune(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options: PruneOptions = {}
): PruneResult
```
</interfaces>
</context>

<validation_gates>
<!-- D-XX coverage gates for Plan 01. -->

| D-XX | Decision (from 03-CONTEXT.md) | Test/grep gate |
|------|-------------------------------|-----------------|
| Discretion: `interactive?: boolean` field on `PruneOptions` | "recommendation: YES — mirroring how `force` and `dryRun` are already there" | `grep -nE "interactive\\??: boolean" src/types.ts` returns ≥1 hit inside the PruneOptions interface |
| Discretion: NO `--no-interactive` flag | "recommendation: NO — absence of `--interactive` is the opt-out" | `grep -n "no-interactive" src/cli.ts` returns 0 hits |
| Discretion: NO `prune.interactive: true` config field | "CI footgun. Keep CLI-flag-only entry into interactive mode" | `grep -nE "prune\\?:[\\s\\S]*interactive" src/types.ts` returns 0 hits (the field is on PruneOptions, not on I18nSharpenConfig.prune) |
| IPRUNE-01 (flag wiring surface) | "User can run `prune --interactive` to enter a TUI flow" | `grep -n "\"--interactive\"" src/cli.ts` returns ≥1 hit; `grep -nE "interactive:\\s*cmdOpts\\.interactive" src/cli.ts` returns ≥1 hit; `grep -n "await prune(" src/cli.ts` returns ≥1 hit |

Plan 01 does NOT yet ship the runtime branch — that lives in Plan 03. The validation gate here is "the surface compiles, the action is async, and the value is passed through unchanged"; the behavior gates are owned by Plan 03.
</validation_gates>

<pre_commit_protocol>
**MANDATORY (per CLAUDE.md):** Before EVERY `Commit as ...` step in this plan, run:

```
gitnexus_detect_changes({repo: "i18n-sharpen"})  # via MCP, or
npx gitnexus detect-changes --repo i18n-sharpen --scope unstaged
```

Expected affected symbols for this plan: `PruneOptions` interface (additive optional field) and the `prune` command-action arrow function in `src/cli.ts` (additive `.option` + new field in `cmdOpts` destructure + `async` + `await`). Any other symbol showing up in `detect_changes` output means the plan drifted — stop and investigate.

If GitNexus MCP is unavailable on Windows (documented in prior phases), the grep-based fallback in each task's `<read_first>` is sufficient — proceed with commit.
</pre_commit_protocol>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add interactive?: boolean to PruneOptions</name>
  <files>src/types.ts</files>
  <read_first>
    - Run gitnexus_impact({target: "PruneOptions", direction: "upstream"}) — confirm consumers are `src/commands/prune.ts` (signature) and `src/cli.ts` (CLI handler). HIGH/CRITICAL warnings → STOP and ask the user before proceeding. If GitNexus MCP is down on Windows: `grep -rn "PruneOptions" src/ --include='*.ts'` — expected hits: `src/types.ts:103`, `src/commands/prune.ts:7,20`, possibly tests.
    - Read src/types.ts lines 90-128 (PruneOptions + PruneResult — the entire prune surface)
    - Read src/commands/prune.ts (full file — confirm options.interactive will be a no-op in this plan; Plan 03 adds the branch)
  </read_first>
  <action>
    Step 1 — extend `src/types.ts`. Inside the `PruneOptions` interface (currently lines 103-108), AFTER the `dryRun?: boolean` field and BEFORE the closing `}`, append:

    ```typescript
      /**
       * If true, launch the interactive TUI picker (arrow-key + Space)
       * when running in a TTY. In a non-TTY environment (pipe, CI),
       * the picker is skipped — see Phase 3 D-13/D-14/D-15 for the
       * fallback semantics. The standard `force` / `dryRun` write gate
       * still applies: `interactive` selects WHICH keys to prune; `force`
       * decides WHETHER they are written. Per IPRUNE-01..06.
       *
       * Defaults to false (existing non-interactive behavior preserved).
       */
      interactive?: boolean
    ```

    Do NOT add the field to `I18nSharpenConfig.prune` (lines 79-87) — per CONTEXT.md Deferred Ideas: "`prune.interactive: true` config field — CI footgun. Keep CLI-flag-only entry into interactive mode."

    Do NOT modify `PruneResult` (lines 114-127) — the result shape stays the same; whether the run was interactive is implicit from the user-facing summary preamble (Plan 03 D-12).

    Step 2 — run `pnpm tsc --noEmit`. MUST exit 0 (the field is optional → no existing call site breaks).

    Step 3 — run `pnpm test`. MUST exit 0 (all existing 58+ tests still green — no behavior change).

    Step 4 — commit as `feat(03-01): add interactive?: boolean field to PruneOptions`.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -nE "interactive\\??: boolean" src/types.ts` returns ≥1 hit
    - `grep -nE "^\\s*interactive\\?:" src/types.ts` returns exactly 1 hit (only one declaration, inside PruneOptions)
    - `grep -nE "prune\\?: \\{[\\s\\S]{0,500}interactive" src/types.ts` returns 0 hits (must NOT appear inside I18nSharpenConfig.prune)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm test` exits 0 with the same test count as before the plan
  </acceptance_criteria>
  <done>
    `PruneOptions.interactive?: boolean` declared with JSDoc. No `I18nSharpenConfig.prune.interactive` field. tsc + tests green. Plan 02 (renderer) and Plan 03 (integration) can now reference the typed field.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Register --interactive option on the CLI prune command AND make the action callback async/await</name>
  <files>src/cli.ts</files>
  <read_first>
    - Run gitnexus_impact({target: "prune", direction: "upstream"}) — confirm callers of the `prune()` orchestrator. Expected: `src/cli.ts` action handler (line 174) and any programmatic consumers. The change in this task is the call site only — the orchestrator signature is unchanged in Plan 01.
    - Read src/cli.ts lines 126-184 (the prune command block — pattern for `.option(...)` + `.action(...)`)
    - Read src/cli.ts lines 91-124 (extract command — for reference: confirms how `.option("--sort <mode>", ...)` differs from boolean `.option("--force", "...", false)`)
    - Read src/commands/prune.ts lines 17-27 (prune() signature — confirms `options.interactive` will be silently ignored in Plan 01)
    - Read src/__tests__/prune.test.ts lines 1-90 (existing dry-run-by-default test — sanity-check it does not pass `interactive` and therefore stays unchanged; it calls `prune(...)` directly, NOT through the cli.ts action callback, so the `async` conversion in this task is invisible to the test suite)
  </read_first>
  <action>
    Step 1 — add the `--interactive` option to the prune command. In `src/cli.ts`, AFTER the existing `--clean-empty` `.option(...)` block (currently lines 141-145) and BEFORE the `.action(...)` call (line 146), insert:

    ```typescript
        .option(
          "--interactive",
          "Pick which unused keys to prune via an arrow-key TUI (TTY only; non-TTY falls back to dry-run preview).",
          false
        )
    ```

    Use exactly that description string — it summarizes IPRUNE-01..06 in one CLI-help line and signals the non-TTY fallback so users discover it from `--help` alone.

    Step 2 — extend the `cmdOpts` destructure type in the `.action(...)` callback (currently lines 147-152). Add `interactive?: boolean` to the inline type literal AND convert the arrow function to `async`:

    ```diff
       .action(
    -    (cmdOpts: {
    +    async (cmdOpts: {
           dryRun?: boolean
           force?: boolean
           sort?: string
           cleanEmpty?: boolean
    +      interactive?: boolean
         }) => {
    ```

    **Why async now (not in Plan 03):** Plan 03 will convert `prune()` itself to `async` (returning `Promise<PruneResult>`) so it can `await` the TUI. To keep `src/cli.ts` in EXACTLY ONE plan's `files_modified` (this plan's), we add the `async` keyword + the `await` here, BEFORE `prune()` becomes async. On a still-synchronous `prune()` return value, `await` is a no-op (it wraps in `Promise.resolve`). Commander's `.action()` already tolerates a callback returning a Promise — it does not `await` it itself, but the runtime drains the microtask queue before exit since `cli.ts` lines 84/87/178/181 set `process.exitCode` rather than calling `process.exit(...)`. No behavior change is observable until Plan 03's interactive branch starts emitting real awaitable work.

    Step 3 — forward the value into the `prune()` call AND add `await`. Replace the existing call (currently lines 174-177):

    ```diff
    -        prune(config, cwd, {
    +        await prune(config, cwd, {
               force: cmdOpts.force === true,
               dryRun: cmdOpts.dryRun === true,
    +          interactive: cmdOpts.interactive === true
             })
    ```

    Use `=== true` (not just `cmdOpts.interactive`) to match the existing defensive coercion pattern already used for `force` / `dryRun` / `cleanEmpty` in this file. This guarantees a strict `boolean` even if Commander hands back `undefined` when the flag is omitted.

    Step 4 — do NOT touch the `extract` command (lines 91-124) — interactive is a prune-only concern, and extract's action callback stays synchronous.

    Step 5 — run `pnpm tsc --noEmit`. MUST exit 0. TypeScript accepts `await` on a synchronous return (it widens the awaited type to `Awaited<PruneResult>` which equals `PruneResult`).

    Step 6 — run `pnpm test`. MUST exit 0. No existing prune integration test passes `interactive`, and no existing test invokes the cli.ts action callback (tests call `prune(...)` directly), so all prior tests continue to pass unchanged.

    Step 7 — smoke-test the help output manually (one-shot, no commit-blocker): `pnpm build && node dist/cli.js prune --help` — confirm the new line appears in the option list. The CI does NOT run this; the grep gates in `<acceptance_criteria>` do.

    Step 8 — commit as `feat(03-01): wire --interactive flag on the CLI prune command (plumbing + async action callback)`.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "\"--interactive\"" src/cli.ts` returns exactly 1 hit
    - `grep -nE "interactive\\?: boolean" src/cli.ts` returns exactly 1 hit (the destructure type literal)
    - `grep -nE "interactive: cmdOpts\\.interactive === true" src/cli.ts` returns exactly 1 hit
    - `grep -nE "async \\(cmdOpts:" src/cli.ts` returns ≥1 hit (the prune action callback is async)
    - `grep -n "await prune(" src/cli.ts` returns exactly 1 hit (the prune call is awaited)
    - `grep -n "no-interactive" src/cli.ts` returns 0 hits (no opt-out flag — confirmed deferred)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm test` exits 0 with the same test count as before the plan
  </acceptance_criteria>
  <done>
    `--interactive` flag registered on the prune command with a self-explanatory help string, forwarded to `prune(config, cwd, { interactive: ... })`. The action callback is now `async` and `await`s the `prune(...)` call — making the cli.ts ownership boundary stable across Plans 01 and 03 (Plan 03 converts `prune()` itself to async but does NOT need to touch cli.ts). Plumbing only — no behavior change. Plan 03 will branch on this value.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user → CLI argv → Commander → cmdOpts | CLI flag parsing — Commander validates the flag exists; the value is a boolean |
| programmatic caller → PruneOptions → prune() | library consumers can pass `interactive: true` directly |

## STRIDE Threat Register

| Threat ID  | Category | Component | Disposition | Mitigation Plan |
|------------|----------|-----------|-------------|-----------------|
| T-03-01-01 | Tampering | `cmdOpts.interactive` value injection | accept | Commander parses `--interactive` as a boolean only (no arg). The `=== true` defensive coercion in the action handler discards any non-boolean value. Same pattern already proven for `--force` / `--dry-run` / `--clean-empty`. |
| T-03-01-02 | Elevation of privilege | Plan 01 plumbs a flag without enforcement | accept (Plan 03 mitigates) | The flag is plumbed but unread in Plan 01 — there is no behavior to elevate. Plan 03 introduces the TTY/non-TTY gate (D-13..D-15) which is the actual safety control. Documented so reviewers do not flag Plan 01 in isolation. |
| T-03-01-03 | Information disclosure | `--help` output exposes new flag name | accept | Intentional — CLI flag discoverability is a usability requirement, not a secret. The help line wording is reviewed in Step 1 above. |
| T-03-01-04 | Denial of service | malformed argv passed to Commander | accept | Commander's own argv parser is the trust boundary; it has been hardened by upstream and is already trusted by every other flag in this CLI. No new attack surface introduced by adding one boolean option. |
| T-03-01-05 | Denial of service | async action callback returning rejected Promise that Commander does not await | accept | Commander does not await the `.action()` callback's returned Promise — but in Plan 01 `prune()` is still synchronous, so the `await` resolves on the next microtask with no possibility of rejection. Plan 03 introduces actual async work AND a top-level try/catch around the `await prune(...)` call (already present at cli.ts lines 178-181) catches rejections and sets `process.exitCode = 1`. No new DoS surface. |

No HIGH/CRITICAL threats. This plan is pure additive plumbing; the safety-critical decisions (TTY detection, write-gate refusal on non-TTY + `--force`) live in Plan 03's threat model.
</threat_model>

<verification>
- `pnpm tsc --noEmit` — types compile; PruneOptions accepts the new field everywhere it is consumed (test files included); `await` on a sync return widens to the same type.
- `pnpm test` — full suite passes with no test count delta and no behavior delta (the new field is unread by Plan 01; the async action callback is not invoked by any test).
- `grep` gates in `<acceptance_criteria>` — confirm the surface exists in exactly the right files with the right shape, AND that the action callback is async and the prune call is awaited.
- `pnpm build && node dist/cli.js prune --help` — manual smoke confirms the help text renders. NOT a blocking gate (build is already covered by `pnpm tsc --noEmit`); included for executor convenience.
</verification>

<success_criteria>
- `PruneOptions.interactive?: boolean` is the sole new type-level export of this plan.
- `--interactive` appears in `src/cli.ts` exactly once as a `.option(...)` declaration on the prune command.
- The prune `.action(...)` callback is `async` and `await`s the `prune(...)` call — locking in the contract that Plan 03 can convert `prune()` itself to async without re-opening cli.ts.
- `cmdOpts.interactive` is forwarded to `prune(...)` exactly once via `interactive: cmdOpts.interactive === true`.
- No new file created. No file outside `src/types.ts` and `src/cli.ts` modified.
- Two atomic commits: `feat(03-01): add interactive?: boolean field to PruneOptions` and `feat(03-01): wire --interactive flag on the CLI prune command (plumbing + async action callback)`.
- Zero test regressions; zero behavior delta until Plan 03 wires the branch.
</success_criteria>

<output>
After completion, create `.planning/phases/03-interactive-pruning/03-01-SUMMARY.md` summarizing:
- Files modified (src/types.ts, src/cli.ts) and the exact diff hunks
- The new type signature `PruneOptions.interactive?: boolean`
- The new CLI flag `--interactive` and its help string
- **Async-action-callback callout:** the prune `.action(...)` is now `async` and `await`s `prune(...)`. This lets Plan 03 convert `prune()` to async without touching cli.ts again. The `await` is currently a no-op on a synchronous return; it becomes load-bearing once Plan 03 lands.
- Verification: `pnpm tsc --noEmit` + `pnpm test` outputs (exit codes + summary lines)
- IPRUNE-01 status: surface delivered; runtime branch deferred to Plan 03
- Handoff note to Plan 02: renderer module can import `PruneOptions` from `@/types` if it ever needs the type (Plan 02's `runInteractivePrune` does NOT take `PruneOptions` — it takes `candidates: string[]`); the type is exported only for the orchestrator in Plan 03
- Handoff note to Plan 03: branch on `options.interactive === true && process.stdin.isTTY === true && process.stdout.isTTY === true` (D-13) — see Plan 03 task spec. cli.ts already `await`s `prune(...)`, so Plan 03 converts `prune()` to `async` returning `Promise<PruneResult>` WITHOUT needing any cli.ts edit.
</output>
