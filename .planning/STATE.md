# STATE — i18n-sharpen

## Current Position

Phase: 1 — Auto-Sorting Keys + Namespace Hardening (in discussion)
Plan: —
Status: Discussing Phase 1 — identifying gray areas
Phase numbering: Reset to 1 for v0.3.0
Last activity: 2026-05-28 — Phase 1 scout found NSWRITE-01/02 already shipped; merged Phase 1 (NSWRITE) into Phase 2 (SORT). 5 phases total now.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-28)

**Core value:** Keep translation files sharp, tidy, and synchronized — without losing data.
**Current focus:** v0.3.0 Developer Experience — discussing Phase 1 (SORT + NSWRITE hardening)

## Roadmap Summary

| # | Phase | Status |
|---|-------|--------|
| 1 | Auto-Sorting Keys + Namespace Hardening | In discussion |
| 2 | Dynamic Key Warnings | Not started |
| 3 | Interactive Pruning | Not started |
| 4 | Hardcoded String Detection | Not started |
| 5 | Deprecation Cleanup | Not started |

## Accumulated Context

- v0.2.0 shipped a major architectural cleanup (core/ split, structured errors, safe prune, namespaced foundation, Vue/Svelte/Astro coverage). See `MILESTONES.md`.
- v0.2.x patch releases (0.2.1 → 0.2.4) added supply-chain metadata, JS/TS locale reading + write-refusal, and scanner regex hardening.
- **Post-v0.2.0 commit `54712ab` closed the namespaced extract/prune write-routing gap** (NSWRITE-01/02 of v0.3.0). Verified via `src/__tests__/extract.test.ts:61` + `src/__tests__/prune.test.ts:232`. The PHASE-EXECUTION-REPORT.md was written before this commit, so it incorrectly lists namespace routing as a Known Gap.
- 58 tests passing across 5 files; ESLint strict-type-checked; tsc clean.
- One known gap from 0.2.0 still standing: removing the `I18nCopConfig` deprecated alias (Phase 5 here).
- Phase numbering reset to 1 for this milestone — prior milestone ended at Phase 10.
- Phase 1 originally split NSWRITE/SORT; merged after scout discovered NSWRITE was largely done. Remaining NSWRITE-03/04/05 fold naturally into the SORT phase because both touch the locale write path.
