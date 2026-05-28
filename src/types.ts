export interface I18nSharpenConfig {
  scanDirs: string[]
  localesDir: string
  defaultLanguage: string
  supportedLanguages: string[]
  excludeDirs?: string[]
  fileExtensions?: string[]
  matchFunctions?: string[]
  /**
   * Path (relative to cwd) where the markdown coverage report is written.
   *
   * - Omit / undefined: use the built-in default ("i18n-coverage.md").
   * - Non-empty string: write the report to that path.
   * - Empty string `""`: disable report generation (no file written,
   *   no warning).
   */
  outputReport?: string
  matchAttributes?: string[]
  ignoreKeys?: string[]
  pluralSuffixes?: string[]
  /**
   * If true, also mark a locale key as "used" when its quoted form
   * appears as a bare string literal anywhere in scanned files (i.e.
   * outside a recognised t(...)/attr=... call).
   *
   * Defaults to false because this loose pass over-matches: a stale key
   * mentioned in a debug log or JSDoc looks "used" and is never pruned,
   * and a short key like "a" matches every "a" literal in the codebase.
   */
  looseKeyMatch?: boolean
  /**
   * Locale file layout under `localesDir`.
   *
   * - `"flat"` (default): one file per language at
   *   `<localesDir>/<lang>.{json,yaml}` containing all keys.
   * - `"namespaced"`: one directory per language with one file per
   *   namespace, e.g. `<localesDir>/en/common.json` +
   *   `<localesDir>/en/auth.json`. Keys are then referenced as
   *   `t("namespace:key.path")` in code; the namespace is the file
   *   basename.
   *
   * Phase 7 introduces the namespaced mode. Backwards compatible — when
   * unset, behavior is identical to v0.1.x.
   */
  localesLayout?: "flat" | "namespaced"
  /**
   * Prune-only knobs. When `prune.force` is false (the default), `prune`
   * runs in dry-run mode: it prints a summary of which keys WOULD be
   * removed but does not modify any locale file. Set `prune.force: true`
   * in config, or pass `--force` on the CLI, to actually write.
   */
  prune?: {
    /** If true, prune writes the cleaned locale files to disk. */
    force?: boolean
  }
}

/**
 * @deprecated Use `I18nSharpenConfig`. This alias is kept for backwards
 * compatibility with v0.0.x / v0.1.x consumers and will be removed in
 * a future major version.
 */
export type I18nCopConfig = I18nSharpenConfig

/**
 * Per-invocation options for the programmatic `prune()` API.
 *
 * Both `force` and `dryRun` can be set; if both are passed, `dryRun`
 * wins (an explicit dry-run beats any `force` from config).
 */
export interface PruneOptions {
  /** Force writes even when config.prune.force is false. */
  force?: boolean
  /** Preview only — never write, regardless of config.prune.force. */
  dryRun?: boolean
}

/**
 * Structured result returned by `prune()` so programmatic callers can
 * inspect what was (or would be) removed without parsing console output.
 */
export interface PruneResult {
  /** Whether any locale files were actually written. */
  written: boolean
  /** Whether prune ran in dry-run mode (no writes). */
  dryRun: boolean
  /** Per-language summary keyed by language code. */
  perLocale: {
    lang: string
    file: string
    prunedKeys: string[]
  }[]
  /** Total number of keys removed across all locales. */
  totalPruned: number
}

export type FlatTranslationsMap = Record<string, string>

export interface LocaleAlignmentMismatch {
  /** Source language that has the keys */
  from: string
  /** Target language that is missing the keys */
  to: string
  /** Keys present in `from` but missing in `to` */
  keys: string[]
}

export interface ValidationResults {
  missingKeys: string[]
  activePlaceholderKeys: { key: string; lang: string }[]
  unusedKeys: string[]
  unusedPlaceholderKeys: { key: string; lang: string }[]
  /**
   * One entry per (from, to) language pair that has at least one
   * missing key. Replaces the previous `Record<from_not_to, keys>` map
   * which collided when a language code contained "_not_" (MD-09).
   */
  keysOnlyInLanguages: LocaleAlignmentMismatch[]
  codeKeyCoverage: string
  utilizationPercent: string
  totalDefinedKeys: number
  usedDefinedKeysCount: number
}
