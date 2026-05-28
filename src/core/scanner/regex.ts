/**
 * Escape a string so it can be safely embedded in a regular expression.
 * Used to defend against regex-injection / ReDoS via user-controlled
 * matchFunctions / matchAttributes config entries.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Build the regex that matches `<fn>("key")` / `<fn>('key')` /
 * `` <fn>(`key`) `` calls. `matchFunctions` entries are regex-escaped
 * before being spliced in as an alternation group.
 */
export function buildKeyRegex(matchFunctions: string[]): RegExp {
  const functionsJoined = matchFunctions.map(escapeRegex).join("|")
  return new RegExp(
    "\\b(?:" + functionsJoined + ")\\s*\\(\\s*(['\"`])([a-zA-Z0-9_\\-.:]+)\\1",
    "g"
  )
}

/**
 * Build the regex that matches `attr="key"` / `attr='key'` /
 * `` attr=`key` `` JSX/HTML attributes. `matchAttributes` entries are
 * regex-escaped before being spliced in.
 *
 * Phase 8: framework attribute names can start with ':' (Vue v-bind)
 * or end with ':' (Astro directives), so we can't rely on \b at the
 * start of the alternation. Use a non-attribute-name lookbehind /
 * start-of-string anchor instead so partial matches like `mi18n` for
 * `i18n` are still rejected.
 */
export function buildAttrRegex(matchAttributes: string[]): RegExp {
  const attrsJoined = matchAttributes.map(escapeRegex).join("|")
  return new RegExp(
    "(?:^|[\\s/{(>])(?:" +
      attrsJoined +
      ")\\s*=\\s*(['\"`])([a-zA-Z0-9_\\-.:]+)\\1",
    "g"
  )
}

/**
 * Build the regex used by validate to capture the first argument of
 * every `<fn>(...)` call regardless of whether it starts with a quote.
 * The caller post-classifies via `isStaticStringLiteral` to flag
 * dynamic references.
 */
export function buildDynamicCallRegex(matchFunctions: string[]): RegExp {
  const functionsJoined = matchFunctions.map(escapeRegex).join("|")
  return new RegExp("\\b(?:" + functionsJoined + ")\\s*\\(\\s*([^)]*)\\)", "g")
}
