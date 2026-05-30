import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import { I18nSharpenError } from "@/core/errors"
import { loadAllLocales, normalizeDisplayPath } from "@/core/locale-io"
import {
  scanSourceFiles,
  detectUsedKeys,
  buildKeyRegex,
  buildAttrRegex,
  buildDynamicCallRegex,
  isStaticStringLiteral,
  getBaseKey,
  classifyDynamicCall,
  computeLineOffsets,
  offsetToLine,
  matchWildcard,
  scanTemplateTextNodes,
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

export function validate(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options?: { checkHardcoded?: boolean }
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
  const matchFunctions = config.matchFunctions ?? ["t", "getTranslation"]
  const matchAttributes = config.matchAttributes ?? ["i18nKey", "id"]

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

  const fullyDynamicFindings: DynamicKeyFinding[] = []
  const structuredConcatFindings: StructuredConcatFinding[] = []

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
    // Phase 2: collect dynamic-key findings into accumulators. Per D-13
    // the per-call log.warn is removed — a grouped summary is printed
    // at the end of validate via printDynamicKeysSummary.
    const lineOffsets = computeLineOffsets(cleanContent)
    for (const match of cleanContent.matchAll(dynamicCallRegex)) {
      const arg = match[1].trim()
      if (arg.length === 0) continue
      if (isStaticStringLiteral(arg)) continue
      const matchIndex = match.index
      const line = offsetToLine(lineOffsets, matchIndex)
      const classification = classifyDynamicCall(arg)
      const expression = match[0]
      const prefix =
        classification.kind === "structured-concat" ? classification.prefix : ""

      // D-10 / D-11 / D-12: ignoreDynamicKeys patterns match against the
      // prefix (empty string for fully-dynamic). The universal "*"
      // suppresses everything. Ignored entries are removed entirely.
      const patterns = config.ignoreDynamicKeys ?? []
      const suppressed = patterns.some((p) => matchWildcard(p, prefix))
      if (suppressed) continue

      if (classification.kind === "fully-dynamic") {
        fullyDynamicFindings.push({
          file: relativePath,
          line,
          expression
        })
      } else {
        structuredConcatFindings.push({
          prefix: classification.prefix,
          file: relativePath,
          line,
          expression
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
    const eligibleExtensions = [".tsx", ".jsx", ".vue", ".svelte", ".astro"]
    for (const file of files) {
      const ext = path.extname(file)
      if (eligibleExtensions.includes(ext)) {
        try {
          const content = fs.readFileSync(file, "utf8")
          const relativePath = normalizeDisplayPath(path.relative(cwd, file))
          const isJsx = [".tsx", ".jsx"].includes(ext)
          const candidates = scanTemplateTextNodes(content, isJsx)
          const lineOffsets = computeLineOffsets(content)
          const customIgnores = config.hardcoded?.ignore ?? []

          for (const cand of candidates) {
            if (!isHardcodedIgnored(cand.text, customIgnores)) {
              hardcodedFindings.push({
                file: relativePath,
                line: offsetToLine(lineOffsets, cand.offset),
                text: cand.text
              })
            }
          }
        } catch {
          // ignore read error
        }
      }
    }
  }

  // --- Pure checks ---
  const suffixes = config.pluralSuffixes ?? []
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
    activePlaceholderKeys.length > 0 ||
    keysOnlyInLanguages.length > 0 ||
    (options?.checkHardcoded && hardcodedFindings.length > 0)

  if (hasError) {
    log.error(
      "Validation failed. Please fix the missing keys, active placeholders, locale mismatches, or hardcoded strings."
    )
  } else {
    log.success("i18n Quality Validation passed successfully!\n")
  }

  return results
}
