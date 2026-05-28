# STATE — i18n-sharpen

## Current Position

Phase: 1 — Namespace Write-Routing
Plan: —
Status: Ready to plan Phase 1
Phase numbering: Reset to 1 for v0.3.0
Last activity: 2026-05-28 — Roadmap created for v0.3.0

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-28)

**Core value:** Keep translation files sharp, tidy, and synchronized — without losing data.
**Current focus:** v0.3.0 Developer Experience — starting Phase 1 (Namespace Write-Routing)

## Roadmap Summary

| # | Phase | Status |
|---|-------|--------|
| 1 | Namespace Write-Routing | Next |
| 2 | Auto-Sorting Keys | Not started |
| 3 | Dynamic Key Warnings | Not started |
| 4 | Interactive Pruning | Not started |
| 5 | Hardcoded String Detection | Not started |
| 6 | Deprecation Cleanup | Not started |

## Accumulated Context

- v0.2.0 shipped a major architectural cleanup (core/ split, structured errors, safe prune, namespaced foundation, Vue/Svelte/Astro coverage). See `MILESTONES.md`.
- v0.2.x patch releases (0.2.1 → 0.2.4) added supply-chain metadata, JS/TS locale reading + write-refusal, and scanner regex hardening.
- 58 tests passing across 5 files; ESLint strict-type-checked; tsc clean.
- Two known gaps from 0.2.0 carried forward: namespaced extract/prune write-routing (Phase 1 here) and removing the `I18nCopConfig` deprecated alias (Phase 6 here).
- Phase numbering reset to 1 for this milestone — prior milestone ended at Phase 10.
- NSWRITE goes first to unblock SORT (both touch locale write paths and must compose correctly).
- CLEANUP goes last — it is the only breaking change in this milestone.
