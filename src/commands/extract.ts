import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import { I18nSharpenError } from "@/core/errors"
import {
  flattenObject,
  unflattenObject,
  findLocaleFile,
  readLocaleFile,
  writeLocaleFile,
  writeLocaleFilesAtomic,
  loadNamespacedLocales,
  sortLocaleObject
} from "@/core/locale-io"
import { scanSourceFiles, detectUsedKeys } from "@/core/scanner"
import type { I18nSharpenConfig } from "@/types"
import { log } from "@/utils"
import { warnLegacyDefaultNamespace } from "./_shared/migration-warnings"

export async function extract(
  config: I18nSharpenConfig,
  cwd: string = process.cwd()
): Promise<void> {
  log.header("I18N-SHARPEN EXTRACTOR")

  const localesDirAbs = path.resolve(cwd, config.localesDir)

  if (!fs.existsSync(localesDirAbs)) {
    throw new I18nSharpenError({
      kind: "filesystem",
      message: `Locales directory not found: ${localesDirAbs}`,
      path: localesDirAbs
    })
  }

  // Scan source files and detect used keys
  const files = scanSourceFiles(config, cwd)
  const matchFunctions = config.matchFunctions ?? ["t", "getTranslation"]
  const matchAttributes = config.matchAttributes ?? ["i18nKey", "id"]
  const { usedKeys, parseErrors } = await detectUsedKeys(
    files,
    matchFunctions,
    matchAttributes,
    { cwd }
  )

  for (const err of parseErrors) {
    log.warn(
      `Parse warning: ${err.file}${err.line ? `:${err.line}` : ""}: ${err.message}`
    )
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
  // languages has a corrupt locale file.
  interface Plan {
    lang: string
    langPath: string
    nestedJson: Record<string, unknown>
    missingKeys: string[]
  }
  const writePlans: Plan[] = []
  const suffixes = config.pluralSuffixes ?? []

  for (const lang of config.supportedLanguages) {
    let langPath = findLocaleFile(localesDirAbs, lang)
    let flatJson: Record<string, string> = {}

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
      let exists = key in flatJson
      if (!exists) {
        for (const suffix of suffixes) {
          if (key + suffix in flatJson) {
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
        flatJson[key] = key
      }
      const nestedJson = unflattenObject(flatJson)
      const sortedNestedJson = sortLocaleObject(
        nestedJson,
        config.sortKeys ?? "preserve",
        usedKeys
      )
      writePlans.push({
        lang,
        langPath,
        nestedJson: sortedNestedJson,
        missingKeys
      })
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
  const suffixes = config.pluralSuffixes ?? []

  const { localesFlat, localeNamespaces } = loadNamespacedLocales(
    localesDirAbs,
    config.supportedLanguages
  )

  warnLegacyDefaultNamespace(config, localeNamespaces)

  interface NsPlan {
    lang: string
    ns: string
    filePath: string
    missingKeys: string[]
  }
  const writePlans: NsPlan[] = []

  for (const lang of config.supportedLanguages) {
    const existingFlat = localesFlat[lang] ?? {}
    const nsFilePaths = localeNamespaces[lang] ?? {}

    const missingByNs = new Map<string, string[]>()

    for (const fullKey of usedKeys) {
      const colonIdx = fullKey.indexOf(":")
      const ns =
        colonIdx >= 0
          ? fullKey.slice(0, colonIdx)
          : (config.defaultNamespace ?? "common")
      const keyPath = colonIdx >= 0 ? fullKey.slice(colonIdx + 1) : fullKey
      const namespacedKey = `${ns}:${keyPath}`

      let exists = namespacedKey in existingFlat
      if (!exists) {
        for (const suffix of suffixes) {
          if (`${ns}:${keyPath}${suffix}` in existingFlat) {
            exists = true
            break
          }
        }
      }
      if (!exists) {
        let arr = missingByNs.get(ns)
        if (!arr) {
          arr = []
          missingByNs.set(ns, arr)
        }
        arr.push(keyPath)
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

  interface WriteItem {
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
      fs.mkdirSync(langDir, { recursive: true })
    }

    for (const keyPath of plan.missingKeys) {
      existingFlat[keyPath] = keyPath
    }

    const nestedJson = unflattenObject(existingFlat)
    const nsKeyOrder = new Set<string>()
    for (const fullKey of usedKeys) {
      const colonIdx = fullKey.indexOf(":")
      const keyNs =
        colonIdx >= 0
          ? fullKey.slice(0, colonIdx)
          : (config.defaultNamespace ?? "common")
      if (keyNs === plan.ns) {
        const keyPath = colonIdx >= 0 ? fullKey.slice(colonIdx + 1) : fullKey
        nsKeyOrder.add(keyPath)
      }
    }
    const sortedNestedJson = sortLocaleObject(
      nestedJson,
      config.sortKeys ?? "preserve",
      nsKeyOrder
    )
    const displayLabel = `${plan.lang}/${plan.ns}.json`
    writeItems.push({
      filePath: plan.filePath,
      nestedJson: sortedNestedJson,
      missingKeys: plan.missingKeys,
      displayLabel
    })
  }

  let totalExtractedCount = 0

  // Phase 1: log what will be written (preserves existing UX)
  for (const item of writeItems) {
    log.info(
      `📥 Preparing to extract ${pc.green(item.missingKeys.length)} new keys to ${pc.cyan(item.displayLabel)}:`
    )
    for (const key of item.missingKeys) {
      log.info(`  + ${pc.green(key)}`)
    }
  }

  // Phase 2: atomic write across all namespace files
  writeLocaleFilesAtomic(
    writeItems.map((item) => ({
      filePath: item.filePath,
      nestedJson: item.nestedJson
    }))
  )

  for (const item of writeItems) {
    totalExtractedCount += item.missingKeys.length
  }

  if (totalExtractedCount > 0) {
    log.success("Locale files updated successfully!\n")
  } else {
    log.success(
      "All used translation keys are already present in locale files.\n"
    )
  }
}
