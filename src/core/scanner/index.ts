import * as fs from "fs"
import { buildKeyRegex, buildAttrRegex } from "./regex"
import { stripComments } from "./text"

export * from "./files"
export * from "./regex"
export * from "./text"

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
export function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[]
): { usedKeys: Set<string>; fileContents: string[] } {
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

  return { usedKeys, fileContents }
}
