/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
import { createRequire } from "node:module"
import * as path from "node:path"
import { loadWorkspaceDep } from "./resolve"
import type { ParsedFileResult, FileParseError } from "./types"
import { parseTypeScriptFile } from "./typescript"

const SVELTE_SKIP_TAGS = new Set([
  "script",
  "style",
  "code",
  "pre",
  "svg",
  "path",
  "noscript",
  "iframe"
])

export function readSvelteMajor(cwd: string): number {
  const req = createRequire(path.join(cwd, "package.json"))
  const { version } = req("svelte/package.json") as { version: string }
  return parseInt(version.split(".")[0], 10)
}

export const svelteInternal = { readSvelteMajor }

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

function walkSvelteTemplate(
  node: any,
  matchFunctions: string[],
  matchAttributes: string[],
  out: ParsedFileResult,
  filePath: string,
  cwd: string,
  errors: FileParseError[],
  hardcodedAttributes: string[],
  source: string,
  isV5: boolean
): void {
  if (!node) return

  if (node.name && SVELTE_SKIP_TAGS.has(node.name.toLowerCase())) {
    return
  }

  if (node.type === "Text") {
    const data = node.data ?? ""
    const trimmed = data.trim()
    if (trimmed) {
      out.hardcodedCandidates.push({
        text: trimmed,
        offset: node.start + data.indexOf(trimmed)
      })
    }
    return
  }

  if (
    node.expression &&
    typeof node.expression.start === "number" &&
    typeof node.expression.end === "number"
  ) {
    const text = source.substring(node.expression.start, node.expression.end)
    const { result, errors: tsErrors } = parseTypeScriptFile(
      text,
      filePath,
      matchFunctions,
      matchAttributes,
      cwd,
      hardcodedAttributes
    )
    mergeWithRebase(out, result, node.expression.start)
    errors.push(...tsErrors)
  }

  const childrenToWalk = new Set<any>()
  for (const attr of node.attributes ?? []) {
    if (attr.type === "Attribute") {
      const valueNode = Array.isArray(attr.value) ? attr.value[0] : null
      if (valueNode && typeof valueNode.data === "string") {
        const val = valueNode.data
        if (matchAttributes.includes(attr.name) && !val.endsWith(".")) {
          out.usedKeys.push({ key: val, offset: valueNode.start })
        }
      }
      if (Array.isArray(attr.value)) {
        for (const val of attr.value) {
          childrenToWalk.add(val)
        }
      } else if (attr.value && typeof attr.value === "object") {
        childrenToWalk.add(attr.value)
      }
    }
  }

  if (node.fragment?.nodes) {
    for (const c of node.fragment.nodes) childrenToWalk.add(c)
  }
  if (node.children) {
    for (const c of node.children) childrenToWalk.add(c)
  }
  if (node.nodes) {
    for (const c of node.nodes) childrenToWalk.add(c)
  }

  for (const child of childrenToWalk) {
    walkSvelteTemplate(
      child,
      matchFunctions,
      matchAttributes,
      out,
      filePath,
      cwd,
      errors,
      hardcodedAttributes,
      source,
      isV5
    )
  }
}

interface SvelteCompilerModule {
  parse: (source: string, options?: any) => any
}

export async function parseSvelteFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string,
  hardcodedAttributes: string[] = []
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  await Promise.resolve()
  const svelteCompiler = loadWorkspaceDep(
    "svelte/compiler",
    cwd
  ) as SvelteCompilerModule

  // For ESM compatibility in tsx, we use an exported object
  const isV5 = svelteInternal.readSvelteMajor(cwd) >= 5

  const merged: ParsedFileResult = {
    usedKeys: [],
    dynamicCalls: [],
    hardcodedCandidates: []
  }
  const collectedErrors: FileParseError[] = []

  let ast: any
  try {
    ast = isV5
      ? svelteCompiler.parse(source, { modern: true })
      : svelteCompiler.parse(source)
  } catch (e) {
    collectedErrors.push({ file: filePath, message: String(e) })
    return { result: merged, errors: collectedErrors }
  }

  for (const block of [ast.instance, ast.module]) {
    if (block) {
      const blockSource = source.slice(block.start, block.end)

      const { result, errors } = parseTypeScriptFile(
        blockSource,
        filePath,
        matchFunctions,
        matchAttributes,
        cwd,
        hardcodedAttributes
      )
      mergeWithRebase(merged, result, block.start)
      collectedErrors.push(...errors)
    }
  }

  const templateRoot = isV5 ? ast.fragment : ast.html
  if (templateRoot) {
    walkSvelteTemplate(
      templateRoot,
      matchFunctions,
      matchAttributes,
      merged,
      filePath,
      cwd,
      collectedErrors,
      hardcodedAttributes,
      source,
      isV5
    )
  }

  return { result: merged, errors: collectedErrors }
}
