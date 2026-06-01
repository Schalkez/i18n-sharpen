import * as path from "node:path"
import { parseAstroFile } from "./astro"
import { parseSvelteFile } from "./svelte"
import type { ParsedFileResult, FileParseError } from "./types"
import { parseTypeScriptFile } from "./typescript"
import { parseVueFile } from "./vue"

export { parseTypeScriptFile, parseVueFile, parseSvelteFile, parseAstroFile }
export type { ParsedFileResult, FileParseError }

export async function parseFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case ".vue":
      return parseVueFile(
        source,
        filePath,
        matchFunctions,
        matchAttributes,
        cwd
      )
    case ".svelte":
      return parseSvelteFile(
        source,
        filePath,
        matchFunctions,
        matchAttributes,
        cwd
      )
    case ".astro":
      return parseAstroFile(
        source,
        filePath,
        matchFunctions,
        matchAttributes,
        cwd
      )
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
      return Promise.resolve(
        parseTypeScriptFile(
          source,
          filePath,
          matchFunctions,
          matchAttributes,
          cwd
        )
      )
    default:
      return Promise.resolve({
        result: { usedKeys: [], dynamicCalls: [], hardcodedCandidates: [] },
        errors: []
      })
  }
}
