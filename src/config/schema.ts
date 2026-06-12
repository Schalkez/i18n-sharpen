import { z } from "zod"
import type { I18nSharpenConfig } from "@/types"

/**
 * Single source of truth for every default value used by the CLI.
 *
 * This object intentionally consolidates what would otherwise be scattered
 * magic strings. When adding a new tunable, add it here and reference
 * `DEFAULT_CONFIG.<field>` from other modules.
 */
export const DEFAULT_CONFIG = {
  scanDirs: ["src"],
  localesDir: "src/locales",
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
  fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".astro"],
  matchFunctions: ["t", "getTranslation"],
  outputReport: "i18n-coverage.md",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
  matchAttributes: ["i18nKey", "id", "i18n", ":label", "v-t", "t:"],
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
  ],
  localesLayout: "flat",
  autoIgnoreDynamicPrefixes: true
} satisfies Partial<I18nSharpenConfig>

// Restrict matchFunctions / matchAttributes to plain identifier-like tokens
// so they are safe to splice into a generated regex.
const identifierLikePattern = /^[A-Za-z_$][A-Za-z0-9_$.]*$/
export const identifierLike = z
  .string()
  .regex(
    identifierLikePattern,
    "must be an identifier-like token matching /^[A-Za-z_$][A-Za-z0-9_$.]*$/"
  )

// Attribute names are looser — can start with ':' (Vue v-bind), end with ':'
// (Astro directives), and contain '-' (HTML data attrs).
const attributeNamePattern = /^[:]?[A-Za-z_$][A-Za-z0-9_$.\-:]*$/
export const attributeName = z
  .string()
  .regex(
    attributeNamePattern,
    "must match /^[:]?[A-Za-z_$][A-Za-z0-9_$.\\-:]*$/ (HTML/Vue/Astro-style attribute)"
  )

// Language codes must be filesystem-safe identifier-like strings.
const languageCodePattern = /^[a-zA-Z0-9_-]+$/
export const languageCode = z
  .string()
  .regex(
    languageCodePattern,
    "must match /^[a-zA-Z0-9_-]+$/ (no path separators)"
  )

export const I18nSharpenConfigSchema = z.object({
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
  matchAttributes: z.array(attributeName).optional(),
  ignoreKeys: z.array(z.string()).optional(),
  ignoreDynamicKeys: z.array(z.string()).optional(),
  autoIgnoreDynamicPrefixes: z.boolean().optional(),
  pluralSuffixes: z.array(z.string()).optional(),
  looseKeyMatch: z.boolean().optional(),
  localesLayout: z.enum(["flat", "namespaced"]).optional(),
  sortKeys: z.enum(["alpha", "source", "preserve"]).optional(),
  defaultNamespace: z
    .string()
    .nonempty("defaultNamespace must be a non-empty string")
    .optional(),
  prune: z
    .object({
      force: z.boolean().optional(),
      cleanEmpty: z.boolean().optional()
    })
    .optional(),
  hardcoded: z
    .object({
      ignore: z.array(z.string()).optional(),
      attributes: z.array(z.string()).optional()
    })
    .optional()
})
