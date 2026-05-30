---
phase: 03-interactive-pruning
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/commands/prune/interactive.ts
  - src/__tests__/interactive.test.ts
autonomous: true
requirements:
  - IPRUNE-02
  - IPRUNE-03
  - IPRUNE-04
tags:
  - tui
  - raw-mode
  - keypress
  - unit-tests
  - property-tests

must_haves:
  truths:
    - "runInteractivePrune renders one row per candidate with ASCII checkbox glyphs [x]/[ ] (NO_EMOJI-safe)"
    - "Arrow Up/Down moves the cursor; cursor clamps at first/last row (no wrap)"
    - "Per D-05 (all-unchecked, user actively checks what to delete) the renderer's data model literally tracks rows the user has marked-for-delete; that set is exposed on the result as `toDelete: Set<string>`. The orchestrator (Plan 03) computes kept = candidates − toDelete."
    - "Space toggles the focused row's membership in the toDelete set; only toggled candidates end up in `result.toDelete`"
    - "Enter resolves the promise with { toDelete, cancelled: false }"
    - "Esc resolves with { toDelete: <empty>, cancelled: true } and does NOT call exit — clean cancel; the orchestrator (Plan 03) sets `process.exitCode = 130` based on `cancelled === true`. A bare Esc is disambiguated from arrow/PageX sequences via an injectable `escDelay` timer (default ~50ms): the byte is committed as Esc only if no `[`-continuation arrives within escDelay."
    - "Ctrl+C triggers the SIGINT cleanup handler (D-17) which restores cursor, restores raw mode, calls injected `exit(130)`, and the returned promise rejects with `InteractiveCancelledError`."
    - "Shortcut `a` checks all (toDelete = all candidates), `n` unchecks all (toDelete = empty), `i` inverts, PageUp/PageDown jump by the visible-window height (page size read dynamically from the CURRENT stdout.rows each keypress, not cached)"
    - "Every rendered row is truncated to fit (stdout.columns ?? 80) - 2 so a row NEVER wraps — this keeps the in-place `\\x1b[<n>A` redraw math correct for any terminal width (root-cause fix for both long keys and width changes) (D-19)"
    - "A `resize` listener on stdout triggers an immediate in-place re-render at the new width; the listener is registered on enter and removed in cleanup() on every exit path (same leak-prevention as the SIGINT handler) (D-19)"
    - "Cursor visibility is restored (\\x1b[?25h emitted) on every exit path — Enter, Esc, Ctrl+C, error"
    - "Raw mode is disabled and keypress listeners are removed on every exit path"
    - "Property test: for any sequence of [arrow-down, space, arrow-up, space, ...] keystrokes, the final `toDelete` set equals the set of candidate names whose row had an odd number of Space toggles"
  artifacts:
    - path: src/commands/prune/interactive.ts
      provides: "runInteractivePrune(candidates, options) — hand-rolled raw-mode TUI renderer + key handler; resolves with { toDelete: Set<string>; cancelled: boolean }"
      exports: ["runInteractivePrune", "InteractivePruneResult", "InteractivePruneOptions", "InteractiveCancelledError"]
      min_lines: 150
    - path: src/__tests__/interactive.test.ts
      provides: "unit tests for render, navigation, toggle, shortcuts, confirm, cancel (Esc-clean vs Ctrl+C-hard), cursor restore, plus fast-check property test for keystroke-replay idempotency"
      min_lines: 200
  key_links:
    - from: src/commands/prune/interactive.ts
      to: picocolors
      via: "row rendering (pc.dim, pc.cyan, pc.green)"
      pattern: "from \"picocolors\""
    - from: src/__tests__/interactive.test.ts
      to: src/commands/prune/interactive.ts
      via: "imports runInteractivePrune and drives it with mocked stdin / captured stdout; asserts result.toDelete shape"
      pattern: "from \"@/commands/prune/interactive\""
---

<objective>
Phase 3, Plan 2: Build the hand-rolled, raw-mode TUI renderer at `src/commands/prune/interactive.ts` and cover it with mocked-IO unit tests + a fast-check property test. The module is self-contained: it takes a flat `string[]` of candidate keys, drives a render loop on injected `stdin`/`stdout` streams, and resolves with a `{ toDelete: Set<string>; cancelled: boolean }` result.

**Field name rationale (Dimension 9 contract — locked):** Per D-05 "Default check-state = ALL UNCHECKED (keep-by-default). User must actively check what to delete", the CHECKED rows ARE the user's mark-for-delete action. The renderer's internal state literally tracks "which rows did the user check to delete", so the result field is named `toDelete` to match. The orchestrator (Plan 03) then computes `kept = candidates − toDelete` for its own purposes. This naming makes the renderer's API self-evident — no inversion logic at the boundary.

Purpose: Honors CONTEXT.md D-01 (hand-roll, no deps), D-02 (key handling scope only — no search, no pagination, no group headers), D-03 (module location — co-located with `prune/plans.ts`, not exported from `src/index.ts`), D-04 (test strategy — mocked stdin/stdout), D-05..D-08 (UX — ASCII glyphs, namespace prefix inline, all-render-no-windowing), D-17 (SIGINT cleanup), D-18 (the test matrix), D-19 (row truncation + resize re-render robustness), and D-20 (timer-based escDelay Esc disambiguation).

Output:
- New `src/commands/prune/interactive.ts` exporting `runInteractivePrune(candidates: string[], options?: InteractivePruneOptions): Promise<InteractivePruneResult>` where:
  - `InteractivePruneOptions` carries injected `stdin` / `stdout` (defaulting to `process.stdin` / `process.stdout`) so tests can drive a fake `Readable` / `Writable`, plus an `exit(code)` hook (defaulting to `process.exit`) for the Ctrl+C path.
  - `InteractivePruneResult = { toDelete: Set<string>; cancelled: boolean }`.
- New `src/__tests__/interactive.test.ts` with the 7 test groups enumerated in CONTEXT.md D-18 (TUI unit tests bullet) plus the property test from D-18.
- The renderer is internal — NOT re-exported from `src/index.ts`. Plan 03's `prune.ts` imports it via the relative path `./prune/interactive`.

No `src/cli.ts`, no `src/commands/prune.ts`, no `src/types.ts` modified in this plan — exclusive file ownership for safe parallel execution with Plan 01.
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
<!-- All contracts the renderer composes on. -->

From src/utils.ts:50-78 — log helpers + NO_EMOJI env handling (the renderer reuses the same NO_EMOJI semantics for its checkbox/cursor glyphs):
```typescript
const emojiDisabled =
  typeof process !== "undefined" &&
  !!process.env.NO_EMOJI &&
  process.env.NO_EMOJI !== "0" &&
  process.env.NO_EMOJI.toLowerCase() !== "false"
// glyphs.ok / glyphs.warn / glyphs.err already use this pattern.
```

From src/__tests__/sort.test.ts:115-149 — fast-check scaffold (pattern for the property test):
```typescript
import fc from "fast-check"
fc.assert(fc.property(<arb>, (value) => { ... }))
```

Node.js stdin/stdout API surface (no external dep):
```typescript
process.stdin.setRawMode(true | false)   // requires process.stdin.isTTY === true on the real stream
process.stdin.on("data", (chunk: Buffer) => ...)
process.stdin.resume() / process.stdin.pause()
process.stdout.write(s: string)
process.stdout.columns: number | undefined
process.stdout.rows:    number | undefined
```

Key byte sequences the parser must recognize (subset documented in CONTEXT.md "External docs to consult" — these are the only ones needed):
```
Arrow Up    : \x1b[A
Arrow Down  : \x1b[B
PageUp      : \x1b[5~
PageDown    : \x1b[6~
Space       : 0x20
Enter       : 0x0d  (\r)  OR  0x0a (\n)  — accept both for Windows ConPTY safety
Esc         : 0x1b  (when NOT followed by `[`)
Ctrl+C      : 0x03
a / n / i   : 0x61 / 0x6e / 0x69
```

ANSI escapes the renderer emits (full set — no others):
```
Hide cursor       : \x1b[?25l
Show cursor       : \x1b[?25h
Cursor up by n    : \x1b[<n>A
Cursor down by n  : \x1b[<n>B
Erase to end of line: \x1b[K   (used after writing each row to clear any leftover chars from a longer previous row)
```

<!-- Result contract — locked. -->
```typescript
export interface InteractivePruneResult {
  /**
   * The set of candidate keys the user CHECKED in the TUI.
   * Per D-05 (default all-unchecked), a checked row means
   * "the user wants to delete this key". The orchestrator
   * computes kept = candidates − toDelete.
   */
  toDelete: Set<string>

  /**
   * True if the user pressed Esc (clean cancel — no exit() called).
   * On Ctrl+C the promise rejects with InteractiveCancelledError instead
   * and this field is never observed by the caller.
   */
  cancelled: boolean
}
```
</interfaces>
</context>

<validation_gates>
<!-- D-XX coverage gates for Plan 02. Every relevant D-XX maps to at least one test in interactive.test.ts. -->

| D-XX | Decision | Test gate (in src/__tests__/interactive.test.ts) |
|------|----------|---------------------------------------------------|
| D-01 | Hand-roll raw-mode | `grep -n "setRawMode" src/commands/prune/interactive.ts` returns ≥1; `grep -n "@clack\\|inquirer\\|prompts" package.json` returns 0 |
| D-02 | Key handling only — no search/pagination/groups | `grep -nE "\"/\"|search|paginat" src/commands/prune/interactive.ts` returns 0 |
| D-03 | Module location internal — NOT in src/index.ts | `grep -n "interactive" src/index.ts` returns 0 |
| D-04 | Unit tests with mocked stdin/stdout | test file imports a `PassThrough` or constructed `Readable`/`Writable` and drives `runInteractivePrune({ stdin, stdout })`; assertion uses `stdout.getCapturedOutput()` (helper) |
| D-05 | Default = all unchecked; checked = mark-for-delete | "initial render — all rows unchecked" test asserts no `[x]` glyph in initial buffer; final result with Enter-immediately has `toDelete.size === 0` |
| D-06 | Shortcut set: arrow / Space / Enter / Esc / Ctrl+C / a / n / i / PageUp / PageDown | one `it.each` table covers every shortcut; assertions on either the final `toDelete` set or the visible buffer |
| D-07 | Row display `[x] / [ ]` ASCII + `→` (or `>` under NO_EMOJI) cursor glyph | NO_EMOJI=1 test variant asserts `>` cursor glyph in captured stdout, no Unicode chars in buffer |
| D-08 | No viewport windowing — render all rows | test with 50 candidates asserts every label appears in the initial render output |
| D-17 | SIGINT cleanup — hide-cursor reset, raw mode off, exit 130 | Ctrl+C test asserts: captured stdout's final emission is `\x1b[?25h`; injected `exit` mock was called with `130`; setRawMode was called with `false` before exit; the promise rejects with InteractiveCancelledError |
| D-18 (TUI unit tests bullet, items 1-7) | Each item below has a dedicated test | see Task 2 behavior table |
| D-18 (Property test bullet) | Keystroke replay → odd-count Space toggles property | `fc.assert(fc.property(...))` block exists; runs ≥100 iterations; asserts `result.toDelete` equals expected odd-toggle set |
| D-19 | Resize + row truncation (no wrap) | test "truncates rows wider than stdout.columns" asserts every visible line ≤ columns; test "re-renders on resize event" asserts a fresh frame at new width; `grep -nE "on\(['\"]resize['\"]" src/commands/prune/interactive.ts` ≥1 |
| D-20 | Esc disambiguation via injectable escDelay timer | tests "bare Esc after timeout", "split arrow sequence is Arrow-Down", "single-chunk arrow" pass; `grep -n "escDelay" src/commands/prune/interactive.ts` ≥1; `grep -n "setImmediate" src/commands/prune/interactive.ts` returns 0 |
| IPRUNE-02 | Arrow nav + Space toggle | tests "arrow-down moves cursor", "Space toggles focused row" pass |
| IPRUNE-03 | Enter confirms | test "Enter resolves with toDelete set" passes |
| IPRUNE-04 | Esc clean-cancel + Ctrl+C hard-cancel both exit 130, no writes | tests "Esc cancels with empty toDelete and cancelled=true (no exit call)" + "Ctrl+C triggers SIGINT cleanup, calls exit(130), promise rejects" pass |

Out of scope for Plan 02 (and explicitly tested NOT to appear):
- IPRUNE-01 (TTY launch from CLI) — Plan 03
- IPRUNE-05 (--force semantics) — Plan 03
- IPRUNE-06 (non-TTY fallback) — Plan 03
- TUI test for the "✨ No unused keys" empty-candidate-list short-circuit (D-16) — Plan 03 handles this BEFORE calling runInteractivePrune
</validation_gates>

<pre_commit_protocol>
**MANDATORY (per CLAUDE.md):** Before EVERY `Commit as ...` step in this plan, run:

```
gitnexus_detect_changes({repo: "i18n-sharpen"})  # via MCP, or
npx gitnexus detect-changes --repo i18n-sharpen --scope unstaged
```

Expected affected symbols for this plan: ONLY new symbols in `src/commands/prune/interactive.ts` and new test cases in `src/__tests__/interactive.test.ts`. Any pre-existing symbol surfacing in `detect_changes` output means the plan drifted — stop and investigate.

If GitNexus MCP is unavailable on Windows (documented in Phase 1 RESEARCH.md), the grep-based fallback in each task's `<read_first>` is sufficient — proceed with commit.
</pre_commit_protocol>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — write failing tests for the TUI renderer (D-18 matrix + property test)</name>
  <files>src/__tests__/interactive.test.ts</files>
  <read_first>
    - Read src/__tests__/sort.test.ts (full file — fast-check scaffold pattern at lines 115-149)
    - Read src/__tests__/prune.test.ts lines 1-60 (vitest spy/mock pattern + beforeEach/afterEach)
    - Read src/utils.ts lines 50-61 (NO_EMOJI env handling — the renderer must respect this; the test verifies it)
    - Read 03-CONTEXT.md D-18 (the test matrix this file mirrors)
    - Note: this is the RED phase. The file under test (`src/commands/prune/interactive.ts`) does NOT exist yet — tests MUST fail with "Cannot find module".
  </read_first>
  <behavior>
    Test groups (mirroring CONTEXT.md D-18 TUI unit tests bullet, items 1-7, plus the property test):

    1. **Initial render** — Given 3 candidates `["auth:login.title", "common.farewell", "errors.network"]`, render produces a buffer with:
       - Header line containing the keymap footer text `Space toggle  Enter confirm  Esc cancel  a all  n none  i invert` (pc.dim wrapped)
       - 3 rows, each starting with `[ ]` (ASCII checkbox unchecked) — no `[x]` anywhere
       - First row prefixed with `→` (default) or `>` (NO_EMOJI=1) cursor glyph
       - Cursor visibility hidden once on enter (`\x1b[?25l` present in the captured buffer)

    2. **Navigation** —
       - Arrow Down (`\x1b[B`) moves cursor from row 0 → row 1 (assertion: row 1 has the cursor glyph after re-render)
       - Arrow Down past the last row (row N-1) stays at N-1 (no wrap; assertion: cursor still on N-1 after extra down-press)
       - Arrow Up past row 0 stays at 0 (no wrap)

    3. **Toggle (IPRUNE-02)** — Space on row 2 marks ONLY row 2: subsequent capture shows `[x]` on row 2 and `[ ]` on rows 0/1. After Enter, `result.toDelete` equals `Set(["errors.network"])` (the row-2 candidate) and `result.cancelled === false`.

    4. **Shortcuts (D-06)** — `it.each` table:
       - `a` → all rows show `[x]`; final `toDelete` set === all candidates
       - `n` after `a` → all rows show `[ ]`; final `toDelete` set === empty
       - `i` after toggling row 1 only → row 0, 2 show `[x]`, row 1 shows `[ ]`
       - PageDown jumps cursor by `Math.max(1, (terminalRows ?? 10) - 2)` rows; PageUp jumps back
       - PageDown past last row clamps to last row

    5. **Confirm (IPRUNE-03)** — Enter (`\r`) resolves the promise with `{ toDelete: <toggled set>, cancelled: false }`. Cursor visibility restored: captured stdout ends with `\x1b[?25h`. Raw mode disabled (`setRawMode(false)` called on the mock stdin).

    6. **Cancel via Esc — clean cancel (IPRUNE-04 / Esc path)** — Esc (`\x1b` solo — i.e., next-tick has no following bracket) resolves with `{ toDelete: new Set(), cancelled: true }`. Cursor restored. Raw mode disabled. The injected `exit` mock is NOT called (Esc is a clean cancel, not a SIGINT — the orchestrator in Plan 03 sets `process.exitCode = 130` itself based on `cancelled === true`).

    7. **Cancel via Ctrl+C — hard cancel (IPRUNE-04 + D-17)** — Ctrl+C (`0x03`) triggers the SIGINT cleanup path: captured stdout's last bytes include `\x1b[?25h`; injected `exit` mock IS called with `130`; raw mode disabled; the returned promise REJECTS with `InteractiveCancelledError` (NOT resolves) — this is how the orchestrator distinguishes Esc-clean from SIGINT-hard.

    8. **Esc disambiguation timer (D-20)** — driven with a small injected `escDelay` (e.g. 5-20ms):
       - **Bare Esc after timeout:** write `\x1b` alone; after `escDelay` elapses with no further bytes, the promise resolves `{ toDelete: <empty>, cancelled: true }` and `exit` is NOT called.
       - **Split arrow sequence:** write `\x1b` in one `stdin.write`, then `[B` in a SECOND `stdin.write` within `escDelay` → treated as Arrow-Down (cursor moves to row 1), NOT Esc. Assert `cancelled === false` after a terminating Enter.
       - **Single-chunk arrow:** write `\x1b[B` as one chunk → Arrow-Down (regression guard that the timer path doesn't break the common case).

    9. **Row truncation (D-19)** — with `stdout.columns = 20` and a candidate longer than 20 chars (e.g. `"deeply.nested.namespace.very.long.key"`), assert every emitted physical line's visible length (ANSI escapes stripped via `stripAnsi`) is ≤ 20 — i.e. no row wraps.

    10. **Resize re-render (D-19)** — start with `stdout.columns = 80`, render; then set `stdout.columns = 30` and `io.stdout.emit("resize")`. Assert a NEW frame is emitted after the resize event (capture length grows) AND the post-resize rows are truncated to ≤ 30 visible columns. Then terminate with Enter and assert `cancelled === false`.

    Plus the cursor-visibility-restore-on-every-exit-path mini-suite (last bullet of D-18 TUI unit tests):
    - After Enter: captured stdout ends with `\x1b[?25h`
    - After Esc:   captured stdout ends with `\x1b[?25h`
    - After Ctrl+C: captured stdout ends with `\x1b[?25h`
    - After thrown error mid-render (force a write error on the injected stdout): captured stdout still contains `\x1b[?25h` before the throw propagates

    **Property test** (D-18 last bullet):
    ```typescript
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("down", "up", "space"), { minLength: 0, maxLength: 30 }),
        fc.integer({ min: 1, max: 8 }),  // number of candidates
        async (keystrokes, n) => {
          const candidates = Array.from({ length: n }, (_, i) => `key.${i}`)
          // simulate by tracking cursor + toggle counts per index
          const result = await driveRenderer(candidates, keystrokes)
          const expected = computeExpected(keystrokes, n) // pure JS reference: same cursor/toggle rules
          expect(result.toDelete).toEqual(expected)
        }
      ),
      { numRuns: 100 }
    )
    ```
    The pure-JS reference (`computeExpected`) lives inside the test file. Property: `toDelete` === { candidate names whose row had an odd Space count }.
  </behavior>
  <action>
    Step 1 — create `src/__tests__/interactive.test.ts`. Use the existing `sort.test.ts` import style (`import { describe, it, expect } from "vitest"`, `import fc from "fast-check"`) for consistency. Build a small `mockStdio()` helper at the top of the file:

    ```typescript
    import { PassThrough } from "node:stream"

    function mockStdio() {
      const stdin = new PassThrough() as PassThrough & { isTTY: boolean; setRawMode: (b: boolean) => void; rawModeStates: boolean[] }
      const stdout = new PassThrough() as PassThrough & { isTTY: boolean; columns?: number; rows?: number }
      stdin.isTTY = true
      stdout.isTTY = true
      stdout.columns = 80
      stdout.rows = 24
      stdin.rawModeStates = []
      stdin.setRawMode = (b: boolean) => { stdin.rawModeStates.push(b); return stdin }
      const captured: string[] = []
      stdout.on("data", (c: Buffer) => captured.push(c.toString("utf8")))
      const exitCalls: number[] = []
      const exit = (code: number) => { exitCalls.push(code); /* do NOT actually exit in tests */ }
      // stdout.columns / stdout.rows are mutable; tests reassign them and call
      // stdout.emit("resize") to exercise the renderer's resize listener (D-19).
      return { stdin, stdout, captured, exitCalls, exit, getOutput: () => captured.join("") }
    }

    // Strips ANSI escape sequences so a row's VISIBLE column width can be asserted
    // (used by the truncation + resize tests — D-19).
    // eslint-disable-next-line no-control-regex
    const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z~]|\x1b\][^\x07]*\x07/g, "")
    ```

    Step 2 — write each test group from the `<behavior>` block above. Use `it.each(...)` for the shortcut table and arrow boundary tests. For the property test, mirror the `sort.test.ts` fast-check scaffold (lines 115-149) — `numRuns: 100` keeps total runtime sub-second.

    Each test that drives the renderer follows this pattern:
    ```typescript
    it("arrow-down moves cursor from row 0 to row 1", async () => {
      const io = mockStdio()
      const candidates = ["a", "b", "c"]
      const promise = runInteractivePrune(candidates, {
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit,
      })
      // give the renderer one microtask tick to render the initial frame
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\x1b[B")          // arrow-down
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\r")              // enter to terminate the test
      const result = await promise
      const output = io.getOutput()
      // last frame should have cursor on row 1 (the "b" row)
      const lastFrame = output.slice(output.lastIndexOf("\x1b[?25l"))
      expect(lastFrame).toMatch(/[>→]\s*\[ \]\s*b/)
      expect(result.cancelled).toBe(false)
    })
    ```

    Test 6 (Esc clean cancel) pattern — explicitly assert exit was NOT called:
    ```typescript
    it("Esc cancels cleanly with empty toDelete and cancelled=true (no exit call)", async () => {
      const io = mockStdio()
      const promise = runInteractivePrune(["a", "b"], { stdin: io.stdin, stdout: io.stdout, exit: io.exit, escDelay: 5 })
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\x1b")            // bare Esc
      const result = await promise       // resolves after the 5ms escDelay timer fires
      expect(result.cancelled).toBe(true)
      expect(result.toDelete.size).toBe(0)
      expect(io.exitCalls).toEqual([])  // Esc does NOT call exit — orchestrator handles 130
      expect(io.stdin.rawModeStates.at(-1)).toBe(false)
      expect(io.getOutput()).toMatch(/\x1b\[\?25h$/)
    })

    it("split arrow sequence (\\x1b then [B in two data events) is Arrow-Down, not Esc (D-20)", async () => {
      const io = mockStdio()
      const promise = runInteractivePrune(["a", "b", "c"], { stdin: io.stdin, stdout: io.stdout, exit: io.exit, escDelay: 20 })
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\x1b")            // ESC byte arrives alone...
      io.stdin.write("[B")             // ...continuation arrives within escDelay
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\r")              // Enter to terminate
      const result = await promise
      expect(result.cancelled).toBe(false)             // NOT treated as Esc-cancel
      const out = io.getOutput()
      const lastFrame = out.slice(out.lastIndexOf("\x1b[?25l"))
      expect(lastFrame).toMatch(/[>→]\s*\[ \]\s*b/)    // cursor moved to row 1
    })

    it("truncates rows wider than stdout.columns so no row wraps (D-19)", async () => {
      const io = mockStdio()
      io.stdout.columns = 20
      const long = "deeply.nested.namespace.very.long.key"
      const promise = runInteractivePrune([long], { stdin: io.stdin, stdout: io.stdout, exit: io.exit, escDelay: 5 })
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\r")
      await promise
      for (const line of io.getOutput().split("\n")) {
        expect(stripAnsi(line).length).toBeLessThanOrEqual(20)
      }
    })

    it("re-renders at the new width on a stdout resize event (D-19)", async () => {
      const io = mockStdio()
      io.stdout.columns = 80
      const promise = runInteractivePrune(["alpha.one", "beta.two"], { stdin: io.stdin, stdout: io.stdout, exit: io.exit, escDelay: 5 })
      await new Promise((r) => setImmediate(r))
      const before = io.getOutput().length
      io.stdout.columns = 30
      io.stdout.emit("resize")
      await new Promise((r) => setImmediate(r))
      expect(io.getOutput().length).toBeGreaterThan(before)   // a fresh frame was emitted
      io.stdin.write("\r")
      const result = await promise
      expect(result.cancelled).toBe(false)
      const after = io.getOutput()
      const lastFrame = after.slice(after.lastIndexOf("\x1b[?25l"))
      for (const line of lastFrame.split("\n")) {
        expect(stripAnsi(line).length).toBeLessThanOrEqual(30)
      }
    })
    ```

    Test 7 (Ctrl+C hard cancel) pattern — explicitly assert REJECTION with InteractiveCancelledError:
    ```typescript
    it("Ctrl+C triggers SIGINT cleanup, calls exit(130), promise rejects with InteractiveCancelledError", async () => {
      const io = mockStdio()
      const promise = runInteractivePrune(["a", "b"], { stdin: io.stdin, stdout: io.stdout, exit: io.exit })
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\x03")            // Ctrl+C
      await expect(promise).rejects.toBeInstanceOf(InteractiveCancelledError)
      expect(io.exitCalls).toEqual([130])
      expect(io.stdin.rawModeStates.at(-1)).toBe(false)
      expect(io.getOutput()).toMatch(/\x1b\[\?25h$/)
    })
    ```

    Step 3 — special test for NO_EMOJI cursor glyph. Use `vi.stubEnv("NO_EMOJI", "1")` in a dedicated `describe` block with `beforeEach` / `afterEach` to restore. Assert captured output contains `>` and NOT `→`.

    Step 4 — run `pnpm tsc --noEmit`. MUST exit 0 (the test file is valid TypeScript even though the imported module doesn't exist yet — TS compile is permissive about missing modules under `--noEmit`; if strict module resolution fails, that itself confirms RED).

    Step 5 — run `pnpm test --run interactive`. MUST exit non-zero — confirms RED. Failure mode should be "module not found" (the strict gate is GREEN in Task 2; RED is informational).

    Step 6 — commit as `test(03-02): add failing TUI renderer tests (RED)`.
  </action>
  <verify>
    <automated>pnpm test --run interactive; test $? -ne 0</automated>
  </verify>
  <acceptance_criteria>
    - `src/__tests__/interactive.test.ts` exists with ≥200 lines
    - `grep -n "runInteractivePrune" src/__tests__/interactive.test.ts` returns ≥10 hits (one per test driving the renderer)
    - `grep -n "fc.assert" src/__tests__/interactive.test.ts` returns ≥1 hit (property test present)
    - `grep -n "NO_EMOJI" src/__tests__/interactive.test.ts` returns ≥1 hit (D-07 ASCII glyph fallback test)
    - `grep -n "result.toDelete\\|tuiResult.toDelete\\|\\.toDelete" src/__tests__/interactive.test.ts` returns ≥5 hits (result field references — locked contract)
    - `grep -n "result.keep\\b\\|tuiResult.keep\\b" src/__tests__/interactive.test.ts` returns 0 hits (old field name must NOT appear)
    - `grep -n "InteractiveCancelledError" src/__tests__/interactive.test.ts` returns ≥1 hit (Ctrl+C rejection assertion)
    - `grep -n "exitCalls" src/__tests__/interactive.test.ts` returns ≥2 hits (Esc-no-exit + Ctrl+C-exit-130 assertions)
    - `grep -n "\\\\x1b\\[?25h" src/__tests__/interactive.test.ts` returns ≥3 hits (cursor-restore assertions on Enter / Esc / Ctrl+C exit paths)
    - `grep -n "\\\\x1b\\[B" src/__tests__/interactive.test.ts` returns ≥1 hit (arrow-down keystroke test)
    - `grep -n "\\\\x1b\\[5~\\|\\\\x1b\\[6~" src/__tests__/interactive.test.ts` returns ≥1 hit (PageUp/PageDown coverage)
    - `grep -n "escDelay" src/__tests__/interactive.test.ts` returns ≥3 hits (D-20 — bare-Esc-timeout + split-sequence + truncation/resize tests inject escDelay)
    - `grep -nE "emit\\(['\"]resize['\"]" src/__tests__/interactive.test.ts` returns ≥1 hit (D-19 — resize re-render test)
    - `grep -n "stripAnsi" src/__tests__/interactive.test.ts` returns ≥1 hit (D-19 — truncation width assertion helper)
    - `grep -n "toBeLessThanOrEqual" src/__tests__/interactive.test.ts` returns ≥1 hit (truncation/resize width-bound assertions)
    - `pnpm test --run interactive` exits NON-ZERO (RED phase — module does not yet exist)
  </acceptance_criteria>
  <done>
    Test file complete and failing for the expected reason (module not found). Property test scaffold present. NO_EMOJI variant present. Every D-18 TUI-unit-test bullet has a corresponding `it(...)` block. Esc and Ctrl+C tests are SPLIT (Esc clean = no exit call; Ctrl+C hard = exit(130) + promise rejection).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — implement runInteractivePrune to satisfy all RED tests</name>
  <files>src/commands/prune/interactive.ts</files>
  <read_first>
    - Run gitnexus_impact({target: "prune", direction: "downstream"}) — confirm there are NO existing modules at `src/commands/prune/interactive*`. If GitNexus MCP is down on Windows: `ls src/commands/prune/` should show only `plans.ts` (and possibly an index file).
    - Read src/commands/prune/plans.ts (full file — to confirm there's no name collision and to match the JSDoc + `log.*` / `pc.*` style)
    - Read src/utils.ts lines 50-78 (NO_EMOJI handling — copy the same `process.env.NO_EMOJI` test for the cursor glyph)
    - Read src/__tests__/interactive.test.ts (the Plan 02 / Task 1 file — these are the contract the implementation must satisfy)
    - 03-CONTEXT.md D-01..D-08, D-17 (the design constraints — re-read before implementing)
  </read_first>
  <behavior>
    Implementation must satisfy every test from Task 1. Specific contracts:

    - **Module exports:**
      ```typescript
      export interface InteractivePruneOptions {
        stdin?: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (b: boolean) => unknown }
        stdout?: NodeJS.WritableStream & { isTTY?: boolean; columns?: number; rows?: number }
        exit?: (code: number) => void
        /** Esc-vs-escape-sequence disambiguation delay in ms (default 50). Tests inject a small value (D-20). */
        escDelay?: number
      }
      export interface InteractivePruneResult {
        /** Candidate keys the user CHECKED — per D-05, checked = mark-for-delete. */
        toDelete: Set<string>
        /** True on Esc (clean). On Ctrl+C the promise rejects instead. */
        cancelled: boolean
      }
      export class InteractiveCancelledError extends Error {
        readonly code = 130
        constructor() { super("Interactive prune cancelled via SIGINT") }
      }
      export function runInteractivePrune(
        candidates: string[],
        options?: InteractivePruneOptions
      ): Promise<InteractivePruneResult>
      ```

    - **Render order (per frame):**
      1. On first frame only: emit `\x1b[?25l` (hide cursor). Read `width = (stdout.columns ?? 80)` and `height = (stdout.rows ?? 24)` FRESH at the start of every frame (never cache — they change on resize).
      2. For each row 0..N-1: build `<cursor-glyph> <checkbox-glyph> <label>`, then TRUNCATE the VISIBLE string to `Math.max(0, width - 2)` columns BEFORE emitting (so the row never wraps), then append `\x1b[K\n` (erase-to-end-of-line clears leftover chars from a previous frame). Truncation is the root-cause fix that keeps the `\x1b[<n>A` redraw math correct at any width (D-19). Measure truncation on the PLAIN text (color escapes don't occupy columns) — truncate first, then apply `pc.*` color.
      3. Emit a footer line: `pc.dim("Space toggle  Enter confirm  Esc cancel  a all  n none  i invert")\n` (also truncated to `width`).
      4. After the first frame, subsequent frames move the cursor up by `(N + 1)` rows (`\x1b[<n>A`) and re-render in place — NO `\x1b[2J` clear-screen (preserves scrollback per CONTEXT.md "External docs to consult"). Because every row is truncated to ≤ width, each frame is always exactly `N + 1` physical lines, so the up-count is always correct.

    - **Glyph constants** (top of file):
      ```typescript
      const NO_EMOJI = !!(process.env.NO_EMOJI && process.env.NO_EMOJI !== "0" && process.env.NO_EMOJI.toLowerCase() !== "false")
      const CURSOR_GLYPH = NO_EMOJI ? ">" : "→"
      const CHECKED = "[x]"
      const UNCHECKED = "[ ]"
      ```

    - **Keystroke parser** (hand-parsed byte buffer per CONTEXT.md Claude's Discretion bullet: "hand-parse the small set of sequences we actually need; `readline.emitKeypressEvents` adds the readline interface as a side effect"):
      - Collect chunks; for each chunk, peek the bytes:
        - `0x03` → Ctrl+C path (cleanup, exit(130), reject with `InteractiveCancelledError`)
        - `0x0d` or `0x0a` → Enter (cleanup, resolve with current `toDelete` set, cancelled=false)
        - `0x1b` followed by `[` → arrow / PageUp / PageDown sequence (parse third byte)
          - `[A` → cursor up (clamp ≥ 0)
          - `[B` → cursor down (clamp ≤ N-1)
          - `[5~` → PageUp (cursor -= pageSize, clamp ≥ 0)
          - `[6~` → PageDown (cursor += pageSize, clamp ≤ N-1)
          - `pageSize = Math.max(1, ((stdout.rows ?? 12) - 2))` — per D-06; read `stdout.rows` DYNAMICALLY at keypress time (not cached at start) so PageUp/PageDown respect the height after a resize (D-19)
        - `0x1b` → potential Esc OR the start of an arrow/PageX sequence. Disambiguate with an injectable **timer-based escape delay** (`escDelay`, default 50ms — NOT `setImmediate`, whose ordering vs stream `data` events is unspecified and unreliable on slow links/SSH where `\x1b` and `[A` split across two reads) (D-20):
          - On a lone `0x1b`, buffer it and start `setTimeout(commitAsEsc, escDelay)`.
          - If a continuation byte (`[` … final) arrives before the timer fires, `clearTimeout`, combine with the buffered `\x1b`, and parse as the arrow/PageX sequence.
          - If the timer fires first, commit as Esc: cleanup, resolve with empty `toDelete`, cancelled=true; do NOT call `exit`.
          - This is the standard TUI "escape delay" (readline/ink/blessed use the same). Document the rationale in a code comment. The `escDelay` is injectable via `InteractivePruneOptions.escDelay` so tests run deterministically with a tiny value.
        - **Resize handling (D-19):** register `stdout.on("resize", onResize)` on enter. `onResize` re-reads `width`/`height` and triggers an immediate in-place re-render at the new width (move cursor up `N+1`, clear via per-row `\x1b[K`, redraw truncated to the new width). Remove the listener in `cleanup()` on EVERY exit path.
        - `0x20` → Space (toggle current row's membership in the `toDelete` set)
        - `0x61` (`a`) → `toDelete = new Set(candidates)`
        - `0x6e` (`n`) → `toDelete = new Set()`
        - `0x69` (`i`) → invert: for each candidate, flip its membership in `toDelete`

    - **Cleanup helper** (called from every exit path — Enter, Esc, Ctrl+C, thrown error):
      ```typescript
      function cleanup(stdin, stdout, sigintHandler, resizeHandler, escTimer) {
        if (escTimer) { try { clearTimeout(escTimer) } catch { /* ignore */ } }
        try { stdout.write("\x1b[?25h") } catch { /* ignore */ }
        try { stdin.setRawMode?.(false) } catch { /* ignore */ }
        try { stdin.pause?.() } catch { /* ignore */ }
        stdin.removeAllListeners("data")
        if (resizeHandler) stdout.removeListener("resize", resizeHandler)
        if (sigintHandler) process.removeListener("SIGINT", sigintHandler)
      }
      ```

    - **SIGINT handler** (D-17): installed on entry, removed on exit. On fire:
      1. cleanup(...)
      2. injected `exit(130)` (the test mock asserts this was called)
      3. The pending `runInteractivePrune` promise is rejected with `new InteractiveCancelledError()`.

    - **Esc vs Ctrl+C contract — locked:**
      - Esc → committed only after the `escDelay` timer fires with no continuation byte. RESOLVE with `{ toDelete: new Set(), cancelled: true }`. Do NOT call `exit`. The orchestrator (Plan 03) sets `process.exitCode = 130` based on `cancelled === true`.
      - Ctrl+C → REJECT with `new InteractiveCancelledError()` immediately (no escDelay — `0x03` is unambiguous). DO call `exit(130)` (via the injected hook). The orchestrator catches the sentinel error and short-circuits (no further work).

    - **Selection state**: internal `Set<number>` of checked-row indices, converted to `Set<string>` (candidate names) only at resolve time and exposed as `result.toDelete`.

    - **Defensive `try/finally`**: the main async loop wraps the listener registration in `try`, calls `cleanup(...)` in `finally`. Even an unexpected throw inside the render loop emits the cursor-restore.
  </behavior>
  <action>
    Step 1 — create `src/commands/prune/interactive.ts` with the full implementation matching the `<behavior>` contract. File header JSDoc explains:
    - Purpose: hand-rolled raw-mode TUI picker for prune candidate selection.
    - Scope: per CONTEXT.md D-02 — key handling only; no search, no pagination, no group headers.
    - Result field naming: per D-05 (default all-unchecked, user actively checks what to delete), `result.toDelete` holds the user's CHECKED rows = the keys to prune. The orchestrator computes `kept = candidates − toDelete`.
    - Cancel semantics: Esc = clean resolve (`cancelled: true`, no exit). Ctrl+C = hard reject (`InteractiveCancelledError` + exit(130)). The orchestrator distinguishes these two paths.
    - Internal: not re-exported from `src/index.ts`; consumed only by `src/commands/prune.ts` (Plan 03).
    - Cleanup invariant: cursor visibility is restored on every exit path (`\x1b[?25h`) and raw mode is disabled (D-17). The orchestrator must NOT setRawMode(true) on its own — that's this module's contract.

    Use the constants block, glyph block, render function, key parser, and cleanup helper from `<behavior>`. Keep the file under ~250 LOC per CONTEXT.md D-01 estimate.

    Top-of-file imports:
    ```typescript
    import pc from "picocolors"
    ```
    No other deps. No `node:readline.emitKeypressEvents` — per CONTEXT.md Claude's Discretion: hand-parse.

    Step 2 — run `pnpm tsc --noEmit`. MUST exit 0.

    Step 3 — run `pnpm test --run interactive`. MUST exit 0 — every test from Task 1 passes.

    Step 4 — run the full suite: `pnpm test`. MUST exit 0 — no regression on existing tests.

    Step 5 — run `pnpm lint`. Expected: zero errors (the file uses `unknown` returns from setRawMode and try/empty-catch — make sure ESLint comments are not needed if `/* ignore */` body comments satisfy the rule).

    Step 6 — commit as `feat(03-02): implement hand-rolled raw-mode TUI for prune --interactive`.
  </action>
  <verify>
    <automated>pnpm test --run interactive && pnpm tsc --noEmit && pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `src/commands/prune/interactive.ts` exists with ≥150 lines
    - `grep -n "export function runInteractivePrune" src/commands/prune/interactive.ts` returns exactly 1 hit
    - `grep -n "export interface InteractivePruneResult" src/commands/prune/interactive.ts` returns exactly 1 hit
    - `grep -nE "toDelete:\\s*Set<string>" src/commands/prune/interactive.ts` returns ≥1 hit (result field shape — locked contract)
    - `grep -nE "\\bkeep\\b\\s*:\\s*Set<string>" src/commands/prune/interactive.ts` returns 0 hits (old field name must NOT appear)
    - `grep -n "export class InteractiveCancelledError" src/commands/prune/interactive.ts` returns exactly 1 hit
    - `grep -n "process.stdin.setRawMode\\|stdin.setRawMode" src/commands/prune/interactive.ts` returns ≥1 hit
    - `grep -n "\\\\x1b\\[?25l" src/commands/prune/interactive.ts` returns ≥1 hit (cursor hide)
    - `grep -n "\\\\x1b\\[?25h" src/commands/prune/interactive.ts` returns ≥1 hit (cursor show — D-17)
    - `grep -n "\\\\x1b\\[A\\|\\\\x1b\\[B" src/commands/prune/interactive.ts` returns ≥1 hit (arrow handlers)
    - `grep -n "\\\\x1b\\[5~\\|\\\\x1b\\[6~" src/commands/prune/interactive.ts` returns ≥1 hit (PageUp/PageDown handlers)
    - `grep -nE "on\\(['\"]resize['\"]" src/commands/prune/interactive.ts` returns ≥1 hit (D-19 resize listener registered)
    - `grep -nE "removeListener\\(['\"]resize['\"]" src/commands/prune/interactive.ts` returns ≥1 hit (D-19 resize listener removed in cleanup)
    - `grep -n "escDelay" src/commands/prune/interactive.ts` returns ≥1 hit (D-20 injectable escape delay)
    - `grep -n "setTimeout" src/commands/prune/interactive.ts` returns ≥1 hit (D-20 timer-based Esc disambiguation)
    - `grep -n "setImmediate" src/commands/prune/interactive.ts` returns 0 hits (D-20 — the fragile mechanism must NOT be used for Esc)
    - `grep -n "columns" src/commands/prune/interactive.ts` returns ≥1 hit (D-19 width read for truncation)
    - `grep -n "SIGINT" src/commands/prune/interactive.ts` returns ≥1 hit (D-17 handler)
    - `grep -nE "exit\\(130\\)" src/commands/prune/interactive.ts` returns ≥1 hit
    - `grep -n "NO_EMOJI" src/commands/prune/interactive.ts` returns ≥1 hit (D-07 ASCII fallback)
    - `grep -n "\\[x\\]\\|\\[ \\]" src/commands/prune/interactive.ts` returns ≥1 hit each (ASCII checkbox glyphs)
    - `grep -n "interactive" src/index.ts` returns 0 hits (D-03 — internal-only module)
    - `grep -nE "@clack|inquirer|prompts" package.json` returns 0 hits (D-01 — zero new deps)
    - `pnpm test --run interactive` exits 0
    - `pnpm tsc --noEmit` exits 0
    - `pnpm test` exits 0 with all prior tests still passing
  </acceptance_criteria>
  <done>
    Hand-rolled TUI renderer implemented with raw-mode + hand-parsed key sequences. All Task 1 RED tests are now GREEN. Property test passes for 100 iterations. NO_EMOJI variant works. Cursor visibility restored on every exit path. No new runtime deps added. File is internal — not exported from `src/index.ts`. Result contract: `{ toDelete: Set<string>; cancelled: boolean }` with Esc=clean-resolve and Ctrl+C=hard-reject semantics. Plan 03 can now `import { runInteractivePrune, InteractiveCancelledError } from "./prune/interactive"`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user terminal → process.stdin (raw mode) | raw-mode bytes feed the keystroke parser; no parsing of untrusted file content |
| process.stdin.isTTY → setRawMode() | toggling raw mode requires real TTY ownership; on a non-TTY stream this can throw — guarded with try/catch |
| `process.on("SIGINT", ...)` | a process-global handler is installed during the TUI session; MUST be removed on every exit path |
| candidates `string[]` → rendered to stdout | candidate strings come from `pruneFlat` / `pruneNamespaced` (locale keys); already validated upstream as object keys |

## STRIDE Threat Register

| Threat ID  | Category | Component | Disposition | Mitigation Plan |
|------------|----------|-----------|-------------|-----------------|
| T-03-02-01 | Tampering | raw-mode terminal state left dirty after crash | mitigate | Every exit path (Enter, Esc, Ctrl+C, thrown error) routes through `cleanup(...)` in a `finally` block. Cleanup emits `\x1b[?25h` (cursor restore) and calls `setRawMode(false)`. Test asserts captured stdout contains `\x1b[?25h` on EVERY exit path including a forced-throw error case. |
| T-03-02-02 | Denial of service | listener / timer leak across runs (SIGINT, stdout `resize`, escDelay timer) | mitigate | The SIGINT handler AND the stdout `resize` listener are added on enter and explicitly removed in `cleanup()` (`process.removeListener("SIGINT", h)`, `stdout.removeListener("resize", r)`); any pending escDelay `setTimeout` is `clearTimeout`'d in cleanup. Tests assert `process.listenerCount("SIGINT")` and `stdout.listenerCount("resize")` are unchanged before/after a runInteractivePrune call, and that no stray timer keeps the event loop alive. |
| T-03-02-03 | Denial of service | adversarial keystroke storm | accept | Keystroke parsing is O(1) per byte; render is O(N) per frame (N = candidate count). No regex backtracking, no recursion. Even an attacker spamming keys cannot exceed terminal stdin throughput. |
| T-03-02-04 | Spoofing | candidate strings containing ANSI escapes | mitigate | Candidate keys come from locale JSON/YAML file object keys (parsed by the existing `readLocaleFile` path); the YAML/JSON parser rejects most binary content. As a defense-in-depth, the renderer writes candidates surrounded by `\x1b[K` (erase-to-end-of-line) after each row — this contains any embedded ANSI within a single line and prevents bleed across rows. Documented as a known limitation: an attacker who can write ANSI bytes into a locale file key can already break the user's terminal via `cat`; the TUI is no worse. |
| T-03-02-05 | Repudiation | TUI selection not logged | accept | Plan 03 D-12 prepends `Interactive selection: kept M keys, removed N keys.` to the summary — that line IS the audit trail. The TUI itself does not need to log; Plan 03 owns the audit message. |
| T-03-02-06 | Information disclosure | candidate keys displayed in clear | accept | The user opted into a CLI that already prints locale keys in dry-run output. Showing them in a picker is the same disclosure surface. No new secrets crossed. |
| T-03-02-07 | Elevation of privilege | injected `exit` mock callable from caller | accept (internal API) | `InteractivePruneOptions.exit` is an internal test seam. Production callers (Plan 03) pass `process.exit`; tests pass a spy. The renderer module is not re-exported from `src/index.ts` (D-03), so library consumers cannot reach this hook. |

No HIGH/CRITICAL threats. The renderer's safety-critical invariant is the cursor-restore + raw-mode-off cleanup on every exit path (T-03-02-01); the test matrix gates it explicitly.
</threat_model>

<verification>
- `pnpm test --run interactive` — every test from the D-18 matrix passes; property test runs 100 iterations sub-second.
- `pnpm tsc --noEmit` — types compile; the new `InteractivePruneOptions` / `InteractivePruneResult` (with `toDelete` field) are well-formed.
- `pnpm test` — full suite passes; no regression in the 58+ existing tests.
- `grep` gates in `<acceptance_criteria>` — confirm every ANSI escape, every shortcut, every cleanup invariant is present in source; confirm `toDelete` is the result field name (NOT `keep`).
- `grep -nE "@clack|inquirer|prompts" package.json` returns 0 — zero new deps (D-01 sanity).
- `grep -n "interactive" src/index.ts` returns 0 — D-03 boundary: internal module not re-exported.
</verification>

<success_criteria>
- `runInteractivePrune` implemented as a self-contained module (~150-250 LOC) with raw-mode hand-rolled keystroke parsing.
- Result contract is `{ toDelete: Set<string>; cancelled: boolean }` (NOT `keep`) — aligned with D-05's "checked = mark-for-delete" semantics.
- Esc resolves with `{ toDelete: <empty>, cancelled: true }` and does NOT call `exit`; Ctrl+C rejects with `InteractiveCancelledError` and DOES call `exit(130)`. The two cancel paths are tested separately.
- Every D-XX in the Plan 02 scope (D-01..D-08, D-17, plus the D-18 TUI-unit-test and property-test bullets) has a passing test.
- Cursor visibility is restored on every exit path — verified by 4 separate test assertions (Enter, Esc, Ctrl+C, error).
- Raw mode is disabled on every exit path — verified by `setRawMode(false)` mock-call assertions.
- SIGINT handler is installed and removed cleanly — no leak across test runs.
- NO_EMOJI=1 produces ASCII cursor glyph (`>` instead of `→`).
- ASCII checkbox glyphs (`[x]` / `[ ]`) — no Unicode codepoints required.
- Every row is truncated to `(columns ?? 80) - 2` so it never wraps; terminal width is read fresh each frame (D-19).
- A stdout `resize` listener re-renders in place at the new width and is removed in cleanup() on every exit path — no listener leak (D-19, T-03-02-02).
- Esc is disambiguated from arrow/PageX sequences via an injectable `escDelay` timer (default 50ms, NOT setImmediate); split-across-two-reads sequences and bare-Esc-after-timeout are both tested (D-20).
- Zero new runtime deps added to `package.json`.
- Module is internal — NOT re-exported from `src/index.ts`.
- Two atomic commits: `test(03-02): add failing TUI renderer tests (RED)` and `feat(03-02): implement hand-rolled raw-mode TUI for prune --interactive`.
</success_criteria>

<output>
After completion, create `.planning/phases/03-interactive-pruning/03-02-SUMMARY.md` summarizing:
- Files created (src/commands/prune/interactive.ts ~LINES lines, src/__tests__/interactive.test.ts ~LINES lines)
- API surface: `runInteractivePrune(candidates, options) → Promise<InteractivePruneResult>`, `InteractivePruneOptions`, `InteractivePruneResult { toDelete: Set<string>; cancelled: boolean }`, `InteractiveCancelledError`
- **Result contract callout (Dimension 9):** the result field is `toDelete` (checked = mark-for-delete, per D-05). The orchestrator computes `kept = candidates − toDelete`.
- **Cancel contract callout:** Esc → resolve(`{ toDelete: empty, cancelled: true }`), no `exit` call. Ctrl+C → reject(`InteractiveCancelledError`) + `exit(130)`.
- Test count delta (expect +~15-20 unit tests + 1 property test)
- Verification output: `pnpm test --run interactive` summary + tsc clean
- D-18 matrix coverage table (every TUI-unit-test bullet ✓)
- Handoff note to Plan 03: in `src/commands/prune.ts`, on the interactive branch:
  1. Compute `candidates` from the existing pipeline (the flat list of unused keys that would be pruned, BEFORE filtering by user selection).
  2. If `candidates.length === 0`, defer to the existing pipeline which logs `✨ No unused keys to prune.` (D-16 short-circuit owned by Plan 03).
  3. If TTY: `const tuiResult = await runInteractivePrune(candidates, _interactiveIOOverride)`.
  4. If `tuiResult.cancelled === true` (Esc), `process.exitCode = 130` and return. Otherwise, compute `kept = candidates.filter(c => !tuiResult.toDelete.has(c))`, augment `usedKeys` with `kept`, then continue to the existing pipeline.
  5. The renderer rejects with `InteractiveCancelledError` on SIGINT; Plan 03 wraps the call in `try { ... } catch (e) { if (e instanceof InteractiveCancelledError) { process.exitCode = 130; return; } throw e }`.
</output>
</output>
