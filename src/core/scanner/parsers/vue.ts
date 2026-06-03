/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/restrict-plus-operands */
import { loadWorkspaceDep } from "./resolve"
import type { ParsedFileResult, FileParseError } from "./types"
import { parseTypeScriptFile } from "./typescript"

const VUE_SKIP_TAGS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "svg",
  "path",
  "noscript",
  "iframe"
])

interface VueSfcModule {
  parse: (
    source: string,
    options: { filename: string }
  ) => {
    descriptor: {
      script: any
      scriptSetup: any
      template: { ast: any } | null
    }
    errors: any[]
  }
}

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

function walkVueTemplateAst(
  node: any,
  matchFunctions: string[],
  matchAttributes: string[],
  out: ParsedFileResult,
  filePath: string,
  cwd: string,
  errors: FileParseError[]
): void {
  if (!node) return

  if (node.type === 2) {
    // TEXT
    const trimmed = (node.content ?? "").trim()
    if (trimmed) {
      out.hardcodedCandidates.push({
        text: trimmed,
        offset: node.loc.start.offset + node.content.indexOf(trimmed)
      })
    }
    return
  }

  if (node.type === 5 && node.content?.type === 4) {
    // INTERPOLATION
    const { result, errors: tsErrors } = parseTypeScriptFile(
      node.content.content,
      filePath,
      matchFunctions,
      matchAttributes,
      cwd
    )
    mergeWithRebase(out, result, node.content.loc.start.offset)
    errors.push(...tsErrors)
    return
  }

  if (node.type === 1) {
    // ELEMENT
    if (node.tag && VUE_SKIP_TAGS.has(node.tag.toLowerCase())) {
      return
    }
    for (const prop of node.props ?? []) {
      if (prop.type === 6 && prop.value) {
        // ATTRIBUTE
        if (
          matchAttributes.includes(prop.name) &&
          !prop.value.content.endsWith(".")
        ) {
          // Add +1 to offset to point inside the opening quote
          out.usedKeys.push({
            key: prop.value.content,
            offset: prop.value.loc.start.offset + 1
          })
        }
      } else if (prop.type === 7 && prop.exp?.type === 4) {
        // DIRECTIVE
        const rawName =
          prop.rawName ??
          (prop.arg?.content ? `:${String(prop.arg.content)}` : prop.name)
        if (matchAttributes.includes(rawName)) {
          let val = prop.exp.content.trim()
          if (
            (val.startsWith("'") && val.endsWith("'")) ||
            (val.startsWith('"') && val.endsWith('"'))
          ) {
            val = val.slice(1, -1)
          }
          if (val && !val.endsWith(".")) {
            out.usedKeys.push({
              key: val,
              offset:
                prop.exp.loc.start.offset +
                (prop.exp.content.indexOf(val) !== -1
                  ? prop.exp.content.indexOf(val)
                  : 0)
            })
          }
        }

        // Always parse directive expressions for function calls like $t('...')
        const { result, errors: tsErrors } = parseTypeScriptFile(
          prop.exp.content,
          filePath,
          matchFunctions,
          matchAttributes,
          cwd
        )
        mergeWithRebase(out, result, prop.exp.loc.start.offset)
        errors.push(...tsErrors)
      }
    }
    for (const child of node.children ?? []) {
      walkVueTemplateAst(
        child,
        matchFunctions,
        matchAttributes,
        out,
        filePath,
        cwd,
        errors
      )
    }
    return
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child !== "string") {
        walkVueTemplateAst(
          child,
          matchFunctions,
          matchAttributes,
          out,
          filePath,
          cwd,
          errors
        )
      }
    }
  }
}

export async function parseVueFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  const compiler = loadWorkspaceDep("@vue/compiler-sfc", cwd) as VueSfcModule
  let descriptor: any = null
  let parseErrors: any[] = []

  const merged: ParsedFileResult = {
    usedKeys: [],
    dynamicCalls: [],
    hardcodedCandidates: []
  }
  const collectedErrors: FileParseError[] = []

  try {
    const res = compiler.parse(source, { filename: filePath })
    descriptor = res.descriptor
    parseErrors = res.errors
  } catch (e) {
    collectedErrors.push({ file: filePath, message: String(e) })
    return { result: merged, errors: collectedErrors }
  }

  if (parseErrors.length > 0) {
    for (const err of parseErrors) {
      collectedErrors.push({ file: filePath, message: String(err) })
    }
  }

  if (descriptor) {
    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (block) {
        const blockStart = source.indexOf(block.content, block.loc.start.offset)
        const anchor = blockStart >= 0 ? blockStart : block.loc.start.offset

        const { result, errors } = parseTypeScriptFile(
          block.content,
          filePath,
          matchFunctions,
          matchAttributes,
          cwd
        )
        mergeWithRebase(merged, result, anchor)
        collectedErrors.push(...errors)
      }
    }

    if (descriptor.template?.ast) {
      walkVueTemplateAst(
        descriptor.template.ast,
        matchFunctions,
        matchAttributes,
        merged,
        filePath,
        cwd,
        collectedErrors
      )
    }
  }

  return { result: merged, errors: collectedErrors }
}
