import pc from "picocolors"
import { getBaseKey } from "@/core/scanner"
import type { ValidationResults } from "@/types"
import { log } from "@/utils"

export interface KeyToFilesLookup {
  has(key: string): boolean
  get(key: string): string[] | undefined
}

/**
 * Print all validation results to the console. Separated from the
 * orchestrator so the pure check functions stay side-effect-free.
 */
export function printValidationResults(
  results: ValidationResults,
  keyToFilesMap: KeyToFilesLookup,
  pluralSuffixes: string[]
): void {
  const {
    missingKeys,
    activePlaceholderKeys,
    unusedKeys,
    unusedPlaceholderKeys,
    keysOnlyInLanguages
  } = results

  const getBK = (key: string): string => getBaseKey(key, pluralSuffixes)

  log.header("VALIDATION RESULTS")

  // 1. Missing keys
  if (missingKeys.length > 0) {
    log.info(pc.bold(pc.red(`❌ Missing Keys (${missingKeys.length}):`)))
    missingKeys.sort().forEach((key) => {
      const files = keyToFilesMap.get(key) ?? []
      log.info(`  - ${pc.red(key)} (referenced in: ${files.join(", ")})`)
    })
  } else {
    log.success("Zero missing keys detected in the source code!")
  }

  // 2. Active placeholders
  if (activePlaceholderKeys.length > 0) {
    log.info(
      `\n${pc.bold(pc.red(`❌ Active Placeholder/Untranslated Keys Used in Code (${activePlaceholderKeys.length}):`))}`
    )
    activePlaceholderKeys
      .sort((a, b) => a.key.localeCompare(b.key))
      .forEach(({ key, lang }) => {
        const direct = keyToFilesMap.get(key)
        const baseKey = getBK(key)
        const baseFiles =
          baseKey !== key ? keyToFilesMap.get(baseKey) : undefined
        const files = direct ?? baseFiles ?? []
        log.info(
          `  - [${lang.toUpperCase()}] ${pc.red(key)} ${files.length > 0 ? `(referenced in: ${files.join(", ")})` : ""}`
        )
      })
  } else {
    log.success("Zero active placeholder keys detected in the source code!")
  }

  // 2.5. Hardcoded strings
  if (results.hardcodedStrings && results.hardcodedStrings.length > 0) {
    log.info(
      `\n${pc.bold(pc.red(`❌ Hardcoded Strings found (${results.hardcodedStrings.length}):`))}`
    )
    results.hardcodedStrings.forEach((f) => {
      log.info(`  - ${pc.cyan(`${f.file}:${f.line}`)}  "${pc.red(f.text)}"`)
    })
  } else if (results.hardcodedStrings !== undefined) {
    log.success("\nZero un-translated hardcoded strings detected!")
  }

  // 3. Locale alignment
  if (keysOnlyInLanguages.length > 0) {
    log.info(`\n${pc.bold(pc.red("❌ Locale Alignment Mismatches:"))}`)
    for (const mismatch of keysOnlyInLanguages) {
      log.info(
        `  ${pc.yellow(`Keys present in ${mismatch.from} but missing in ${mismatch.to} (${mismatch.keys.length}):`)}`
      )
      mismatch.keys
        .slice()
        .sort()
        .forEach((k) => {
          log.info(`    - ${k}`)
        })
    }
  } else {
    log.success("Perfect key alignment across all locale files!")
  }

  // 4. Unused keys (warning only)
  if (unusedKeys.length > 0) {
    log.info(
      `\n${pc.bold(pc.yellow(`⚠️  Unused Keys in locales (${unusedKeys.length}):`))}`
    )
    unusedKeys.sort().forEach((key) => {
      log.info(`  - ${pc.yellow(key)}`)
    })
  } else {
    log.success(
      "Zero unused keys detected! All defined keys are referenced in code."
    )
  }

  // 5. Unused placeholders (warning only)
  if (unusedPlaceholderKeys.length > 0) {
    log.info(
      `\n${pc.bold(pc.yellow(`⚠️  Unused Placeholder Keys in locales (${unusedPlaceholderKeys.length}):`))}`
    )
    unusedPlaceholderKeys
      .sort((a, b) => a.key.localeCompare(b.key))
      .forEach(({ key, lang }) => {
        log.info(`  - [${lang.toUpperCase()}] ${pc.yellow(key)}`)
      })
  }

  // Quality metrics summary
  log.header("QUALITY METRICS SUMMARY")
  log.info(
    `- Translation Key Coverage (Code -> Locales): ${pc.bold(results.codeKeyCoverage === "100.00" ? pc.green(results.codeKeyCoverage + "%") : pc.red(results.codeKeyCoverage + "%"))}`
  )
  log.info(
    `- Translation Key Utilization (Locales -> Code): ${pc.bold(pc.magenta(results.utilizationPercent + "%"))}`
  )
  log.info(`- Total Defined Keys: ${pc.bold(results.totalDefinedKeys)}`)
  log.info(`- Actually Used in Code: ${pc.bold(results.usedDefinedKeysCount)}`)
  log.info(`- Missing/Undefined: ${pc.bold(missingKeys.length)}`)
  log.info(`- Unused/Stale: ${pc.bold(unusedKeys.length)}`)
}

/**
 * Print the grouped dynamic-key summary that replaces the v0.2.x
 * per-call log.warn. Per Phase 2 D-08 (console verbose) + D-13
 * (grouped end-of-validate). Suppressed entries (D-12) are already
 * removed from the input arrays by the validator.
 *
 * Output shape:
 *
 *   Fully-dynamic keys (N):
 *     - src/auth.ts:42  t(getKey())
 *
 *   Structured-concat keys (M):
 *     - error.  ← t(`error.${err.code}`) (src/auth.ts:42)
 *
 * Silent (no header) when both arrays are empty.
 */
export function printDynamicKeysSummary(dynamicKeys: {
  fullyDynamic: { file: string; line: number; expression: string }[]
  structuredConcat: {
    prefix: string
    file: string
    line: number
    expression: string
  }[]
}): void {
  const { fullyDynamic, structuredConcat } = dynamicKeys
  if (fullyDynamic.length === 0 && structuredConcat.length === 0) return

  log.header("DYNAMIC KEYS")

  if (fullyDynamic.length > 0) {
    log.info(
      pc.bold(pc.yellow(`⚠️  Fully-dynamic keys (${fullyDynamic.length}):`))
    )
    for (const f of fullyDynamic) {
      log.info(
        `  - ${pc.cyan(`${f.file}:${f.line}`)}  ${pc.yellow(f.expression)}`
      )
    }
  }

  if (structuredConcat.length > 0) {
    log.info(
      pc.bold(
        pc.yellow(`⚠️  Structured-concat keys (${structuredConcat.length}):`)
      )
    )
    for (const f of structuredConcat) {
      log.info(
        `  - ${pc.green(f.prefix)}  ← ${pc.yellow(f.expression)} (${pc.cyan(
          `${f.file}:${f.line}`
        )})`
      )
    }
  }
}
