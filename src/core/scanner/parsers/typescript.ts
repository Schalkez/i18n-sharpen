import * as path from "node:path"
import type * as TS from "typescript"
import { loadWorkspaceDep } from "./resolve"
import type { ParsedFileResult, FileParseError } from "./types"

// D-10: structural skip-tags (svelte:head omitted — Phase 3 framework-specific)
const SKIP_TAGS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "svg",
  "path",
  "noscript",
  "iframe"
])

// D-10: hardcoded-attribute allowlist (parser emits raw candidates; caller filters via isHardcodedIgnored)
const HARDCODED_ATTRS = new Set([
  "placeholder",
  "label",
  "title",
  "alt",
  "aria-label"
])

/**
 * Parse a single JS/TS/JSX/TSX file using TypeScript Compiler API (parser-only,
 * no Program / type-checker — PARSE-01). Returns a `ParsedFileResult` with
 * document-absolute offsets (OFFSET-01) and collected `FileParseError`s.
 *
 * TypeScript is resolved lazily from the user's workspace (PERF-02) via
 * `loadWorkspaceDep`. Never statically imported.
 *
 * LOCKED SIGNATURE — plans 02-02 and 02-03 use this EXACTLY.
 */
export function parseTypeScriptFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string
): { result: ParsedFileResult; errors: FileParseError[] } {
  // PERF-02: lazy-load TypeScript from the USER's workspace, never bundled.
  const ts = loadWorkspaceDep("typescript", cwd) as typeof TS

  const ext = path.extname(filePath).toLowerCase()
  const scriptKindMap: Record<string, number> = {
    ".ts": ts.ScriptKind.TS, // JSX-DISABLED → <T> generics parse as type args (TEST-03 mechanism)
    ".tsx": ts.ScriptKind.TSX, // JSX-ENABLED
    ".js": ts.ScriptKind.JS,
    ".jsx": ts.ScriptKind.JSX
  }
  const scriptKind = scriptKindMap[ext] ?? ts.ScriptKind.TS

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest, // = 99 (ESNext) — broadest syntax support
    false, // setParentNodes: false — always pass sourceFile to getText/getStart
    scriptKind
  )

  const usedKeys: ParsedFileResult["usedKeys"] = []
  const dynamicCalls: ParsedFileResult["dynamicCalls"] = []
  const hardcodedCandidates: ParsedFileResult["hardcodedCandidates"] = []

  // --- helpers ---

  /** Resolve JSX tag name to a lowercase string for SKIP_TAGS matching. */
  function getTagName(
    tagExpr: ReturnType<
      typeof ts.isIdentifier extends (n: infer T) => unknown ? () => T : never
    >
  ): string {
    const node = tagExpr as { text?: string; getText?: (sf: unknown) => string }
    if (ts.isIdentifier(tagExpr)) {
      return (node.text ?? "").toLowerCase()
    }
    if (ts.isPropertyAccessExpression(tagExpr)) {
      return (node.getText?.(sourceFile) ?? "").toLowerCase()
    }
    return ""
  }

  /**
   * D-07: bare (no dot) matches rightmost callee identifier;
   * dotted matches full property path.
   */
  function matchesCallee(
    callee: Parameters<typeof ts.isIdentifier>[0]
  ): boolean {
    const lastSegment = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : null
    if (!lastSegment) return false
    for (const fn of matchFunctions) {
      if (!fn.includes(".")) {
        // bare: last-segment match → t() AND i18n.t()
        if (lastSegment === fn) return true
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.getText(sourceFile) === fn
      ) {
        // dotted: full-path exact match
        return true
      }
    }
    return false
  }

  /** Walk the left chain of '+' BinaryExpressions to the deepest-left StringLiteral. */
  function getLeadingStringLiteral(
    expr: Parameters<typeof ts.isStringLiteral>[0]
  ): { text: string } | null {
    if (ts.isStringLiteral(expr)) return expr
    if (
      ts.isBinaryExpression(expr) &&
      expr.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      return getLeadingStringLiteral(expr.left)
    }
    return null
  }

  /** D-02: structural classification. NO string munging. */
  function classifyArg(arg: Parameters<typeof ts.isBinaryExpression>[0]): {
    classification: "fully-dynamic" | "structured-concat"
    prefix?: string
  } {
    if (
      ts.isBinaryExpression(arg) &&
      arg.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const leading = getLeadingStringLiteral(arg)
      if (leading) {
        return { classification: "structured-concat", prefix: leading.text }
      }
    }
    if (ts.isTemplateExpression(arg) && arg.head.text !== "") {
      return { classification: "structured-concat", prefix: arg.head.text }
    }
    return { classification: "fully-dynamic" }
  }

  function visit(node: Parameters<typeof ts.isJsxElement>[0]): void {
    // SKIP_TAGS: do not recurse into a skip-tag subtree (D-10).
    if (ts.isJsxElement(node)) {
      if (SKIP_TAGS.has(getTagName(node.openingElement.tagName))) return
    }
    if (ts.isJsxSelfClosingElement(node)) {
      if (SKIP_TAGS.has(getTagName(node.tagName))) return
    }

    // --- PARSE-02 + PARSE-04: call-expression detection ---
    if (ts.isCallExpression(node)) {
      const arg0 = node.arguments[0]
      if (node.arguments.length > 0 && matchesCallee(node.expression)) {
        if (
          ts.isStringLiteral(arg0) ||
          ts.isNoSubstitutionTemplateLiteral(arg0)
        ) {
          // PARSE-02 static key. D-09: keys ending in '.' excluded.
          if (!arg0.text.endsWith(".")) {
            usedKeys.push({
              key: arg0.text,
              offset: node.getStart(sourceFile)
            })
          }
        } else {
          // PARSE-04 dynamic candidate.
          const { classification, prefix } = classifyArg(arg0)
          dynamicCalls.push({
            expression: node.getText(sourceFile),
            arg: arg0.getText(sourceFile),
            offset: node.getStart(sourceFile),
            classification,
            prefix
          })
        }
      }
    }

    // --- PARSE-03 + PARSE-05: JSX attribute detection ---
    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sourceFile)
      const init = node.initializer
      let strValue: string | null = null
      let strOffset: number | null = null

      if (init && ts.isStringLiteral(init)) {
        // i18nKey="x" / 'x'
        strValue = init.text
        strOffset = init.getStart(sourceFile) + 1 // +1 skips opening quote → value start
      } else if (
        init &&
        ts.isJsxExpression(init) &&
        init.expression &&
        (ts.isStringLiteral(init.expression) ||
          ts.isNoSubstitutionTemplateLiteral(init.expression))
      ) {
        // i18nKey={"x"} / {`x`} — AST-only GAIN over regex (D-08).
        strValue = init.expression.text
        strOffset = init.expression.getStart(sourceFile) + 1
      }

      if (strValue !== null && strOffset !== null) {
        // Attribute key extraction (PARSE-03)
        if (matchAttributes.includes(attrName) && !strValue.endsWith(".")) {
          usedKeys.push({ key: strValue, offset: strOffset }) // D-09: '.'-terminated excluded
        }
        // Hardcoded attribute candidate (PARSE-05)
        if (HARDCODED_ATTRS.has(attrName)) {
          const trimmed = strValue.trim()
          if (trimmed.length > 0) {
            hardcodedCandidates.push({
              text: trimmed,
              offset: strOffset + strValue.indexOf(trimmed)
            })
          }
        }
      }
    }

    // --- PARSE-05: JSX expression — static strings in {...} ---
    if (ts.isJsxExpression(node)) {
      const expr = node.expression
      if (
        expr &&
        (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr))
      ) {
        const trimmed = expr.text.trim()
        if (trimmed.length > 0) {
          hardcodedCandidates.push({
            text: trimmed,
            offset: expr.getStart(sourceFile) + 1
          })
        }
      }
      // Still recurse for nested JSX like {isActive && <span>Hi</span>}
    }

    // --- PARSE-05: JSX text nodes --- (OFFSET-01: node.pos, NOT getStart)
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim()
      if (trimmed.length > 0) {
        const idx = node.text.indexOf(trimmed)
        hardcodedCandidates.push({
          text: trimmed,
          offset: node.pos + idx // node.pos = raw start incl. whitespace
        })
      }
      return // JsxText has no children — do not recurse
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return { result: { usedKeys, dynamicCalls, hardcodedCandidates }, errors: [] }
}
