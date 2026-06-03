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
 * Comments are replaced with a single space so token boundaries are preserved.
 */
export function stripComments(code: string): string {
  interface StackFrame {
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
      const after = trimmed.slice(i + 1).trim()
      // Static literal: nothing after (`"key"`) OR options-object follows (`"key", { ... }`)
      return after.length === 0 || after.startsWith(",")
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
 * Test whether a trimmed candidate string matches default filters
 * (punctuation, numbers) or custom user ignore globs/regexes.
 */
export function isHardcodedIgnored(
  text: string,
  customIgnores: string[] = []
): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return true

  // 1. Punctuation-only
  const punctuationRegex =
    /^[!@#$%^&*()_+={}[\]|\\:;"'<>,.?/~` \-—–••…&bull;&nbsp;&middot;]+$/
  if (punctuationRegex.test(trimmed)) return true

  // 2. Numbers-only
  const numbersRegex = /^[0-9\s.,%-]+$/
  if (numbersRegex.test(trimmed)) return true

  // 3. HTML entities (e.g., &nbsp;, &times;, &#39;)
  const htmlEntityRegex = /^&[a-zA-Z0-9#]+;$/
  if (htmlEntityRegex.test(trimmed)) return true

  // 4. Custom ignores
  for (const pattern of customIgnores) {
    if (pattern === trimmed) return true
    try {
      const regex = new RegExp(pattern)
      if (regex.test(trimmed)) return true
    } catch {
      // Skip invalid regexes
    }
  }

  return false
}
