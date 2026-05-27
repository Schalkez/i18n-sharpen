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
