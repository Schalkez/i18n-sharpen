import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import type { I18nCopConfig } from "../types"
import {
  getFiles,
  stripComments,
  flattenObject,
  unflattenObject,
  findLocaleFile,
  readLocaleFile,
  writeLocaleFile,
  matchWildcard,
  escapeRegex,
  log
} from "../utils"

export function prune(
  config: I18nCopConfig,
  cwd: string = process.cwd()
): void {
  log.header("I18N-SHARPEN PRUNER")

  const localesDirAbs = path.resolve(cwd, config.localesDir)

  if (!fs.existsSync(localesDirAbs)) {
    throw new Error(`Locales directory not found: ${localesDirAbs}`)
  }

  // Find all source files
  const filesToScan: string[] = []
  for (const scanDir of config.scanDirs) {
    const scanDirAbs = path.resolve(cwd, scanDir)
    if (fs.existsSync(scanDirAbs)) {
      filesToScan.push(
        ...getFiles(
          scanDirAbs,
          config.fileExtensions || [],
          config.excludeDirs || []
        )
      )
    }
  }

  // Scan source files for translation keys
  const usedKeys = new Set<string>()
  // Escape user-supplied config entries to prevent regex injection / ReDoS.
  const functionsJoined = (config.matchFunctions || ["t", "getTranslation"])
    .map(escapeRegex)
    .join("|")
  const keyRegex = new RegExp(
    "\\b(?:" + functionsJoined + ")\\s*\\(\\s*(['\"`])([a-zA-Z0-9_\\-.]+)\\1",
    "g"
  )

  const attrsJoined = (config.matchAttributes || ["i18nKey", "id"])
    .map(escapeRegex)
    .join("|")
  const attrRegex = new RegExp(
    "\\b(?:" + attrsJoined + ")\\s*=\\s*(['\"`])([a-zA-Z0-9_\\-.]+)\\1",
    "g"
  )

  const fileContents = filesToScan.map((file) => {
    try {
      const content = fs.readFileSync(file, "utf8")
      return stripComments(content)
    } catch {
      return ""
    }
  })

  // First pass: match exact t("key") or getTranslation("key")
  for (const cleanContent of fileContents) {
    let match
    keyRegex.lastIndex = 0
    while ((match = keyRegex.exec(cleanContent)) !== null) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }

    attrRegex.lastIndex = 0
    while ((match = attrRegex.exec(cleanContent)) !== null) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }
  }

  // Load locale files and get all keys
  const allLocaleKeys = new Set<string>()
  const localesData: Record<string, Record<string, unknown>> = {}
  const localesFlat: Record<string, Record<string, string>> = {}
  const localeFilePaths: Record<string, string> = {}

  for (const lang of config.supportedLanguages) {
    const langPath = findLocaleFile(localesDirAbs, lang)
    if (langPath) {
      localeFilePaths[lang] = langPath
      try {
        localesData[lang] = readLocaleFile(langPath)
        localesFlat[lang] = flattenObject(localesData[lang])
        Object.keys(localesFlat[lang]).forEach((key) => allLocaleKeys.add(key))
      } catch (error) {
        throw new Error(
          `Failed to parse locale file '${path.basename(langPath)}': ${(error as Error).message}`
        )
      }
    }
  }

  // Second pass: opt-in loose match (config.looseKeyMatch). When enabled,
  // marks a locale key as "used" if its quoted form appears anywhere in
  // scanned source — even outside a t(...)/attr=... call. Default-off
  // because it keeps stale keys around forever and short keys collide
  // with unrelated string literals.
  if (config.looseKeyMatch) {
    for (const key of allLocaleKeys) {
      if (usedKeys.has(key)) continue

      const doubleQuote = `"${key}"`
      const singleQuote = `'${key}'`
      const backtickQuote = `\`${key}\``

      for (const cleanContent of fileContents) {
        if (
          cleanContent.includes(doubleQuote) ||
          cleanContent.includes(singleQuote) ||
          cleanContent.includes(backtickQuote)
        ) {
          usedKeys.add(key)
          break
        }
      }
    }
  }

  // Plural/Context suffix alignment helper
  const suffixes = config.pluralSuffixes || []

  function getBaseKey(key: string): string {
    for (const suffix of suffixes) {
      if (key.endsWith(suffix)) {
        return key.slice(0, -suffix.length)
      }
    }
    return key
  }

  function isKeyUsed(key: string): boolean {
    // Exact match
    if (usedKeys.has(key)) return true

    // Whitelisted in ignoreKeys (wildcard match)
    if (config.ignoreKeys) {
      for (const pattern of config.ignoreKeys) {
        if (matchWildcard(pattern, key)) {
          return true
        }
      }
    }

    // Check if key is a plural suffix variant of a used key
    const baseKey = getBaseKey(key)
    if (baseKey !== key && usedKeys.has(baseKey)) {
      return true
    }

    return false
  }

  log.info(
    `Found ${pc.green(usedKeys.size)} unique translation keys referenced in code.`
  )

  let totalPrunedCount = 0

  for (const lang of config.supportedLanguages) {
    const langPath = localeFilePaths[lang]
    if (!langPath) continue

    const flatJson = localesFlat[lang]
    const newFlatJson: Record<string, string> = {}
    let prunedCount = 0

    for (const key in flatJson) {
      if (isKeyUsed(key)) {
        newFlatJson[key] = flatJson[key]
      } else {
        prunedCount++
      }
    }

    if (prunedCount > 0) {
      log.info(
        `🧹 Pruning ${pc.yellow(prunedCount)} unused keys from ${pc.cyan(path.basename(langPath))}`
      )
      const nestedJson = unflattenObject(newFlatJson)
      try {
        writeLocaleFile(langPath, nestedJson)
        totalPrunedCount += prunedCount
      } catch (error) {
        throw new Error(
          `Failed to write to file '${langPath}': ${(error as Error).message}`
        )
      }
    } else {
      log.info(
        `✨ No unused keys to prune in ${pc.cyan(path.basename(langPath))}.`
      )
    }
  }

  if (totalPrunedCount > 0) {
    log.success(
      `Files have been successfully cleaned! Total pruned: ${totalPrunedCount} keys.\n`
    )
  } else {
    log.success("No unused keys found to prune.\n")
  }
}
