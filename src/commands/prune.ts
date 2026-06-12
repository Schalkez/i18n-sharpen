import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import { I18nSharpenError } from "@/core/errors"
import { scanSourceFiles, detectUsedKeys } from "@/core/scanner"
import type { I18nSharpenConfig, PruneOptions, PruneResult } from "@/types"
import { log } from "@/utils"
import {
  runInteractivePrune,
  InteractiveCancelledError,
  type InteractivePruneOptions
} from "./prune/interactive"
import {
  pruneFlat,
  pruneNamespaced,
  collectFlatCandidates,
  collectNamespacedCandidates
} from "./prune/plans"

/** @internal — tests inject a fake stdin/stdout for the interactive branch. */
let _interactiveIOOverride: InteractivePruneOptions | undefined
export function __setInteractiveIOForTests(
  opts: InteractivePruneOptions | undefined
): void {
  _interactiveIOOverride = opts
}

/**
 * Prune unused keys from locale files.
 *
 * Safe-by-default: runs in dry-run mode unless force is explicitly set via
 * config.prune.force, options.force, or --force CLI flag.
 * options.dryRun always wins over force.
 */
export async function prune(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options: PruneOptions = {}
): Promise<PruneResult> {
  log.header("I18N-SHARPEN PRUNER")

  const configForce = config.prune?.force === true
  const optForce = options.force === true
  const optDryRun = options.dryRun === true
  let dryRun = optDryRun ? true : !(optForce || configForce)

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

  log.info(
    `Found ${pc.green(usedKeys.size)} unique translation keys referenced in code.`
  )

  let activeConfig = config
  if (config.autoIgnoreDynamicPrefixes !== false) {
    const dynamicPrefixes = new Set<string>()
    for (const r of parsedResults) {
      for (const dc of r.dynamicCalls) {
        if (dc.classification === "structured-concat" && dc.prefix) {
          dynamicPrefixes.add(dc.prefix)
        }
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

  const wantInteractive = options.interactive === true

  // ───── Non-interactive path (Phases 1-2 behavior, untouched) ─────
  if (!wantInteractive) {
    if (activeConfig.localesLayout === "namespaced") {
      return pruneNamespaced(
        activeConfig,
        localesDirAbs,
        usedKeys,
        fileContents,
        dryRun
      )
    }
    return pruneFlat(
      activeConfig,
      localesDirAbs,
      usedKeys,
      fileContents,
      dryRun
    )
  }

  // ───── Interactive path (Phase 3 D-13..D-17) ─────
  const isTTY =
    _interactiveIOOverride !== undefined ||
    (process.stdin.isTTY && process.stdout.isTTY) // D-13: BOTH sides

  // D-14 / D-15: non-TTY fallback
  if (!isTTY) {
    if (optForce || configForce) {
      // D-15 verbatim two-line warning — the safety-critical gate
      log.warn(
        "--interactive requires a TTY; --force ignored to avoid unintended bulk prune.\nFalling back to dry-run preview of all candidates."
      )
    } else {
      // D-14 verbatim single-line warning
      log.warn(
        "--interactive requires a TTY; falling back to dry-run preview of all candidates."
      )
    }
    // Force dry-run regardless of force/configForce (D-15 safety override)
    dryRun = true
    if (activeConfig.localesLayout === "namespaced") {
      return pruneNamespaced(
        activeConfig,
        localesDirAbs,
        usedKeys,
        fileContents,
        dryRun
      )
    }
    return pruneFlat(
      activeConfig,
      localesDirAbs,
      usedKeys,
      fileContents,
      dryRun
    )
  }

  // TTY path: compute candidates and decide short-circuit (D-16) or launch TUI
  const isNamespaced = activeConfig.localesLayout === "namespaced"
  const candidates = isNamespaced
    ? collectNamespacedCandidates(
        activeConfig,
        localesDirAbs,
        usedKeys,
        fileContents
      )
    : collectFlatCandidates(activeConfig, localesDirAbs, usedKeys, fileContents)

  if (candidates.length === 0) {
    // D-16: skip TUI entirely — defer to the existing pipeline which logs
    // the standard "✨ No unused keys" message.
    if (isNamespaced) {
      return pruneNamespaced(
        activeConfig,
        localesDirAbs,
        usedKeys,
        fileContents,
        dryRun
      )
    }
    return pruneFlat(
      activeConfig,
      localesDirAbs,
      usedKeys,
      fileContents,
      dryRun
    )
  }

  const stdoutStream = _interactiveIOOverride?.stdout ?? process.stdout
  const termRows = stdoutStream.rows ?? 24
  if (candidates.length + 1 > termRows) {
    log.warn(
      `Interactive picker needs ${candidates.length + 1} rows but the terminal has ${termRows}. ` +
        `Falling back to dry-run preview — resize the terminal taller, or narrow the scope, then re-run.`
    )
    dryRun = true
    if (isNamespaced) {
      return pruneNamespaced(
        activeConfig,
        localesDirAbs,
        usedKeys,
        fileContents,
        dryRun
      )
    }
    return pruneFlat(
      activeConfig,
      localesDirAbs,
      usedKeys,
      fileContents,
      dryRun
    )
  }

  // Launch the TUI
  let tuiResult
  try {
    tuiResult = await runInteractivePrune(candidates, _interactiveIOOverride)
  } catch (e) {
    if (e instanceof InteractiveCancelledError) {
      // D-17: SIGINT cancel path. Set process.exitCode = 130 defensively.
      process.exitCode = 130
      return { written: false, dryRun: true, perLocale: [], totalPruned: 0 }
    }
    throw e
  }

  if (tuiResult.cancelled) {
    // Esc path — IPRUNE-04: process.exitCode = 130, no writes
    process.exitCode = 130
    return { written: false, dryRun: true, perLocale: [], totalPruned: 0 }
  }

  // D-05: checked rows = toDelete. Kept = candidates − toDelete.
  const kept = candidates.filter((c) => !tuiResult.toDelete.has(c))
  const removedCount = tuiResult.toDelete.size

  // Augment usedKeys with kept candidates to preserve them in locale files.
  const augmentedUsedKeys = new Set(usedKeys)
  for (const candidate of kept) {
    augmentedUsedKeys.add(candidate)
  }

  const interactiveSummary = { kept: kept.length, removed: removedCount }

  if (isNamespaced) {
    return pruneNamespaced(
      activeConfig,
      localesDirAbs,
      augmentedUsedKeys,
      fileContents,
      dryRun,
      interactiveSummary
    )
  }
  return pruneFlat(
    activeConfig,
    localesDirAbs,
    augmentedUsedKeys,
    fileContents,
    dryRun,
    interactiveSummary
  )
}
