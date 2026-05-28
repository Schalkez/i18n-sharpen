import * as fs from "fs"
import * as path from "path"
import type { I18nSharpenConfig } from "../types"
import { escapeRegex } from "../utils"

/**
 * Recursively find all source files in a directory matching specific
 * extensions, ignoring specified directories.
 *
 * Uses readdirSync({ withFileTypes: true }) so each entry's type is known
 * without an extra statSync call. Symlinks are skipped to avoid infinite
 * recursion on symlink cycles or junction points.
 *
 * `excludeDirs` matches against the bare directory name (entry.name),
 * not the full path and not as a glob.
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
 * State machine that tracks string contexts ('...', "...", `...` including
 * ${} interpolation depth) so that:
 *   - `//` inside a string is preserved
 *   - `*` `/` inside a string does not terminate a block comment
 *   - URLs like "https://x" survive intact
 *   - escapes (`\"`, `\\`, etc.) inside strings are respected
 *
 * Comments are replaced with a single space so token boundaries are
 * preserved.
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

    if (top) {
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
      if (top.kind === "template" && top.templateDepth > 0) {
        // Fall through to non-string handling below
      } else {
        if (ch === "\\" && i + 1 < n) {
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

    if (ch === "/" && next === "*") {
      i += 2
      while (i < n && !(code[i] === "*" && i + 1 < n && code[i + 1] === "/")) {
        i++
      }
      i += 2
      out.push(" ")
      continue
    }
    if (ch === "/" && next === "/") {
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
 * Return true if `arg` is a single static string literal — i.e. a quoted
 * literal that consumes the whole argument with no concatenation, no
 * template interpolation, and no trailing tokens.
 */
export function isStaticStringLiteral(arg: string): boolean {
  const trimmed = arg.trim()
  if (trimmed.length < 2) return false
  const quote = trimmed[0]
  if (quote !== "'" && quote !== '"' && quote !== "`") return false
  let i = 1
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === "\\" && i + 1 < trimmed.length) {
      i += 2
      continue
    }
    if (quote === "`" && ch === "$" && trimmed[i + 1] === "{") {
      return false
    }
    if (ch === quote) {
      return i === trimmed.length - 1
    }
    i++
  }
  return false
}

/**
 * Strip the first matching plural / context suffix off `key`. Returns
 * `key` unchanged when no suffix matches.
 */
export function getBaseKey(key: string, suffixes: string[]): string {
  for (const suffix of suffixes) {
    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length)
    }
  }
  return key
}

/**
 * Test if a string matches a wildcard pattern (e.g. "status.*" matches
 * "status.success"). `?` is treated as a literal character, not a regex
 * quantifier.
 */
export function matchWildcard(pattern: string, key: string): boolean {
  if (pattern === "*") return true
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
  const regex = new RegExp(`^${escaped}$`)
  return regex.test(key)
}

/**
 * Test whether `key` should be considered used given the set of keys
 * found in source, the user's ignoreKeys wildcards, and the configured
 * plural suffixes.
 */
export function isKeyUsed(
  key: string,
  usedKeys: Set<string>,
  ignoreKeys: string[] | undefined,
  pluralSuffixes: string[]
): boolean {
  if (usedKeys.has(key)) return true

  if (ignoreKeys) {
    for (const pattern of ignoreKeys) {
      if (matchWildcard(pattern, key)) {
        return true
      }
    }
  }

  const baseKey = getBaseKey(key, pluralSuffixes)
  if (baseKey !== key && usedKeys.has(baseKey)) {
    return true
  }

  return false
}

/**
 * Build the regex that matches `<fn>("key")` / `<fn>('key')` /
 * `` <fn>(`key`) `` calls. `matchFunctions` entries are regex-escaped
 * before being spliced in as an alternation group.
 */
export function buildKeyRegex(matchFunctions: string[]): RegExp {
  const functionsJoined = matchFunctions.map(escapeRegex).join("|")
  return new RegExp(
    "\\b(?:" + functionsJoined + ")\\s*\\(\\s*(['\"`])([a-zA-Z0-9_\\-.]+)\\1",
    "g"
  )
}

/**
 * Build the regex that matches `attr="key"` / `attr='key'` /
 * `` attr=`key` `` JSX/HTML attributes. `matchAttributes` entries are
 * regex-escaped before being spliced in.
 */
export function buildAttrRegex(matchAttributes: string[]): RegExp {
  const attrsJoined = matchAttributes.map(escapeRegex).join("|")
  return new RegExp(
    "\\b(?:" + attrsJoined + ")\\s*=\\s*(['\"`])([a-zA-Z0-9_\\-.]+)\\1",
    "g"
  )
}

/**
 * Build the regex used by validate.ts to capture the first argument of
 * every `<fn>(...)` call regardless of whether it starts with a quote.
 * The caller post-classifies via `isStaticStringLiteral` to flag
 * dynamic references.
 */
export function buildDynamicCallRegex(matchFunctions: string[]): RegExp {
  const functionsJoined = matchFunctions.map(escapeRegex).join("|")
  return new RegExp("\\b(?:" + functionsJoined + ")\\s*\\(\\s*([^)]*)\\)", "g")
}

/**
 * Walk every configured `scanDirs` entry and collect absolute paths of
 * files whose extension matches `config.fileExtensions`. Missing entries
 * are silently skipped; the caller decides whether to warn.
 */
export function scanSourceFiles(
  config: I18nSharpenConfig,
  cwd: string
): string[] {
  const filesToScan: string[] = []
  for (const scanDir of config.scanDirs) {
    const scanDirAbs = path.resolve(cwd, scanDir)
    if (fs.existsSync(scanDirAbs)) {
      filesToScan.push(
        ...getFiles(
          scanDirAbs,
          config.fileExtensions || [],
          config.excludeDirs || []
        )
      )
    }
  }
  return filesToScan
}

/**
 * Read every file in `files`, strip comments, then run the function/attr
 * regex over each cleaned source. Returns:
 *   - `usedKeys`: the set of statically-resolvable translation keys
 *   - `fileContents`: the cleaned source per file (parallel to `files`),
 *     useful for the optional looseKeyMatch second pass
 *
 * Keys that end in `.` are skipped — they indicate dynamic prefixes
 * (e.g. `t('status.' + code)` -> `t('status.'`) and would otherwise
 * pollute the used-key set.
 */
export function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[]
): { usedKeys: Set<string>; fileContents: string[] } {
  const keyRegex = buildKeyRegex(matchFunctions)
  const attrRegex = buildAttrRegex(matchAttributes)

  const fileContents = files.map((file) => {
    try {
      const content = fs.readFileSync(file, "utf8")
      return stripComments(content)
    } catch {
      return ""
    }
  })

  const usedKeys = new Set<string>()
  for (const cleanContent of fileContents) {
    for (const match of cleanContent.matchAll(keyRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }
    for (const match of cleanContent.matchAll(attrRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }
  }

  return { usedKeys, fileContents }
}
