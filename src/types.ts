export interface I18nCopConfig {
  scanDirs: string[]
  localesDir: string
  defaultLanguage: string
  supportedLanguages: string[]
  excludeDirs?: string[]
  fileExtensions?: string[]
  matchFunctions?: string[]
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
}

export type FlatTranslationsMap = Record<string, string>

export interface ValidationResults {
  missingKeys: string[]
  activePlaceholderKeys: { key: string; lang: string }[]
  unusedKeys: string[]
  unusedPlaceholderKeys: { key: string; lang: string }[]
  keysOnlyInLanguages: Record<string, string[]>
  codeKeyCoverage: string
  utilizationPercent: string
  totalDefinedKeys: number
  usedDefinedKeysCount: number
}
