import * as fs from "node:fs"
import { createRequire } from "node:module"
import * as path from "node:path"
import { I18nSharpenError } from "@/core/errors"

// Module-level cache: package name → resolved module. The lazy-load gate
// (PERF-02) holds because this is only ever called from the (future) TS
// parser, which the extension-gated dispatcher only invokes for JS/TS files.
const depCache = new Map<string, unknown>()

export function detectPackageManager(
  cwd: string
): "pnpm" | "yarn" | "npm" | "bun" {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm"
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn"
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm"
  if (
    fs.existsSync(path.join(cwd, "bun.lockb")) ||
    fs.existsSync(path.join(cwd, "bun.lock"))
  )
    return "bun"
  return "npm"
}

function buildInstallCommand(
  pm: "pnpm" | "yarn" | "npm" | "bun",
  packageName: string
): string {
  switch (pm) {
    case "pnpm":
      return `pnpm add -D ${packageName}`
    case "yarn":
      return `yarn add -D ${packageName}`
    case "bun":
      return `bun add -d ${packageName}`
    default:
      return `npm install -D ${packageName}`
  }
}

/**
 * Resolve a workspace peer dependency from the USER's cwd (not the tool's
 * install dir). On failure, throws a fatal missing-dependency
 * I18nSharpenError naming the package and the PM-correct install command
 * (D-02, D-05, D-06). Same resolver for typescript and framework compilers
 * — only packageName differs (D-06).
 */
export function loadWorkspaceDep(packageName: string, cwd: string): unknown {
  const cached = depCache.get(packageName)
  if (cached !== undefined) return cached

  const require = createRequire(path.join(cwd, "package.json"))
  try {
    const mod: unknown = require(packageName)
    depCache.set(packageName, mod)
    return mod
  } catch {
    const pm = detectPackageManager(cwd)
    const installCommand = buildInstallCommand(pm, packageName)
    throw new I18nSharpenError({
      kind: "missing-dependency",
      packageName,
      installCommand,
      message: `Package '${packageName}' is not installed in your project. Run: ${installCommand}`
    })
  }
}
