# i18n-sharpen

## What This Is

A lightning-fast, framework-agnostic CLI and library to **validate**, **extract**, and **prune** i18n translation keys in JS/TS/Vue/Svelte/Astro codebases. Targets dev teams that want a tiny, dependency-light tool slotted into CI/CD that catches missing/stale translation keys before they ship.

## Core Value

**Keep translation files sharp, tidy, and synchronized — without losing data.** If everything else fails, `prune` must never silently destroy translation work, and `validate` must never miss a real key drift.

## Current Milestone: v0.3.0 — Developer Experience (Giai đoạn 1 of ROADMAP)

**Goal:** Sharpen the day-to-day developer loop around prune/extract/validate — ordering, interactivity, smarter warnings, and catching un-translated hardcoded text.

**Target features:**
- Auto-sorting keys (A-Z or order-of-appearance on extract/prune writes)
- Interactive Pruning CLI (arrow-key + space selection per key)
- Improved dynamic-key warnings (distinguish fully-dynamic vs structured concat keys)
- Hardcoded string detection (text nodes between HTML/JSX/Vue/Svelte/Astro tags not wrapped in `t()`)
- Namespaced extract/prune write-routing (finishes Phase 7 of 0.2.0)
- Remove `I18nCopConfig` deprecated alias (per 0.2.0 announcement)

**Phase numbering:** Reset to Phase 1 for this milestone (clean slate).

## Requirements

### Validated

<!-- Shipped in prior milestones. Locked. -->

- ✓ `validate` — missing keys, active placeholders, cross-locale alignment — v0.2.0
- ✓ `extract` — append missing keys to locale files, preserve formatting — v0.2.0
- ✓ `prune` — safe-by-default dry-run, `--force` to write, `PruneResult` API — v0.2.0
- ✓ Structured error type `I18nSharpenError` (discriminated union) — v0.2.0
- ✓ `--config <path>` CLI flag — v0.2.0
- ✓ Vue / Svelte / Astro file coverage — v0.2.0
- ✓ Namespaced locales foundation (read + validate end-to-end) — v0.2.0
- ✓ JS/TS/ESM locale **reading** (`.js`, `.cjs`, `.mjs`, `.ts`, `.tsx` via `jiti`) — v0.2.2
- ✓ Refuse to write JS/TS locale files (safety) — v0.2.3
- ✓ Scanner returns match-nothing regex on empty matchFunctions/matchAttributes — v0.2.4

### Active

<!-- Building toward these in v0.3.0. Filled in via REQUIREMENTS.md. -->

See `.planning/REQUIREMENTS.md`.

### Out of Scope (for now)

- **Auto-Translation Integration** (Google/DeepL/LLM) — Giai đoạn 3 of ROADMAP, separate milestone
- **VS Code Extension** — Giai đoạn 4 of ROADMAP, separate milestone
- **Locale TS/JS write support** — explicitly refused in v0.2.3 for safety; would require AST-level surgery; reading-only stays the contract
- **Runtime i18n features** — this tool stays build/CI-time only; no runtime overhead

## Context

- **Distribution:** Published to npm as `i18n-sharpen`, current version 0.2.4. Used as a `devDependency` and run via `npx`/CI.
- **Tech stack:** TypeScript ESM, Node 20+, bundled with `tsup`. Runtime deps: `commander`, `picocolors`, `yaml`, `zod`. Tests: `vitest` + `fast-check` (property-based on core modules).
- **Architecture:** `src/core/{scanner, locale-io, errors}` (pure primitives) + `src/commands/{validate, extract, prune}` (thin orchestrators using core) + `src/cli.ts` (sole catch site for `I18nSharpenError`).
- **Quality bar:** ESLint strict-type-checked, `no-explicit-any: error`, `consistent-type-imports: error`, `no-console: warn`. All commits gated on `pnpm tsc --noEmit && pnpm test && pnpm build`.
- **Indexed by GitNexus** as `i18n-sharpen` (514 symbols, 799 relationships) — see CLAUDE.md for impact-analysis workflow before edits.

## Constraints

- **Dependencies:** Keep the CLI dep tree tiny. No new heavy deps (e.g., no `typescript`/`babel` AST parsers in runtime deps). Prefer pure code or sub-1KB utilities. Optional peer deps (like `jiti`) only when strictly necessary.
- **Safety:** `prune` must remain safe-by-default (dry-run). Any feature that touches locale files on disk must use atomic writes (`.tmp` + rename, already in `locale-io`).
- **Framework-agnostic:** No assumption of React/Vue/Next/etc. — regex-based scanner stays the engine. New features must work across all supported file extensions.
- **Performance:** End-to-end run on a medium repo must stay sub-second; no regression past 100ms baseline overhead.
- **Compatibility:** Node ≥ 20 (already in CI). ESM-only output (already shipped). Don't break the 0.2.0 public API mid-milestone — additive only or behind explicit flags.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Regex-based scanner over AST | Framework-agnostic, dependency-free, fast | ✓ Good (v0.2.0) |
| `prune` dry-run by default | Translation data is precious; opt-in writes | ✓ Good (v0.2.0) |
| Refuse to write JS/TS locales | Cannot safely preserve imports/JSDoc/types | ✓ Good (v0.2.3) |
| Discriminated-union error type | Lets callers branch on `err.error.kind` without string matching | ✓ Good (v0.2.0) |
| Property-based testing on core modules | Catches regex/parsing crashes on weird real-world files | ✓ Good (v0.2.0) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-28 after starting milestone v0.3.0*
