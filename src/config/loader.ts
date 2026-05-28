import * as fs from "fs"
import * as path from "path"
import { I18nSharpenError } from "@/core/errors"
import type { I18nSharpenConfig } from "@/types"
import { DEFAULT_CONFIG, I18nSharpenConfigSchema } from "./schema"

/**
 * Load i18n-sharpen configuration.
 *
 * Resolution order:
 *   1. If `configPath` is provided, load that file (JSON). Errors are
 *      fatal — the user explicitly asked for this file.
 *   2. Otherwise, look for `i18n-sharpen.json` in `cwd`.
 *   3. Otherwise, look for an `i18nSharpen` field in `cwd/package.json`.
 *   4. Otherwise, use defaults only.
 *
 * `configPath` may be absolute or relative; relative paths are resolved
 * against `cwd`.
 */
export function loadConfig(
  cwd: string = process.cwd(),
  configPath?: string
): I18nSharpenConfig {
  if (!fs.existsSync(cwd)) {
    throw new I18nSharpenError({
      kind: "config",
      message: `cwd does not exist: ${cwd}`,
      path: cwd
    })
  }
  if (!fs.statSync(cwd).isDirectory()) {
    throw new I18nSharpenError({
      kind: "config",
      message: `cwd is not a directory: ${cwd}`,
      path: cwd
    })
  }

  const configPathJson = path.join(cwd, "i18n-sharpen.json")
  const packageJsonPath = path.join(cwd, "package.json")

  let fileConfig: Partial<I18nSharpenConfig> = {}

  if (configPath) {
    const resolved = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(cwd, configPath)
    if (!fs.existsSync(resolved)) {
      throw new I18nSharpenError({
        kind: "config",
        message: `Config file not found: ${resolved}`,
        path: resolved
      })
    }
    if (!fs.statSync(resolved).isFile()) {
      throw new I18nSharpenError({
        kind: "config",
        message: `Config path is not a file: ${resolved}`,
        path: resolved
      })
    }
    try {
      const content = fs.readFileSync(resolved, "utf8")
      fileConfig = JSON.parse(content) as Partial<I18nSharpenConfig>
    } catch (error) {
      throw new I18nSharpenError({
        kind: "parse",
        message: `Failed to parse config file '${resolved}': ${(error as Error).message}`,
        path: resolved
      })
    }
  } else if (fs.existsSync(configPathJson)) {
    try {
      const content = fs.readFileSync(configPathJson, "utf8")
      fileConfig = JSON.parse(content) as Partial<I18nSharpenConfig>
    } catch (error) {
      console.warn(
        `⚠️ Failed to parse i18n-sharpen.json: ${(error as Error).message}`
      )
    }
  } else if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, "utf8")
      const pkg = JSON.parse(content) as {
        i18nSharpen?: Partial<I18nSharpenConfig>
      }
      if (pkg.i18nSharpen) {
        fileConfig = pkg.i18nSharpen
      }
    } catch (error) {
      console.warn(
        `⚠️ Failed to read package.json for i18nSharpen config: ${(error as Error).message}`
      )
    }
  }

  // Merge with defaults
  const rawConfig = {
    scanDirs: fileConfig.scanDirs ?? DEFAULT_CONFIG.scanDirs,
    localesDir: fileConfig.localesDir ?? DEFAULT_CONFIG.localesDir,
    defaultLanguage:
      fileConfig.defaultLanguage ?? DEFAULT_CONFIG.defaultLanguage,
    supportedLanguages:
      fileConfig.supportedLanguages ?? DEFAULT_CONFIG.supportedLanguages,
    excludeDirs: fileConfig.excludeDirs ?? DEFAULT_CONFIG.excludeDirs,
    fileExtensions: fileConfig.fileExtensions ?? DEFAULT_CONFIG.fileExtensions,
    matchFunctions: fileConfig.matchFunctions ?? DEFAULT_CONFIG.matchFunctions,
    outputReport: fileConfig.outputReport ?? DEFAULT_CONFIG.outputReport,
    matchAttributes:
      fileConfig.matchAttributes ?? DEFAULT_CONFIG.matchAttributes,
    ignoreKeys: fileConfig.ignoreKeys ?? DEFAULT_CONFIG.ignoreKeys,
    pluralSuffixes: fileConfig.pluralSuffixes ?? DEFAULT_CONFIG.pluralSuffixes,
    looseKeyMatch: fileConfig.looseKeyMatch ?? false,
    localesLayout: fileConfig.localesLayout ?? DEFAULT_CONFIG.localesLayout,
    prune: fileConfig.prune ?? { force: false }
  }

  // Zod validation
  const result = I18nSharpenConfigSchema.safeParse(rawConfig)
  if (!result.success) {
    const errors = result.error.issues
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n")
    throw new I18nSharpenError({
      kind: "config",
      message: `Invalid configuration:\n${errors}`
    })
  }

  const config = result.data

  // Warn when localesDir / scanDirs / outputReport resolve outside cwd.
  const cwdResolved = path.resolve(cwd)
  const isInsideCwd = (p: string): boolean => {
    const rel = path.relative(cwdResolved, path.resolve(cwdResolved, p))
    return !rel.startsWith("..") && !path.isAbsolute(rel)
  }
  if (!isInsideCwd(config.localesDir)) {
    console.warn(
      `⚠️ localesDir '${config.localesDir}' resolves outside cwd ('${cwdResolved}').`
    )
  }
  for (const dir of config.scanDirs) {
    if (!isInsideCwd(dir)) {
      console.warn(
        `⚠️ scanDirs entry '${dir}' resolves outside cwd ('${cwdResolved}').`
      )
    }
  }
  if (config.outputReport && !isInsideCwd(config.outputReport)) {
    console.warn(
      `⚠️ outputReport '${config.outputReport}' resolves outside cwd ('${cwdResolved}').`
    )
  }

  if (!config.supportedLanguages.includes(config.defaultLanguage)) {
    config.supportedLanguages = Array.from(
      new Set([config.defaultLanguage, ...config.supportedLanguages])
    )
  }

  return config
}
