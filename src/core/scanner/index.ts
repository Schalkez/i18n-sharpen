import * as fs from "fs"
import { parseFile } from "./parsers"
import type { ParsedFileResult, FileParseError } from "./parsers/types"
import { runBoundedPool } from "./pool"
import { stripComments } from "./text"

export * from "./files"
export * from "./text"
export * from "./lines"

export interface DetectUsedKeysOptions {
  cwd?: string
  maxConcurrency?: number
  hardcodedAttributes?: string[]
}

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
  opts?: DetectUsedKeysOptions
): Promise<{
  usedKeys: Set<string>
  fileContents: string[]
  parsedResults: ParsedFileResult[]
  parseErrors: FileParseError[]
}> {
  const cwd = opts?.cwd ?? process.cwd()
  const maxConcurrency = opts?.maxConcurrency ?? 4

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
        cwd,
        opts?.hardcodedAttributes ?? []
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
