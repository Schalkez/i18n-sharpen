import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import type { I18nSharpenConfig, PruneOptions, PruneResult } from "../types"
import { I18nSharpenError } from "../core/errors"
import { scanSourceFiles, detectUsedKeys } from "../core/scanner"
import { log } from "../utils"
import { pruneFlat, pruneNamespaced } from "./prune/plans"

/**
 * Prune unused keys from locale files.
 *
 * Safe-by-default: runs in dry-run mode unless force is explicitly set via
 * config.prune.force, options.force, or --force CLI flag.
 * options.dryRun always wins over force.
 */
export function prune(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options: PruneOptions = {}
): PruneResult {
  log.header("I18N-SHARPEN PRUNER")

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

  // Scan source files and detect used keys
  const files = scanSourceFiles(config, cwd)
  const matchFunctions = config.matchFunctions || ["t", "getTranslation"]
  const matchAttributes = config.matchAttributes || ["i18nKey", "id"]
  const { usedKeys, fileContents } = detectUsedKeys(
    files,
    matchFunctions,
    matchAttributes
  )

  log.info(
    `Found ${pc.green(usedKeys.size)} unique translation keys referenced in code.`
  )

  if (config.localesLayout === "namespaced") {
    return pruneNamespaced(
      config,
      localesDirAbs,
      usedKeys,
      fileContents,
      dryRun
    )
  }
  return pruneFlat(config, localesDirAbs, usedKeys, fileContents, dryRun)
}
