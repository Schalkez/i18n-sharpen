# Changelog

All notable changes to `i18n-sharpen` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-06-07

### Added
- **Namespace Scoped Hooks Support**: Added support for modern namespace-scoped hooks in Next.js/React (`useTranslations`, `useNamespace`, `useTranslation`). It automatically prepends the namespace prefix (e.g. `auth.`) to all translation calls scoped within that hook.
- **`ignoreKeys` in `validate`**: The quality validation engine now respects configured `ignoreKeys` wildcard patterns when reporting missing keys, ensuring parity with the prune command.

## [0.4.1] - 2026-06-03

### Added
- **Configurable hardcoded-string attributes** (`hardcoded.attributes`): The list of HTML/JSX attributes scanned for un-translated text is now configurable in `i18n-sharpen.json`. Defaults to `["placeholder", "label", "title", "alt", "aria-label"]` when omitted. All AST parsers (TypeScript/JSX, Vue, Svelte, Astro) use the configured list instead of a hard-coded constant.

### Fixed
- **`hardcoded.ignore` passthrough**: User-configured `hardcoded.ignore` values were silently dropped by the config loader and never applied. They are now correctly passed through to the validator.

---

## [0.4.0] - 2026-06-03

### Changed (BREAKING)
- **Async public API**: `validate()`, `extract()`, and `prune()` now return `Promise`. All callers must `await` their results.
  ```ts
  // Before
  const result = validate(config)
  // After
  const result = await validate(config)
  ```
- **New optional peer dependencies**: Framework scanning now requires the workspace compiler for each framework. If a compiler is missing, an actionable error is emitted.
  ```bash
  pnpm add -D typescript          # .ts/.tsx/.js/.jsx scanning
  pnpm add -D @vue/compiler-sfc   # .vue scanning
  pnpm add -D svelte              # .svelte scanning
  pnpm add -D @astrojs/compiler   # .astro scanning
  ```
- **AST engine**: The regex/state-machine scanner is replaced by per-framework AST parsers (TS Compiler API for JS/TS; workspace compilers for Vue/Svelte/Astro); accuracy improves; no configuration change required.

## [0.3.0] - Unreleased

### Added
- **Interactive Pruning (`prune --interactive`)**: Introduce an interactive TUI picker (built with raw ANSI escape sequences and no third-party dependencies) to selectively prune unused translation keys.
  - Full keyboard control: `↑`/`↓` for fine navigation, `PageUp`/`PageDown` to jump cursor by page, `Space` to toggle key selection, `a` to check all, `n` to uncheck all, `i` to invert checks, `Enter` to confirm, and `Esc`/`Ctrl+C` to cancel (exiting with code `130` and making no modifications).
  - Safety-first write gate: Selection is confirmed via `Enter`, but changes are only written to disk if `--force` is provided. If run without `--force`, prints a preview of selected keys and exits.
  - Environment-friendly: Respects `NO_EMOJI` by falling back to clean ASCII indicators dynamically at render time.
  - Non-TTY fallback: Gracefully falls back to standard dry-run preview in non-TTY environments with a warning. If `--force` is passed in a non-TTY environment, it is ignored to prevent accidental bulk-pruning.
  - Short-circuit: Skips the TUI entirely if there are no unused keys to prune, completing instantly.
  - Composes with `--clean-empty`: Cleans up empty namespace files in `namespaced` layout after the TUI prune is written.
- **Hardcoded String Detection (`validate --check-hardcoded`)**: Detect un-translated raw text nodes, attributes (`placeholder`, `label`, `title`, `alt`, `aria-label`), and expression literals in HTML/JSX/Vue/Svelte/Astro templates. Features a robust stack-based parser to handle nested JSX elements inside expressions and heuristic look-behind to differentiate mathematical comparison operators (`<`, `>`) from tags. Includes default and custom regex filter ignores (`hardcoded.ignore`) and exits with code `1` in CI/pipelines on finding un-translated text.

### Changed (notable behavior change)
- **prune**: The programmatic API `prune()` is now asynchronous and returns `Promise<PruneResult>` instead of a synchronous `PruneResult` to accommodate TUI interactive choices.
- **validate**: dynamic-key warnings are now emitted as a single grouped summary at the end of the run (sections "Fully-dynamic keys" and "Structured-concat keys") instead of one `log.warn` per call site. Structured-concat keys surface their leading static prefix (e.g. `error.`) and every finding includes a `file:line` location. Configure suppression via `ignoreDynamicKeys: ["error.*", "*"]`. Exit code is unchanged — dynamic findings never cause `validate` to fail. (Phase 2 / D-13)

### Changed (BREAKING)
- **Removed `I18nCopConfig` type alias**: The deprecated `I18nCopConfig` type alias has been fully removed. Use `I18nSharpenConfig` instead.
  ```ts
  // Migration
  - import type { I18nCopConfig } from "i18n-sharpen"
  + import type { I18nSharpenConfig } from "i18n-sharpen"
  ```

## [0.2.3] - 2026-05-28

### Security & Safety

- **Refuse to write JS/TS locale files**: `writeLocaleFile` now throws a clear, actionable error if asked to write to `.js`, `.cjs`, `.mjs`, `.ts`, or `.tsx` files. This prevents the `extract` and `prune` commands from destroying typescript imports, JSDoc comments, type annotations, and custom JS/TS wrappers in those files.

### Added

- Comprehensive unit tests covering JS/TS/ESM module reading, cache eviction, and write-refusal behaviors.

## [0.2.2] - 2026-05-28

### Added

- **JS/TS locale file reading**: Added support to read `.js`, `.cjs`, `.mjs`, `.ts`, and `.tsx` locale files. `.js`/`.cjs` are loaded synchronously via `createRequire`, while `.mjs`/`.ts`/`.tsx` are compiled and loaded using `jiti` (must be installed by the user as a dev-dependency).
- **Synchronous cache eviction**: CommonJS module cache is automatically cleared on each read to ensure fresh updates are loaded in watch/development flows.
- **Robust error handling**: Wrapped JS/TS module loading in `try/catch` blocks to throw clear compile/syntax errors instead of crashing the CLI.

## [0.2.1] - 2026-05-28

### Added

- Added repository metadata (`repository`, `bugs`, `homepage`, `author`) to `package.json` to improve package supply chain security and maintenance scores on Socket.dev.

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
