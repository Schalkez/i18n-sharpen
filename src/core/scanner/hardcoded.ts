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
  let tagQuote: "'" | '"' | null = null
  let tagEscaped = false

  let currentExprContent = ""
  let currentExprStartOffset = 0
  let braceDepth = 0
  let exprQuote: "'" | '"' | "`" | null = null
  let exprEscaped = false
  let exprInComment: "single" | "multi" | null = null

  let skipTargetClose = ""

  // Track HTML/JSX tag nesting depth.
  // For TSX/JSX, we start at 0 (JS context). We only enter template land when tagDepth > 0.
  // For Vue/Svelte/Astro, we start at 1 (Template context).
  let tagDepth = isJsx ? 0 : 1

  interface StackFrame {
    mode: "TEXT" | "TAG" | "EXPR" | "BLOCK_SKIP"
    entryTagDepth: number
    currentText: string
    currentTextStartOffset: number
    currentTagContent: string
    currentTagStartOffset: number
    tagQuote: "'" | '"' | null
    tagEscaped: boolean
    braceDepth?: number
    exprQuote?: "'" | '"' | "`" | null
    exprEscaped?: boolean
    exprInComment?: "single" | "multi" | null
    currentExprContent?: string
    currentExprStartOffset?: number
    jsxStartOffset?: number
  }

  const stack: StackFrame[] = []

  function pushState(jsxStartOffset?: number) {
    stack.push({
      mode,
      entryTagDepth: tagDepth,
      currentText,
      currentTextStartOffset,
      currentTagContent,
      currentTagStartOffset,
      tagQuote,
      tagEscaped,
      braceDepth,
      exprQuote,
      exprEscaped,
      exprInComment,
      currentExprContent,
      currentExprStartOffset,
      jsxStartOffset
    })
  }

  function popState() {
    const parent = stack.pop()
    if (parent) {
      mode = parent.mode
      currentText = parent.currentText
      currentTextStartOffset = parent.currentTextStartOffset
      currentTagContent = parent.currentTagContent
      currentTagStartOffset = parent.currentTagStartOffset
      tagQuote = parent.tagQuote
      tagEscaped = parent.tagEscaped
      braceDepth = parent.braceDepth ?? 0
      exprQuote = parent.exprQuote ?? null
      exprEscaped = parent.exprEscaped ?? false
      exprInComment = parent.exprInComment ?? null
      currentExprContent = parent.currentExprContent ?? ""
      currentExprStartOffset = parent.currentExprStartOffset ?? 0
    }
    return parent
  }

  while (i < n) {
    const ch = source[i]

    if (mode === "TEXT") {
      if (source.slice(i, i + 4) === "<!--") {
        if (tagDepth > 0) {
          flushTextNode(currentText, currentTextStartOffset)
        }
        currentText = ""
        pushState()
        mode = "BLOCK_SKIP"
        skipTargetClose = "-->"
        i += 4
        continue
      }

      // Check if it's a tag start
      if (isJsxTagStart(source, i)) {
        if (tagDepth > 0) {
          flushTextNode(currentText, currentTextStartOffset)
        }
        currentText = ""
        pushState()
        mode = "TAG"
        currentTagStartOffset = i
        currentTagContent = ""
        tagQuote = null
        tagEscaped = false
        i++
        continue
      }

      if (ch === "{" && tagDepth > 0) {
        flushTextNode(currentText, currentTextStartOffset)
        currentText = ""
        pushState()
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
      if (tagEscaped) {
        tagEscaped = false
        currentTagContent += ch
        i++
        continue
      }

      if (tagQuote !== null) {
        if (ch === "\\") {
          tagEscaped = true
        } else if (ch === tagQuote) {
          tagQuote = null
        }
        currentTagContent += ch
        i++
        continue
      }

      if (ch === "'" || ch === '"') {
        tagQuote = ch
        currentTagContent += ch
        i++
        continue
      }

      // Abort tag mode if we hit a statement separator (semicolon) — it means it's a comparison, not a tag.
      if (ch === ";") {
        if (stack.length > 0) {
          popState()
        } else {
          mode = "TEXT"
        }
        currentText = ""
        i++
        continue
      }

      if (ch === "{") {
        pushState()
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
          // Pop the immediate parent if it was TEXT or TAG
          if (
            stack.length > 0 &&
            (stack[stack.length - 1].mode === "TEXT" ||
              stack[stack.length - 1].mode === "TAG")
          ) {
            popState()
          }

          // If the new top of the stack is EXPR and tagDepth matches its entryTagDepth,
          // we have fully exited the JSX element inside the expression.
          if (
            stack.length > 0 &&
            stack[stack.length - 1].mode === "EXPR" &&
            tagDepth === stack[stack.length - 1].entryTagDepth
          ) {
            const parent = popState()
            if (parent) {
              mode = "EXPR"
              const jsxStart = parent.jsxStartOffset ?? i
              currentExprContent =
                (parent.currentExprContent ?? "") +
                source.slice(jsxStart, i + 1)
            }
          } else {
            mode = "TEXT"
            currentTextStartOffset = i + 1
            currentText = ""
          }
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

      if (isJsxTagStart(source, i, true)) {
        pushState(i)
        mode = "TAG"
        currentTagStartOffset = i
        currentTagContent = ""
        tagQuote = null
        tagEscaped = false
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
        if (stack.length > 0) {
          popState()
        } else {
          mode = "TEXT"
          currentTextStartOffset = i + 1
          currentText = ""
        }
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
      const tagName = skipTargetClose.replace(/[</>]/g, "").toLowerCase()
      if (tagName && tagName !== "--") {
        tagDepth = Math.max(0, tagDepth - 1)
      }

      if (stack.length > 0) {
        popState()
      } else {
        mode = "TEXT"
        currentTextStartOffset = i
        currentText = ""
      }
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
      const matchIndex = match.index
      const precedingChar = matchIndex > 0 ? tagContent[matchIndex - 1] : ""
      if (precedingChar === ":" || precedingChar === "-") {
        continue
      }
      if (
        matchIndex >= 7 &&
        tagContent.slice(matchIndex - 7, matchIndex) === "v-bind:"
      ) {
        continue
      }
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

function isJsxTagStart(source: string, index: number, inExpr = false): boolean {
  if (source[index] !== "<") return false

  // 1. Check if the next characters match a tag name pattern
  const slice = source.slice(index + 1, index + 50)
  if (!/^\/?[a-zA-Z_$][a-zA-Z0-9_\-:]*(\s|>|\/>)/.test(slice)) {
    return false
  }

  // If it's a closing tag (starts with /), it is always a tag start
  if (slice.startsWith("/")) {
    return true
  }

  // If we are not in an expression, then any '<' matching a tag pattern is always a tag start
  if (!inExpr) {
    return true
  }

  // 2. Look backward to check if it's a binary operator `<`
  let k = index - 1
  while (k >= 0 && /\s/.test(source[k])) {
    k--
  }
  if (k < 0) return true // Start of file/string

  const prevCh = source[k]

  // If it's punctuation or operator, it's a tag start
  const tagStartChars = /[=+\-*/%&|^!~?:,;{([<>]/
  if (tagStartChars.test(prevCh)) {
    return true
  }

  // If it's a word character, check if it's a keyword
  if (/[a-zA-Z0-9_$]/.test(prevCh)) {
    // Extract the word
    let start = k
    while (start >= 0 && /[a-zA-Z0-9_$]/.test(source[start])) {
      start--
    }
    const word = source.slice(start + 1, k + 1)
    const keywords = [
      "return",
      "yield",
      "await",
      "default",
      "case",
      "delete",
      "typeof",
      "void"
    ]
    if (keywords.includes(word)) {
      return true
    }
    return false // It's an identifier, so `<` is a comparison
  }

  // For closing parentheses/brackets, it's a comparison
  if (prevCh === ")" || prevCh === "]") {
    return false
  }

  return true
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
