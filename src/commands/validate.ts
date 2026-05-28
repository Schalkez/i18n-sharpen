import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import type {
  I18nSharpenConfig,
  ValidationResults,
  LocaleAlignmentMismatch
} from "../types"
import {
  getFiles,
  stripComments,
  flattenObject,
  findLocaleFile,
  readLocaleFile,
  escapeRegex,
  isStaticStringLiteral,
  normalizeDisplayPath,
  getBaseKey as sharedGetBaseKey,
  isKeyUsed as sharedIsKeyUsed,
  log
} from "../utils"

export function validate(
  config: I18nSharpenConfig,
  cwd: string = process.cwd()
): ValidationResults {
  log.header("I18N-SHARPEN VALIDATOR")

  const localesDirAbs = path.resolve(cwd, config.localesDir)

  // Load all locale files
  const locales: Record<string, Record<string, unknown>> = {}
  const localesFlat: Record<string, Record<string, string>> = {}
  const localeKeySets: Record<string, Set<string>> = {}

  let defaultLocalePath: string | null = null

  for (const lang of config.supportedLanguages) {
    const langPath = findLocaleFile(localesDirAbs, lang)
    if (lang === config.defaultLanguage) {
      defaultLocalePath = langPath
    }

    if (!langPath) {
      log.warn(
        `Locale file not found for language '${lang}' in: ${localesDirAbs}`
      )
      locales[lang] = {}
      localesFlat[lang] = {}
      localeKeySets[lang] = new Set()
      continue
    }

    try {
      const parsed = readLocaleFile(langPath)
      locales[lang] = parsed
      localesFlat[lang] = flattenObject(parsed)
      localeKeySets[lang] = new Set(Object.keys(localesFlat[lang]))
    } catch (error) {
      throw new Error(
        `Failed to parse locale file '${path.basename(langPath)}': ${(error as Error).message}`
      )
    }
  }

  if (!defaultLocalePath) {
    throw new Error(
      `Default language '${config.defaultLanguage}' locale file not found.`
    )
  }

  const defaultKeys = Object.keys(localesFlat[config.defaultLanguage])
  const defaultKeySet = localeKeySets[config.defaultLanguage]

  log.info(
    `Loaded default language '${config.defaultLanguage}' with ${pc.green(defaultKeys.length)} keys.`
  )
  for (const lang of config.supportedLanguages) {
    if (lang !== config.defaultLanguage) {
      const keysCount = Object.keys(localesFlat[lang]).length
      log.info(`Loaded language '${lang}' with ${pc.green(keysCount)} keys.`)
    }
  }

  // Find all source files
  const filesToScan: string[] = []
  for (const scanDir of config.scanDirs) {
    const scanDirAbs = path.resolve(cwd, scanDir)
    if (fs.existsSync(scanDirAbs)) {
      log.info(
        `Scanning directory: ${pc.cyan(normalizeDisplayPath(path.relative(cwd, scanDirAbs)))}`
      )
      filesToScan.push(
        ...getFiles(
          scanDirAbs,
          config.fileExtensions || [],
          config.excludeDirs || []
        )
      )
    } else {
      log.warn(`Scan directory does not exist: ${scanDirAbs}`)
    }
  }

  log.info(`Found ${pc.green(filesToScan.length)} source files to check.`)

  // Scan source files for translation keys
  const usedKeys = new Set<string>()
  // LO-07: track key -> set of relative paths to avoid the O(n²)
  // includes() check on every match. We convert to Array at display.
  const keyToFilesSet = new Map<string, Set<string>>()
  const keyToFilesMap = {
    has(key: string): boolean {
      return keyToFilesSet.has(key)
    },
    get(key: string): string[] | undefined {
      const s = keyToFilesSet.get(key)
      return s ? Array.from(s) : undefined
    },
    add(key: string, file: string): void {
      let s = keyToFilesSet.get(key)
      if (!s) {
        s = new Set()
        keyToFilesSet.set(key, s)
      }
      s.add(file)
    }
  }

  // Regex setup — escape user-supplied config entries to prevent
  // regex injection / ReDoS via matchFunctions / matchAttributes.
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

  // Regex to capture the first argument of every <fn>(...) call, regardless
  // of whether it starts with a quote. We then post-classify the argument
  // as static-literal vs dynamic in JS. Compared to the prior regex which
  // excluded quote-leading args, this correctly flags:
  //   t("k" + suffix)          — concatenation
  //   t(`pre.${x}`)            — template with placeholder
  //   t(getKey())              — function call
  // and still skips pure static literals.
  const dynamicCallRegex = new RegExp(
    "\\b(?:" + functionsJoined + ")\\s*\\(\\s*([^)]*)\\)",
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

  // First pass: extract keys from code
  for (let i = 0; i < filesToScan.length; i++) {
    const file = filesToScan[i]
    const cleanContent = fileContents[i]
    const relativePath = normalizeDisplayPath(path.relative(cwd, file))

    // MD-11: use matchAll instead of regex.exec + lastIndex. matchAll
    // is stateless across iterations so we can't accidentally leak
    // lastIndex between files.

    // Match function calls
    for (const match of cleanContent.matchAll(keyRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)

      keyToFilesMap.add(key, relativePath)
    }

    // Match JSX/HTML attributes
    for (const match of cleanContent.matchAll(attrRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)

      keyToFilesMap.add(key, relativePath)
    }

    // Check for dynamic key warnings. The regex captures the entire
    // parenthesized first-argument span; we classify it in JS to avoid
    // the prior false-negatives where a `"key" + suffix` or
    // `\`pre.${x}\`` call was silently skipped.
    for (const match of cleanContent.matchAll(dynamicCallRegex)) {
      const arg = match[1].trim()
      if (arg.length === 0) continue
      if (!isStaticStringLiteral(arg)) {
        log.warn(
          `Potential dynamic translation key reference in ${pc.cyan(relativePath)}: ${pc.yellow(`${match[0]}`)}`
        )
      }
    }
  }

  // Second pass: opt-in loose match. Only runs when config.looseKeyMatch
  // is true. The loose pass walks every default-locale key and marks it
  // as "used" if the quoted literal appears anywhere — which over-matches
  // (debug logs, JSDoc, unrelated type literals all count). Default-off
  // to avoid prune keeping stale keys forever and validate hiding
  // missing-key errors.
  if (config.looseKeyMatch) {
    for (const key of defaultKeys) {
      if (usedKeys.has(key)) continue

      const doubleQuote = `"${key}"`
      const singleQuote = `'${key}'`
      const backtickQuote = `\`${key}\``

      for (let i = 0; i < filesToScan.length; i++) {
        const file = filesToScan[i]
        const cleanContent = fileContents[i]
        const relativePath = normalizeDisplayPath(path.relative(cwd, file))

        if (
          cleanContent.includes(doubleQuote) ||
          cleanContent.includes(singleQuote) ||
          cleanContent.includes(backtickQuote)
        ) {
          usedKeys.add(key)
          keyToFilesMap.add(key, relativePath)
        }
      }
    }
  } // end if (config.looseKeyMatch)

  // Plural/Context suffix alignment helpers — delegate to shared
  // implementations in utils.ts (LO-06).
  const suffixes = config.pluralSuffixes || []
  const getBaseKey = (key: string): string => sharedGetBaseKey(key, suffixes)
  const isKeyUsed = (key: string): boolean =>
    sharedIsKeyUsed(key, usedKeys, config.ignoreKeys, suffixes)

  log.info(
    `Found ${pc.green(usedKeys.size)} unique translation keys used in source code.`
  )

  // Computations
  const missingKeys: string[] = []
  const unusedKeys: string[] = []
  const activeKeysUsed: string[] = []

  // Check 1: Missing keys (used in code but not in default json)
  for (const key of usedKeys) {
    let exists = defaultKeySet.has(key)

    // If not found, check if it has plural suffix versions defined in locales
    if (!exists) {
      for (const suffix of suffixes) {
        if (defaultKeySet.has(key + suffix)) {
          exists = true
          break
        }
      }
    }

    if (!exists) {
      missingKeys.push(key)
    } else {
      activeKeysUsed.push(key)
    }
  }

  // Check 2: Unused keys (defined in default json but never used in code)
  for (const key of defaultKeys) {
    if (!isKeyUsed(key)) {
      unusedKeys.push(key)
    }
  }

  // Check 3: Locale alignment checks (across all supported languages)
  // MD-09: structured object instead of `${from}_not_${to}` string keys
  // so language codes containing "_not_" no longer ambiguously split.
  const keysOnlyInLanguages: LocaleAlignmentMismatch[] = []
  for (const lang of config.supportedLanguages) {
    if (lang === config.defaultLanguage) continue
    const langKeySet = localeKeySets[lang]

    const onlyInDefault = defaultKeys.filter((key) => !langKeySet.has(key))
    const onlyInTarget = Object.keys(localesFlat[lang]).filter(
      (key) => !defaultKeySet.has(key)
    )

    if (onlyInDefault.length > 0) {
      keysOnlyInLanguages.push({
        from: config.defaultLanguage,
        to: lang,
        keys: onlyInDefault
      })
    }
    if (onlyInTarget.length > 0) {
      keysOnlyInLanguages.push({
        from: lang,
        to: config.defaultLanguage,
        keys: onlyInTarget
      })
    }
  }

  // Check 4: Placeholder keys checks (value equals key path)
  const activePlaceholderKeys: { key: string; lang: string }[] = []
  const unusedPlaceholderKeys: { key: string; lang: string }[] = []

  for (const lang of config.supportedLanguages) {
    const flatMap = localesFlat[lang]
    for (const key in flatMap) {
      if (flatMap[key] === key) {
        if (isKeyUsed(key)) {
          activePlaceholderKeys.push({ key, lang })
        } else {
          unusedPlaceholderKeys.push({ key, lang })
        }
      }
    }
  }

  // Calculate coverage stats
  const totalDefinedKeys = defaultKeys.length
  const usedDefinedKeysCount = defaultKeys.length - unusedKeys.length
  const utilizationPercent =
    totalDefinedKeys > 0
      ? ((usedDefinedKeysCount / totalDefinedKeys) * 100).toFixed(2)
      : "0.00"

  const codeKeyCoverage =
    usedKeys.size > 0
      ? ((usedDefinedKeysCount / usedKeys.size) * 100).toFixed(2)
      : "100.00"

  // Report results to console
  log.header("VALIDATION RESULTS")
  let hasError = false

  // 1. Missing keys
  if (missingKeys.length > 0) {
    hasError = true
    console.log(pc.bold(pc.red(`❌ Missing Keys (${missingKeys.length}):`)))
    missingKeys.sort().forEach((key) => {
      const files = keyToFilesMap.get(key) || []
      console.log(`  - ${pc.red(key)} (referenced in: ${files.join(", ")})`)
    })
  } else {
    log.success("Zero missing keys detected in the source code!")
  }

  // 2. Active placeholders
  if (activePlaceholderKeys.length > 0) {
    hasError = true
    console.log(
      `\n${pc.bold(pc.red(`❌ Active Placeholder/Untranslated Keys Used in Code (${activePlaceholderKeys.length}):`))}`
    )
    activePlaceholderKeys
      .sort((a, b) => a.key.localeCompare(b.key))
      .forEach(({ key, lang }) => {
        // Prefer direct map lookup; fall back to the plural-base key.
        // Previous expression had an operator-precedence bug that
        // parsed as `(get(key) || (base === key)) ? [] : ...` so any
        // direct hit was wiped to `[]`.
        const direct = keyToFilesMap.get(key)
        const baseKey = getBaseKey(key)
        const baseFiles =
          baseKey !== key ? keyToFilesMap.get(baseKey) : undefined
        const files = direct ?? baseFiles ?? []
        console.log(
          `  - [${lang.toUpperCase()}] ${pc.red(key)} ${files.length > 0 ? `(referenced in: ${files.join(", ")})` : ""}`
        )
      })
  } else {
    log.success("Zero active placeholder keys detected in the source code!")
  }

  // 3. Locale alignment
  if (keysOnlyInLanguages.length > 0) {
    hasError = true
    console.log(`\n${pc.bold(pc.red("❌ Locale Alignment Mismatches:"))}`)
    for (const mismatch of keysOnlyInLanguages) {
      console.log(
        `  ${pc.yellow(`Keys present in ${mismatch.from} but missing in ${mismatch.to} (${mismatch.keys.length}):`)}`
      )
      mismatch.keys
        .slice()
        .sort()
        .forEach((k) => console.log(`    - ${k}`))
    }
  } else {
    log.success("Perfect key alignment across all locale files!")
  }

  // 4. Unused keys (warning only)
  if (unusedKeys.length > 0) {
    console.log(
      `\n${pc.bold(pc.yellow(`⚠️  Unused Keys in locales (${unusedKeys.length}):`))}`
    )
    unusedKeys.sort().forEach((key) => {
      console.log(`  - ${pc.yellow(key)}`)
    })
  } else {
    log.success(
      "Zero unused keys detected! All defined keys are referenced in code."
    )
  }

  // 5. Unused placeholders (warning only)
  if (unusedPlaceholderKeys.length > 0) {
    console.log(
      `\n${pc.bold(pc.yellow(`⚠️  Unused Placeholder Keys in locales (${unusedPlaceholderKeys.length}):`))}`
    )
    unusedPlaceholderKeys
      .sort((a, b) => a.key.localeCompare(b.key))
      .forEach(({ key, lang }) => {
        console.log(`  - [${lang.toUpperCase()}] ${pc.yellow(key)}`)
      })
  }

  // Quality metrics summary
  log.header("QUALITY METRICS SUMMARY")
  console.log(
    `- Translation Key Coverage (Code -> Locales): ${pc.bold(codeKeyCoverage === "100.00" ? pc.green(codeKeyCoverage + "%") : pc.red(codeKeyCoverage + "%"))}`
  )
  console.log(
    `- Translation Key Utilization (Locales -> Code): ${pc.bold(pc.magenta(utilizationPercent + "%"))}`
  )
  console.log(`- Total Defined Keys: ${pc.bold(totalDefinedKeys)}`)
  console.log(`- Actually Used in Code: ${pc.bold(usedDefinedKeysCount)}`)
  console.log(`- Missing/Undefined: ${pc.bold(missingKeys.length)}`)
  console.log(`- Unused/Stale: ${pc.bold(unusedKeys.length)}`)

  // Save report if config outputReport is set
  if (config.outputReport) {
    const reportPath = path.resolve(cwd, config.outputReport)
    const defaultBasename = path.basename(defaultLocalePath)

    const markdownContent = `# i18n Quality and Coverage Report

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

${
  missingKeys.length > 0
    ? `## ❌ Missing Keys (${missingKeys.length})

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
    : "## ✅ Missing Keys\n\nNo missing translation keys detected in the source code."
}

${
  activePlaceholderKeys.length > 0
    ? `## ❌ Active Placeholders (${activePlaceholderKeys.length})

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
    : "## ✅ Active Placeholders\n\nNo active placeholder keys detected in the source code."
}

${
  keysOnlyInLanguages.length > 0
    ? `## ❌ Locale Alignment Mismatches

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
    : "## ✅ Locale Alignment\n\nPerfect key alignment between all locale files."
}

${
  unusedKeys.length > 0
    ? `## ⚠️ Unused Keys (${unusedKeys.length})

These keys are defined in the locale file but are not used anywhere in the source code. They can be safely pruned to reduce bundle size:

${unusedKeys
  .sort()
  .map((key) => `- \`${key}\``)
  .join("\n")}
`
    : "## ✅ Unused Keys\n\nAll defined translation keys are used in the source code."
}

${
  unusedPlaceholderKeys.length > 0
    ? `## ⚠️ Unused Placeholders (${unusedPlaceholderKeys.length})

These keys have placeholder values but are not currently used in the source code. They should be translated before use:

${unusedPlaceholderKeys
  .sort((a, b) => a.key.localeCompare(b.key))
  .map(({ key, lang }) => `- \`${key}\` [\`${lang.toUpperCase()}\`]`)
  .join("\n")}
`
    : ""
}
`
    // MD-07: ensure parent directory exists before writing the report.
    // Previously `outputReport: "reports/i18n.md"` would throw ENOENT if
    // `reports/` did not already exist.
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, markdownContent, "utf8")
    log.info(
      `💾 Markdown report saved to: ${pc.cyan(normalizeDisplayPath(path.relative(cwd, reportPath)))}\n`
    )
  }

  const results: ValidationResults = {
    missingKeys,
    activePlaceholderKeys,
    unusedKeys,
    unusedPlaceholderKeys,
    keysOnlyInLanguages,
    codeKeyCoverage,
    utilizationPercent,
    totalDefinedKeys,
    usedDefinedKeysCount
  }

  if (hasError) {
    log.error(
      "Validation failed. Please fix the missing keys, active placeholders, or locale mismatches."
    )
  } else {
    log.success("i18n Quality Validation passed successfully!\n")
  }

  return results
}
