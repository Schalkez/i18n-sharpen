import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import type { I18nSharpenConfig, PruneOptions, PruneResult } from "../types"
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
  isKeyUsed as sharedIsKeyUsed,
  log
} from "../utils"

/**
 * Prune unused keys from locale files.
 *
 * Phase 6: safe-by-default. By default `prune` runs in dry-run mode and
 * will NOT modify any locale file — it only prints a preview of what
 * WOULD be removed. To actually write, set one of:
 *
 *   - `config.prune.force: true` in i18n-sharpen.json
 *   - `--force` on the CLI
 *   - `prune(config, cwd, { force: true })` programmatically
 *
 * `--dry-run` / `{ dryRun: true }` always wins over `force` to make
 * preview-in-CI scripts robust.
 */
export function prune(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options: PruneOptions = {}
): PruneResult {
  log.header("I18N-SHARPEN PRUNER")

  // Effective mode: dryRun beats force; otherwise honor force from
  // options first, then config.prune.force, defaulting to false (= dry).
  const configForce = config.prune?.force === true
  const optForce = options.force === true
  const optDryRun = options.dryRun === true
  const dryRun = optDryRun ? true : !(optForce || configForce)

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
        throw new I18nSharpenError({
          kind: "parse",
          message: `Failed to parse locale file '${path.basename(langPath)}': ${(error as Error).message}`,
          path: langPath
        })
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
    lang: string
    langPath: string
    nestedJson: Record<string, unknown>
    prunedKeys: string[]
  }
  const writePlans: Plan[] = []
  const perLocale: PruneResult["perLocale"] = []

  for (const lang of config.supportedLanguages) {
    const langPath = localeFilePaths[lang]
    if (!langPath) continue

    const flatJson = localesFlat[lang]
    const newFlatJson: Record<string, string> = {}
    const prunedKeys: string[] = []

    for (const key in flatJson) {
      if (isKeyUsed(key)) {
        newFlatJson[key] = flatJson[key]
      } else {
        prunedKeys.push(key)
      }
    }

    if (prunedKeys.length > 0) {
      const nestedJson = unflattenObject(newFlatJson)
      writePlans.push({ lang, langPath, nestedJson, prunedKeys })
    } else {
      log.info(
        `✨ No unused keys to prune in ${pc.cyan(path.basename(langPath))}.`
      )
    }
    perLocale.push({ lang, file: langPath, prunedKeys })
  }

  let totalPrunedCount = 0
  let written = false

  if (dryRun) {
    log.header(
      writePlans.length === 0
        ? "PRUNE PREVIEW (no changes)"
        : "PRUNE PREVIEW (dry-run — no files written)"
    )
  }

  for (const plan of writePlans) {
    const verb = dryRun ? "Would prune" : "🧹 Pruning"
    log.info(
      `${verb} ${pc.yellow(plan.prunedKeys.length)} unused keys from ${pc.cyan(path.basename(plan.langPath))}`
    )
    // Show a sample of up to 10 keys per file so CI logs stay readable
    // but the user always has something concrete to inspect.
    const sample = plan.prunedKeys.slice(0, 10)
    for (const k of sample) {
      console.log(`  - ${pc.yellow(k)}`)
    }
    if (plan.prunedKeys.length > sample.length) {
      console.log(
        `  ... and ${plan.prunedKeys.length - sample.length} more (run with verbose flag to see all)`
      )
    }

    if (!dryRun) {
      try {
        writeLocaleFile(plan.langPath, plan.nestedJson)
        totalPrunedCount += plan.prunedKeys.length
        written = true
      } catch (error) {
        throw new I18nSharpenError({
          kind: "filesystem",
          message: `Failed to write to file '${plan.langPath}': ${(error as Error).message}`,
          path: plan.langPath,
          cause: error
        })
      }
    } else {
      totalPrunedCount += plan.prunedKeys.length
    }
  }

  if (dryRun) {
    if (totalPrunedCount > 0) {
      log.warn(
        `Dry-run: ${totalPrunedCount} key${totalPrunedCount === 1 ? "" : "s"} would be removed. Re-run with --force (or set prune.force: true in config) to apply.\n`
      )
    } else {
      log.success("Dry-run: no unused keys found to prune.\n")
    }
  } else if (totalPrunedCount > 0) {
    log.success(
      `Files have been successfully cleaned! Total pruned: ${totalPrunedCount} keys.\n`
    )
  } else {
    log.success("No unused keys found to prune.\n")
  }

  return {
    written,
    dryRun,
    perLocale,
    totalPruned: totalPrunedCount
  }
}
