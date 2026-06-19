import * as fs from "fs"
import * as path from "path"
import readline from "readline"
import pc from "picocolors"
import { I18nSharpenError } from "@/core/errors"
import {
  unflattenObject,
  writeLocaleFile,
  writeLocaleFilesAtomic,
  loadAllLocales,
  loadNamespacedLocales,
  sortLocaleObject
} from "@/core/locale-io"
import { scanSourceFiles, detectUsedKeys, matchWildcard } from "@/core/scanner"
import type { I18nSharpenConfig } from "@/types"
import { log } from "@/utils"
import { warnLegacyDefaultNamespace } from "./_shared/migration-warnings"

export async function translate(
  config: I18nSharpenConfig,
  cwd: string = process.cwd()
): Promise<void> {
  log.header("I18N-SHARPEN INTERACTIVE TRANSLATOR")

  const localesDirAbs = path.resolve(cwd, config.localesDir)
  if (!fs.existsSync(localesDirAbs)) {
    throw new I18nSharpenError({
      kind: "filesystem",
      message: `Locales directory not found: ${localesDirAbs}`,
      path: localesDirAbs
    })
  }

  // 1. Scan source files and detect used keys
  const files = scanSourceFiles(config, cwd)
  const matchFunctions = config.matchFunctions ?? ["t", "getTranslation"]
  const matchAttributes = config.matchAttributes ?? ["i18nKey", "id"]
  const { usedKeys } = await detectUsedKeys(
    files,
    matchFunctions,
    matchAttributes,
    { cwd, hardcodedAttributes: config.hardcoded?.attributes ?? [] }
  )

  // 2. Load metadata contexts
  const metadataPath = path.resolve(
    localesDirAbs,
    config.metadataFile ?? "metadata.json"
  )
  let metadata: Record<
    string,
    { context: string; file: string; line: number } | undefined
  > = {}
  if (config.metadataFile && fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<
        string,
        { context: string; file: string; line: number } | undefined
      >
    } catch {
      // ignore
    }
  }

  // 3. Load all translations
  const isNamespaced = config.localesLayout === "namespaced"
  let localesFlat: Record<string, Record<string, unknown>> = {}
  let localePaths: Record<string, string | null> = {}
  let localeNamespaces: Record<string, Record<string, string>> = {}

  if (isNamespaced) {
    const loaded = loadNamespacedLocales(
      localesDirAbs,
      config.supportedLanguages
    )
    localesFlat = loaded.localesFlat
    localeNamespaces = loaded.localeNamespaces
    warnLegacyDefaultNamespace(config, localeNamespaces)
  } else {
    const loaded = loadAllLocales(localesDirAbs, config.supportedLanguages)
    localesFlat = loaded.localesFlat
    localePaths = loaded.localePaths
  }

  const defaultLang = config.defaultLanguage
  const defaultFlatMap = localesFlat[defaultLang] ?? {}

  // 4. Identify untranslated keys for each language
  // A key is untranslated if:
  // - It is missing from flat map
  // - Value equals key (placeholder)
  // - Value equals default lang value (fallback) when lang !== defaultLang
  const suffixes = config.pluralSuffixes ?? []
  const ignoreKeys = config.ignoreKeys ?? []

  interface UntranslatedKey {
    fullKey: string // e.g. "namespace:key.path" or "key.path"
    keyPath: string // e.g. "key.path"
    ns: string // e.g. "namespace"
    currentValue: string
    defaultValue?: string
    context?: string
    reason: "missing" | "placeholder" | "fallback"
  }

  const untranslatedByLang: Record<string, UntranslatedKey[]> = {}

  for (const lang of config.supportedLanguages) {
    const flatMap = localesFlat[lang] ?? {}
    const keys: UntranslatedKey[] = []

    for (const fullKey of usedKeys) {
      if (ignoreKeys.some((pattern) => matchWildcard(pattern, fullKey))) {
        continue
      }

      // Resolve namespace and key path
      let ns = "common"
      let keyPath = fullKey
      if (isNamespaced) {
        const colonIdx = fullKey.indexOf(":")
        ns =
          colonIdx >= 0
            ? fullKey.slice(0, colonIdx)
            : (config.defaultNamespace ?? "common")
        keyPath = colonIdx >= 0 ? fullKey.slice(colonIdx + 1) : fullKey
      }

      const flatKey = isNamespaced ? `${ns}:${keyPath}` : fullKey
      const val = flatMap[flatKey] as string | undefined
      const defaultVal = defaultFlatMap[flatKey] as string | undefined
      const meta = metadata[fullKey] ?? metadata[flatKey]

      const isMissing = val === undefined
      if (!isMissing && suffixes.length > 0) {
        // Double check plural suffixes
        let suffixExists = false
        for (const suffix of suffixes) {
          if (flatKey + suffix in flatMap) {
            suffixExists = true
            break
          }
        }
        if (suffixExists) continue
      }

      if (isMissing) {
        keys.push({
          fullKey,
          keyPath,
          ns,
          currentValue: "",
          defaultValue: defaultVal,
          context: meta?.context,
          reason: "missing"
        })
      } else if (val === flatKey || val === keyPath) {
        keys.push({
          fullKey,
          keyPath,
          ns,
          currentValue: val,
          defaultValue: defaultVal,
          context: meta?.context,
          reason: "placeholder"
        })
      } else if (lang !== defaultLang && val === defaultVal) {
        keys.push({
          fullKey,
          keyPath,
          ns,
          currentValue: val,
          defaultValue: defaultVal,
          context: meta?.context,
          reason: "fallback"
        })
      }
    }

    if (keys.length > 0) {
      untranslatedByLang[lang] = keys
    }
  }

  const langsToTranslate = Object.keys(untranslatedByLang)
  if (langsToTranslate.length === 0) {
    log.success(
      "✨ All translation keys are fully translated across all languages!"
    )
    return
  }

  log.info(
    `Found untranslated keys in ${pc.green(langsToTranslate.length)} languages.`
  )

  // 5. Interactive prompt loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  // SIGINT handler to save progress before exit
  const state = { sigintReceived: false as boolean }
  const cleanupAndSave = () => {
    rl.close()
    log.info("\n💾 Saving translation progress entered so far...")
    saveTranslations(
      config,
      localesDirAbs,
      localesFlat,
      localePaths,
      localeNamespaces,
      usedKeys
    )
    process.exit(0)
  }

  const sigintHandler = () => {
    state.sigintReceived = true
    cleanupAndSave()
  }
  process.on("SIGINT", sigintHandler)

  const ask = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (ans) => {
        resolve(ans.trim())
      })
    })
  }

  try {
    for (const lang of langsToTranslate) {
      if (state.sigintReceived) break
      const keys = untranslatedByLang[lang]
      log.info(
        `\n🌐 Translating for language: ${pc.bold(pc.magenta(lang.toUpperCase()))} (${keys.length} keys)`
      )

      for (let i = 0; i < keys.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (state.sigintReceived) break
        const item = keys[i]

        log.info(
          pc.cyan(`\n[${i + 1}/${keys.length}] Key: "${pc.bold(item.fullKey)}"`)
        )
        if (item.context) {
          log.info(`💡 Context: ${pc.italic(item.context)}`)
        }
        if (item.defaultValue && lang !== defaultLang) {
          log.info(
            `🇬🇧 Default (${defaultLang}): "${pc.dim(item.defaultValue)}"`
          )
        }
        if (item.currentValue) {
          log.info(
            `📝 Current Value: "${pc.dim(item.currentValue)}" (${item.reason})`
          )
        }

        const promptLabel = `👉 Enter [${lang.toUpperCase()}] translation: `
        const ans = await ask(promptLabel)

        if (ans) {
          if (ans === ":skip") {
            log.info("Skipped.")
            continue
          }
          if (ans === ":exit") {
            state.sigintReceived = true
            break
          }

          // Store translation
          const flatKey = isNamespaced
            ? `${item.ns}:${item.keyPath}`
            : item.fullKey
          localesFlat[lang] ??= {}
          localesFlat[lang][flatKey] = ans
          log.success(`Added: "${ans}"`)
        } else {
          log.info("Skipped (value unchanged).")
        }
      }
    }
  } finally {
    rl.close()
    process.off("SIGINT", sigintHandler)
  }

  // 6. Save results
  log.info("\n💾 Saving translations...")
  saveTranslations(
    config,
    localesDirAbs,
    localesFlat,
    localePaths,
    localeNamespaces,
    usedKeys
  )
  log.success("🎉 All translations saved successfully!")
}

function saveTranslations(
  config: I18nSharpenConfig,
  localesDirAbs: string,
  localesFlat: Record<string, Record<string, unknown>>,
  localePaths: Record<string, string | null>,
  localeNamespaces: Record<string, Record<string, string>>,
  usedKeys: Set<string>
): void {
  const isNamespaced = config.localesLayout === "namespaced"

  if (isNamespaced) {
    interface NsPlan {
      filePath: string
      nestedJson: Record<string, unknown>
    }
    const plans: NsPlan[] = []

    for (const lang of config.supportedLanguages) {
      const flatMap = localesFlat[lang] ?? {}
      const nsFilePaths = localeNamespaces[lang] ?? {}

      // Group keys in this language flatMap by namespace
      const keysByNs: Record<string, Record<string, unknown> | undefined> = {}
      for (const [flatKey, value] of Object.entries(flatMap)) {
        const colonIdx = flatKey.indexOf(":")
        const ns =
          colonIdx >= 0
            ? flatKey.slice(0, colonIdx)
            : (config.defaultNamespace ?? "common")
        const keyPath = colonIdx >= 0 ? flatKey.slice(colonIdx + 1) : flatKey

        let nsMap = keysByNs[ns]
        if (!nsMap) {
          nsMap = {}
          keysByNs[ns] = nsMap
        }
        nsMap[keyPath] = value
      }

      // Reconstruct and sort each namespace file
      for (const [ns, nsFlat] of Object.entries(keysByNs)) {
        const langDir = path.join(localesDirAbs, lang)
        const filePath = nsFilePaths[ns] ?? path.join(langDir, `${ns}.json`)

        if (!fs.existsSync(path.dirname(filePath))) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
        }

        const nestedJson = unflattenObject(nsFlat ?? {})

        // Find sorting key order for this namespace
        const nsKeyOrder = new Set<string>()
        for (const fullKey of usedKeys) {
          const colonIdx = fullKey.indexOf(":")
          const keyNs =
            colonIdx >= 0
              ? fullKey.slice(0, colonIdx)
              : (config.defaultNamespace ?? "common")
          if (keyNs === ns) {
            const keyPath =
              colonIdx >= 0 ? fullKey.slice(colonIdx + 1) : fullKey
            nsKeyOrder.add(keyPath)
          }
        }

        const sortedNestedJson = sortLocaleObject(
          nestedJson,
          config.sortKeys ?? "preserve",
          nsKeyOrder
        )

        plans.push({ filePath, nestedJson: sortedNestedJson })
      }
    }

    writeLocaleFilesAtomic(plans)
  } else {
    for (const lang of config.supportedLanguages) {
      const flatMap = localesFlat[lang] ?? {}
      const langPath =
        localePaths[lang] ?? path.join(localesDirAbs, `${lang}.json`)

      const nestedJson = unflattenObject(flatMap)
      const sortedNestedJson = sortLocaleObject(
        nestedJson,
        config.sortKeys ?? "preserve",
        usedKeys
      )

      writeLocaleFile(langPath, sortedNestedJson)
    }
  }
}
