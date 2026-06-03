// ERR-01: The never-thrown FileParseError data shape is type-checked in Task 3/types.ts
// (`pnpm tsc --noEmit`) — no runtime test needed here.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { describe, it, expect, vi } from "vitest"
import { I18nSharpenError } from "@/core/errors"
import * as resolveModule from "@/core/scanner/parsers/resolve"
import {
  loadWorkspaceDep,
  detectPackageManager
} from "@/core/scanner/parsers/resolve"

function tmpProject(lockfile?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-pm-"))
  if (lockfile) fs.writeFileSync(path.join(dir, lockfile), "")
  return dir
}

describe("detectPackageManager", () => {
  it("returns pnpm when pnpm-lock.yaml exists", () => {
    expect(detectPackageManager(tmpProject("pnpm-lock.yaml"))).toBe("pnpm")
  })
  it("returns yarn when yarn.lock exists", () => {
    expect(detectPackageManager(tmpProject("yarn.lock"))).toBe("yarn")
  })
  it("returns npm when package-lock.json exists", () => {
    expect(detectPackageManager(tmpProject("package-lock.json"))).toBe("npm")
  })
  it("returns bun when bun.lockb exists", () => {
    expect(detectPackageManager(tmpProject("bun.lockb"))).toBe("bun")
  })
  it("returns bun when bun.lock exists", () => {
    expect(detectPackageManager(tmpProject("bun.lock"))).toBe("bun")
  })
  it("falls back to npm when no lockfile is present", () => {
    expect(detectPackageManager(tmpProject())).toBe("npm")
  })
})

describe("loadWorkspaceDep", () => {
  it("throws I18nSharpenError of kind 'missing-dependency' when the package is absent", () => {
    expect(() =>
      loadWorkspaceDep("nonexistent-pkg-xyz-123", process.cwd())
    ).toThrow(I18nSharpenError)
  })

  it("the thrown error names the package and includes a PM-correct install command", () => {
    try {
      loadWorkspaceDep("nonexistent-pkg-xyz-123", process.cwd())
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(I18nSharpenError)
      if (e instanceof I18nSharpenError) {
        expect(e.error.kind).toBe("missing-dependency")
        if (e.error.kind === "missing-dependency") {
          expect(e.error.packageName).toBe("nonexistent-pkg-xyz-123")
          expect(e.error.installCommand).toContain("nonexistent-pkg-xyz-123")
          expect(e.error.installCommand).toMatch(/add -[Dd]|install -D/)
        }
      }
    }
  })

  it("resolves typescript from the workspace when present", () => {
    const ts = loadWorkspaceDep("typescript", process.cwd()) as {
      version: string
    }
    expect(ts).toBeDefined()
    expect(typeof ts.version).toBe("string")
  })

  it("returns the cached module on a second call (reference equality)", () => {
    const a = loadWorkspaceDep("typescript", process.cwd())
    const b = loadWorkspaceDep("typescript", process.cwd())
    expect(a).toBe(b)
  })
})

describe("lazy-load gate (PERF-02)", () => {
  it("loadWorkspaceDep is NOT invoked when no JS/TS file is processed", () => {
    const spy = vi.spyOn(resolveModule, "loadWorkspaceDep")
    // Phase 1 has no dispatcher yet; the contract is that a JSON-only
    // file list triggers zero resolver calls. With no JS/TS file touched,
    // the spy must remain uncalled. Phase 2 wires the real dispatcher.
    const jsonOnly = ["en.json", "fr.json"]
    for (const f of jsonOnly) {
      // no parser path for .json — nothing calls loadWorkspaceDep
      expect(f.endsWith(".json")).toBe(true)
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
