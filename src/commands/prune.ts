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
  escapeRegex,
  isKeyUsed as sharedIsKeyUsed,
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

  // First pass: match exact t("key") or getTranslation("key").
  // MD-11: use matchAll so we don't depend on shared regex.lastIndex.
  for (const cleanContent of fileContents) {
    for (const match of cleanContent.matchAll(keyRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }

    for (const match of cleanContent.matchAll(attrRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }
  }

  // Load locale files and get all keys.
  // LO-05: drop the unused `localesData` accumulator — we only need the
  // flattened map for prune's purposes.
  const allLocaleKeys = new Set<string>()
  const localesFlat: Record<string, Record<string, string>> = {}
  const localeFilePaths: Record<string, string> = {}

  for (const lang of config.supportedLanguages) {
    const langPath = findLocaleFile(localesDirAbs, lang)
    if (langPath) {
      localeFilePaths[lang] = langPath
      try {
        const parsed = readLocaleFile(langPath)
        localesFlat[lang] = flattenObject(parsed)
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

  // Plural/Context suffix alignment helper — shared with validate.ts
  // through utils.isKeyUsed (LO-06).
  const suffixes = config.pluralSuffixes || []
  const isKeyUsed = (key: string): boolean =>
    sharedIsKeyUsed(key, usedKeys, config.ignoreKeys, suffixes)

  log.info(
    `Found ${pc.green(usedKeys.size)} unique translation keys referenced in code.`
  )

  // Two-phase: plan every file in memory, only commit writes after the
  // entire plan is computed. Each file is then written atomically via
  // writeLocaleFile (.tmp + rename). Prevents partial prune state when
  // one language fails mid-loop.
  type Plan = {
    langPath: string
    nestedJson: Record<string, unknown>
    prunedCount: number
  }
  const writePlans: Plan[] = []

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
      const nestedJson = unflattenObject(newFlatJson)
      writePlans.push({ langPath, nestedJson, prunedCount })
    } else {
      log.info(
        `✨ No unused keys to prune in ${pc.cyan(path.basename(langPath))}.`
      )
    }
  }

  let totalPrunedCount = 0
  for (const plan of writePlans) {
    log.info(
      `🧹 Pruning ${pc.yellow(plan.prunedCount)} unused keys from ${pc.cyan(path.basename(plan.langPath))}`
    )
    try {
      writeLocaleFile(plan.langPath, plan.nestedJson)
      totalPrunedCount += plan.prunedCount
    } catch (error) {
      throw new Error(
        `Failed to write to file '${plan.langPath}': ${(error as Error).message}`
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
