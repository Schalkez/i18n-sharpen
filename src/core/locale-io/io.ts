import * as fs from "fs"
import { createRequire } from "module"
import * as path from "path"
import YAML from "yaml"
import { I18nSharpenError } from "@/core/errors"
import { log } from "@/utils"
import { flattenObject } from "./transform"

const _require = createRequire(import.meta.url)

/** All locale file extensions supported for reading. */
export const LOCALE_EXTENSIONS = [
  ".json",
  ".yaml",
  ".yml",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx"
]

/**
 * Find the path of a locale file for a given language.
 *
 * Checks for .json, .yaml, .yml, .js, .cjs, .mjs, .ts, .tsx in that order.
 * If multiple files with the same base name exist, a warning is emitted and
 * the first match wins.
 */
export function findLocaleFile(
  localesDir: string,
  lang: string
): string | null {
  const extensions = LOCALE_EXTENSIONS
  const found = extensions
    .map((ext) => path.join(localesDir, `${lang}${ext}`))
    .filter((p) => fs.existsSync(p))
  if (found.length === 0) return null
  if (found.length > 1) {
    log.warn(
      `Multiple locale files found for '${lang}' in ${localesDir}: ${found
        .map((p) => path.basename(p))
        .join(
          ", "
        )}. Using '${path.basename(found[0])}'. Remove the duplicates to silence this warning.`
    )
  }
  return found[0]
}

/**
 * Dynamic ESM/TypeScript module loader using jiti.
 */
function loadWithJiti(filePath: string): Record<string, unknown> {
  let jiti: ((id: string) => unknown) | undefined
  try {
    // jiti v2: import is ESM-only; v1: has CJS entry — try both
    const jitiMod = _require("jiti") as
      | { default?: (base: string) => (id: string) => unknown }
      | ((base: string) => (id: string) => unknown)
    const factory = typeof jitiMod === "function" ? jitiMod : jitiMod.default
    if (typeof factory === "function") {
      jiti = factory(import.meta.url)
    }
  } catch {
    // jiti not installed
  }
  if (!jiti) {
    throw new Error(
      `TypeScript/ESM locale file '${path.basename(filePath)}' requires the 'jiti' package.\n` +
        `Install it as a dev-dependency: pnpm add -D jiti`
    )
  }
  try {
    const mod = jiti(filePath)
    const result =
      mod !== null && typeof mod === "object" && "default" in mod
        ? mod.default
        : mod
    return result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {}
  } catch (err) {
    throw new Error(
      `Failed to parse TypeScript/ESM locale file '${path.basename(filePath)}': ${(err as Error).message}`
    )
  }
}

/**
 * Load and parse a locale file (JSON, YAML, or JS/TS module).
 *
 * Tolerates real-world edge cases:
 *   - UTF-8 BOM prefix (U+FEFF)
 *   - whitespace-only / empty JSON/YAML
 *
 * JS/TS locale files:
 *   - `.js` / `.cjs`: loaded via `createRequire` (sync, no extra deps).
 *     Must use `module.exports = { ... }` or `exports.default = { ... }`.
 *   - `.mjs` / `.ts` / `.tsx`: loaded via `jiti` (must be installed as a
 *     dev-dependency: `pnpm add -D jiti`). Supports `export default { ... }`.
 *     Throws a helpful error if jiti is not available.
 */
export function readLocaleFile(filePath: string): Record<string, unknown> {
  const ext = path.extname(filePath).toLowerCase()

  // ── JS / CJS ─────────────────────────────────────────────────────────────
  if (ext === ".js" || ext === ".cjs") {
    try {
      const resolved = _require.resolve(filePath)
      Reflect.deleteProperty(_require.cache, resolved)
    } catch {
      // ignore cache resolution failure
    }
    try {
      const mod = _require(filePath) as unknown
      const result =
        mod !== null && typeof mod === "object" && "default" in mod
          ? mod.default
          : mod
      return result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {}
    } catch (err) {
      if (ext === ".js") {
        return loadWithJiti(filePath)
      }
      throw new Error(
        `Failed to parse JS/CJS locale file '${path.basename(filePath)}': ${(err as Error).message}`
      )
    }
  }

  // ── ESM / TypeScript (requires jiti) ─────────────────────────────────────
  if (ext === ".mjs" || ext === ".ts" || ext === ".tsx") {
    return loadWithJiti(filePath)
  }

  // ── JSON / YAML ───────────────────────────────────────────────────────────
  let content = fs.readFileSync(filePath, "utf8")
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1)
  }
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return {}
  }

  if (ext === ".yaml" || ext === ".yml") {
    const parsed = YAML.parse(trimmed) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  }
  const parsedJson = JSON.parse(trimmed) as unknown
  return parsedJson &&
    typeof parsedJson === "object" &&
    !Array.isArray(parsedJson)
    ? (parsedJson as Record<string, unknown>)
    : {}
}

/** Extensions that we can read via JS/TS module loaders but refuse to write. */
const JS_TS_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx"])

/**
 * Write a locale object to a file (JSON or YAML format).
 *
 * Uses a write-then-rename strategy: data is first written to
 * `<filePath>.tmp` and then atomically renamed into place. This prevents
 * truncation of the destination file if the process is killed mid-write.
 *
 * JS/TS locale files (`.js`, `.cjs`, `.mjs`, `.ts`, `.tsx`) are **read-only**:
 * this function throws if asked to write to one, because doing so would
 * destroy any imports, type annotations, or custom code the user may have
 * around the exported object. Convert such files to `.json` / `.yaml` if you
 * want `extract` / `prune` to mutate them.
 */
export function writeLocaleFile(
  filePath: string,
  obj: Record<string, unknown>
): void {
  const ext = path.extname(filePath).toLowerCase()

  if (JS_TS_EXTENSIONS.has(ext)) {
    throw new Error(
      `Refusing to write JS/TS locale file '${path.basename(filePath)}'.\n` +
        `i18n-sharpen can read .js/.cjs/.mjs/.ts/.tsx locale files but will not overwrite them, ` +
        `because doing so would destroy any imports, type annotations, or custom code in the source.\n` +
        `Fix: convert this locale to .json or .yaml so extract/prune can update it safely, ` +
        `or add the missing keys manually.`
    )
  }

  let content = ""
  if (ext === ".yaml" || ext === ".yml") {
    content = YAML.stringify(obj, { indent: 2 })
  } else {
    content = JSON.stringify(obj, null, 2)
  }

  if (!content.endsWith("\n")) {
    content += "\n"
  }

  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, content, "utf8")
  try {
    fs.renameSync(tmpPath, filePath)
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // ignore secondary failure
    }
    throw error
  }
}

/**
 * Minimal write-plan used by `writeLocaleFilesAtomic`. Decouples the core
 * locale-io layer from prune/extract-specific plan shapes.
 */
export interface WriteLocalePlan {
  /** Absolute path to the final locale file (.json or .yaml/.yml). */
  filePath: string
  /** Nested object to serialize. Must NOT be a JS/TS locale file path. */
  nestedJson: Record<string, unknown>
}

/**
 * Write multiple locale files atomically using a two-phase commit.
 *
 * **Phase A (write all .tmp files):** every plan's serialized content is
 * written to `<filePath>.tmp`. If any single write fails (ENOENT,
 * ENOSPC, EACCES, ...), every `.tmp` file created so far is best-effort
 * deleted and the function throws `I18nSharpenError({ kind: "filesystem" })`.
 * On Phase A failure NONE of the original files are touched — the
 * caller's locale set is guaranteed consistent with pre-call state.
 *
 * **Phase B (rename .tmp → final, in order):** once every `.tmp` is on
 * disk, each `.tmp` is renamed to its final path. If a rename fails
 * mid-loop, the function:
 *   - throws an error detailing which files were committed (files 0..N-1)
 *     and which remain as `.tmp` (files N..M-1)
 *   - leaves the remaining `.tmp` files on disk for user inspection
 *   - does NOT roll back already-renamed files (rollback would itself
 *     be error-prone — D-10 documents this trade-off)
 *   - throws `I18nSharpenError({ kind: "filesystem" })`
 *
 * **JS/TS guard:** writing to .js/.cjs/.mjs/.ts/.tsx files is refused
 * via the same path-extension check as `writeLocaleFile` (delegated to
 * the per-plan content-formatting helper).
 *
 * @param plans  Ordered list of plans. Empty array is a no-op.
 */
export function writeLocaleFilesAtomic(plans: WriteLocalePlan[]): void {
  if (plans.length === 0) return

  // Phase A: serialize content + write all .tmp files
  const tmpPaths: string[] = []

  for (const plan of plans) {
    const ext = path.extname(plan.filePath).toLowerCase()
    if (JS_TS_EXTENSIONS.has(ext)) {
      // Cleanup any .tmp files written so far, then surface the same
      // refusal as writeLocaleFile would.
      for (const t of tmpPaths) {
        try {
          fs.unlinkSync(t)
        } catch {
          /* ignore secondary failure */
        }
      }
      throw new Error(
        `Refusing to write JS/TS locale file '${path.basename(plan.filePath)}'.\n` +
          `i18n-sharpen can read .js/.cjs/.mjs/.ts/.tsx locale files but will not overwrite them.`
      )
    }

    let content = ""
    if (ext === ".yaml" || ext === ".yml") {
      content = YAML.stringify(plan.nestedJson, { indent: 2 })
    } else {
      content = JSON.stringify(plan.nestedJson, null, 2)
    }
    if (!content.endsWith("\n")) content += "\n"

    const tmpPath = `${plan.filePath}.tmp`
    try {
      fs.writeFileSync(tmpPath, content, "utf8")
      tmpPaths.push(tmpPath)
    } catch (error) {
      // Phase A failure — clean up all .tmp files created so far.
      for (const t of tmpPaths) {
        try {
          fs.unlinkSync(t)
        } catch {
          /* ignore secondary failure */
        }
      }
      throw new I18nSharpenError({
        kind: "filesystem",
        message: `Atomic write failed during Phase A (.tmp write) for '${plan.filePath}': ${(error as Error).message}. No original files were modified.`,
        path: plan.filePath,
        cause: error
      })
    }
  }

  // Phase B: rename .tmp → final path, in order
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]
    const tmpPath = tmpPaths[i]
    try {
      fs.renameSync(tmpPath, plan.filePath)
    } catch (error) {
      // Phase B failure — partial commit. Log clearly, leave the
      // remaining .tmp files on disk, do NOT roll back already-renamed
      // files.
      const committed = plans.slice(0, i).map((p) => p.filePath)
      const pending = plans.slice(i).map((p) => `${p.filePath}.tmp`)
      throw new I18nSharpenError({
        kind: "filesystem",
        message:
          `Atomic write failed during Phase B (rename) for '${plan.filePath}': ${(error as Error).message}.\n` +
          `Committed files (already renamed): ${committed.length === 0 ? "(none)" : committed.join(", ")}\n` +
          `Pending .tmp files remaining on disk: ${pending.join(", ")}\n` +
          `Inspect the .tmp files manually and either rename them or delete them.`,
        path: plan.filePath,
        cause: error
      })
    }
  }
}

/**
 * Load every supported language's locale file into a flat map.
 *
 * Returns:
 *   - `locales`: parsed nested object per language
 *   - `localesFlat`: dot-flat map per language
 *   - `localeKeySets`: Set of dot-flat keys per language
 *   - `localePaths`: resolved file path per language (null when missing)
 *
 * Missing locale files are reported via `onMissing` (defaults to a no-op).
 * Parse errors are thrown to the caller — they're never recoverable.
 */
export function loadAllLocales(
  localesDir: string,
  supportedLanguages: string[],
  onMissing: (lang: string, localesDir: string) => void = () => {
    /* no-op */
  }
): {
  locales: Record<string, Record<string, unknown>>
  localesFlat: Record<string, Record<string, unknown>>
  localeKeySets: Record<string, Set<string>>
  localePaths: Record<string, string | null>
} {
  const locales: Record<string, Record<string, unknown>> = {}
  const localesFlat: Record<string, Record<string, unknown>> = {}
  const localeKeySets: Record<string, Set<string>> = {}
  const localePaths: Record<string, string | null> = {}

  for (const lang of supportedLanguages) {
    const langPath = findLocaleFile(localesDir, lang)
    localePaths[lang] = langPath

    if (!langPath) {
      onMissing(lang, localesDir)
      locales[lang] = {}
      localesFlat[lang] = {}
      localeKeySets[lang] = new Set()
      continue
    }

    const parsed = readLocaleFile(langPath)
    locales[lang] = parsed
    localesFlat[lang] = flattenObject(parsed)
    localeKeySets[lang] = new Set(Object.keys(localesFlat[lang]))
  }

  return { locales, localesFlat, localeKeySets, localePaths }
}

/**
 * Phase 7: load every namespace file under `<localesDir>/<lang>/` and
 * merge into a single flat map per language using `namespace:` prefix.
 *
 * Example layout:
 *   locales/en/common.json  -> keys load as "common:greeting", ...
 *   locales/en/auth.json    -> keys load as "auth:login.title", ...
 *
 * Languages without a directory (or with an empty one) load as empty
 * maps; the caller's `onMissing` callback is invoked once per missing
 * language.
 */
export function loadNamespacedLocales(
  localesDir: string,
  supportedLanguages: string[],
  onMissing: (lang: string, localesDir: string) => void = () => {
    /* no-op */
  }
): {
  locales: Record<string, Record<string, unknown>>
  localesFlat: Record<string, Record<string, unknown>>
  localeKeySets: Record<string, Set<string>>
  localeNamespaces: Record<string, Record<string, string>>
} {
  const locales: Record<string, Record<string, unknown>> = {}
  const localesFlat: Record<string, Record<string, unknown>> = {}
  const localeKeySets: Record<string, Set<string>> = {}
  const localeNamespaces: Record<string, Record<string, string>> = {}

  for (const lang of supportedLanguages) {
    const langDir = path.join(localesDir, lang)
    localeNamespaces[lang] = {}
    if (!fs.existsSync(langDir) || !fs.statSync(langDir).isDirectory()) {
      onMissing(lang, localesDir)
      locales[lang] = {}
      localesFlat[lang] = {}
      localeKeySets[lang] = new Set()
      continue
    }

    const entries = fs.readdirSync(langDir, { withFileTypes: true })
    const merged: Record<string, unknown> = {}
    const mergedFlat: Record<string, unknown> = {}

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!LOCALE_EXTENSIONS.includes(ext)) continue
      const ns = path.basename(entry.name, ext)
      const filePath = path.join(langDir, entry.name)
      localeNamespaces[lang][ns] = filePath

      const parsed = readLocaleFile(filePath)
      merged[ns] = parsed
      const nsFlat = flattenObject(parsed)
      for (const [k, v] of Object.entries(nsFlat)) {
        mergedFlat[`${ns}:${k}`] = v
      }
    }

    locales[lang] = merged
    localesFlat[lang] = mergedFlat
    localeKeySets[lang] = new Set(Object.keys(mergedFlat))
  }

  return { locales, localesFlat, localeKeySets, localeNamespaces }
}
