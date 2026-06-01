---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: — AST Parser Rewrite
status: planning
stopped_at: Phase 3 context gathered
last_updated: "2026-06-01T11:37:40.051Z"
last_activity: 2026-06-01 -- Phase 2 executed by Antigravity worker
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# STATE — i18n-sharpen

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-31)

**Core value:** Keep translation files sharp, tidy, and synchronized — without losing data.
**Current focus:** v0.4.0 — Phase 2: JS/TS Parser Core

## Current Position

Phase: 2 of 6 (JS/TS Parser Core + Golden Cases)
Plan: 02-03 complete (3/3 plans done)
Status: Phase 2 executed — ready for Phase 3 planning
Last activity: 2026-06-01 -- Phase 2 executed by Antigravity worker

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: ~8min
- Total execution time: ~30min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Error Model | 1/1 | ~15min | ~15min |
| 2. JS/TS Parser Core | 3/3 | ~10min | ~3min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- **Ratified:** JS/TS parser = TypeScript Compiler API (`ts.createSourceFile`, parser-only), resolved as optional peer dep — not Babel. ~0 bundle weight; native TS+JSX; avoids `@babel/traverse` ESM crash.
- **Ratified:** Shadow-mode-before-delete spine — AST behind flag first, corpus diff proves zero false-negatives, then flip default, then delete regex code in a separate phase.
- **Carry-forward:** `isHardcodedIgnored` must move to `text.ts` before `hardcoded.ts` is deleted (Phase 6 pre-condition).
- **Carry-forward:** `fileContents` must be preserved in `detectUsedKeys` return value to keep `looseKeyMatch` working (Phase 4 regression test required).
- **Carry-forward:** Uncommitted in-flight regex patches (`hardcoded.ts`, `<Foo.Bar>` handling) — decide before Phase 2: commit as last regex-era fix or discard (AST will supersede).

### Pending Todos

None yet.

### Blockers/Concerns

- **Phase 3 research flag:** compiler version pinning + exact Svelte 5 `fragment` / Astro WASM init API shapes — re-verify via Context7 at plan-phase (open decision #2).
- **Phase 5 research flag:** corpus selection — choose + pin specific OSS projects per framework at plan-phase (open decision #3).

## Session Continuity

Last session: 2026-06-01T11:37:40.048Z
Stopped at: Phase 3 context gathered
Resume file: .planning/phases/03-framework-parsers-dispatcher/03-CONTEXT.md
