import * as fs from "fs"
import * as path from "path"
import pc from "picocolors"
import YAML from "yaml"

/**
 * Recursively find all source files in a directory matching specific extensions,
 * ignoring specified directories.
 *
 * Uses readdirSync({ withFileTypes: true }) so each entry's type is
 * known without an extra statSync call (MD-02). Symlinks are skipped to
 * avoid infinite recursion on symlink cycles or junction points (MD-01).
 *
 * NOTE (MD-03): `excludeDirs` is matched against the bare directory name
 * (entry.name), not the full path and not as a glob. Listing
 * `"coverage"` excludes every directory called `coverage` at any depth;
 * it does NOT allow excluding `src/legacy` specifically. If you need
 * path-aware excludes, factor that policy into the caller.
 */
export function getFiles(
  dir: string,
  extensions: string[],
  excludeDirs: string[]
): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    // Skip symlinks entirely — they can point back into an ancestor
    // directory (cycle) or to anywhere outside the scan root.
    if (entry.isSymbolicLink()) continue

    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        results.push(...getFiles(filePath, extensions, excludeDirs))
      }
    } else if (entry.isFile()) {
      if (extensions.includes(path.extname(entry.name))) {
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
 * Return true if `arg` is a single static string literal — i.e. a quoted
 * literal that consumes the whole argument with no concatenation, no
 * template interpolation, and no trailing tokens.
 *
 * Used by validate.ts to decide whether a `t(...)` call is statically
 * resolvable or should be flagged as dynamic.
 */
export function isStaticStringLiteral(arg: string): boolean {
  const trimmed = arg.trim()
  if (trimmed.length < 2) return false
  const quote = trimmed[0]
  if (quote !== "'" && quote !== '"' && quote !== "`") return false
  // Walk the literal respecting escapes; if it terminates before the end
  // of `trimmed`, the argument has trailing tokens (concatenation, etc.)
  // and is not a single static literal.
  let i = 1
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === "\\" && i + 1 < trimmed.length) {
      i += 2
      continue
    }
    if (quote === "`" && ch === "$" && trimmed[i + 1] === "{") {
      // Template literal with placeholder — dynamic by definition.
      return false
    }
    if (ch === quote) {
      // Literal closes here; if there is anything after it, it's dynamic.
      return i === trimmed.length - 1
    }
    i++
  }
  // Unterminated literal — treat as not-static so the user is warned.
  return false
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
