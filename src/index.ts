/**
 * Public API for `i18n-sharpen`.
 *
 * This entry point is what gets exported from the npm package. The CLI
 * (`src/cli.ts`) is published separately as the `i18n-sharpen` binary.
 *
 * @example
 * ```ts
 * import { loadConfig, validate, extract, prune } from "i18n-sharpen"
 *
 * const config = loadConfig()
 * const report = validate(config)
 * if (report.missingKeys.length === 0) {
 *   prune(config, process.cwd(), { force: true })
 * }
 * ```
 */

/**
 * Load and validate `i18n-sharpen` configuration from disk.
 *
 * Resolution order: explicit `configPath` → `i18n-sharpen.json` →
 * `package.json#i18nSharpen` → defaults. Throws `I18nSharpenError` of
 * kind `config` or `parse` on failure.
 */
export { loadConfig } from "./config"

/**
 * Validate translation keys, active placeholders, and cross-locale
 * alignment. Returns a structured {@link ValidationResults} object and
 * optionally writes a markdown report when `config.outputReport` is set.
 */
export { validate } from "./commands/validate"

/**
 * Extract new translation keys referenced in source code and inject them
 * into the configured locale files as placeholder entries.
 */
export { extract } from "./commands/extract"

/**
 * Prune unused translation keys from locale files. Safe-by-default:
 * runs as a dry-run unless `--force` / `options.force` / `config.prune.force`
 * is set. Returns a {@link PruneResult} so programmatic callers can
 * inspect what was (or would be) removed.
 */
export { prune } from "./commands/prune"

/**
 * Structured error thrown by every i18n-sharpen API. Use
 * `err.error.kind` to switch on the failure category.
 */
export { I18nSharpenError, type I18nError } from "./core/errors"

export type {
  /** Configuration object accepted by the CLI and programmatic API. */
  I18nSharpenConfig,
  /**
   * @deprecated Use {@link I18nSharpenConfig}. Kept for backwards
   * compatibility with v0.0.x / v0.1.x consumers; will be removed in a
   * future major version.
   */
  I18nCopConfig,
  /** Structured result returned by {@link validate}. */
  ValidationResults,
  /** Per-invocation options for the programmatic {@link prune} API. */
  PruneOptions,
  /** Structured result returned by {@link prune}. */
  PruneResult
} from "./types"
