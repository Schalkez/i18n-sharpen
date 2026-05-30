# Milestones — i18n-sharpen

Shipped milestones and what they delivered. Active milestone lives in `PROJECT.md` and `ROADMAP.md`.

## v0.3.0 — 2026-05-30 (Developer Experience)

Tag: `v0.3.0`. 5 phases, 13 plans. Tests: 166 passing; ESLint strict-type-checked clean; tsc clean; build success. Full archive: `milestones/v0.3.0-ROADMAP.md` + `milestones/v0.3.0-REQUIREMENTS.md` (phase artifacts under `milestones/v0.3.0-phases/`).

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Auto-sorting keys (`sortKeys`/`--sort`) + namespace hardening (`defaultNamespace`, `--clean-empty`, two-phase atomic prune) | DONE |
| 2 | Dynamic-key warnings — fully-dynamic vs structured-concat, `ignoreDynamicKeys`, report counts | DONE |
| 3 | Interactive pruning — hand-rolled raw-mode TUI (`prune --interactive`), non-TTY fallback | DONE |
| 4 | Hardcoded string detection — `validate --check-hardcoded` (text nodes + attributes), markdown section | DONE |
| 5 | Deprecation cleanup — `I18nCopConfig` alias removed (breaking) | DONE |

**Key accomplishments:**
1. Deterministic locale key ordering on every extract/prune write, opt-in via config or `--sort`.
2. Cross-file atomic prune (`writeLocaleFilesAtomic`) — no mixed pruned/unpruned state on partial failure.
3. Actionable dynamic-key reporting that no longer pollutes the missing-key failure count.
4. Zero-dependency interactive prune TUI honoring the tiny-dep constraint.
5. `validate --check-hardcoded` catches un-translated text before ship; CI-failing exit code.

**Breaking change:** `I18nCopConfig` removed (migrate to `I18nSharpenConfig`).

**Tech debt → motivates v0.4.0:** hardcoded/key/dynamic detection still on a hand-rolled regex/state-machine scanner that accumulates edge-case patches; v0.4.0 replaces it with real per-framework AST parsers.

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
