import { stripComments } from "./text"

export interface HardcodedTextCandidate {
  text: string
  offset: number
}

const SKIP_TAGS = [
  "script",
  "style",
  "code",
  "pre",
  "svg",
  "path",
  "noscript",
  "iframe",
  "svelte:head"
]

/**
 * Scan source text char-by-char to find un-translated text node, attribute,
 * and expression literal candidates.
 * Strips out script, style, comments, and complex brace expressions.
 */
export function scanTemplateTextNodes(
  source: string
): HardcodedTextCandidate[] {
  const candidates: HardcodedTextCandidate[] = []
  let mode: "TEXT" | "TAG" | "EXPR" | "BLOCK_SKIP" = "TEXT"
  let i = 0
  const n = source.length

  let currentText = ""
  let currentTextStartOffset = 0

  let currentTagContent = ""
  let currentTagStartOffset = 0

  let currentExprContent = ""
  let currentExprStartOffset = 0
  let braceDepth = 0

  let skipTargetClose = ""

  while (i < n) {
    const ch = source[i]

    if (mode === "TEXT") {
      if (source.slice(i, i + 4) === "<!--") {
        flushTextNode(currentText, currentTextStartOffset)
        currentText = ""
        mode = "BLOCK_SKIP"
        skipTargetClose = "-->"
        i += 4
        continue
      }

      if (ch === "<") {
        flushTextNode(currentText, currentTextStartOffset)
        currentText = ""
        mode = "TAG"
        currentTagStartOffset = i
        currentTagContent = ""
        i++
        continue
      }

      if (ch === "{") {
        flushTextNode(currentText, currentTextStartOffset)
        currentText = ""
        mode = "EXPR"
        currentExprStartOffset = i
        currentExprContent = ""
        braceDepth = 1
        i++
        continue
      }

      if (currentText === "") {
        currentTextStartOffset = i
      }
      currentText += ch
      i++
      continue
    }

    if (mode === "TAG") {
      if (ch === ">") {
        const isSelfClosing = currentTagContent.trim().endsWith("/")
        const tagInner = isSelfClosing
          ? currentTagContent.slice(0, currentTagContent.length - 1)
          : currentTagContent

        // Parse attributes
        parseAttributes(tagInner, currentTagStartOffset + 1)

        const matchTagName = /^\/?([a-zA-Z0-9_\-:]+)/.exec(tagInner.trim())
        const tagName = matchTagName ? matchTagName[1].toLowerCase() : ""

        if (
          tagName &&
          SKIP_TAGS.includes(tagName) &&
          !isSelfClosing &&
          !tagInner.trim().startsWith("/")
        ) {
          mode = "BLOCK_SKIP"
          skipTargetClose = `</${tagName}>`
        } else {
          mode = "TEXT"
          currentTextStartOffset = i + 1
          currentText = ""
        }
        i++
        continue
      }

      currentTagContent += ch
      i++
      continue
    }

    if (mode === "EXPR") {
      if (ch === "{") {
        braceDepth++
      } else if (ch === "}") {
        braceDepth--
      }

      if (braceDepth === 0) {
        parseExpression(currentExprContent, currentExprStartOffset)
        mode = "TEXT"
        currentTextStartOffset = i + 1
        currentText = ""
        i++
        continue
      }

      currentExprContent += ch
      i++
      continue
    }

    const matchClose = source.slice(i, i + skipTargetClose.length)
    if (matchClose.toLowerCase() === skipTargetClose.toLowerCase()) {
      i += skipTargetClose.length
      mode = "TEXT"
      currentTextStartOffset = i
      currentText = ""
      continue
    }
    i++
  }

  if (mode === "TEXT") {
    flushTextNode(currentText, currentTextStartOffset)
  }

  return candidates

  function flushTextNode(text: string, startOffset: number) {
    const trimmed = text.trim()
    if (trimmed.length > 0) {
      const idx = text.indexOf(trimmed)
      candidates.push({
        text: trimmed,
        offset: startOffset + idx
      })
    }
  }

  function parseAttributes(tagContent: string, tagOffset: number) {
    const attrRegex =
      /\b(placeholder|label|title|alt|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
    let match
    while ((match = attrRegex.exec(tagContent)) !== null) {
      const value = match[2] || match[3] || ""
      const eqIndex = match[0].indexOf("=")
      const quoteIndex = match[0].indexOf(match[2] ? '"' : "'", eqIndex)
      const valueStart = tagOffset + match.index + quoteIndex + 1
      const trimmed = value.trim()
      if (trimmed.length > 0) {
        candidates.push({
          text: trimmed,
          offset: valueStart + value.indexOf(trimmed)
        })
      }
    }
  }

  function parseExpression(exprContent: string, exprOffset: number) {
    const cleanExpr = stripComments(exprContent).trim()
    const stringMatch = /^(['"`])([\s\S]*)\1$/.exec(cleanExpr)
    if (stringMatch) {
      const quote = stringMatch[1]
      const innerVal = stringMatch[2]
      if (quote !== "`" || !innerVal.includes("${")) {
        const rawIndex = exprContent.indexOf(cleanExpr)
        if (rawIndex !== -1) {
          const valueStart = exprOffset + rawIndex + 1 + 1 // +1 for '{', +1 for quote
          const trimmed = innerVal.trim()
          if (trimmed.length > 0) {
            candidates.push({
              text: trimmed,
              offset: valueStart + innerVal.indexOf(trimmed)
            })
          }
        }
      }
    }
  }
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

  // 3. Custom ignores
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
