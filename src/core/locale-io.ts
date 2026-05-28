import * as fs from "fs"
import * as path from "path"
import YAML from "yaml"
import { log } from "../utils"

/**
 * Forbidden path segments that could lead to prototype pollution
 * when used as keys in `setNestedValue` / `flattenObject`. Exported so
 * other modules can reuse the same guard list.
 */
export const FORBIDDEN_KEY_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor"
])

/**
 * Flatten a nested JSON/YAML object into a flat key-value map using
 * dot notation.
 *
 * `.` is the path separator AND a permitted character in a key. A locale
 * containing both `{ "user.name": "X", "user": { "name": "Y" } }` produces
 * the same flat key `user.name`; whichever iteration order wins overwrites
 * the other. A warning is emitted when this happens.
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (FORBIDDEN_KEY_SEGMENTS.has(key)) continue
      const value = obj[key]
      const newKey = prefix ? `${prefix}.${key}` : key
      if (Object.prototype.hasOwnProperty.call(map, newKey)) {
        log.warn(
          `Key collision in locale: '${newKey}' is produced both as a flat key and as a nested path. The later definition wins.`
        )
      }
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        Object.assign(
          map,
          flattenObject(value as Record<string, unknown>, newKey)
        )
      } else {
        map[newKey] = String(value)
      }
    }
  }
  return map
}

/**
 * Set a value in a nested object based on a dot-separated key path.
 *
 * Rejects path segments equal to `__proto__`, `prototype`, or
 * `constructor` to prevent prototype-pollution via untrusted key strings.
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown
): void {
  const parts = keyPath.split(".")
  for (const part of parts) {
    if (FORBIDDEN_KEY_SEGMENTS.has(part)) {
      return
    }
  }
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (i === parts.length - 1) {
      current[part] = value
    } else {
      if (
        current[part] === undefined ||
        typeof current[part] !== "object" ||
        current[part] === null
      ) {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }
  }
}

/**
 * Get a value from a nested object based on a dot-separated key path.
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  keyPath: string
): unknown {
  const parts = keyPath.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== "object"
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Build a nested object from a flat dot-notation key-value map. Alias
 * kept as `buildNestedObject` for clarity in callers that don't want to
 * read this as "unflatten".
 */
export function buildNestedObject(
  flatObj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key in flatObj) {
    if (Object.prototype.hasOwnProperty.call(flatObj, key)) {
      setNestedValue(result, key, flatObj[key])
    }
  }
  return result
}

/** Alias for {@link buildNestedObject}. */
export const unflattenObject = buildNestedObject

/**
 * Find the path of a locale file for a given language.
 *
 * Checks for .json, .yaml, .yml in that order. If multiple files with
 * the same base name exist (e.g. `en.json` and `en.yaml`), a warning
 * is emitted and the first match wins.
 */
export function findLocaleFile(
  localesDir: string,
  lang: string
): string | null {
  const extensions = [".json", ".yaml", ".yml"]
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
 * Load and parse a locale file (JSON or YAML).
 *
 * Tolerates real-world edge cases that previously crashed the tool:
 *   - UTF-8 BOM prefix (`\\uFEFF`)
 *   - whitespace-only content
 *   - empty content
 * Returns an empty object instead of throwing in those cases.
 */
export function readLocaleFile(filePath: string): Record<string, unknown> {
  const ext = path.extname(filePath).toLowerCase()
  let content = fs.readFileSync(filePath, "utf8")
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1)
  }
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return {}
  }

  if (ext === ".yaml" || ext === ".yml") {
    const parsed = YAML.parse(trimmed)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  }
  return JSON.parse(trimmed)
}

/**
 * Write a locale object to a file (JSON or YAML format).
 *
 * Uses a write-then-rename strategy: data is first written to
 * `<filePath>.tmp` and then atomically renamed into place. This prevents
 * truncation of the destination file if the process is killed mid-write.
 */
export function writeLocaleFile(
  filePath: string,
  obj: Record<string, unknown>
): void {
  const ext = path.extname(filePath).toLowerCase()
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
 * Normalize a (possibly platform-specific) path for display in reports
 * and console output. Converts Windows backslashes to forward slashes
 * so reports are platform-independent.
 */
export function normalizeDisplayPath(p: string): string {
  return p.split(path.sep).join("/")
}

/**
 * Load every supported language's locale file into a flat map.
 *
 * Returns:
 *   - `locales`: parsed nested object per language (used by validate
 *     for placeholder/value comparison)
 *   - `localesFlat`: dot-flat map per language
 *   - `localeKeySets`: Set of dot-flat keys per language (used by
 *     validate for alignment checks)
 *   - `localePaths`: resolved file path per language (null when missing)
 *
 * Missing locale files are reported via `onMissing` (defaults to a no-op
 * so callers that don't care can ignore them). Parse errors are thrown
 * to the caller — they're never recoverable.
 */
export function loadAllLocales(
  localesDir: string,
  supportedLanguages: string[],
  onMissing: (lang: string, localesDir: string) => void = () => {}
): {
  locales: Record<string, Record<string, unknown>>
  localesFlat: Record<string, Record<string, string>>
  localeKeySets: Record<string, Set<string>>
  localePaths: Record<string, string | null>
} {
  const locales: Record<string, Record<string, unknown>> = {}
  const localesFlat: Record<string, Record<string, string>> = {}
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
