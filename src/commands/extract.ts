import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import type { I18nSharpenConfig } from "../types"
import { I18nSharpenError } from "../core/errors"
import {
  getFiles,
  stripComments,
  flattenObject,
  unflattenObject,
  findLocaleFile,
  readLocaleFile,
  writeLocaleFile,
  escapeRegex,
  log
} from "../utils"
import { loadNamespacedLocales } from "../core/locale-io"
import { buildAttrRegex } from "../core/scanner"

export function extract(
  config: I18nSharpenConfig,
  cwd: string = process.cwd()
): void {
  log.header("I18N-SHARPEN EXTRACTOR")

  const localesDirAbs = path.resolve(cwd, config.localesDir)

  if (!fs.existsSync(localesDirAbs)) {
    throw new I18nSharpenError({
      kind: "filesystem",
      message: `Locales directory not found: ${localesDirAbs}`,
      path: localesDirAbs
    })
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
    "\\b(?:" + functionsJoined + ")\\s*\\(\\s*(['\"`])([a-zA-Z0-9_\\-.:]+)\\1",
    "g"
  )

  const attrRegex = buildAttrRegex(config.matchAttributes || ["i18nKey", "id"])

  // MD-11: use matchAll instead of exec + lastIndex.
  for (const file of filesToScan) {
    try {
      const content = fs.readFileSync(file, "utf8")
      const cleanContent = stripComments(content)

      // Match functions
      for (const match of cleanContent.matchAll(keyRegex)) {
        const key = match[2]
        if (key.endsWith(".")) continue
        usedKeys.add(key)
      }

      // Match JSX attributes
      for (const match of cleanContent.matchAll(attrRegex)) {
        const key = match[2]
        if (key.endsWith(".")) continue
        usedKeys.add(key)
      }
    } catch {
      // Ignore read errors
    }
  }

  log.info(
    `Found ${pc.green(usedKeys.size)} unique translation keys referenced in code.`
  )

  if (config.localesLayout === "namespaced") {
    extractNamespaced(config, localesDirAbs, usedKeys)
  } else {
    extractFlat(config, localesDirAbs, usedKeys)
  }
}

/**
 * Extract missing keys into flat locale files (one file per language).
 * This is the default (pre-Phase 7) behavior.
 */
function extractFlat(
  config: I18nSharpenConfig,
  localesDirAbs: string,
  usedKeys: Set<string>
): void {
  // Two-phase write: parse every existing locale file up-front and
  // compute the new flat map. Only after every parse succeeds do we
  // write anything. Prevents partial extraction when one of several
  // languages has a corrupt locale file. (HI-08, MD-08 atomic writes
  // implemented inside writeLocaleFile.)
  type Plan = {
    lang: string
    langPath: string
    nestedJson: Record<string, unknown>
    missingKeys: string[]
  }
  const writePlans: Plan[] = []
  const suffixes = config.pluralSuffixes || []

  for (const lang of config.supportedLanguages) {
    let langPath = findLocaleFile(localesDirAbs, lang)
    let flatJson: Record<string, string> = {}

    // If file does not exist, default to .json format
    if (!langPath) {
      langPath = path.join(localesDirAbs, `${lang}.json`)
    } else {
      try {
        const langJson = readLocaleFile(langPath)
        flatJson = flattenObject(langJson)
      } catch (error) {
        throw new I18nSharpenError({
          kind: "parse",
          message: `Failed to parse locale file '${path.basename(langPath)}': ${(error as Error).message}`,
          path: langPath
        })
      }
    }

    const missingKeys: string[] = []
    for (const key of usedKeys) {
      let exists = flatJson[key] !== undefined
      if (!exists) {
        for (const suffix of suffixes) {
          if (flatJson[key + suffix] !== undefined) {
            exists = true
            break
          }
        }
      }
      if (!exists) {
        missingKeys.push(key)
      }
    }

    if (missingKeys.length > 0) {
      missingKeys.sort()
      for (const key of missingKeys) {
        flatJson[key] = key // default translation is the key path itself
      }
      const nestedJson = unflattenObject(flatJson)
      writePlans.push({ lang, langPath, nestedJson, missingKeys })
    } else {
      log.info(
        `✨ No new keys to extract for ${pc.cyan(path.basename(langPath))}.`
      )
    }
  }

  let totalExtractedCount = 0
  for (const plan of writePlans) {
    log.info(
      `📥 Extracting ${pc.green(plan.missingKeys.length)} new keys to ${pc.cyan(path.basename(plan.langPath))}:`
    )
    for (const key of plan.missingKeys) {
      log.info(`  + ${pc.green(key)}`)
    }
    try {
      writeLocaleFile(plan.langPath, plan.nestedJson)
      totalExtractedCount += plan.missingKeys.length
    } catch (error) {
      throw new I18nSharpenError({
        kind: "filesystem",
        message: `Failed to write to file '${plan.langPath}': ${(error as Error).message}`,
        path: plan.langPath,
        cause: error
      })
    }
  }

  if (totalExtractedCount > 0) {
    log.success("Locale files updated successfully!\n")
  } else {
    log.success(
      "All used translation keys are already present in locale files.\n"
    )
  }
}

/**
 * Extract missing keys into namespaced locale files.
 * Keys with a colon prefix (`namespace:key.path`) are routed to the
 * appropriate namespace file (`<localesDir>/<lang>/<namespace>.json`).
 * Keys without a colon go into `default.json`.
 */
function extractNamespaced(
  config: I18nSharpenConfig,
  localesDirAbs: string,
  usedKeys: Set<string>
): void {
  const suffixes = config.pluralSuffixes || []

  // Load existing namespaced locales so we know what's already present.
  const { localesFlat, localeNamespaces } = loadNamespacedLocales(
    localesDirAbs,
    config.supportedLanguages
  )

  type NsPlan = {
    lang: string
    ns: string
    filePath: string
    /** Flat key paths WITHIN the namespace (no `ns:` prefix) */
    missingKeys: string[]
  }
  const writePlans: NsPlan[] = []

  for (const lang of config.supportedLanguages) {
    const existingFlat = localesFlat[lang] ?? {}
    const nsFilePaths = localeNamespaces[lang] ?? {}

    // Group missing keys by namespace
    const missingByNs = new Map<string, string[]>()

    for (const fullKey of usedKeys) {
      // fullKey may be "ns:key.path" or "key.path" (no namespace)
      const colonIdx = fullKey.indexOf(":")
      const ns = colonIdx >= 0 ? fullKey.slice(0, colonIdx) : "default"
      const keyPath = colonIdx >= 0 ? fullKey.slice(colonIdx + 1) : fullKey
      const namespacedKey = `${ns}:${keyPath}`

      let exists = existingFlat[namespacedKey] !== undefined
      if (!exists) {
        for (const suffix of suffixes) {
          if (existingFlat[`${ns}:${keyPath}${suffix}`] !== undefined) {
            exists = true
            break
          }
        }
      }
      if (!exists) {
        if (!missingByNs.has(ns)) missingByNs.set(ns, [])
        missingByNs.get(ns)!.push(keyPath)
      }
    }

    for (const [ns, missingKeys] of missingByNs) {
      missingKeys.sort()
      const langDir = path.join(localesDirAbs, lang)
      const filePath = nsFilePaths[ns] ?? path.join(langDir, `${ns}.json`)
      writePlans.push({ lang, ns, filePath, missingKeys })
    }

    if (missingByNs.size === 0) {
      log.info(`✨ No new keys to extract for ${pc.cyan(lang)} (namespaced).`)
    }
  }

  // Two-phase: read existing namespace files, merge new keys, then write.
  type WriteItem = {
    filePath: string
    nestedJson: Record<string, unknown>
    missingKeys: string[]
    displayLabel: string
  }
  const writeItems: WriteItem[] = []

  for (const plan of writePlans) {
    const langDir = path.dirname(plan.filePath)
    let existingFlat: Record<string, string> = {}

    if (fs.existsSync(plan.filePath)) {
      try {
        existingFlat = flattenObject(readLocaleFile(plan.filePath))
      } catch (error) {
        throw new I18nSharpenError({
          kind: "parse",
          message: `Failed to parse namespace file '${plan.filePath}': ${(error as Error).message}`,
          path: plan.filePath
        })
      }
    } else {
      // Ensure the language directory exists before writing.
      fs.mkdirSync(langDir, { recursive: true })
    }

    for (const keyPath of plan.missingKeys) {
      existingFlat[keyPath] = keyPath // default: key path as value
    }

    const nestedJson = unflattenObject(existingFlat)
    const displayLabel = `${plan.lang}/${plan.ns}.json`
    writeItems.push({
      filePath: plan.filePath,
      nestedJson,
      missingKeys: plan.missingKeys,
      displayLabel
    })
  }

  let totalExtractedCount = 0
  for (const item of writeItems) {
    log.info(
      `📥 Extracting ${pc.green(item.missingKeys.length)} new keys to ${pc.cyan(item.displayLabel)}:`
    )
    for (const key of item.missingKeys) {
      log.info(`  + ${pc.green(key)}`)
    }
    try {
      writeLocaleFile(item.filePath, item.nestedJson)
      totalExtractedCount += item.missingKeys.length
    } catch (error) {
      throw new I18nSharpenError({
        kind: "filesystem",
        message: `Failed to write to file '${item.filePath}': ${(error as Error).message}`,
        path: item.filePath,
        cause: error
      })
    }
  }

  if (totalExtractedCount > 0) {
    log.success("Locale files updated successfully!\n")
  } else {
    log.success(
      "All used translation keys are already present in locale files.\n"
    )
  }
}
