import * as fs from "fs"
import * as path from "path"
import { z } from "zod"
import type { I18nCopConfig } from "./types"

export const DEFAULT_CONFIG: Partial<I18nCopConfig> = {
  excludeDirs: [
    "node_modules",
    "dist",
    ".git",
    ".next",
    "build",
    "coverage",
    ".agent",
    ".claude"
  ],
  fileExtensions: [".ts", ".tsx", ".js", ".jsx"],
  matchFunctions: ["t", "getTranslation"],
  outputReport: "i18n-coverage.md",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
  matchAttributes: ["i18nKey", "id"],
  ignoreKeys: [],
  pluralSuffixes: [
    "_zero",
    "_one",
    "_two",
    "_few",
    "_many",
    "_other",
    "_male",
    "_female"
  ]
}

// Restrict matchFunctions / matchAttributes to plain identifier-like
// tokens so they are safe to splice into a generated regex. This is the
// schema-level companion to escapeRegex() (defense in depth: even with
// the runtime escape, the schema rejects obviously malicious patterns
// up-front so the user sees a clear error message).
const identifierLikePattern = /^[A-Za-z_$][A-Za-z0-9_$.]*$/
const identifierLike = z
  .string()
  .regex(
    identifierLikePattern,
    "must be an identifier-like token matching /^[A-Za-z_$][A-Za-z0-9_$.]*$/"
  )

// Language codes must be filesystem-safe identifier-like strings to
// guard against `path.join(localesDir, "../../etc/passwd")` style escape
// from the locales directory. Allow letters, digits, underscore and
// hyphen (covers BCP-47 codes like "en", "en-US", "zh_CN").
const languageCodePattern = /^[a-zA-Z0-9_-]+$/
const languageCode = z
  .string()
  .regex(
    languageCodePattern,
    "must match /^[a-zA-Z0-9_-]+$/ (no path separators)"
  )

export const I18nCopConfigSchema = z.object({
  scanDirs: z
    .array(z.string())
    .nonempty("scanDirs must contain at least one directory path"),
  localesDir: z.string().nonempty("localesDir must be a non-empty string"),
  defaultLanguage: languageCode,
  supportedLanguages: z
    .array(languageCode)
    .nonempty("supportedLanguages must contain at least one language"),
  excludeDirs: z.array(z.string()).optional(),
  fileExtensions: z.array(z.string()).optional(),
  matchFunctions: z.array(identifierLike).optional(),
  outputReport: z.string().optional(),
  matchAttributes: z.array(identifierLike).optional(),
  ignoreKeys: z.array(z.string()).optional(),
  pluralSuffixes: z.array(z.string()).optional(),
  looseKeyMatch: z.boolean().optional()
})

export function loadConfig(cwd: string = process.cwd()): I18nCopConfig {
  // LO-03: validate cwd is a real directory. Previously a typo'd cwd
  // silently produced an all-defaults config with no error.
  if (!fs.existsSync(cwd)) {
    throw new Error(`cwd does not exist: ${cwd}`)
  }
  if (!fs.statSync(cwd).isDirectory()) {
    throw new Error(`cwd is not a directory: ${cwd}`)
  }

  const configPathJson = path.join(cwd, "i18n-sharpen.json")
  const packageJsonPath = path.join(cwd, "package.json")

  let fileConfig: Partial<I18nCopConfig> = {}

  if (fs.existsSync(configPathJson)) {
    try {
      const content = fs.readFileSync(configPathJson, "utf8")
      fileConfig = JSON.parse(content)
    } catch (error) {
      console.warn(
        `⚠️ Failed to parse i18n-sharpen.json: ${(error as Error).message}`
      )
    }
  } else if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, "utf8")
      const pkg = JSON.parse(content)
      if (pkg.i18nSharpen) {
        fileConfig = pkg.i18nSharpen
      }
    } catch (error) {
      // LO-02: surface the read error so the user is not confused why
      // their package.json#i18nSharpen settings are ignored.
      console.warn(
        `⚠️ Failed to read package.json for i18nSharpen config: ${(error as Error).message}`
      )
    }
  }

  // Merge with defaults
  const rawConfig = {
    scanDirs: fileConfig.scanDirs || ["src"],
    localesDir: fileConfig.localesDir || "src/locales",
    defaultLanguage:
      fileConfig.defaultLanguage || DEFAULT_CONFIG.defaultLanguage!,
    supportedLanguages:
      fileConfig.supportedLanguages || DEFAULT_CONFIG.supportedLanguages!,
    excludeDirs: fileConfig.excludeDirs || DEFAULT_CONFIG.excludeDirs,
    fileExtensions: fileConfig.fileExtensions || DEFAULT_CONFIG.fileExtensions,
    matchFunctions: fileConfig.matchFunctions || DEFAULT_CONFIG.matchFunctions,
    outputReport:
      fileConfig.outputReport !== undefined
        ? fileConfig.outputReport
        : DEFAULT_CONFIG.outputReport,
    matchAttributes:
      fileConfig.matchAttributes || DEFAULT_CONFIG.matchAttributes,
    ignoreKeys: fileConfig.ignoreKeys || DEFAULT_CONFIG.ignoreKeys,
    pluralSuffixes: fileConfig.pluralSuffixes || DEFAULT_CONFIG.pluralSuffixes,
    looseKeyMatch:
      fileConfig.looseKeyMatch !== undefined ? fileConfig.looseKeyMatch : false
  }

  // Zod validation
  const result = I18nCopConfigSchema.safeParse(rawConfig)
  if (!result.success) {
    const errors = result.error.issues
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n")
    throw new Error(`Invalid configuration:\n${errors}`)
  }

  const config = result.data

  // MD-06: warn when localesDir / scanDirs / outputReport resolve outside
  // the working directory. We only warn (not error) because legitimate
  // monorepo setups place locales above cwd, but the warning surfaces
  // accidental escapes via "../../etc" in untrusted CI configs.
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
    // If supportedLanguages does not include defaultLanguage, add it
    config.supportedLanguages = Array.from(
      new Set([config.defaultLanguage, ...config.supportedLanguages])
    )
  }

  return config
}
