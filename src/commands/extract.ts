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
  log
} from "../utils"

export function extract(
  config: I18nCopConfig,
  cwd: string = process.cwd()
): void {
  log.header("I18N-SHARPEN EXTRACTOR")

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

  for (const file of filesToScan) {
    try {
      const content = fs.readFileSync(file, "utf8")
      const cleanContent = stripComments(content)

      // Match functions
      let match
      keyRegex.lastIndex = 0
      while ((match = keyRegex.exec(cleanContent)) !== null) {
        const key = match[2]
        if (key.endsWith(".")) continue
        usedKeys.add(key)
      }

      // Match JSX attributes
      attrRegex.lastIndex = 0
      while ((match = attrRegex.exec(cleanContent)) !== null) {
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
        throw new Error(
          `Failed to parse locale file '${path.basename(langPath)}': ${(error as Error).message}`
        )
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
      console.log(`  + ${pc.green(key)}`)
    }
    try {
      writeLocaleFile(plan.langPath, plan.nestedJson)
      totalExtractedCount += plan.missingKeys.length
    } catch (error) {
      throw new Error(
        `Failed to write to file '${plan.langPath}': ${(error as Error).message}`
      )
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
