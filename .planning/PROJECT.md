# i18n-sharpen

## What This Is

A **static analysis engine for localization** — not a JSON checker. Parses real ASTs across TS/JS/Vue/Svelte/Astro to build a usage graph (key → files → locales), then uses that graph to enforce translation correctness in CI/CD.

The core asset is the AST usage graph. Everything — missing keys, unused keys, dynamic key detection, hardcoded string detection, and future features like impact analysis and key refactoring — derives from it.

> **Positioning note (2026-06-03):** After v0.4.0 shipped AST parsing + dynamic key detection, the correct description is no longer "i18n utility" but *"static analysis engine specialised for the localization domain."* Cross-framework AST analysis (TS/JS/Vue/Svelte/Astro in one engine) is what differentiates this from the ~70% of tools that do locale file comparison only. — Validated by external review.

## Core Value

**The AST graph is the moat.** Grep-based tools miss `t(\`auth.${action}\`)`. AST-based tools don't. That difference is what makes the tool worth using on large codebases (1000+ keys, 10+ locales, 50+ contributors) where locale drift, dead translations, and hardcoded strings become real costs — not theoretical ones.

Safety invariant: `prune` must never silently destroy translation work; `validate` must never miss a real key drift.

## Current State

**Shipped:** v0.3.0 — Developer Experience (2026-05-30). 5 phases, 13 plans, tag `v0.3.0`. See `MILESTONES.md` + `milestones/v0.3.0-ROADMAP.md`.

## Current Milestone: v0.4.0 — AST Parser Rewrite

**Goal:** Replace the regex / hand-rolled state-machine scanner with real per-framework AST parsers so key extraction, dynamic-key classification, and hardcoded-string detection reach near-100% accuracy — without regressing the tool's safety, CI-friendliness, or framework coverage.

**Target features:**
- Babel-based AST parser for `.ts/.tsx/.js/.jsx` — used keys + dynamic calls + hardcoded candidates in one traversal, with correct offsets.
- Dynamically-loaded framework compilers for `.vue` / `.svelte` (Svelte 5 AST) / `.astro` (WASM async init), resolved from the user's workspace.
- Central extension dispatcher producing a unified `ParsedFileResult`.
- Resilient error model (collect-and-continue on file syntax errors; fatal on missing compiler) + a shadow-mode differential-testing harness to prove accuracy before flipping the default.
- Async public API migration (`validate`/`extract`/`prune` → `Promise`) with bounded-concurrency parsing.

> **Note:** v0.4.0 deliberately revisits two long-standing constraints below — the "regex-only scanner" engine choice and the "no heavy AST deps" rule. Those decisions were correct for v0.2–v0.3 but the accumulating edge-case patches (e.g. `<Foo.Bar>` tags, `forwardRef<A,B>` generics misread as JSX) now justify the trade-off. Dependency strategy is **decided**: the JS/TS/JSX parser is the **TypeScript Compiler API** (parser-only) resolved as an optional peer dependency — chosen over Babel (revising the seed) for ~0 added bundle, native TS+JSX, and to dodge the `@babel/traverse` ESM trap. Implementation detail seed: `.planning/v0.4.0-SEED-PLAN.md` (note: its Babel-mandatory choice is superseded).

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
- ✓ Namespaced `extract` / `prune` write-routing (per-namespace file routing, no cross-namespace bleed) — v0.2.x post-release (commit `54712ab`, covers NSWRITE-01 + NSWRITE-02)
- ✓ JS/TS/ESM locale **reading** (`.js`, `.cjs`, `.mjs`, `.ts`, `.tsx` via `jiti`) — v0.2.2
- ✓ Refuse to write JS/TS locale files (safety) — v0.2.3
- ✓ Scanner returns match-nothing regex on empty matchFunctions/matchAttributes — v0.2.4
- ✓ Auto-sorting keys (`sortKeys` config + `--sort` flag, alpha/source/preserve) — v0.3.0
- ✓ Namespace hardening: `defaultNamespace`, `--clean-empty`, cross-file atomic prune — v0.3.0
- ✓ Dynamic-key warnings: fully-dynamic vs structured-concat, `ignoreDynamicKeys`, report counts — v0.3.0
- ✓ Interactive pruning TUI (`prune --interactive`, non-TTY fallback) — v0.3.0
- ✓ Hardcoded string detection (`validate --check-hardcoded`) — v0.3.0
- ✓ `I18nCopConfig` deprecated alias removed (breaking) — v0.3.0

### Active

<!-- v0.4.0 (AST Parser Rewrite). Full REQ-IDs in REQUIREMENTS.md; phase mapping in ROADMAP.md. -->

- [ ] Babel AST parser core + extension dispatcher → unified `ParsedFileResult` (used keys, dynamic calls, hardcoded candidates, offsets)
- [ ] Dynamically-loaded Vue / Svelte 5 / Astro framework compilers (missing compiler → actionable install error)
- [ ] Resilient error model — collect-and-continue on file syntax errors, fatal missing-compiler, distinct exit codes
- [x] Shadow-mode differential accuracy harness (regex vs AST corpus diff) — gates the default flip
- [ ] Offset / line correctness across embedded script blocks
- [x] Async migration of `validate`/`extract`/`prune` + public API, bounded-concurrency parse pool
- [x] Performance budget vs v0.3.0 baseline (perf-regression gate)
- [ ] Port behavioral tests (incl. `<m.div>` dot-notation + `forwardRef<A,B>` generics golden cases)
- [ ] Cleanup: delete regex scanner after AST is default & verified; BREAKING CHANGELOG entry

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

- **Dependencies:** Keep the CLI dep tree tiny. **Revised + decided for v0.4.0:** JS/TS/JSX parsing uses the **TypeScript Compiler API** (`ts.createSourceFile`, parser-only) resolved as an **optional peer dependency** — ~0 added bundle weight (`typescript` already present in target projects), no bundled `@babel/*` runtime dep, and avoids the `@babel/traverse` ESM `.default` interop crash. Framework compilers (Vue/Svelte/Astro) stay **dynamically loaded** from the user's workspace, never bundled. No other heavy deps; optional peer deps (like `jiti`) only when strictly necessary.
- **Safety:** `prune` must remain safe-by-default (dry-run). Any feature that touches locale files on disk must use atomic writes (`.tmp` + rename, already in `locale-io`).
- **Framework-agnostic:** No assumption of React/Vue/Next/etc. **Revised for v0.4.0:** per-framework AST parsers replace the regex scanner as the engine; config-driven `matchFunctions`/`matchAttributes` stay the detection mechanism (no hardcoded i18n-function names). New features must work across all supported file extensions.
- **Performance:** End-to-end run on a medium repo must stay sub-second; no regression past 100ms baseline overhead.
- **Compatibility:** Node ≥ 20 (already in CI). ESM-only output (already shipped). Don't break the 0.2.0 public API mid-milestone — additive only or behind explicit flags.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Regex-based scanner over AST | Framework-agnostic, dependency-free, fast | ⚠️ Revisit — correct for v0.2–v0.3; v0.4.0 moves to AST parsers for accuracy as edge-case patches accumulate |
| `prune` dry-run by default | Translation data is precious; opt-in writes | ✓ Good (v0.2.0) |
| Refuse to write JS/TS locales | Cannot safely preserve imports/JSDoc/types | ✓ Good (v0.2.3) |
| Discriminated-union error type | Lets callers branch on `err.error.kind` without string matching | ✓ Good (v0.2.0) |
| Property-based testing on core modules | Catches regex/parsing crashes on weird real-world files | ✓ Good (v0.2.0) |
| AST parser per framework (v0.4.0) | Regex can't parse context-free grammars; hardcoded-string detection needs the document tree | ✓ Good (Phases 1-3) |
| Sync → async public API (v0.4.0) | Dynamic compiler `import()` forces `await`; project < 1.0 ⇒ minor bump → 0.4.0 | ✓ Good (Phase 4) |
| Collect-and-continue on file syntax errors (v0.4.0) | A CI scanner must not crash on one bad file; missing *compiler* stays fatal | ✓ Good (Phase 1) |
| Shadow-mode before deleting regex (v0.4.0) | Prove AST parity on a real corpus before flipping default; delete old code in a later phase | ✓ Good (Phase 5) |
| JS/TS parser = TypeScript Compiler API, not Babel (v0.4.0) | `typescript` already present ⇒ ~0 bundle; native TS+JSX; always-on error recovery; avoids `@babel/traverse` ESM crash; read-only scan needs no traverse path API. Supersedes the seed's Babel choice. | ✓ Good (Phase 2) |

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

## Strategic Notes

*Captured 2026-06-03 after v0.4.0 shipped. Use at milestone planning time.*

### Positioning

Don't market this as an "i18n utility" or "translation checker." The correct frame is:

> **Static analysis engine specialised for localization, with the AST usage graph as the core asset.**

This positioning unlocks the enterprise angle: teams with 1000+ keys and 50+ contributors don't need another JSON linter — they need a tool that understands their codebase the way a compiler does.

### Roadmap direction

Recommended milestone order — each builds on the AST graph rather than adding more locale-file rules:

| Milestone | Feature | Why |
|-----------|---------|-----|
| v0.5 | **Impact Analysis** | 20% effort / 80% value. Reverse the existing key→files index. Enterprise ask #1 on key rename. |
| v0.6 | **Key Refactor (AST write-back)** | Killer feature — no other i18n tool does this. Read path done; missing piece is write-back. |
| v0.7 | **Translation Ownership** | Low effort, high monorepo value. Config-driven namespace→team mapping. |
| v0.8 | **Coverage Dashboard** | Formatting layer on top of existing validate output. PM/stakeholder appeal. |

**Defer indefinitely:** AI translation review, screenshot-based UI overflow detection — these pull the product into a different scope and would dilute the static analysis identity.

### What to avoid

Adding more locale-file comparison rules (more flavors of "key missing in locale X"). The grep-based competition already does that. New features should use the AST graph or they don't belong here.

---
*Last updated: 2026-06-03 after v0.4.0 shipped and strategic positioning reviewed*
