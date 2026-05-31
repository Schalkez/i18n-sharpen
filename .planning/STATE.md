---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: — AST Parser Rewrite
status: executing
stopped_at: Phase 1 complete
last_updated: "2026-05-31T12:19:00.000Z"
last_activity: 2026-05-31 -- Phase 1 executed (Antigravity worker)
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
  percent: 17
---

# STATE — i18n-sharpen

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-31)

**Core value:** Keep translation files sharp, tidy, and synchronized — without losing data.
**Current focus:** v0.4.0 — Phase 1: Foundation & Error Model

## Current Position

Phase: 1 of 6 (Foundation & Error Model)
Plan: 01-01 complete
Status: Phase 1 executed — ready for Phase 2 planning
Last activity: 2026-05-31 -- Phase 1 executed by Antigravity worker

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Error Model | 1/1 | ~15min | ~15min |

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

Last session: 2026-05-31T12:19:00.000Z
Stopped at: Phase 1 complete
Resume file: .planning/phases/01-foundation-error-model/01-01-SUMMARY.md
