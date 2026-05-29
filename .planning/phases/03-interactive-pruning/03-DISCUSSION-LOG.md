# Phase 3: Interactive Pruning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 03-interactive-pruning
**Areas discussed:** TUI implementation strategy, Selection UX details, Flag composition with --force / --dry-run / --clean-empty, Non-TTY behavior + edge cases

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| TUI implementation strategy | Hand-roll vs library; scope; module location; test approach | ✓ |
| Selection UX details | Default check-state, shortcuts, display, long-list handling | ✓ |
| Flag composition with --force / --dry-run / --clean-empty | Confirm UX, dry-run interaction, clean-empty composition, summary format | ✓ |
| Non-TTY behavior + edge cases | CI fallback, dangerous combo, empty list, SIGINT cleanup | ✓ |

**User's choice:** All four areas

---

## TUI Implementation Strategy

### How should the TUI be built?

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-roll with stdin raw-mode (Recommended) | ~150 LOC, zero new deps, honors PROJECT.md tiny-dep-tree constraint | ✓ |
| Pull in @clack/prompts (~30KB) | Polished multiselect, terminal compat handled, requires dep-policy exception | |
| Pull in 'prompts' (~6KB) | Smaller but maintenance-frozen, rougher ESM story | |

**User's choice:** Hand-roll with stdin raw-mode

### What's the scope of the hand-rolled (or library-driven) renderer?

| Option | Description | Selected |
|--------|-------------|----------|
| Basic: arrows + space + enter + esc (Recommended) | IPRUNE-02..04 minimum, no filter / no pagination / no grouping | ✓ |
| Extended: + pagination + filter (/) + select-all (a) | Long-list ergonomics, +100 LOC, more bug surface | |
| Advanced: + visual polish (color groups, status bar) | Color-coded ns, footer, spinner — over-engineered for v0.3.0 | |

**User's choice:** Basic
**Notes:** Shortcut bundle in Area 2 expands beyond strict basic (a/n/i/PgUp/PgDn) but no viewport pagination / filter / grouping.

### Where does the TUI module live in the codebase?

| Option | Description | Selected |
|--------|-------------|----------|
| src/commands/prune/interactive.ts (Recommended) | Co-located with sole consumer; matches plans.ts pattern | ✓ |
| src/core/tui/select.ts | Generic reusable primitive — premature abstraction risk | |

**User's choice:** src/commands/prune/interactive.ts

### How do we test the TUI?

| Option | Description | Selected |
|--------|-------------|----------|
| Unit tests with mocked stdin + capture stdout (Recommended) | Inject fake Readable/Writable, drive keystrokes, assert output | ✓ |
| Skip TUI tests; cover via prune.test.ts logic only | Faster but leaves rendering bugs uncaught | |
| Unit tests + manual smoke test checklist in CHANGELOG | Both — heaviest investment | |

**User's choice:** Unit tests with mocked stdin + capture stdout

---

## Selection UX Details

### What's the default check-state when the TUI opens?

| Option | Description | Selected |
|--------|-------------|----------|
| All unchecked = keep-by-default (Recommended) | Aligns with dry-run/safety philosophy; pairs with `a` shortcut | ✓ |
| All checked = delete-by-default | Matches old prune --force behavior; one accidental Enter wipes all | |

**User's choice:** All unchecked = keep-by-default

### Which keyboard shortcuts ship in v0.3.0?

| Option | Description | Selected |
|--------|-------------|----------|
| Arrow keys + Space + Enter + Esc (Required) | IPRUNE-02..04 minimum, non-negotiable | ✓ |
| 'a' to select all / 'n' to select none (Recommended) | Restores old bulk-prune in one tap; ~10 LOC | ✓ |
| 'i' to invert selection | Power-user shortcut, ~5 LOC | ✓ |
| PageUp / PageDown for fast scroll | Jump N rows within visible window | ✓ |

**User's choice:** ALL FOUR — Arrows+Space+Enter+Esc, a/n, i, PageUp/PageDown
**Notes:** Slight scope bump from "Basic" in Area 1 but no viewport pagination / filter / ns grouping ships.

### How are keys displayed in the list?

| Option | Description | Selected |
|--------|-------------|----------|
| One row per key, ns prefix shown inline (Recommended) | Flat: `[ ] auth.login.title`; namespaced: `[ ] auth:login.title` | ✓ |
| Grouped by namespace with collapsible headers | ▼ auth (4) / [ ]   login.title; rendering complexity | |
| Show locale value preview alongside key | `[ ] auth.login.title — "Sign in"`; truncation issues | |

**User's choice:** One row per key, ns prefix shown inline

### How does the TUI handle long lists (>50 unused keys)?

| Option | Description | Selected |
|--------|-------------|----------|
| Render all rows, let the terminal scroll naturally (Recommended) | Simplest; terminal scrollback shows history | ✓ |
| Viewport-windowed: render N rows at a time | Better UX for huge lists but viewport math required | |

**User's choice:** Render all rows, let terminal scroll naturally

---

## Flag Composition

### When user runs `prune --interactive` WITHOUT `--force`, what happens after they hit Enter to confirm?

| Option | Description | Selected |
|--------|-------------|----------|
| Show dry-run preview of selected keys, exit 0 (Recommended) | Preserves --force as sole write gate; user re-runs with --force to apply | ✓ |
| Show preview + prompt 'Apply now? (y/N)' | Removes friction but adds confirm-fatigue, breaks --force pattern | |
| `--interactive` implies `--force` (user 'meant it') | Zero friction; one accidental Enter writes immediately | |

**User's choice:** Show dry-run preview, exit 0

### Does `--interactive --dry-run` do anything special, or is it equivalent to `--interactive` alone?

| Option | Description | Selected |
|--------|-------------|----------|
| Equivalent to `--interactive` alone (Recommended) | --dry-run is silently redundant in this combo, no error | ✓ |
| `--interactive --dry-run` refuses to launch TUI (errors out) | Treats combo as 'why would you?'; might confuse CI users | |
| `--interactive --dry-run` launches TUI but shows 'preview only' banner | Same outcome, clearer signposting | |

**User's choice:** Equivalent to --interactive alone

### Does `--interactive` compose with `--clean-empty` (Phase 1 D-09)?

| Option | Description | Selected |
|--------|-------------|----------|
| Flag still works the same way (Recommended) | cleanEmptyNamespaceFiles() runs post-confirm if --clean-empty passed | ✓ |
| TUI shows empty-namespace files as a separate confirm step | New y/N step; couples Phase 3 to Phase 1 D-09 | |
| Add a second TUI screen for empty-ns selection (even without --clean-empty) | Most interactive; effectively re-implements --clean-empty in TUI | |

**User's choice:** Flag still works the same way

### What does the CLI summary look like after a successful interactive write?

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror existing prune summary (Recommended) | Reuse current summary line + one preamble: "Interactive selection: kept M, removed N" | ✓ |
| Add an 'interactive session' block (kept-list + removed-list) | Full audit dump; noisy on large selections | |

**User's choice:** Mirror existing prune summary

---

## Non-TTY Behavior + Edge Cases

### In a non-TTY environment (CI, piped stdin), `prune --interactive` does what?

| Option | Description | Selected |
|--------|-------------|----------|
| Warn + fall back to dry-run + exit 0 (Recommended) | Verbatim IPRUNE-06 fallback | ✓ |
| Warn + fall back to dry-run + exit 1 | Signal 'intended action did not happen'; penalizes common case | |
| Hard error + exit 1 (no fallback) | Strictest; conflicts with IPRUNE-06 mandate | |

**User's choice:** Warn + fall back to dry-run + exit 0

### What about the DANGEROUS combo: `prune --interactive --force` in a non-TTY?

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse to write — fall back to dry-run + warn (Recommended) | --force ignored to avoid unintended bulk prune; exit 0 | ✓ |
| Honor --force, prune everything as if --interactive wasn't passed | Highest blast radius if CI script hits this path | |
| Hard error + exit 1 | Breaks 'always degrade gracefully' principle | |

**User's choice:** Refuse to write — fall back to dry-run + warn

### What happens when there are NO unused keys to prune (empty candidate list)?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip TUI entirely, print existing 'no unused keys' message (Recommended) | Same code path as current; no wasted attention | ✓ |
| Open an empty TUI with '(no candidates)' message | Consistent UX (TUI always opens) but pointless | |

**User's choice:** Skip TUI entirely

### How do we handle Ctrl+C (SIGINT) and ensure no .tmp files leak?

| Option | Description | Selected |
|--------|-------------|----------|
| Catch SIGINT in TUI, restore terminal, exit 130 — writes haven't started yet (Recommended) | TUI-scoped handler; writeLocaleFilesAtomic handles its own .tmp cleanup post-TUI | ✓ |
| Catch SIGINT globally + cleanup any stray .tmp files in localesDir | Belt-and-braces; risks deleting .tmp from concurrent prune runs | |

**User's choice:** Catch SIGINT in TUI, restore terminal, exit 130

---

## Claude's Discretion

Captured in CONTEXT.md under "Claude's Discretion" section:
- ANSI escape sequence abstraction (inline constants recommended)
- Terminal width detection (`process.stdout.columns ?? 80`)
- Keypress reader internal model (hand-parsed byte buffer recommended over `readline.emitKeypressEvents`)
- Exact text of warning / preview / summary lines
- Whether to add `interactive?: boolean` to `PruneOptions` (YES recommended)
- `package.json#engines.node` bump (NO recommended)
- `--no-interactive` flag (NO recommended)

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section. Highlights:
- Pagination + filter (`/`) + viewport windowing — defer to v0.4+
- Visual polish (color groups, status bar, spinner) — defer to v0.4+
- Reusable TUI primitive at `src/core/tui/` — extract when 2nd consumer appears
- Confirmation prompt (`y/N`) after TUI Enter — adds confirm-fatigue
- `--interactive` implies `--force` — erodes safety contract
- Auto-empty-ns cleanup inside TUI without `--clean-empty` — re-implements Phase 1 D-09
- `--no-interactive` flag, `prune.interactive` config field — CI footguns / extra surface without value
- Interactive `extract` / `validate` — separate future phases
- Per-key value editing in TUI — out of scope
- Saved/persistent selections across runs — heavy for marginal value
