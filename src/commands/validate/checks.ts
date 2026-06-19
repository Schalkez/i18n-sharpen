import { isKeyUsed, getBaseKey, matchWildcard } from "@/core/scanner"
import type { I18nSharpenConfig, LocaleAlignmentMismatch } from "@/types"

/**
 * Find keys used in source code that are absent from the default locale.
 * A key is considered present when it or any of its plural-suffix variants
 * exist in the default locale key set.
 */
export function findMissingKeys(
  usedKeys: Set<string>,
  defaultKeySet: Set<string>,
  config: Pick<I18nSharpenConfig, "pluralSuffixes" | "ignoreKeys">
): string[] {
  const suffixes = config.pluralSuffixes ?? []
  const ignoreKeys = config.ignoreKeys ?? []
  const missing: string[] = []

  for (const key of usedKeys) {
    if (ignoreKeys.some((pattern) => matchWildcard(pattern, key))) {
      continue
    }

    let exists = defaultKeySet.has(key)
    if (!exists) {
      for (const suffix of suffixes) {
        if (defaultKeySet.has(key + suffix)) {
          exists = true
          break
        }
      }
    }
    if (!exists) {
      missing.push(key)
    }
  }

  return missing
}

/**
 * Find keys defined in the default locale that are never referenced in
 * source code (accounting for ignoreKeys wildcards and plural suffixes).
 */
export function findUnusedKeys(
  defaultKeys: string[],
  usedKeys: Set<string>,
  config: Pick<I18nSharpenConfig, "pluralSuffixes" | "ignoreKeys">
): string[] {
  const suffixes = config.pluralSuffixes ?? []
  const unused: string[] = []

  for (const key of defaultKeys) {
    if (!isKeyUsed(key, usedKeys, config.ignoreKeys, suffixes)) {
      unused.push(key)
    }
  }

  return unused
}

/**
 * Find cross-locale alignment mismatches: keys present in one language
 * file but absent from another. Returns one entry per (from, to) pair
 * that has at least one missing key.
 */
export function findAlignmentMismatches(
  config: Pick<I18nSharpenConfig, "defaultLanguage" | "supportedLanguages">,
  defaultKeys: string[],
  defaultKeySet: Set<string>,
  localesFlat: Record<string, Record<string, string>>,
  localeKeySets: Record<string, Set<string>>
): LocaleAlignmentMismatch[] {
  const mismatches: LocaleAlignmentMismatch[] = []

  for (const lang of config.supportedLanguages) {
    if (lang === config.defaultLanguage) continue
    const langKeySet = localeKeySets[lang]

    const onlyInDefault = defaultKeys.filter((key) => !langKeySet.has(key))
    const onlyInTarget = Object.keys(localesFlat[lang]).filter(
      (key) => !defaultKeySet.has(key)
    )

    if (onlyInDefault.length > 0) {
      mismatches.push({
        from: config.defaultLanguage,
        to: lang,
        keys: onlyInDefault
      })
    }
    if (onlyInTarget.length > 0) {
      mismatches.push({
        from: lang,
        to: config.defaultLanguage,
        keys: onlyInTarget
      })
    }
  }

  return mismatches
}

/**
 * Find placeholder keys (where the translation value equals the key path)
 * split into active (used in code) and unused buckets.
 */
export function findPlaceholderKeys(
  config: Pick<
    I18nSharpenConfig,
    "supportedLanguages" | "pluralSuffixes" | "ignoreKeys"
  >,
  usedKeys: Set<string>,
  localesFlat: Record<string, Record<string, string>>
): {
  activePlaceholderKeys: { key: string; lang: string }[]
  unusedPlaceholderKeys: { key: string; lang: string }[]
} {
  const suffixes = config.pluralSuffixes ?? []
  const activePlaceholderKeys: { key: string; lang: string }[] = []
  const unusedPlaceholderKeys: { key: string; lang: string }[] = []

  for (const lang of config.supportedLanguages) {
    const flatMap = localesFlat[lang]
    for (const key in flatMap) {
      if (flatMap[key] === key) {
        if (isKeyUsed(key, usedKeys, config.ignoreKeys, suffixes)) {
          activePlaceholderKeys.push({ key, lang })
        } else {
          unusedPlaceholderKeys.push({ key, lang })
        }
      }
    }
  }

  return { activePlaceholderKeys, unusedPlaceholderKeys }
}

/**
 * Find translation keys in non-default languages that match the default language value
 * (indicating a copy-paste fallback).
 */
export function findUntranslatedFallbacks(
  config: Pick<
    I18nSharpenConfig,
    "defaultLanguage" | "supportedLanguages" | "pluralSuffixes" | "ignoreKeys"
  >,
  usedKeys: Set<string>,
  localesFlat: Record<string, Record<string, string>>
): { key: string; lang: string; value: string }[] {
  const suffixes = config.pluralSuffixes ?? []
  const ignoreKeys = config.ignoreKeys ?? []
  const fallbacks: { key: string; lang: string; value: string }[] = []

  const defaultLang = config.defaultLanguage
  const defaultFlatMap = localesFlat[defaultLang] ?? {}

  for (const lang of config.supportedLanguages) {
    if (lang === defaultLang) continue
    const flatMap = localesFlat[lang] ?? {}
    for (const key in flatMap) {
      if (!isKeyUsed(key, usedKeys, ignoreKeys, suffixes)) {
        continue
      }

      const defaultVal = defaultFlatMap[key]
      const targetVal = flatMap[key]

      if (
        key in defaultFlatMap &&
        targetVal === defaultVal &&
        defaultVal !== ""
      ) {
        // Exclude keys whose value is equal to key (already caught by findPlaceholderKeys)
        if (targetVal !== key) {
          fallbacks.push({ key, lang, value: targetVal })
        }
      }
    }
  }

  return fallbacks
}

/**
 * Re-export getBaseKey with a bound suffixes array for use by output/report modules.
 */
export { getBaseKey }
