import * as fs from "fs"
import * as path from "path"
import type { ValidationResults, LocaleAlignmentMismatch } from "../../types"
import { normalizeDisplayPath } from "../../core/locale-io"
import { log } from "../../utils"
import pc from "picocolors"

/**
 * A lookup interface that the validator builds during scanning and the
 * report consumes. Kept narrow so the report module is decoupled from
 * the (Set-backed) implementation in the validator orchestrator.
 */
export interface KeyToFilesLookup {
  has(key: string): boolean
  get(key: string): string[] | undefined
}

/**
 * Render and persist the markdown coverage report when `outputReport`
 * is set. Returns the resolved report path (or null when disabled).
 *
 * Kept side-effect-free aside from the single mkdirSync/writeFileSync
 * pair so it's trivial to test by snapshotting the returned content via
 * `renderMarkdownReport`.
 */
export function writeMarkdownReport(args: {
  cwd: string
  outputReport: string
  defaultBasename: string
  results: ValidationResults
  keyToFilesMap: KeyToFilesLookup
  getBaseKey: (key: string) => string
}): string {
  const reportPath = path.resolve(args.cwd, args.outputReport)
  const markdownContent = renderMarkdownReport(args)
  // Ensure parent directory exists before writing the report.
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, markdownContent, "utf8")
  log.info(
    `💾 Markdown report saved to: ${pc.cyan(normalizeDisplayPath(path.relative(args.cwd, reportPath)))}\n`
  )
  return reportPath
}

/**
 * Render the markdown coverage report as a string. Exposed for tests
 * that don't want to hit the filesystem.
 */
export function renderMarkdownReport(args: {
  defaultBasename: string
  results: ValidationResults
  keyToFilesMap: KeyToFilesLookup
  getBaseKey: (key: string) => string
}): string {
  const {
    missingKeys,
    activePlaceholderKeys,
    unusedKeys,
    unusedPlaceholderKeys,
    keysOnlyInLanguages,
    codeKeyCoverage,
    utilizationPercent,
    totalDefinedKeys,
    usedDefinedKeysCount
  } = args.results
  const { keyToFilesMap, getBaseKey, defaultBasename } = args

  return `# i18n Quality and Coverage Report

Generated on: ${new Date().toISOString()}

## Quality Metrics Summary

| Metric | Value | Status |
| :--- | :--- | :--- |
| **Code Translation Coverage** | ${codeKeyCoverage}% | ${codeKeyCoverage === "100.00" ? "🟢 100% Perfect" : "🔴 Missing Translations"} |
| **Locales Key Utilization** | ${utilizationPercent}% | ${Number(utilizationPercent) > 90 ? "🟢 High" : "🟡 Medium"} |
| **Total Defined Keys** | ${totalDefinedKeys} | - |
| **Actually Used Keys** | ${usedDefinedKeysCount} | - |
| **Missing Keys** | ${missingKeys.length} | ${missingKeys.length === 0 ? "🟢 Clean" : "🔴 Action Required"} |
| **Active Placeholders** | ${activePlaceholderKeys.length} | ${activePlaceholderKeys.length === 0 ? "🟢 Clean" : "🔴 Action Required"} |
| **Unused Keys** | ${unusedKeys.length} | ${unusedKeys.length === 0 ? "🟢 Optimized" : "🟡 Can be pruned"} |
| **Locale Alignment** | ${keysOnlyInLanguages.length === 0 ? "Align'd" : "Mismatch"} | ${keysOnlyInLanguages.length === 0 ? "🟢 Perfect" : "🔴 Action Required"} |

${renderMissingKeysSection(missingKeys, keyToFilesMap, defaultBasename)}

${renderActivePlaceholdersSection(activePlaceholderKeys, keyToFilesMap, getBaseKey)}

${renderAlignmentSection(keysOnlyInLanguages)}

${renderUnusedKeysSection(unusedKeys)}

${renderUnusedPlaceholdersSection(unusedPlaceholderKeys)}
`
}

function renderMissingKeysSection(
  missingKeys: string[],
  keyToFilesMap: KeyToFilesLookup,
  defaultBasename: string
): string {
  if (missingKeys.length === 0) {
    return "## ✅ Missing Keys\n\nNo missing translation keys detected in the source code."
  }
  return `## ❌ Missing Keys (${missingKeys.length})

The following keys are used in the source code but are not defined in the main locale file \`${defaultBasename}\`:

${missingKeys
  .sort()
  .map(
    (key) =>
      `- **\`${key}\`** (referenced in: ${keyToFilesMap
        .get(key)
        ?.map((f) => `\`${f}\``)
        .join(", ")})`
  )
  .join("\n")}
`
}

function renderActivePlaceholdersSection(
  activePlaceholderKeys: { key: string; lang: string }[],
  keyToFilesMap: KeyToFilesLookup,
  getBaseKey: (key: string) => string
): string {
  if (activePlaceholderKeys.length === 0) {
    return "## ✅ Active Placeholders\n\nNo active placeholder keys detected in the source code."
  }
  return `## ❌ Active Placeholders (${activePlaceholderKeys.length})

The following keys are referenced in the source code but only have placeholder values (identical to the key path):

${activePlaceholderKeys
  .sort((a, b) => a.key.localeCompare(b.key))
  .map(
    ({ key, lang }) =>
      `- **\`${key}\`** [\`${lang.toUpperCase()}\`] ${
        keyToFilesMap.has(key)
          ? `(referenced in: ${keyToFilesMap
              .get(key)
              ?.map((f) => `\`${f}\``)
              .join(", ")})`
          : keyToFilesMap.has(getBaseKey(key))
            ? `(referenced in: ${keyToFilesMap
                .get(getBaseKey(key))
                ?.map((f) => `\`${f}\``)
                .join(", ")})`
            : ""
      }`
  )
  .join("\n")}
`
}

function renderAlignmentSection(
  keysOnlyInLanguages: LocaleAlignmentMismatch[]
): string {
  if (keysOnlyInLanguages.length === 0) {
    return "## ✅ Locale Alignment\n\nPerfect key alignment between all locale files."
  }
  return `## ❌ Locale Alignment Mismatches

${keysOnlyInLanguages
  .map(
    (m) => `### Keys in ${m.from} but missing in ${m.to} (${m.keys.length})
${m.keys
  .slice()
  .sort()
  .map((k) => `- \`${k}\``)
  .join("\n")}
`
  )
  .join("\n")}
`
}

function renderUnusedKeysSection(unusedKeys: string[]): string {
  if (unusedKeys.length === 0) {
    return "## ✅ Unused Keys\n\nAll defined translation keys are used in the source code."
  }
  return `## ⚠️ Unused Keys (${unusedKeys.length})

These keys are defined in the locale file but are not used anywhere in the source code. They can be safely pruned to reduce bundle size:

${unusedKeys
  .sort()
  .map((key) => `- \`${key}\``)
  .join("\n")}
`
}

function renderUnusedPlaceholdersSection(
  unusedPlaceholderKeys: { key: string; lang: string }[]
): string {
  if (unusedPlaceholderKeys.length === 0) return ""
  return `## ⚠️ Unused Placeholders (${unusedPlaceholderKeys.length})

These keys have placeholder values but are not currently used in the source code. They should be translated before use:

${unusedPlaceholderKeys
  .sort((a, b) => a.key.localeCompare(b.key))
  .map(({ key, lang }) => `- \`${key}\` [\`${lang.toUpperCase()}\`]`)
  .join("\n")}
`
}
