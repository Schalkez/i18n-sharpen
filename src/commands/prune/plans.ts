import * as path from "path"
import pc from "picocolors"
import type { I18nSharpenConfig, PruneResult } from "../../types"
import { I18nSharpenError } from "../../core/errors"
import { isKeyUsed } from "../../core/scanner"
import {
  flattenObject,
  unflattenObject,
  findLocaleFile,
  readLocaleFile,
  writeLocaleFile,
  loadNamespacedLocales
} from "../../core/locale-io"
import { log } from "../../utils"

type WritePlan = {
  lang: string
  langPath: string
  nestedJson: Record<string, unknown>
  prunedKeys: string[]
  /** Optional display label override (used by namespaced mode) */
  displayName?: string
}

/**
 * Execute prune write plans: log what will be removed, optionally write
 * files to disk, and return a structured PruneResult.
 */
export function executePrunePlans(
  writePlans: WritePlan[],
  perLocale: PruneResult["perLocale"],
  dryRun: boolean
): PruneResult {
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
    const displayName = plan.displayName ?? path.basename(plan.langPath)
    const verb = dryRun ? "Would prune" : "Pruning"
    log.info(
      `${verb} ${pc.yellow(plan.prunedKeys.length)} unused keys from ${pc.cyan(displayName)}`
    )
    const sample = plan.prunedKeys.slice(0, 10)
    for (const k of sample) {
      log.info(`  - ${pc.yellow(k)}`)
    }
    if (plan.prunedKeys.length > sample.length) {
      log.info(
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

  return { written, dryRun, perLocale, totalPruned: totalPrunedCount }
}

/**
 * Prune unused keys from flat locale files (one file per language).
 */
export function pruneFlat(
  config: I18nSharpenConfig,
  localesDirAbs: string,
  usedKeys: Set<string>,
  fileContents: string[],
  dryRun: boolean
): PruneResult {
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

  // Opt-in loose match
  if (config.looseKeyMatch) {
    for (const key of allLocaleKeys) {
      if (usedKeys.has(key)) continue
      const dq = `"${key}"`,
        sq = `'${key}'`,
        bq = `\`${key}\``
      for (const cleanContent of fileContents) {
        if (
          cleanContent.includes(dq) ||
          cleanContent.includes(sq) ||
          cleanContent.includes(bq)
        ) {
          usedKeys.add(key)
          break
        }
      }
    }
  }

  const suffixes = config.pluralSuffixes || []
  const isUsed = (key: string): boolean =>
    isKeyUsed(key, usedKeys, config.ignoreKeys, suffixes)

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
      if (isUsed(key)) {
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

  return executePrunePlans(writePlans, perLocale, dryRun)
}

/**
 * Prune unused keys from namespaced locale files (one directory per language,
 * one file per namespace).
 */
export function pruneNamespaced(
  config: I18nSharpenConfig,
  localesDirAbs: string,
  usedKeys: Set<string>,
  fileContents: string[],
  dryRun: boolean
): PruneResult {
  const suffixes = config.pluralSuffixes || []

  const { localesFlat, localeNamespaces } = loadNamespacedLocales(
    localesDirAbs,
    config.supportedLanguages
  )

  const allLocaleKeys = new Set<string>()
  for (const lang of config.supportedLanguages) {
    for (const key of Object.keys(localesFlat[lang] ?? {})) {
      allLocaleKeys.add(key)
    }
  }

  if (config.looseKeyMatch) {
    for (const key of allLocaleKeys) {
      if (usedKeys.has(key)) continue
      const dq = `"${key}"`,
        sq = `'${key}'`,
        bq = `\`${key}\``
      for (const cleanContent of fileContents) {
        if (
          cleanContent.includes(dq) ||
          cleanContent.includes(sq) ||
          cleanContent.includes(bq)
        ) {
          usedKeys.add(key)
          break
        }
      }
    }
  }

  const isUsed = (namespacedKey: string): boolean =>
    isKeyUsed(namespacedKey, usedKeys, config.ignoreKeys, suffixes)

  type NsPlan = {
    lang: string
    ns: string
    filePath: string
    nestedJson: Record<string, unknown>
    prunedKeys: string[]
  }
  const writePlans: NsPlan[] = []
  const perLocale: PruneResult["perLocale"] = []

  for (const lang of config.supportedLanguages) {
    const nsFilePaths = localeNamespaces[lang] ?? {}
    const langFlat = localesFlat[lang] ?? {}

    const keysByNs = new Map<string, Record<string, string>>()
    for (const [namespacedKey, value] of Object.entries(langFlat)) {
      const colonIdx = namespacedKey.indexOf(":")
      const ns = colonIdx >= 0 ? namespacedKey.slice(0, colonIdx) : "default"
      const keyPath =
        colonIdx >= 0 ? namespacedKey.slice(colonIdx + 1) : namespacedKey
      if (!keysByNs.has(ns)) keysByNs.set(ns, {})
      keysByNs.get(ns)![keyPath] = value
    }

    for (const [ns, nsFlatKeys] of keysByNs) {
      const filePath = nsFilePaths[ns]
      if (!filePath) continue

      const newFlatJson: Record<string, string> = {}
      const prunedKeys: string[] = []

      for (const keyPath of Object.keys(nsFlatKeys)) {
        const namespacedKey = `${ns}:${keyPath}`
        if (isUsed(namespacedKey)) {
          newFlatJson[keyPath] = nsFlatKeys[keyPath]
        } else {
          prunedKeys.push(keyPath)
        }
      }

      if (prunedKeys.length > 0) {
        const nestedJson = unflattenObject(newFlatJson)
        writePlans.push({ lang, ns, filePath, nestedJson, prunedKeys })
      } else {
        log.info(
          `✨ No unused keys to prune in ${pc.cyan(`${lang}/${ns}.json`)}.`
        )
      }

      perLocale.push({ lang, file: filePath, prunedKeys })
    }

    if (keysByNs.size === 0) {
      log.info(`✨ No locale files found for ${pc.cyan(lang)}.`)
    }
  }

  const flatPlans = writePlans.map((p) => ({
    lang: p.lang,
    langPath: p.filePath,
    nestedJson: p.nestedJson,
    prunedKeys: p.prunedKeys,
    displayName: `${p.lang}/${p.ns}.json`
  }))

  return executePrunePlans(flatPlans, perLocale, dryRun)
}
