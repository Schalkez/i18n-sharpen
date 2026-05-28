import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import type { I18nSharpenConfig, ValidationResults } from "../types"
import { I18nSharpenError } from "../core/errors"
import {
  scanSourceFiles,
  detectUsedKeys,
  buildKeyRegex,
  buildAttrRegex,
  buildDynamicCallRegex,
  isStaticStringLiteral,
  getBaseKey
} from "../core/scanner"
import { loadAllLocales, normalizeDisplayPath } from "../core/locale-io"
import { log } from "../utils"
import {
  findMissingKeys,
  findUnusedKeys,
  findAlignmentMismatches,
  findPlaceholderKeys
} from "./validate/checks"
import { printValidationResults } from "./validate/output"
import { writeMarkdownReport } from "./validate/report"

export function validate(
  config: I18nSharpenConfig,
  cwd: string = process.cwd()
): ValidationResults {
  log.header("I18N-SHARPEN VALIDATOR")

  const localesDirAbs = path.resolve(cwd, config.localesDir)

  // --- Load locales ---
  const { localesFlat, localeKeySets, localePaths } = loadAllLocales(
    localesDirAbs,
    config.supportedLanguages,
    (lang) => {
      log.warn(
        `Locale file not found for language '${lang}' in: ${localesDirAbs}`
      )
    }
  )

  const defaultLocalePath = localePaths[config.defaultLanguage] ?? null

  if (!defaultLocalePath) {
    throw new I18nSharpenError({
      kind: "filesystem",
      message: `Default language '${config.defaultLanguage}' locale file not found.`,
      path: localesDirAbs
    })
  }

  const defaultKeys = Object.keys(localesFlat[config.defaultLanguage])
  const defaultKeySet = localeKeySets[config.defaultLanguage]

  log.info(
    `Loaded default language '${config.defaultLanguage}' with ${pc.green(defaultKeys.length)} keys.`
  )
  for (const lang of config.supportedLanguages) {
    if (lang !== config.defaultLanguage) {
      const keysCount = Object.keys(localesFlat[lang]).length
      log.info(`Loaded language '${lang}' with ${pc.green(keysCount)} keys.`)
    }
  }

  // --- Scan source files ---
  const files = scanSourceFiles(config, cwd)

  for (const scanDir of config.scanDirs) {
    const scanDirAbs = path.resolve(cwd, scanDir)
    if (fs.existsSync(scanDirAbs)) {
      log.info(
        `Scanning directory: ${pc.cyan(normalizeDisplayPath(path.relative(cwd, scanDirAbs)))}`
      )
    } else {
      log.warn(`Scan directory does not exist: ${scanDirAbs}`)
    }
  }

  log.info(`Found ${pc.green(files.length)} source files to check.`)

  // --- Detect used keys ---
  const matchFunctions = config.matchFunctions || ["t", "getTranslation"]
  const matchAttributes = config.matchAttributes || ["i18nKey", "id"]

  const { usedKeys, fileContents } = detectUsedKeys(
    files,
    matchFunctions,
    matchAttributes
  )

  // Build key->files map for output/report and dynamic key warnings
  const keyToFilesSet = new Map<string, Set<string>>()
  const keyToFilesMap = {
    has(key: string): boolean {
      return keyToFilesSet.has(key)
    },
    get(key: string): string[] | undefined {
      const s = keyToFilesSet.get(key)
      return s ? Array.from(s) : undefined
    },
    add(key: string, file: string): void {
      let s = keyToFilesSet.get(key)
      if (!s) {
        s = new Set()
        keyToFilesSet.set(key, s)
      }
      s.add(file)
    }
  }

  const keyRegex = buildKeyRegex(matchFunctions)
  const attrRegex = buildAttrRegex(matchAttributes)
  const dynamicCallRegex = buildDynamicCallRegex(matchFunctions)

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const cleanContent = fileContents[i]
    const relativePath = normalizeDisplayPath(path.relative(cwd, file))

    for (const match of cleanContent.matchAll(keyRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      keyToFilesMap.add(key, relativePath)
    }
    for (const match of cleanContent.matchAll(attrRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      keyToFilesMap.add(key, relativePath)
    }
    for (const match of cleanContent.matchAll(dynamicCallRegex)) {
      const arg = match[1].trim()
      if (arg.length === 0) continue
      if (!isStaticStringLiteral(arg)) {
        log.warn(
          `Potential dynamic translation key reference in ${pc.cyan(relativePath)}: ${pc.yellow(`${match[0]}`)}`
        )
      }
    }
  }

  // Loose key match second pass
  if (config.looseKeyMatch) {
    for (const key of defaultKeys) {
      if (usedKeys.has(key)) continue
      const dq = `"${key}"`
      const sq = `'${key}'`
      const bq = `\`${key}\``
      for (let i = 0; i < files.length; i++) {
        const cleanContent = fileContents[i]
        if (
          cleanContent.includes(dq) ||
          cleanContent.includes(sq) ||
          cleanContent.includes(bq)
        ) {
          usedKeys.add(key)
          keyToFilesMap.add(
            key,
            normalizeDisplayPath(path.relative(cwd, files[i]))
          )
        }
      }
    }
  }

  log.info(
    `Found ${pc.green(usedKeys.size)} unique translation keys used in source code.`
  )

  // --- Pure checks ---
  const suffixes = config.pluralSuffixes || []
  const missingKeys = findMissingKeys(usedKeys, defaultKeySet, config)
  const unusedKeys = findUnusedKeys(defaultKeys, usedKeys, config)
  const keysOnlyInLanguages = findAlignmentMismatches(
    config,
    defaultKeys,
    defaultKeySet,
    localesFlat,
    localeKeySets
  )
  const { activePlaceholderKeys, unusedPlaceholderKeys } = findPlaceholderKeys(
    config,
    usedKeys,
    localesFlat
  )

  // Coverage stats
  const totalDefinedKeys = defaultKeys.length
  const usedDefinedKeysCount = defaultKeys.length - unusedKeys.length
  const utilizationPercent =
    totalDefinedKeys > 0
      ? ((usedDefinedKeysCount / totalDefinedKeys) * 100).toFixed(2)
      : "0.00"
  const codeKeyCoverage =
    usedKeys.size > 0
      ? ((usedDefinedKeysCount / usedKeys.size) * 100).toFixed(2)
      : "100.00"

  const results: ValidationResults = {
    missingKeys,
    activePlaceholderKeys,
    unusedKeys,
    unusedPlaceholderKeys,
    keysOnlyInLanguages,
    codeKeyCoverage,
    utilizationPercent,
    totalDefinedKeys,
    usedDefinedKeysCount
  }

  // --- Output ---
  printValidationResults(results, keyToFilesMap, suffixes)

  if (config.outputReport) {
    writeMarkdownReport({
      cwd,
      outputReport: config.outputReport,
      defaultBasename: path.basename(defaultLocalePath),
      results,
      keyToFilesMap,
      getBaseKey: (key) => getBaseKey(key, suffixes)
    })
  }

  const hasError =
    missingKeys.length > 0 ||
    activePlaceholderKeys.length > 0 ||
    keysOnlyInLanguages.length > 0

  if (hasError) {
    log.error(
      "Validation failed. Please fix the missing keys, active placeholders, or locale mismatches."
    )
  } else {
    log.success("i18n Quality Validation passed successfully!\n")
  }

  return results
}
