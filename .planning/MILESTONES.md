# Milestones — i18n-sharpen

Shipped milestones and what they delivered. Active milestone lives in `PROJECT.md` and `ROADMAP.md`.

## v0.2.0 — 2026-05-28 (Architecture, safety, framework coverage)

Final HEAD: `d3e6071`. Tests: 15 → 58 passing across 5 files. Build: ESM + DTS clean.

| Phase | Scope | Status |
|-------|-------|--------|
| 5 | `--config <path>` CLI flag wiring | DONE |
| 6 | `prune` safe-by-default dry-run | DONE |
| 2 | Architecture refactor (core/ split, structured errors, rename) | DONE |
| 9 | Quality hardening (lint, validate split, JSDoc, +43 tests) | DONE |
| 7 | Namespaced locales foundation (read + validate) | PARTIAL — extract/prune write-routing deferred to 0.3.x |
| 8 | Vue / Svelte / Astro coverage | DONE |
| 10 | Docs + release prep (CHANGELOG, README, version bump) | DONE |

**Breaking changes:** `I18nCopConfig` deprecated, `prune()` dry-run by default + new `PruneResult` return type, `looseKeyMatch` opt-in, `keysOnlyInLanguages` shape changed, errors are `I18nSharpenError` instances.

**Known gaps carried to v0.3.x:**
1. Namespaced extract/prune write-routing — schema/scanner/loader recognise `t("ns:key.path")` and read per-namespace files, but `extract`/`prune` still operate on flat files.
2. `no-console` warnings at 30 sites in `validate.ts`/`prune.ts`/`extract.ts`/`config.ts`/`utils.ts` — intentional CLI prints, to be migrated to `log.*` helpers.
3. `I18nCopConfig` deprecated alias — scheduled for removal in 0.3.0.

See `PHASE-EXECUTION-REPORT.md` at repo root for the full execution report.

## v0.2.1 — 2026-05-28 (Supply chain metadata)

- Added `repository`, `bugs`, `homepage`, `author` to `package.json` for Socket.dev maintenance score.

## v0.2.2 — 2026-05-28 (JS/TS locale reading)

- `.js`/`.cjs`/`.mjs`/`.ts`/`.tsx` locale file **reading** via `createRequire` + `jiti`.
- Synchronous cache eviction for CJS, robust error wrapping.

## v0.2.3 — 2026-05-28 (Write-safety on JS/TS locales)

- `writeLocaleFile` refuses to write `.js`/`.cjs`/`.mjs`/`.ts`/`.tsx` — throws a clear `I18nSharpenError` instead of destroying imports/JSDoc/types.

## v0.2.4 — 2026-05-28 (Scanner regex hardening)

- Scanner returns a match-nothing regex when `matchFunctions`/`matchAttributes` are empty (previously could over-match).
