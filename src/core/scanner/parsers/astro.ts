/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
import { loadWorkspaceDep } from "./resolve"
import type { ParsedFileResult, FileParseError } from "./types"
import { parseTypeScriptFile } from "./typescript"

const ASTRO_SKIP_TAGS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "svg",
  "path",
  "noscript",
  "iframe"
])

function mergeWithRebase(
  target: ParsedFileResult,
  src: ParsedFileResult,
  offset: number
): void {
  target.usedKeys.push(
    ...src.usedKeys.map((k) => ({ ...k, offset: k.offset + offset }))
  )
  target.dynamicCalls.push(
    ...src.dynamicCalls.map((d) => ({ ...d, offset: d.offset + offset }))
  )
  target.hardcodedCandidates.push(
    ...src.hardcodedCandidates.map((h) => ({ ...h, offset: h.offset + offset }))
  )
}

function walkAstroAst(
  node: any,
  matchFunctions: string[],
  matchAttributes: string[],
  out: ParsedFileResult,
  filePath: string,
  cwd: string,
  errors: FileParseError[],
  hardcodedAttributes: string[],
  source: string
): void {
  if (!node) return

  if (node.type === "frontmatter") {
    const blockStart = node.position?.start?.offset ?? 0
    let anchor = blockStart
    const tsSource = node.value ?? ""
    const contentIndex = source.indexOf(tsSource, blockStart)
    if (contentIndex !== -1) {
      anchor = contentIndex
    }
    const { result, errors: tsErrors } = parseTypeScriptFile(
      tsSource,
      filePath,
      matchFunctions,
      matchAttributes,
      cwd,
      hardcodedAttributes
    )
    mergeWithRebase(out, result, anchor)
    errors.push(...tsErrors)
    return
  }

  if (node.type === "expression") {
    const textNodes = node.children?.filter((c: any) => c.type === "text") ?? []
    const text = textNodes.map((c: any) => String(c.value)).join("")
    if (text) {
      const offset =
        textNodes[0]?.position?.start?.offset ??
        node.position?.start?.offset ??
        0
      const { result, errors: tsErrors } = parseTypeScriptFile(
        text,
        filePath,
        matchFunctions,
        matchAttributes,
        cwd,
        hardcodedAttributes
      )
      mergeWithRebase(out, result, offset)
      errors.push(...tsErrors)
    }
  }

  if (node.type === "text") {
    const data = node.value ?? ""
    const trimmed = data.trim()
    if (trimmed) {
      out.hardcodedCandidates.push({
        text: trimmed,
        offset: (node.position?.start?.offset ?? 0) + data.indexOf(trimmed)
      })
    }
    return
  }

  if (
    node.type === "element" ||
    node.type === "component" ||
    node.type === "custom-element"
  ) {
    if (node.name && ASTRO_SKIP_TAGS.has(node.name.toLowerCase())) return
    for (const attr of node.attributes ?? []) {
      if (attr.kind === "quoted" && attr.value) {
        if (matchAttributes.includes(attr.name) && !attr.value.endsWith(".")) {
          out.usedKeys.push({
            key: attr.value,
            offset: attr.position?.start?.offset ?? 0
          })
        }
      } else if (attr.kind === "expression" && attr.value) {
        const text = attr.value
        let offset = attr.position?.start?.offset ?? 0
        const valIndex = source.indexOf(text, offset)
        if (valIndex !== -1) {
          offset = valIndex
        }
        const { result, errors: tsErrors } = parseTypeScriptFile(
          text,
          filePath,
          matchFunctions,
          matchAttributes,
          cwd
        )
        mergeWithRebase(out, result, offset)
        errors.push(...tsErrors)
      }
    }
  }

  const children = node.children ?? []
  for (const child of children) {
    walkAstroAst(
      child,
      matchFunctions,
      matchAttributes,
      out,
      filePath,
      cwd,
      errors,
      hardcodedAttributes,
      source
    )
  }
}

interface AstroCompilerModule {
  parse: (source: string, options?: any) => Promise<any>
}

let initPromise: Promise<void> | null = null

export async function parseAstroFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string,
  hardcodedAttributes: string[] = []
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  const astroCompiler = loadWorkspaceDep(
    "@astrojs/compiler",
    cwd
  ) as AstroCompilerModule

  initPromise ??= astroCompiler
    .parse("", { position: false })
    .then(() => undefined)
  await initPromise

  const merged: ParsedFileResult = {
    usedKeys: [],
    dynamicCalls: [],
    hardcodedCandidates: []
  }
  const collectedErrors: FileParseError[] = []

  let parsed: any
  try {
    parsed = await astroCompiler.parse(source, { position: true })
  } catch (e) {
    collectedErrors.push({ file: filePath, message: String(e) })
    return { result: merged, errors: collectedErrors }
  }

  if (parsed.diagnostics && parsed.diagnostics.length > 0) {
    for (const diag of parsed.diagnostics) {
      if (diag.severity === 1 || diag.severity === "error") {
        collectedErrors.push({
          file: filePath,
          message: diag.text ?? String(diag)
        })
      }
    }
  }

  walkAstroAst(
    parsed.ast,
    matchFunctions,
    matchAttributes,
    merged,
    filePath,
    cwd,
    collectedErrors,
    hardcodedAttributes,
    source
  )

  return { result: merged, errors: collectedErrors }
}
