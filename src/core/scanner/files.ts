import * as fs from "fs"
import * as path from "path"
import type { I18nSharpenConfig } from "@/types"

/**
 * Recursively find all source files in a directory matching specific
 * extensions, ignoring specified directories.
 *
 * Uses readdirSync({ withFileTypes: true }) so each entry's type is known
 * without an extra statSync call. Symlinks are skipped to avoid infinite
 * recursion on symlink cycles or junction points.
 *
 * `excludeDirs` matches against the bare directory name (entry.name),
 * not the full path and not as a glob.
 */
export function getFiles(
  dir: string,
  extensions: string[],
  excludeDirs: string[]
): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue

    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!excludeDirs.includes(entry.name)) {
        results.push(...getFiles(filePath, extensions, excludeDirs))
      }
    } else if (entry.isFile()) {
      if (extensions.includes(path.extname(entry.name))) {
        results.push(filePath)
      }
    }
  }
  return results
}

/**
 * Walk every configured `scanDirs` entry and collect absolute paths of
 * files whose extension matches `config.fileExtensions`. Missing entries
 * are silently skipped; the caller decides whether to warn.
 */
export function scanSourceFiles(
  config: I18nSharpenConfig,
  cwd: string
): string[] {
  const filesToScan: string[] = []
  for (const scanDir of config.scanDirs) {
    const scanDirAbs = path.resolve(cwd, scanDir)
    if (fs.existsSync(scanDirAbs)) {
      filesToScan.push(
        ...getFiles(
          scanDirAbs,
          config.fileExtensions ?? [],
          config.excludeDirs ?? []
        )
      )
    }
  }
  return filesToScan
}
