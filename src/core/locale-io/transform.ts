import * as path from "path"
import { log } from "@/utils"

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
): Record<string, unknown> {
  const map: Record<string, unknown> = {}
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
        map[newKey] = value
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
 * Normalize a (possibly platform-specific) path for display in reports
 * and console output. Converts Windows backslashes to forward slashes
 * so reports are platform-independent.
 */
export function normalizeDisplayPath(p: string): string {
  return p.split(path.sep).join("/")
}
