import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import YAML from "yaml"

// Re-export scanner primitives from core/scanner for back-compat. New
// code should import from `./core/scanner` directly.
export {
  /** @deprecated Import from `./core/scanner` instead. */
  getFiles,
  /** @deprecated Import from `./core/scanner` instead. */
  stripComments,
  /** @deprecated Import from `./core/scanner` instead. */
  isStaticStringLiteral,
  /** @deprecated Import from `./core/scanner` instead. */
  getBaseKey,
  /** @deprecated Import from `./core/scanner` instead. */
  isKeyUsed,
  /** @deprecated Import from `./core/scanner` instead. */
  matchWildcard
} from "./core/scanner"

/**
 * Flatten a nested JSON/YAML object into a flat key-value map using dot notation.
 *
 * NOTE (MD-04): `.` is the path separator AND a permitted character in
 * a key. A locale containing both `{ "user.name": "X", "user": { "name": "Y" } }`
 * produces the same flat key `user.name`; whichever iteration order
 * wins overwrites the other and the original shape cannot be recovered
 * by unflattenObject. When this happens we emit a warning so the user
 * can rename one of the keys.
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Skip forbidden keys to defend against prototype-pollution
      // from malicious / corrupted locale JSON.
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
 * Forbidden path segments that could lead to prototype pollution
 * when used as keys in setNestedValue / flattenObject.
 */
const FORBIDDEN_KEY_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor"
])

/**
 * Set a value in a nested object based on a dot-separated key path.
 *
 * Rejects path segments equal to `__proto__`, `prototype`, or `constructor`
 * to prevent prototype-pollution via untrusted key strings.
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  keyPath: string,
  value: unknown
): void {
  const parts = keyPath.split(".")
  // Reject path segments that could pollute Object.prototype.
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
 * Build a nested object from a flat dot-notation key-value map.
 */
export function unflattenObject(
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

/**
 * Find the path of a locale file for a given language.
 *
 * Checks for .json, .yaml, and .yml extensions in that order. If
 * multiple files with the same base name exist (e.g. `en.json` and
 * `en.yaml`), a warning is emitted and the first match wins — this
 * surfaces accidental drift during JSON<->YAML migrations.
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
 *   - UTF-8 BOM prefix (`\\uFEFF`) — many Windows editors save with BOM
 *   - whitespace-only content
 *   - empty content
 * In all three cases the function returns an empty object instead of
 * throwing.
 */
export function readLocaleFile(filePath: string): Record<string, unknown> {
  const ext = path.extname(filePath).toLowerCase()
  let content = fs.readFileSync(filePath, "utf8")
  // Strip a UTF-8 BOM if present — JSON.parse rejects it.
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1)
  }
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return {}
  }

  if (ext === ".yaml" || ext === ".yml") {
    const parsed = YAML.parse(trimmed)
    // Treat null/undefined (e.g. an empty YAML or a YAML containing
    // literally `null`) as an empty object.
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
 * truncation of the destination file if the process is killed mid-write
 * (e.g. Ctrl-C during a large prune). Rename is atomic on POSIX and on
 * NTFS for the same volume.
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

  // Ensure trailing newline
  if (!content.endsWith("\n")) {
    content += "\n"
  }

  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, content, "utf8")
  try {
    fs.renameSync(tmpPath, filePath)
  } catch (error) {
    // Clean up the temp file on rename failure (e.g. cross-device link).
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
 * so reports are platform-independent and can be copy/pasted into
 * shells / browsers / cross-platform CI logs.
 */
export function normalizeDisplayPath(p: string): string {
  return p.split(path.sep).join("/")
}

/**
 * Escape a string so it can be safely embedded in a regular expression.
 * Used to defend against regex-injection / ReDoS via user-controlled
 * matchFunctions / matchAttributes config entries.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Logging helper utilities.
 *
 * LO-10: emoji can render as `?` on Windows cmd.exe and on some CI log
 * viewers. Set the NO_EMOJI environment variable (any truthy value) to
 * fall back to plain-text glyphs.
 */
const emojiDisabled =
  typeof process !== "undefined" &&
  !!process.env &&
  !!process.env.NO_EMOJI &&
  process.env.NO_EMOJI !== "0" &&
  process.env.NO_EMOJI.toLowerCase() !== "false"

const glyphs = {
  ok: emojiDisabled ? "[OK]" : "✅",
  warn: emojiDisabled ? "[WARN]" : "⚠️ ",
  err: emojiDisabled ? "[ERR]" : "❌"
}

export const log = {
  header(title: string): void {
    console.log(`\n${pc.bold(pc.cyan(`=== ${title} ===`))}`)
  },
  info(msg: string): void {
    console.log(msg)
  },
  success(msg: string): void {
    console.log(`${pc.green(glyphs.ok)} ${msg}`)
  },
  warn(msg: string): void {
    console.log(`${pc.yellow(`${glyphs.warn} Warning:`)} ${msg}`)
  },
  error(msg: string): void {
    console.error(`${pc.red(`${glyphs.err} Error:`)} ${msg}`)
  }
}
