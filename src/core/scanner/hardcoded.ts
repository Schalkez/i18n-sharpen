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
  source: string,
  isJsx = false
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

  let exprQuote: "'" | '"' | "`" | null = null
  let exprEscaped = false
  let exprInComment: "single" | "multi" | null = null

  // Track HTML/JSX tag nesting depth.
  // For TSX/JSX, we start at 0 (JS context). We only enter template land when tagDepth > 0.
  // For Vue/Svelte/Astro, we start at 1 (Template context).
  let tagDepth = isJsx ? 0 : 1

  while (i < n) {
    const ch = source[i]

    if (mode === "TEXT") {
      if (source.slice(i, i + 4) === "<!--") {
        if (tagDepth > 0) {
          flushTextNode(currentText, currentTextStartOffset)
        }
        currentText = ""
        mode = "BLOCK_SKIP"
        skipTargetClose = "-->"
        i += 4
        continue
      }

      // Check if it's a tag start
      if (
        ch === "<" &&
        /^\/?[a-zA-Z_$][a-zA-Z0-9_\-:]*(\s|>|\/>)/.test(
          source.slice(i + 1, i + 50)
        )
      ) {
        if (tagDepth > 0) {
          flushTextNode(currentText, currentTextStartOffset)
        }
        currentText = ""
        mode = "TAG"
        currentTagStartOffset = i
        currentTagContent = ""
        i++
        continue
      }

      if (ch === "{" && tagDepth > 0) {
        flushTextNode(currentText, currentTextStartOffset)
        currentText = ""
        mode = "EXPR"
        currentExprStartOffset = i
        currentExprContent = ""
        braceDepth = 1
        exprQuote = null
        exprEscaped = false
        exprInComment = null
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
      // Abort tag mode if we hit a statement separator (semicolon) — it means it's a comparison, not a tag.
      if (ch === ";") {
        mode = "TEXT"
        currentText = ""
        i++
        continue
      }

      if (ch === ">") {
        const isSelfClosing = currentTagContent.trim().endsWith("/")
        const tagInner = isSelfClosing
          ? currentTagContent
              .trim()
              .slice(0, currentTagContent.trim().length - 1)
          : currentTagContent

        // Parse attributes
        parseAttributes(tagInner, currentTagStartOffset + 1)

        const matchTagName = /^\/?([a-zA-Z0-9_\-:]+)/.exec(tagInner.trim())
        const tagName = matchTagName ? matchTagName[1].toLowerCase() : ""
        const isClosing = tagInner.trim().startsWith("/")

        // Update tag depth
        if (!isSelfClosing && tagName) {
          if (isClosing) {
            tagDepth = Math.max(0, tagDepth - 1)
          } else {
            tagDepth++
          }
        }

        if (
          tagName &&
          SKIP_TAGS.includes(tagName) &&
          !isSelfClosing &&
          !isClosing
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
      const nextCh = i + 1 < n ? source[i + 1] : ""

      if (exprInComment === "single") {
        if (ch === "\n") {
          exprInComment = null
        }
        currentExprContent += ch
        i++
        continue
      }

      if (exprInComment === "multi") {
        if (ch === "*" && nextCh === "/") {
          exprInComment = null
          currentExprContent += "*/"
          i += 2
          continue
        }
        currentExprContent += ch
        i++
        continue
      }

      if (exprQuote) {
        if (exprEscaped) {
          exprEscaped = false
        } else if (ch === "\\") {
          exprEscaped = true
        } else if (ch === exprQuote) {
          exprQuote = null
        }
        currentExprContent += ch
        i++
        continue
      }

      // Check for start of comments or string literals
      if (ch === "/" && nextCh === "/") {
        exprInComment = "single"
        currentExprContent += "//"
        i += 2
        continue
      }
      if (ch === "/" && nextCh === "*") {
        exprInComment = "multi"
        currentExprContent += "/*"
        i += 2
        continue
      }
      if (ch === "'" || ch === '"' || ch === "`") {
        exprQuote = ch
        exprEscaped = false
        currentExprContent += ch
        i++
        continue
      }

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

      // If we skipped a block like script/style, we also decremented tagDepth because of the closing tag.
      // Wait, inside BLOCK_SKIP, we consumed the closing tag like </script>.
      // The closing tag has already been consumed here, so we must decrement tagDepth accordingly!
      const tagName = skipTargetClose.replace(/[</>]/g, "").toLowerCase()
      if (tagName && tagName !== "--") {
        tagDepth = Math.max(0, tagDepth - 1)
      }

      mode = "TEXT"
      currentTextStartOffset = i
      currentText = ""
      continue
    }
    i++
  }

  if (mode === "TEXT" && tagDepth > 0) {
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
