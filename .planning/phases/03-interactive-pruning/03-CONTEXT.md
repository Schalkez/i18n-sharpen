# Phase 3: Interactive Pruning — Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase ships a new `--interactive` flag on the existing `prune` command. In a TTY, it opens a minimal hand-rolled TUI that lists every candidate unused key and lets the user pick (via arrow keys + Space) which subset to actually delete. After confirming with Enter, the selected keys flow through the existing `executePrunePlans` → `writeLocaleFilesAtomic` pipeline, honoring the existing `--force` / dry-run semantics. In non-TTY environments, the TUI is bypassed with a clear warning and the command falls back to the standard dry-run preview.

**NOT in scope (Deferred):**

- Interactive variants of `extract` / `validate` — separate phases if demand emerges.
- A reusable TUI primitive at `src/core/tui/` — premature abstraction; extract when a second consumer appears.
- Pagination / viewport-windowing / search-as-you-type (`/`) — deferred from "Extended scope" in Area 1.
- Visual polish: color-coded namespace groups, status bar, animated spinner — deferred to v0.4+.
- Saved/persistent selections across runs — out of scope.
- Per-key value editing inside the TUI — out of scope (not a prune concern).
- Auto-detected empty-namespace cleanup inside the TUI without `--clean-empty` — keeps Phase 1's D-09 flag-only design.
- Confirmation prompt (`y/N`) after the TUI Enter — single Enter is the confirm; `--force` is the write gate.

</domain>

<decisions>
## Implementation Decisions

### TUI Implementation

- **D-01: Hand-roll the TUI with raw-mode stdin.** No new dependencies. Use `process.stdin.setRawMode(true)`, read keypress sequences (arrow ANSI codes, single-byte chars, ESC + bracket sequences), render rows via `picocolors` (already a dep) and ANSI cursor escapes. Honors the "tiny dep tree" hard constraint from `.planning/PROJECT.md`. Estimated ~150-250 LOC for the renderer + key handler.
- **D-02: Renderer scope = key handling only.** Ships: arrow keys, Space, Enter, Esc, plus the shortcut bundle from D-05. Does NOT ship: search-as-you-type filtering, viewport-windowed pagination, namespace-group headers, status bar, color-coded groups. Long lists rely on natural terminal scrollback.
- **D-03: Module location = `src/commands/prune/interactive.ts`.** Co-located with `prune/plans.ts`. Stays internal to the `prune` command; not exported from `src/index.ts`. If a future phase needs similar UI (e.g. `validate --interactive`), the renderer is extracted to `src/core/tui/` at that point — not preemptively.
- **D-04: Test strategy = unit tests with mocked stdin / captured stdout.** Inject fake `Readable` for `process.stdin` and a fake `Writable` for `process.stdout`. Drive keystrokes, assert the captured ANSI escape sequences AND the final selection result. Same pattern as the existing `scanner` / `locale-io` unit tests. No real-terminal smoke tests required for v0.3.0.

### Selection UX

- **D-05: Default check-state = ALL UNCHECKED (keep-by-default).** User must actively check what to delete. Aligns with the project's "translation data is precious, dry-run by default" principle. Pairs with the `a` shortcut for users who want the old bulk-prune semantics in one tap.
- **D-06: Shortcut set.** All four bundles ship:
  - `↑` / `↓` — move cursor (IPRUNE-02, required).
  - `Space` — toggle row (IPRUNE-02, required).
  - `Enter` — confirm selection (IPRUNE-03, required).
  - `Esc` / `Ctrl+C` — cancel with no writes, exit 130 (IPRUNE-04, required).
  - `a` — check all (recommended; restores old bulk-prune in one tap).
  - `n` — uncheck all (recommended; counterpart to `a`).
  - `i` — invert selection (power-user shortcut).
  - `PageUp` / `PageDown` — jump cursor by N rows within the visible window (N = terminal rows - 2, or 10 if undetectable). Cursor still wraps via arrows.
- **D-07: Row display = one row per key, namespace prefix inline.**
  - Flat layout: `[ ] auth.login.title`
  - Namespaced layout: `[ ] auth:login.title` (matches the `t()` call convention from source code).
  - No grouping headers, no value preview, no extra columns. Cursor row gets an `→` glyph or `>` (NO_EMOJI fallback) at the left margin to indicate focus. Checkbox glyphs: `[x]` checked, `[ ]` unchecked (ASCII only — avoids emoji compat issues like the existing `NO_EMOJI` env-var handling in `src/utils.ts`).
- **D-08: Long-list handling = render all rows, rely on natural terminal scrollback.** No viewport windowing. Works fine for up to a few hundred keys; awkward beyond that, but typical i18n projects with this many unused keys have bigger problems than the picker UX. If demand emerges in v0.4+, viewport pagination can be layered on without breaking the API.

### Flag Composition

- **D-09: `--interactive` WITHOUT `--force` → dry-run preview of selected keys, exit 0.** After Enter, print:
  ```
  PRUNE PREVIEW (interactive — no files written)
  Would prune N keys (interactively selected) from <file>:
    - key.one
    - key.two
    ...
  Dry-run: N keys would be removed. Re-run with --interactive --force to apply.
  ```
  Selections do NOT persist between runs (user re-selects on next invocation). Preserves the existing "`--force` is the sole write gate" pattern from `src/commands/prune.ts:27`.
- **D-10: `--interactive --dry-run` = no-op equivalent to `--interactive` alone.** Both end in a dry-run preview (the absence of `--force` is what gates writes). `--dry-run` is silently redundant in this combo, no error. Matches the existing flag matrix where `dryRun` always wins over `force`.
- **D-11: `--interactive --clean-empty` = existing flag still applies post-selection.** After the user confirms their key selection AND chooses to write (i.e. `--force` was also passed), the existing `cleanEmptyNamespaceFiles()` helper runs on any namespace whose files end up with zero own-keys. NO new TUI step for namespace deletion — Phase 1's D-09 flag-only design preserved. If user wants empty-ns cleanup, they pass `--clean-empty` explicitly as before.
- **D-12: CLI summary after a successful interactive write.** Reuse the existing `executePrunePlans` summary line (`Files have been successfully cleaned! Total pruned: N keys.`). Prepend one informational line: `Interactive selection: kept M keys, removed N keys.` so the audit trail records that selection was hand-curated. No "kept list / removed list" dump in the summary — the TUI already showed the user what they picked.

### Non-TTY & Safety

- **D-13: Non-TTY detection = `!process.stdin.isTTY || !process.stdout.isTTY`.** Either side being a non-TTY (piped input OR piped output) triggers the fallback. Reason: even a TTY stdin with stdout redirected to a file means the user can't see the picker — so the experience is broken either way.
- **D-14: Non-TTY fallback (no `--force`) = warn + dry-run + exit 0.** Print:
  ```
  Warning: --interactive requires a TTY; falling back to dry-run preview of all candidates.
  ```
  Then run the existing dry-run code path (all unused keys shown). Exit 0. Verbatim implementation of IPRUNE-06.
- **D-15: Non-TTY + `--force` (the dangerous combo) = warn + dry-run + exit 0, `--force` IGNORED.** Print:
  ```
  Warning: --interactive requires a TTY; --force ignored to avoid unintended bulk prune.
  Falling back to dry-run preview of all candidates.
  ```
  Reason: the user explicitly asked for interactive selection; in a non-TTY they can't actually pick, so honoring `--force` here would silently bulk-prune everything — the exact thing `--interactive` was meant to prevent. Refusing the write protects against accidental CI misconfiguration. Exit 0 (the dry-run completed without errors).
- **D-16: Empty candidate list = skip TUI entirely.** When `pruneFlat` / `pruneNamespaced` produce zero `writePlans` (no unused keys anywhere), don't open the TUI. Print the existing `✨ No unused keys found to prune.` log and exit 0. Cheapest, most predictable.
- **D-17: SIGINT (Ctrl+C) cleanup = TUI-scoped handler, restore terminal, exit 130.** On entering raw-mode, install a SIGINT handler that:
  1. Writes `\x1b[?25h` to stdout (restore cursor visibility).
  2. Calls `process.stdin.setRawMode(false)` and removes keypress listeners.
  3. Calls `process.exit(130)`.
  No `.tmp` cleanup is needed because the TUI exits BEFORE any write code runs — the existing `writeLocaleFilesAtomic` handles its own `.tmp` cleanup if interrupted mid-write (Phase 1 D-10). The handler is removed on normal exit (Enter / Esc) so it doesn't leak into the post-TUI write phase. `Esc` triggers the same exit path (selection discarded, exit 130 per IPRUNE-04).

### Test coverage

- **D-18: Tests required**:
  - **TUI unit tests** (`src/__tests__/interactive.test.ts` new):
    - Render: initial state with N rows, cursor at row 0, all unchecked.
    - Keystrokes: arrow-down moves cursor; arrow-down past last row stays at last (no wrap); arrow-up past first row stays at first.
    - Toggle: Space on row 2 marks row 2 only.
    - Shortcuts: `a` checks all, `n` unchecks all, `i` inverts, `PageUp`/`PageDown` jump N rows.
    - Confirm: Enter exits with selected indices.
    - Cancel: Esc exits with `cancelled: true`, no selection.
    - Cursor visibility restored on every exit path (capture trailing `\x1b[?25h`).
  - **Integration tests** (extend `src/__tests__/prune.test.ts`):
    - `prune --interactive` in TTY with all selections checked → writes those keys when `--force`.
    - `prune --interactive` without `--force` → prints "Would prune" preview, no disk writes.
    - `prune --interactive` empty candidate list → "No unused keys" log, no TUI invocation.
    - Non-TTY fallback (mock `process.stdin.isTTY = false`): warn + dry-run preview of all candidates, exit 0.
    - Non-TTY + `--force`: same fallback, additional `--force ignored` warning, no writes.
    - `--interactive --clean-empty --force` in namespaced layout: empty ns files deleted post-write, matching Phase 1 D-09 behavior.
  - **Property test (fast-check)**: for any sequence of `[arrow-down, space, arrow-up, space, ...]` keystrokes, the final selection set equals the set of indices that had an odd number of Space toggles. Idempotency: `confirm-then-replay-selection == confirm-with-same-selection`.

### Claude's Discretion

The user accepted every recommended default (consistent with the Phase 1 / Phase 2 pattern: "best practice tùy bạn quyết"). Remaining technical choices delegated to planner/researcher:

- Exact ANSI escape sequences and how to abstract them (a tiny `ansi.ts` helper inside `prune/` or inline constants — recommendation: inline constants since the surface is small).
- How to detect terminal width for cursor reset (`process.stdout.columns ?? 80`).
- How to model the keypress reader internally (event-emitter pattern from `node:readline.emitKeypressEvents` vs hand-parsed byte buffer — recommendation: hand-parse the small set of sequences we actually need; `readline.emitKeypressEvents` adds the readline interface as a side effect and the parser is small).
- The exact text of warning / preview / summary lines — match the existing `pc.cyan(filename)` / `pc.yellow(count)` patterns from `prune/plans.ts`.
- Whether to add a new `interactive?: boolean` field to `PruneOptions` for the programmatic API — recommendation: **YES**, mirroring how `force` and `dryRun` are already there. Lets library consumers test or compose the interactive path without going through the CLI.
- Whether to bump `package.json#engines.node` (recommendation: **NO** — Node ≥ 20 already covers `setRawMode` and `readline.emitKeypressEvents`).
- Whether to add a `--no-interactive` flag for explicit opt-out (recommendation: **NO** — absence of `--interactive` is the opt-out; extra flag adds CLI surface without value).

### Folded Todos

None — `gsd-tools todo match-phase 3` returned zero matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Vision, constraints (tiny dep tree, dry-run safety, ESM Node 20+, framework-agnostic), Key Decisions table.
- `.planning/REQUIREMENTS.md` — IPRUNE-01..06 mapped to this phase. Includes Out of Scope list and Future Requirements (v0.4+).
- `.planning/ROADMAP.md` — Phase 3 success criteria (5 items).
- `CLAUDE.md` (project root) — GitNexus impact-analysis workflow (MANDATORY before editing any symbol).

### Prior phase context (decisions to honor)
- `.planning/phases/01-auto-sorting-keys-namespace-hardening/01-CONTEXT.md` — D-09 (`--clean-empty` flag-only design, explicitly deferred TUI confirmation prompt to Phase 3), D-10 (atomic write helper `writeLocaleFilesAtomic` — the post-confirm write path).
- `.planning/phases/02-dynamic-key-warnings/02-CONTEXT.md` — D-15 (line-offset tracking pattern), output-format precedents (grouped summary instead of per-call warn).

### Existing code (read before changing)
- `src/cli.ts` — Lines 126-184 wire the `prune` command and its current flags. Add `--interactive` here in the same `.option()` pattern as `--force` / `--clean-empty`. The action handler at line 146 needs an `interactive?: boolean` field added to the destructure.
- `src/commands/prune.ts` — Entry point for the `prune` function. Lines 17-63. The new flow: after `detectUsedKeys` and before calling `pruneFlat` / `pruneNamespaced`, if `options.interactive === true` AND TTY: collect candidates, launch TUI, filter `usedKeys` to exclude un-checked candidates so the existing pipeline only "removes what the user picked".
- `src/commands/prune/plans.ts` — `executePrunePlans` (line 32), `pruneFlat` (line 151), `pruneNamespaced` (line 257), `cleanEmptyNamespaceFiles` (line 110). The interactive layer ideally injects ABOVE these — by treating "user-checked keys" as a virtual additional set of used keys, the existing functions need no changes. The summary text in `executePrunePlans:78-92` may need a one-line preamble for interactive runs (D-12).
- `src/types.ts` — Add `interactive?: boolean` to `PruneOptions` (line 103). The internal `prune?:` config block (line 79) does NOT get a new field — keep the CLI flag as the sole way to enter interactive mode (no `prune.interactive: true` in config, otherwise it'd be a footgun in CI).
- `src/utils.ts` — `log.warn`, `log.success`, `log.info`, `log.header`. Use these for all user-facing output. Note the `NO_EMOJI` env var (lines 50-61) — TUI glyphs must respect this convention (use ASCII `[x]`/`[ ]` and `>` cursor instead of Unicode). Picocolors is also re-exported indirectly via the log helpers.
- `src/__tests__/prune.test.ts` — Existing prune integration test pattern (especially line 232 namespaced test). Mock `fs` writes and `process.stdin/stdout` for TTY tests.
- `src/__tests__/atomic.test.ts` — Pattern for testing the atomic write window (Phase 1 D-10). Interactive tests should NOT re-test atomicity — it's already covered.
- `src/__tests__/sort.test.ts` — Pattern for property-based tests with `fast-check`. Use the same scaffold for the keystroke-replay property test (D-18).

### External docs to consult
- Node.js docs — [`tty.WriteStream.isTTY`](https://nodejs.org/api/tty.html#writestreamistty), [`process.stdin.setRawMode`](https://nodejs.org/api/tty.html#readstreamsetrawmodemode), [`readline.emitKeypressEvents`](https://nodejs.org/api/readline.html#readlineemitkeypresseventsstream-interface). The TUI lives on these primitives. Specifically watch out for: Windows ConPTY behavior (Node 20+ ConPTY is well-supported but esc-sequence parsing for arrow keys differs from Unix in older Node).
- ANSI escape codes — minimum set needed: `\x1b[?25l` / `\x1b[?25h` (hide/show cursor), `\x1b[H` (cursor home), `\x1b[2J` (clear screen — NOT used; prefer line-by-line rerender to avoid scroll loss), `\x1b[<n>A` / `\x1b[<n>B` (cursor up/down by n).
- IPRUNE-04 exit code 130 — standard SIGINT exit code convention (128 + signal 2).

[No external ADRs or third-party specs required for this phase.]

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`executePrunePlans`** ([prune/plans.ts:32](src/commands/prune/plans.ts:32)) — already handles the print-then-write flow with dry-run support. The interactive layer should produce a filtered `writePlans` array and hand it to this function unchanged. The `displayName` field on `WritePlan` (line 24) is already namespace-aware (`en/auth.json` format).
- **`writeLocaleFilesAtomic`** (re-exported from `@/core/locale-io`, defined per Phase 1 D-10) — the atomic write path. Already handles `.tmp` cleanup on partial failure. Interactive runs use the same path; no new atomicity concerns.
- **`cleanEmptyNamespaceFiles`** ([prune/plans.ts:110](src/commands/prune/plans.ts:110)) — already filters for empty namespace files and deletes them under `--clean-empty`. D-11 says: don't touch this function; it just runs after the interactive selection naturally.
- **`isKeyUsed`** (from `@/core/scanner`) — the predicate that decides "used or unused". The interactive layer can compose with this: candidates = locale-keys-where-`isKeyUsed`-is-false; the TUI's "kept" selections become a virtual extension of `usedKeys`.
- **`log` helpers** ([utils.ts:62-78](src/utils.ts:62)) — `log.warn`, `log.success`, `log.info`, `log.header`. All TUI-adjacent output goes through these. The `NO_EMOJI` env var handling (line 50) is the precedent for picking ASCII glyphs in the TUI checkboxes.
- **`picocolors` (`pc`)** — already a runtime dep. Use `pc.cyan` for filenames, `pc.yellow` for counts, `pc.green` for success states, `pc.dim` for the help-key footer (`Space toggle  Enter confirm  Esc cancel  a all  n none  i invert`).

### Established Patterns
- **Two-phase plan-then-write** — `extractFlat`, `pruneFlat`, `pruneNamespaced`, and `cleanEmptyNamespaceFiles` all build plans in memory before any disk I/O. The interactive layer fits this pattern naturally: TUI selection happens BEFORE the write phase. No new pattern to introduce.
- **CLI flag → config field → action body** — `cli.ts` parses CLI options, fills in config fields (`config.sortKeys`, `config.prune.cleanEmpty`), then calls the action. `--interactive` follows the same shape but goes into `options` (the `PruneOptions` parameter to `prune()`) rather than `config`, mirroring how `--force` / `--dry-run` are handled (line 174-177 of cli.ts).
- **Test pattern: capture stdout + spy on log methods** — `src/__tests__/prune.test.ts` already mocks `log.info` / `log.warn` via `vi.spyOn`. The TUI unit tests extend this with `process.stdin` and `process.stdout` mocks.
- **Property-based testing** — `src/__tests__/sort.test.ts` and `src/__tests__/core.test.ts` use `fast-check` for invariants. The keystroke-replay property test in D-18 reuses this scaffold.
- **Exit code via `process.exitCode`** — `cli.ts` lines 84/87/119/122/178/181 use `process.exitCode = N` (not `process.exit(N)`) so buffered stdout drains. The interactive Esc/SIGINT path is the one place where `process.exit(130)` IS appropriate, because raw-mode terminals need an immediate, synchronous exit to restore state before any other code runs.

### Integration Points
- **`cli.ts:126-184`** — add `--interactive` flag to the `prune` command, threaded into `options.interactive` for the `prune()` call.
- **`prune.ts:17-63`** — top-level orchestration. After computing `usedKeys` and BEFORE calling `pruneFlat`/`pruneNamespaced`, branch on `options.interactive && process.stdin.isTTY && process.stdout.isTTY`. The TUI returns a filtered set of "keys to keep" which augment `usedKeys`. Non-TTY branch logs the IPRUNE-06 warning and proceeds with the existing dry-run path.
- **New: `src/commands/prune/interactive.ts`** — exports `runInteractivePrune(candidates: string[]): Promise<{ keep: Set<string>; cancelled: boolean }>` (or similar). Self-contained: imports `picocolors` and the `log` helper, owns all stdin/stdout interaction. Takes flat candidate keys as input, returns the user's "keep" set. The caller (`prune.ts`) translates "kept" back into the existing pipeline.
- **`types.ts:103`** — add `interactive?: boolean` to `PruneOptions`. No zod schema change (PruneOptions isn't user-config; it's the programmatic call signature).
- **`src/__tests__/interactive.test.ts`** (new) — TUI-specific unit tests per D-18.
- **`src/__tests__/prune.test.ts`** — extend with the integration cases from D-18.
- **`CHANGELOG.md`** — new entry under v0.3.0: "added `prune --interactive` for hand-picking unused keys (IPRUNE-01..06)". Note that no behavior changes for non-interactive `prune`.

</code_context>

<specifics>
## Specific Ideas

- User accepted every recommended default — the same pattern as Phase 1 and Phase 2. Signal: trust the conservative "minimum-surface-area + maximum-safety" engineering taste. The TUI scope deliberately stays small (no search, no pagination, no value preview) because every extra feature is a future maintenance bill and a possible regression vector. Property-based tests + mocked-IO unit tests handle the edge-case coverage the user has consistently asked for ("tôi cần cover đủ các case").
- Hand-rolling the TUI is the right call given the project's hard "tiny dep tree" constraint. ~150-250 LOC of carefully scoped raw-mode handling is acceptable; the alternative (`@clack/prompts`, ~30KB unpacked + transitive deps) would be the first dep added since the v0.2.x baseline and would set a precedent that's hard to walk back.
- The shortcut bundle (`a`/`n`/`i`/`PgUp`/`PgDn`) is the one spot where the user nudged the scope wider than the strict minimum. It's a good trade: those keys cost very little code, and `a` specifically restores the "prune everything" muscle memory in one keystroke given the new keep-by-default convention (D-05).
- D-15 (non-TTY + `--force` refuses to write) is a deliberate safety break vs the surface-level "honor flags as passed" reading of `--force`. The reasoning: `--interactive` is a stronger signal of user intent than `--force` alone. If they explicitly asked to pick, and they can't pick, doing the bulk action they were trying to AVOID would be a footgun. This is the kind of dangerous CI combination that justifies an opinionated refusal.
- v0.3.0 is the milestone where breaking changes are allowed; adding a new CLI flag is fully additive, no breakage. CHANGELOG entry goes under "Added", not "BREAKING".

</specifics>

<deferred>
## Deferred Ideas

Came up during discussion but explicitly out of scope for Phase 3 (and v0.3.0):

- **Pagination + filter (`/` to search) + viewport windowing** — Area 1 "Extended scope" option. Useful for projects with 500+ unused keys, but every i18n project that big has bigger problems. Defer to v0.4+ if user demand surfaces. The hand-rolled renderer can layer this on without breaking the API.
- **Visual polish: color-coded namespace groups, status bar, animated spinner** — Area 1 "Advanced scope". Aesthetic, not functional. Defer to v0.4+.
- **Reusable TUI primitive at `src/core/tui/select.ts`** — Area 1 module-location option. Premature abstraction with one consumer. Extract when a second consumer (e.g. `validate --interactive`, future) actually exists.
- **Confirmation prompt (`y/N`) after TUI Enter** — Area 3 confirm-UX option. Adds confirm-fatigue without proportional safety value; the `--force` gate is the existing pattern and it's enough.
- **`--interactive` implies `--force`** — Area 3 confirm-UX option. Would erode the dry-run safety contract; rejected.
- **Auto-detected empty-namespace cleanup inside TUI (without `--clean-empty`)** — Area 3 `--clean-empty` option. Effectively re-implements Phase 1 D-09 inside the TUI; rejected to keep flag-only design.
- **`--no-interactive` flag for explicit opt-out** — Claude's Discretion. Absence of `--interactive` IS the opt-out. Extra CLI surface without value.
- **`prune.interactive: true` config field** — Claude's Discretion. CI footgun. Keep CLI-flag-only entry into interactive mode.
- **`--interactive` for `extract` or `validate`** — entirely separate phases if they ever ship. No coupling.
- **Per-key value editing in the TUI** — would re-implement an editor. Out of scope; users have IDEs.
- **Saved/persistent selections across runs** — adds state file management, sync-with-git questions, etc. Heavy for marginal value (re-selection on a list of N keys takes seconds).
- **Generic `selectMany<T>` API** — see "reusable TUI primitive" above.
- **TUI smoke test in CHANGELOG / contributor checklist** — Area 1 test option. Manual test discipline is hard to enforce; unit tests with mocked IO catch the same bugs.

### Reviewed Todos (not folded)
None reviewed — `gsd-tools todo match-phase 3` returned zero matches.

</deferred>

---

*Phase: 03-interactive-pruning*
*Context gathered: 2026-05-29*
