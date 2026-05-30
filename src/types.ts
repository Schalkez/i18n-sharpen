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
   * Locale key ordering mode.
   * - "alpha": case-insensitive, numeric-aware Unicode sort
   * - "source": order keys by first-appearance in source code
   * - "preserve": return unchanged
   */
  sortKeys?: "alpha" | "source" | "preserve"
  /**
   * Namespace used for keys without a `ns:` prefix when `localesLayout === "namespaced"`.
   * Defaults to `"common"`.
   */
  defaultNamespace?: string
  /**
   * Glob patterns that suppress dynamic-key findings from both the
   * console summary and the markdown report. Patterns are matched
   * against the extracted leading prefix (structured-concat) or
   * against the empty string (fully-dynamic). The universal `*`
   * silences every dynamic-key finding.
   *
   * Examples:
   *   ignoreDynamicKeys: ["error.*"]   // suppress t("error." + x)
   *   ignoreDynamicKeys: ["*"]         // suppress everything
   *
   * Per D-09 / D-11. Reuses the existing matchWildcard glob syntax
   * shared with `ignoreKeys`.
   */
  ignoreDynamicKeys?: string[]
  /**
   * Prune-only knobs. When `prune.force` is false (the default), `prune`
   * runs in dry-run mode: it prints a summary of which keys WOULD be
   * removed but does not modify any locale file. Set `prune.force: true`
   * in config, or pass `--force` on the CLI, to actually write.
   */
  prune?: {
    /** If true, prune writes the cleaned locale files to disk. */
    force?: boolean
    /**
     * If true, namespace files left with zero keys after pruning are
     * deleted from disk (namespaced layout only).
     */
    cleanEmpty?: boolean
  }
  /**
   * Hardcoded string detection options.
   */
  hardcoded?: {
    ignore?: string[]
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
  /**
   * If true, launch the interactive TUI picker (arrow-key + Space)
   * when running in a TTY. In a non-TTY environment (pipe, CI),
   * the picker is skipped — see Phase 3 D-13/D-14/D-15 for the
   * fallback semantics. The standard `force` / `dryRun` write gate
   * still applies: `interactive` selects WHICH keys to prune; `force`
   * decides WHETHER they are written. Per IPRUNE-01..06.
   *
   * Defaults to false (existing non-interactive behavior preserved).
   */
  interactive?: boolean
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
  /**
   * Dynamic-key findings collected during validate. Phase 2 splits
   * non-static t(...) calls into two buckets (D-01..D-07). These
   * findings never contribute to exit code 1 (D-16). When
   * `ignoreDynamicKeys` matches, the entry is removed entirely
   * (D-12).
   */
  dynamicKeys: {
    fullyDynamic: DynamicKeyFinding[]
    structuredConcat: StructuredConcatFinding[]
  }
  hardcodedStrings?: HardcodedFinding[]
}

export interface HardcodedFinding {
  file: string
  line: number
  text: string
}

/**
 * One occurrence of a fully-dynamic translation key reference.
 * Phase 2 D-01..D-02, D-04. The `expression` is the raw matched
 * call string (e.g. `t(myVar)`) for display in the console summary
 * and markdown report.
 */
export interface DynamicKeyFinding {
  file: string
  line: number
  expression: string
}

/**
 * One occurrence of a structured-concat translation key reference.
 * Phase 2 D-03, D-05. Carries the normalized leading-static prefix
 * (no surrounding quotes/backticks per D-07).
 */
export interface StructuredConcatFinding {
  prefix: string
  file: string
  line: number
  expression: string
}
