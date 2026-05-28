# Changelog

All notable changes to `i18n-sharpen` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-28

First fully-stabilised release. Major architectural cleanup, broader
framework coverage, safer defaults, and a public structured error type.
Pre-`0.1.0` consumers should read the **BREAKING CHANGES** section.

### Added

- **Structured error type** (`I18nSharpenError`). Every API throws this
  one class; `err.error.kind` is a discriminated union over
  `"config" | "filesystem" | "parse" | "validation"`.
- **`--config <path>` CLI flag** (Phase 5) — load an explicit config file
  instead of relying on `i18n-sharpen.json` discovery.
- **Safe-by-default `prune`** (Phase 6) — `prune` now runs in dry-run
  mode unless `--force` (CLI), `options.force` (API), or
  `config.prune.force: true` is set. `--dry-run` always wins to make CI
  scripts robust.
- **`PruneResult` return value** — `prune()` now returns
  `{ written, dryRun, perLocale, totalPruned }` so callers can inspect
  what was (or would be) removed without parsing console output.
- **Namespaced locales foundation** (Phase 7) — new
  `localesLayout: "flat" | "namespaced"` config option. `"namespaced"`
  expects `<localesDir>/<lang>/<namespace>.json` layouts and supports
  `t("namespace:key.path")` syntax. Loader (`loadNamespacedLocales`) is
  shipped; extract/prune end-to-end routing arrives in 0.3.x.
- **Vue / Svelte / Astro coverage** (Phase 8) — `.vue`, `.svelte`,
  `.astro` are in the default `fileExtensions`. Default
  `matchAttributes` now includes `i18n`, `:label`, `v-t`, `t:` so Vue
  v-bind and Astro directives work out of the box.
- **`I18nSharpenConfig` type** — proper rename of the old
  `I18nCopConfig`; the old name is kept as a deprecated alias.
- **JSDoc on the public API** — every export from `src/index.ts` carries
  a description in the generated `.d.ts`.
- **30+ new tests** — coverage rose from 15 to 58 across scanner,
  locale-io, errors, and report modules.

### Changed (BREAKING)

- **`I18nCopConfig` is deprecated** in favour of `I18nSharpenConfig`.
  The old name is a type alias today and will be removed in `0.3.0`.
- **`prune()` default behaviour is dry-run.** Pre-0.2.0 code that
  expected `prune()` to write must now pass
  `{ force: true }` or set `config.prune.force: true`.
- **`prune()` return type changed** from `void` to `PruneResult`.
- **`looseKeyMatch` is opt-in.** The fuzzy "bare string literal" pass
  previously ran by default; it now requires
  `config.looseKeyMatch: true`. The default-on behaviour caused stale
  keys to never be pruned and is rarely what users want.
- **All thrown errors are `I18nSharpenError`** instances. Code that did
  `catch (e) { if (e instanceof Error) ... }` keeps working;
  `instanceof I18nSharpenError` is now the precise check.
- **`ValidationResults.keysOnlyInLanguages`** is now an array of
  `{ from, to, keys }` objects (was a string-indexed map). The previous
  encoding broke when a language code contained the literal substring
  `_not_`.

### Fixed (33 hardening items rolled up from REVIEW-FIX)

- **HI** — high-impact:
  - process.exit no longer truncates piped stdout (HI-01 / LO-01).
  - URL strings (`https://...`) inside source are no longer mistaken
    for line comments (HI-02 / part of MD-10).
  - Cleaner regex injection guard via `escapeRegex` over
    user-controlled `matchFunctions` / `matchAttributes`.
- **MD** — medium-impact: symlink-safe directory walker, BOM-tolerant
  locale parsing, atomic locale writes (`.tmp` + rename), parent-dir
  creation for `outputReport`, structured locale alignment results.
- **LO** — low-impact:
  - `setNestedValue` rejects `__proto__` / `prototype` / `constructor`.
  - `cwd` is validated to be an existing directory before config load.
  - Surfaced `package.json` read errors instead of silently swallowing.
  - Centralised `DEFAULT_CONFIG`; removed duplicated logic across
    validate / extract / prune.
  - `Set<string>` lookup replaces O(n²) `Array.includes()` on the
    key→files map.
  - `?` in `ignoreKeys` patterns is treated as a literal, not a regex
    quantifier.
  - Version is read dynamically from `package.json` so it never drifts.
  - `NO_EMOJI` env var falls back to plain-text glyphs for Windows
    cmd.exe / older CI loggers.

### Internal

- Split `utils.ts` into `core/scanner.ts` + `core/locale-io.ts` +
  `core/errors.ts`. `utils.ts` now re-exports with `@deprecated` JSDoc
  for backwards compatibility.
- Extracted markdown report generation into
  `commands/validate/report.ts` (`renderMarkdownReport` is pure /
  snapshot-testable).
- Tightened ESLint: `@typescript-eslint/no-explicit-any: error`,
  `@typescript-eslint/consistent-type-imports: error`,
  `no-console: warn`.

### Migration from 0.0.x / 0.1.x

```ts
// Before
import type { I18nCopConfig } from "i18n-sharpen"
prune(config)                       // writes by default

// After
import type { I18nSharpenConfig } from "i18n-sharpen"
prune(config, cwd, { force: true }) // explicit
```

If you relied on the old loose-match behaviour, add
`"looseKeyMatch": true` to your `i18n-sharpen.json`.

## [0.1.0] - prior

Initial public release. See git history for details.

[0.2.0]: https://github.com/your-org/i18n-sharpen/releases/tag/v0.2.0
[0.1.0]: https://github.com/your-org/i18n-sharpen/releases/tag/v0.1.0
