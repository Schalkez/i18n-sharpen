/**
 * Classify the first-arg payload of a non-static `t(...)` call into
 * one of two buckets per Phase 2 D-01..D-07:
 *   - `fully-dynamic` : bare ident, function call, template with leading
 *     interpolation, or conditional expression.
 *   - `structured-concat` : leading static segment + dynamic tail (string
 *     concat with `+` or template literal with non-leading interpolation).
 *
 * The caller is expected to have already confirmed the arg is NOT a
 * static string literal (via `isStaticStringLiteral`). This module is
 * pure / regex-based — no AST.
 */

export type DynamicClassification =
  | { kind: "fully-dynamic" }
  | { kind: "structured-concat"; prefix: string }

/**
 * Extract the longest leading static segment from a dynamic-key arg.
 * Returns the unquoted prefix string, or null if the arg has no
 * leading static segment (i.e. it starts with an identifier, function
 * call, conditional, or template interpolation).
 *
 * Per D-07: surrounding quotes / backticks are stripped from the
 * returned prefix.
 */
export function extractLeadingPrefix(arg: string): string | null {
  const trimmed = arg.trim()
  if (trimmed.length < 2) return null
  const quote = trimmed[0]
  if (quote !== '"' && quote !== "'" && quote !== "`") return null

  // For template literals: take everything before the first ${...}.
  if (quote === "`") {
    // Find first unescaped ${. If at index 1 (immediately after `),
    // there's no leading static segment.
    let i = 1
    while (i < trimmed.length) {
      const ch = trimmed[i]
      if (ch === "\\" && i + 1 < trimmed.length) {
        i += 2
        continue
      }
      if (ch === "$" && trimmed[i + 1] === "{") {
        // segment is trimmed[1..i)
        if (i === 1) return null
        return trimmed.slice(1, i)
      }
      if (ch === "`") {
        // Closing backtick with no interpolation.
        return trimmed.slice(1, i)
      }
      i++
    }
    return null
  }

  // For "..." / '...' string concat: extract through the closing
  // matching quote.
  let i = 1
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === "\\" && i + 1 < trimmed.length) {
      i += 2
      continue
    }
    if (ch === quote) {
      // Closing quote — leading static is trimmed[1..i).
      return trimmed.slice(1, i)
    }
    i++
  }
  return null
}

/**
 * Classify a non-static `t(...)` first-arg per D-01..D-04.
 *
 * Precondition: `isStaticStringLiteral(arg) === false`. Passing a
 * static literal to this function is a programming error.
 */
export function classifyDynamicCall(arg: string): DynamicClassification {
  const prefix = extractLeadingPrefix(arg)
  if (prefix === null) {
    return { kind: "fully-dynamic" }
  }
  return { kind: "structured-concat", prefix }
}
