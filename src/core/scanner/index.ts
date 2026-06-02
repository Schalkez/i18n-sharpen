import * as fs from "fs"
import { parseFile } from "./parsers"
import type { ParsedFileResult, FileParseError } from "./parsers/types"
import { runBoundedPool } from "./pool"
import { buildKeyRegex, buildAttrRegex } from "./regex"
import { stripComments } from "./text"

export * from "./files"
export * from "./regex"
export * from "./text"
export * from "./dynamic"
export * from "./lines"
export * from "./hardcoded"

/**
 * Read every file in `files`, strip comments, then run the function/attr
 * regex over each cleaned source. Returns:
 *   - `usedKeys`: the set of statically-resolvable translation keys
 *   - `fileContents`: the cleaned source per file (parallel to `files`),
 *     useful for the optional looseKeyMatch second pass
 *
 * Keys that end in `.` are skipped — they indicate dynamic prefixes
 * (e.g. `t('status.' + code)` -> `t('status.'`) and would otherwise
 * pollute the used-key set.
 */
export async function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[],
  opts?: { cwd?: string; useAst?: boolean; maxConcurrency?: number }
): Promise<{
  usedKeys: Set<string>
  fileContents: string[]
  parsedResults: ParsedFileResult[]
  parseErrors: FileParseError[]
}> {
  const useAst = opts?.useAst ?? false
  const cwd = opts?.cwd ?? process.cwd()
  const maxConcurrency = opts?.maxConcurrency ?? 4

  if (useAst) {
    const fileContents: string[] = []
    const parsedResults: (ParsedFileResult | undefined)[] = []
    const parseErrors: FileParseError[] = []
    const usedKeys = new Set<string>()

    fileContents.length = files.length
    parsedResults.length = files.length

    await runBoundedPool(
      files.length,
      async (i) => {
        let source = ""
        try {
          source = await fs.promises.readFile(files[i], "utf8")
        } catch {
          source = ""
        }
        fileContents[i] = stripComments(source)
        const { result, errors } = await parseFile(
          source,
          files[i],
          matchFunctions,
          matchAttributes,
          cwd
        )
        parsedResults[i] = result
        if (errors.length) parseErrors.push(...errors)
      },
      maxConcurrency
    )

    for (const r of parsedResults) {
      if (!r) continue
      for (const { key } of r.usedKeys) {
        if (key.endsWith(".")) continue
        usedKeys.add(key)
      }
    }

    return {
      usedKeys,
      fileContents,
      parsedResults: parsedResults as ParsedFileResult[],
      parseErrors
    }
  }

  const keyRegex = buildKeyRegex(matchFunctions)
  const attrRegex = buildAttrRegex(matchAttributes)

  const fileContents = files.map((file) => {
    try {
      const content = fs.readFileSync(file, "utf8")
      return stripComments(content)
    } catch {
      return ""
    }
  })

  const usedKeys = new Set<string>()
  for (const cleanContent of fileContents) {
    for (const match of cleanContent.matchAll(keyRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }
    for (const match of cleanContent.matchAll(attrRegex)) {
      const key = match[2]
      if (key.endsWith(".")) continue
      usedKeys.add(key)
    }
  }

  return { usedKeys, fileContents, parsedResults: [], parseErrors: [] }
}
