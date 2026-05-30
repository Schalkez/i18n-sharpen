---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: AST Parser Rewrite
status: planning
last_updated: "2026-05-31T00:00:00.000Z"
last_activity: 2026-05-31 -- v0.3.0 archived to milestones/; starting v0.4.0 (AST Parser Rewrite) planning
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# STATE — i18n-sharpen

## Current Position

Milestone: v0.4.0 — AST Parser Rewrite
Phase: none yet (planning)
Status: v0.3.0 archived; defining v0.4.0 requirements + roadmap
Last activity: 2026-05-31 -- Completed/archived v0.3.0 milestone. Next: `/gsd-new-milestone` to define v0.4.0 from AST_PARSER_PLAN.md.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-30)

**Core value:** Keep translation files sharp, tidy, and synchronized — without losing data.
**Current focus:** v0.4.0 — replace regex/state-machine scanner with real per-framework AST parsers for ~100% extraction accuracy.

## Roadmap Summary

| Milestone | Status |
|-----------|--------|
| v0.3.0 — Developer Experience (Phases 1-5) | ✅ Shipped 2026-05-30 (archived) |
| v0.4.0 — AST Parser Rewrite | 🚧 Planning |

## Accumulated Context

- **v0.3.0 shipped & archived** — sorting, namespace hardening, dynamic-key warnings, interactive prune TUI, hardcoded-string detection, `I18nCopConfig` removed. Full archive in `milestones/v0.3.0-*`.
- **v0.4.0 seed plan:** `AST_PARSER_PLAN.md` (repo root). Author's intent: AST parsers per framework, strict fail-fast, delete the old regex scanner.
- **Open review notes on the seed plan (raised before planning, to resolve during discuss/plan):**
  1. "Strict fail-fast / throw on any syntax error" is wrong for a *scanner* — separate "compiler missing" (throw once, actionable) from "one file has a syntax error" (collect-and-continue; don't abort the whole CI run). The plan also self-contradicts with `errorRecovery: true`.
  2. Don't *delete* `dynamic.test.ts` / `hardcoded.test.ts` / `scanner.test.ts` — *port* their input→output behavioral cases onto the new parser; only drop regex-internal tests.
  3. Don't big-bang rewrite + delete in one shot — run AST behind a flag in shadow mode, diff against regex on a real corpus, flip default, then delete in a separate PR.
  4. Offset rebasing: Babel offsets for embedded `<script>` blocks (Vue/Svelte/Astro) are block-relative — must add the block's start offset or report line numbers will be wrong.
  5. Reconsider deps: `@babel/traverse` has painful ESM interop (`.default` unwrap) and may be unnecessary (hand-walk or `@babel/types`); consider the TypeScript compiler API as an optional peer dep (most TS projects already have `typescript`) for zero added weight on the common path.
  6. Turn the sync→async migration into a perf win (bounded-concurrency parse pool, optional mtime cache); add a perf-regression gate to the verification plan.
  7. Pin compiler major versions — Svelte 5 AST shape changed (`ast.html` → `fragment`, `{ modern: true }`); `@astrojs/compiler` is WASM with async init.
- **Async blast radius (GitNexus):** making `detectUsedKeys` async is HIGH risk — breaks `validate`/`extract`/`prune` at step 1 + `cli.ts` + public API `index.ts` + their tests. `validate` itself only has `cli.ts` as a direct caller. Cascade is bounded (~6-8 files).
- **Uncommitted at archive time:** `src/core/scanner/hardcoded.ts` + `hardcoded.test.ts` have in-flight regex patches (`<Foo.Bar>` tag handling). Decide whether to commit as the last regex-era fix or discard before the AST rewrite deletes that file.
- **Constraint under revision for v0.4.0:** PROJECT.md "no heavy AST deps" + "regex-based scanner stays the engine" — the v0.4.0 milestone explicitly revisits both.
