import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import YAML from "yaml"

/**
 * Recursively find all source files in a directory matching specific extensions,
 * ignoring specified directories.
 */
export function getFiles(
  dir: string,
  extensions: string[],
  excludeDirs: string[]
): string[] {
  let results: string[] = []
  if (!fs.existsSync(dir)) return results

  const list = fs.readdirSync(dir)
  for (const file of list) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat && stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        results = results.concat(getFiles(filePath, extensions, excludeDirs))
      }
    } else {
      if (extensions.includes(path.extname(file))) {
        results.push(filePath)
      }
    }
  }
  return results
}

/**
 * Remove single-line and multi-line comments from JS/TS code without
 * corrupting string contents.
 *
 * Implemented as a small state machine that tracks string contexts
 * ('...', "...", `...` including ${} interpolation depth) so that:
 *   - `//` inside a string is preserved
 *   - `*` `/` inside a string does not terminate a block comment
 *   - URLs like "https://x" survive intact
 *   - escapes (`\"`, `\\`, etc.) inside strings are respected
 *
 * Comments are replaced with a single space so token boundaries (e.g.
 * `a/*x*\/b` -> `a b`) are preserved.
 */
export function stripComments(code: string): string {
  type StackFrame = {
    kind: "single" | "double" | "template"
    templateDepth: number
  }
  const out: string[] = []
  const stack: StackFrame[] = []
  let i = 0
  const n = code.length

  while (i < n) {
    const ch = code[i]
    const next = i + 1 < n ? code[i + 1] : ""
    const top = stack.length > 0 ? stack[stack.length - 1] : null

    // Inside a string?
    if (top) {
      // Handle template-literal interpolation depth
      if (top.kind === "template" && ch === "$" && next === "{") {
        top.templateDepth++
        out.push("${")
        i += 2
        continue
      }
      if (top.kind === "template" && top.templateDepth > 0 && ch === "}") {
        top.templateDepth--
        out.push("}")
        i++
        continue
      }
      // While inside an interpolation, treat code as normal code (handled below by re-entering loop with stack still tracking)
      if (top.kind === "template" && top.templateDepth > 0) {
        // Fall through to non-string handling below
      } else {
        // Inside the literal portion of a string
        if (ch === "\\" && i + 1 < n) {
          // Preserve escape sequence verbatim
          out.push(ch, code[i + 1])
          i += 2
          continue
        }
        if (
          (top.kind === "single" && ch === "'") ||
          (top.kind === "double" && ch === '"') ||
          (top.kind === "template" && ch === "`")
        ) {
          stack.pop()
          out.push(ch)
          i++
          continue
        }
        out.push(ch)
        i++
        continue
      }
    }

    // Not in a (literal) string — check for comment / string start
    if (ch === "/" && next === "*") {
      // Block comment — skip until */
      i += 2
      while (i < n && !(code[i] === "*" && i + 1 < n && code[i + 1] === "/")) {
        i++
      }
      i += 2 // skip closing */
      out.push(" ")
      continue
    }
    if (ch === "/" && next === "/") {
      // Line comment — skip until newline (keep the newline)
      i += 2
      while (i < n && code[i] !== "\n") {
        i++
      }
      out.push(" ")
      continue
    }
    if (ch === "'") {
      stack.push({ kind: "single", templateDepth: 0 })
      out.push(ch)
      i++
      continue
    }
    if (ch === '"') {
      stack.push({ kind: "double", templateDepth: 0 })
      out.push(ch)
      i++
      continue
    }
    if (ch === "`") {
      stack.push({ kind: "template", templateDepth: 0 })
      out.push(ch)
      i++
      continue
    }

    out.push(ch)
    i++
  }

  return out.join("")
}

/**
 * Flatten a nested JSON/YAML object into a flat key-value map using dot notation.
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
 * Checks for .json, .yaml, and .yml extensions.
 */
export function findLocaleFile(
  localesDir: string,
  lang: string
): string | null {
  const extensions = [".json", ".yaml", ".yml"]
  for (const ext of extensions) {
    const filePath = path.join(localesDir, `${lang}${ext}`)
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }
  return null
}

/**
 * Load and parse a locale file (JSON or YAML).
 */
export function readLocaleFile(filePath: string): Record<string, unknown> {
  const ext = path.extname(filePath).toLowerCase()
  const content = fs.readFileSync(filePath, "utf8")

  if (ext === ".yaml" || ext === ".yml") {
    return YAML.parse(content) || {}
  }
  return JSON.parse(content || "{}")
}

/**
 * Write a locale object to a file (JSON or YAML format).
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
  fs.writeFileSync(filePath, content, "utf8")
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
 * Test if a string matches a wildcard pattern (e.g. "status.*" matches "status.success").
 */
export function matchWildcard(pattern: string, key: string): boolean {
  if (pattern === "*") return true
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
  const regex = new RegExp(`^${escaped}$`)
  return regex.test(key)
}

/**
 * Logging helper utilities.
 */
export const log = {
  header(title: string): void {
    console.log(`\n${pc.bold(pc.cyan(`=== ${title} ===`))}`)
  },
  info(msg: string): void {
    console.log(msg)
  },
  success(msg: string): void {
    console.log(`${pc.green("✅")} ${msg}`)
  },
  warn(msg: string): void {
    console.log(`${pc.yellow("⚠️  Warning:")} ${msg}`)
  },
  error(msg: string): void {
    console.error(`${pc.red("❌ Error:")} ${msg}`)
  }
}
