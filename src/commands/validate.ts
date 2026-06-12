import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import { I18nSharpenError } from "@/core/errors"
import { loadAllLocales, normalizeDisplayPath } from "@/core/locale-io"
import {
  scanSourceFiles,
  detectUsedKeys,
  getBaseKey,
  computeLineOffsets,
  offsetToLine,
  matchWildcard,
  isHardcodedIgnored
} from "@/core/scanner"
import type {
  I18nSharpenConfig,
  ValidationResults,
  DynamicKeyFinding,
  StructuredConcatFinding,
  HardcodedFinding
} from "@/types"
import { log } from "@/utils"
import {
  findMissingKeys,
  findUnusedKeys,
  findAlignmentMismatches,
  findPlaceholderKeys
} from "./validate/checks"
import {
  printValidationResults,
  printDynamicKeysSummary
} from "./validate/output"
import { writeMarkdownReport } from "./validate/report"

export async function validate(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options?: { checkHardcoded?: boolean }
): Promise<ValidationResults> {
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
  const matchFunctions = config.matchFunctions ?? ["t", "getTranslation"]
  const matchAttributes = config.matchAttributes ?? ["i18nKey", "id"]

  const { usedKeys, fileContents, parsedResults, parseErrors } =
    await detectUsedKeys(files, matchFunctions, matchAttributes, {
      cwd,
      hardcodedAttributes: config.hardcoded?.attributes ?? []
    })

  for (const err of parseErrors) {
    log.warn(
      `Parse warning: ${err.file}${err.line ? `:${err.line}` : ""}: ${err.message}`
    )
  }

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

  const fullyDynamicFindings: DynamicKeyFinding[] = []
  const structuredConcatFindings: StructuredConcatFinding[] = []

  for (let i = 0; i < files.length; i++) {
    const relativePath = normalizeDisplayPath(path.relative(cwd, files[i]))
    const parsed = parsedResults[i]

    for (const { key } of parsed.usedKeys) {
      if (key.endsWith(".")) continue
      keyToFilesMap.add(key, relativePath)
    }

    const lineOffsets = computeLineOffsets(fileContents[i])
    for (const dc of parsed.dynamicCalls) {
      const prefix =
        dc.classification === "structured-concat" ? (dc.prefix ?? "") : ""
      const suppressed = (config.ignoreDynamicKeys ?? []).some((p) =>
        matchWildcard(p, prefix)
      )
      if (suppressed) continue

      const line = offsetToLine(lineOffsets, dc.offset)
      if (dc.classification === "fully-dynamic") {
        fullyDynamicFindings.push({
          file: relativePath,
          line,
          expression: dc.expression
        })
      } else {
        structuredConcatFindings.push({
          prefix,
          file: relativePath,
          line,
          expression: dc.expression
        })
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

  // --- Scan hardcoded strings ---
  const hardcodedFindings: HardcodedFinding[] = []
  if (options?.checkHardcoded) {
    log.info("Checking for un-translated hardcoded strings...")
    for (let i = 0; i < files.length; i++) {
      const relativePath = normalizeDisplayPath(path.relative(cwd, files[i]))
      const parsed = parsedResults[i]

      let rawContent = ""
      try {
        rawContent = fs.readFileSync(files[i], "utf8")
      } catch {
        rawContent = ""
      }
      const rawLineOffsets = computeLineOffsets(rawContent)

      for (const cand of parsed.hardcodedCandidates) {
        const customIgnores = config.hardcoded?.ignore ?? []
        if (!isHardcodedIgnored(cand.text, customIgnores)) {
          hardcodedFindings.push({
            file: relativePath,
            line: offsetToLine(rawLineOffsets, cand.offset),
            text: cand.text
          })
        }
      }
    }
  }

  // --- Pure checks ---
  let activeConfig = config
  if (config.autoIgnoreDynamicPrefixes !== false) {
    const dynamicPrefixes = new Set<string>()
    for (const finding of structuredConcatFindings) {
      if (finding.prefix) {
        dynamicPrefixes.add(finding.prefix)
      }
    }
    if (dynamicPrefixes.size > 0) {
      const localIgnoreKeys = [...(config.ignoreKeys ?? [])]
      for (const prefix of dynamicPrefixes) {
        const pattern = prefix + "*"
        if (!localIgnoreKeys.includes(pattern)) {
          localIgnoreKeys.push(pattern)
        }
      }
      activeConfig = {
        ...config,
        ignoreKeys: localIgnoreKeys
      }
    }
  }

  const suffixes = activeConfig.pluralSuffixes ?? []
  const missingKeys = findMissingKeys(usedKeys, defaultKeySet, activeConfig)
  const unusedKeys = findUnusedKeys(defaultKeys, usedKeys, activeConfig)
  const keysOnlyInLanguages = findAlignmentMismatches(
    activeConfig,
    defaultKeys,
    defaultKeySet,
    localesFlat,
    localeKeySets
  )
  const { activePlaceholderKeys, unusedPlaceholderKeys } = findPlaceholderKeys(
    activeConfig,
    usedKeys,
    localesFlat
  )

  const missingDynamicKeys: StructuredConcatFinding[] = []
  for (const finding of structuredConcatFindings) {
    const prefix = finding.prefix
    if (prefix) {
      const hasAnyKey = Array.from(defaultKeySet).some((k) =>
        k.startsWith(prefix)
      )
      if (!hasAnyKey) {
        missingDynamicKeys.push(finding)
      }
    }
  }

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
    missingDynamicKeys,
    activePlaceholderKeys,
    unusedKeys,
    unusedPlaceholderKeys,
    keysOnlyInLanguages,
    codeKeyCoverage,
    utilizationPercent,
    totalDefinedKeys,
    usedDefinedKeysCount,
    dynamicKeys: {
      fullyDynamic: fullyDynamicFindings,
      structuredConcat: structuredConcatFindings
    },
    hardcodedStrings: options?.checkHardcoded ? hardcodedFindings : undefined
  }

  // --- Output ---
  printValidationResults(results, keyToFilesMap, suffixes)
  printDynamicKeysSummary(results.dynamicKeys)

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
    missingDynamicKeys.length > 0 ||
    activePlaceholderKeys.length > 0 ||
    keysOnlyInLanguages.length > 0 ||
    (options?.checkHardcoded && hardcodedFindings.length > 0)

  if (hasError) {
    log.error(
      "Validation failed. Please fix the missing keys, missing dynamic keys, active placeholders, locale mismatches, or hardcoded strings."
    )
  } else {
    log.success("i18n Quality Validation passed successfully!\n")
  }

  return results
}
